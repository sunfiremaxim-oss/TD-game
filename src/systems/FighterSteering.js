import { TransformComponent } from '../components/TransformComponent.js';
import { VelocityComponent } from '../components/VelocityComponent.js';
import { CircleColliderComponent } from '../components/CircleColliderComponent.js';
import { EnemyComponent } from '../components/EnemyComponent.js';
import { HealthComponent } from '../components/HealthComponent.js';
import { FighterFlightComponent } from '../components/FighterFlightComponent.js';
import { GameConfig } from '../config/GameConfig.js';

const CELL_SIZE = 128;
const ANGLE_OFFSETS = [0, 1, -1, 2, -2, 3, -3, 4, -4, 6, -6, 8, -8, 10, -10, 12];

/** Local velocity steering, called by MovementSystem before position integration.
 * A shrinking spiral is the preferred course. Short swept-circle predictions
 * select a clear velocity around nearby allies, with a bias to their rear.
 * No routes, navigation mesh, global searches or entity-ID history are retained.
 */
export class FighterSteering {
  constructor() {
    this.cells = new Map();
    this.buckets = [];
    this.bodies = [];
    this.neighbors = [];
    this.bodyCount = 0;
    this.bodyById = new Map();
    this.course = { x: 0, y: 0, speed: 0 };
    this.occupiedSlots = new Set();
  }

  prepare(world, enemies, towerX, towerY, towerRadius) {
    this.cells.clear();
    this.bodyById.clear();
    this.neighbors.length = 0;
    this.bodyCount = 0;
    this.maxRadius = 0;
    this.maxSpeed = 0;
    let bucketCount = 0;
    // No spatial index work when this wave has no fighters.
    if (!enemies.some(id => world.getComponent(id, EnemyComponent).type === 'fighter')) {
      for (const body of this.bodies) { body.enemy = null; body.flight = null; }
      for (const bucket of this.buckets) bucket.length = 0;
      return;
    }
    for (const id of enemies) {
      const enemy = world.getComponent(id, EnemyComponent);
      const health = world.getComponent(id, HealthComponent);
      const col = world.getComponent(id, CircleColliderComponent);
      if (!col || !health || health.current <= 0 || world.destructionQueue.has(id)) continue;
      const transform = world.getComponent(id, TransformComponent);
      const velocity = world.getComponent(id, VelocityComponent);
      const body = this.bodies[this.bodyCount] || (this.bodies[this.bodyCount] = {});
      body.id = id; body.enemy = enemy; body.x = transform.x; body.y = transform.y;
      body.radius = col.radius; body.vx = velocity?.vx || 0; body.vy = velocity?.vy || 0;
      body.speed = velocity?.currentSpeed || 0;
      body.flight = world.getComponent(id, FighterFlightComponent);
      this.bodyById.set(id, body);
      const distance = Math.hypot(towerX - body.x, towerY - body.y) || 1;
      if (enemy.knockbackRemaining > 0) {
        body.vx = enemy.knockbackVx;
        body.vy = enemy.knockbackVy;
      }
      // Newly spawned marchers have not acquired their first velocity yet.
      else if (velocity && !body.vx && !body.vy && !enemy.isStopped && enemy.type !== 'boss_shield' &&
        distance > towerRadius + col.radius + 0.1) {
        body.vx = (towerX - body.x) / distance * velocity.currentSpeed;
        body.vy = (towerY - body.y) / distance * velocity.currentSpeed;
      }
      this.maxRadius = Math.max(this.maxRadius, col.radius);
      this.maxSpeed = Math.max(this.maxSpeed, Math.hypot(body.vx, body.vy));
      const key = Math.floor(body.x / CELL_SIZE) * 65536 + Math.floor(body.y / CELL_SIZE);
      let bucket = this.cells.get(key);
      if (!bucket) {
        bucket = this.buckets[bucketCount] || (this.buckets[bucketCount] = []);
        bucket.length = 0;
        bucketCount++;
        this.cells.set(key, bucket);
      }
      bucket.push(body);
      this.bodyCount++;
    }
    // Release references to removed entities, while reusing object/array capacity.
    for (let i = this.bodyCount; i < this.bodies.length; i++) {
      this.bodies[i].enemy = null;
      this.bodies[i].flight = null;
    }
    for (let i = bucketCount; i < this.buckets.length; i++) this.buckets[i].length = 0;
  }

  steer(world, id, transform, velocity, towerX, towerY, stopDistance, radius, deltaTime, towerRange = GameConfig.tower.baseRange) {
    let flight = world.getComponent(id, FighterFlightComponent);
    if (!flight) {
      const config = GameConfig.enemies.fighter.flight;
      // Spawners supply random flight data. Manually created/legacy entities
      // get a stable fallback without consuming combat chance rolls per frame.
      flight = world.addComponent(id, new FighterFlightComponent(id % 2 ? -1 : 1,
        config.spiralMin + ((id * 0.61803398875) % 1) * (config.spiralMax - config.spiralMin)));
      const body = this.bodyById.get(id);
      if (body) body.flight = flight;
    }
    const config = GameConfig.enemies.fighter.flight;
    const escortConfig = GameConfig.enemies.fighter.escort;
    const dx = towerX - transform.x, dy = towerY - transform.y;
    const distance = Math.hypot(dx, dy) || 1;
    const nx = dx / distance, ny = dy / distance;
    const remaining = Math.max(0, distance - stopDistance);
    let speed = Math.min(velocity.currentSpeed, remaining / Math.max(deltaTime, 0.000001));
    // Unwind the spiral at the core so fighters make contact instead of orbiting forever.
    const ratio = flight.spiralRatio * Math.min(1, remaining / config.unwindDistance) * flight.direction;
    const norm = Math.hypot(1, ratio);
    let baseX = (nx - ny * ratio) / norm, baseY = (ny + nx * ratio) / norm;
    const horizon = Math.max(config.lookAhead, deltaTime);
    const safetyHorizon = Math.max(config.reactionTime, deltaTime);
    const searchRadius = Math.max(escortConfig.seekDistance,
      (velocity.currentSpeed * escortConfig.chargeMultiplier + this.maxSpeed) * horizon + radius + this.maxRadius + config.clearance);
    this._nearby(id, transform.x, transform.y, searchRadius);
    if (this._tacticalCourse(flight, transform, velocity, towerX, towerY, stopDistance - radius, radius, towerRange, deltaTime)) {
      baseX = this.course.x;
      baseY = this.course.y;
      speed = Math.min(this.course.speed, remaining / Math.max(deltaTime, 0.000001));
    }
    if (remaining < 2) {
      velocity.vx = nx * speed;
      velocity.vy = ny * speed;
      return;
    }
    if (speed < 0.001) {
      velocity.vx = 0; velocity.vy = 0;
      return;
    }

    let blocker = null, firstContact = Infinity;
    for (const body of this.neighbors) {
      if ((flight.mode === 'joining' || flight.mode === 'escort') && body.enemy === flight.escortTank) {
        const rearDistance = Math.hypot(body.x - towerX, body.y - towerY) || 1;
        const behind = ((transform.x - body.x) * (body.x - towerX) +
          (transform.y - body.y) * (body.y - towerY)) / rearDistance;
        // The formation controller decelerates at a waypoint behind the tank;
        // a constant-velocity extrapolation must not treat that catch-up as an overtake.
        // The short safety check below still tests the actual tank collider.
        if (behind >= radius + body.radius + config.clearance) continue;
      }
      const time = this._impact(transform.x, transform.y, baseX * speed, baseY * speed, body,
        radius + body.radius + config.clearance, horizon);
      if (time < firstContact) { firstContact = time; blocker = body; }
    }

    let desiredX = baseX, desiredY = baseY;
    if (blocker) {
      if (flight.obstacle !== blocker.enemy) {
        // Choose the side farther from the tower, and keep it for this encounter.
        const rearX = blocker.x - towerX, rearY = blocker.y - towerY;
        const rearDot = -baseY * rearX + baseX * rearY;
        flight.passSide = Math.abs(rearDot) > 0.001 ? Math.sign(rearDot) : flight.direction;
        flight.obstacle = blocker.enemy;
      }
      const bias = 1.2 + 0.6 * (1 - Math.min(1, firstContact / horizon));
      desiredX -= baseY * flight.passSide * bias;
      desiredY += baseX * flight.passSide * bias;
    } else {
      flight.obstacle = null;
    }
    let angle = Math.atan2(desiredY, desiredX);
    const previous = flight.heading ?? Math.atan2(baseY, baseX);
    const turn = Math.atan2(Math.sin(angle - previous), Math.cos(angle - previous));
    const maxTurn = config.turnSpeed * deltaTime;
    angle = previous + Math.max(-maxTurn, Math.min(maxTurn, turn));

    const smoothX = Math.cos(angle), smoothY = Math.sin(angle);
    let smoothIsClear = true;
    for (const body of this.neighbors) {
      if (this._impact(transform.x, transform.y, smoothX * speed, smoothY * speed, body,
        radius + body.radius + config.clearance, safetyHorizon) !== Infinity) {
        smoothIsClear = false;
        break;
      }
    }
    if (smoothIsClear) {
      flight.heading = angle;
      velocity.vx = smoothX * speed;
      velocity.vy = smoothY * speed;
      return;
    }

    let bestScore = -Infinity, bestX = baseX, bestY = baseY, bestSpeed = speed;
    const desiredLength = Math.hypot(desiredX, desiredY);
    desiredX /= desiredLength;
    desiredY /= desiredLength;
    // Usually the first full-speed candidate is clear. Slower options are only
    // considered if every full-speed heading would collide in the lookahead.
    for (let scale = 1; scale >= 0.25; scale -= 0.25) {
      let safeFound = false;
      const candidateSpeed = speed * scale;
      for (const offset of ANGLE_OFFSETS) {
        const candidateAngle = angle + offset * Math.PI / 12;
        const x = Math.cos(candidateAngle), y = Math.sin(candidateAngle);
        let impact = Infinity;
        for (const body of this.neighbors) {
          impact = Math.min(impact, this._impact(transform.x, transform.y, x * candidateSpeed, y * candidateSpeed,
            body, radius + body.radius + config.clearance, safetyHorizon));
        }
        const safe = impact === Infinity;
        const score = (safe ? 100 : Math.min(impact, safetyHorizon) / safetyHorizon * 10) +
          x * desiredX + y * desiredY + 0.22 * (x * Math.cos(previous) + y * Math.sin(previous)) +
          0.12 * (x * nx + y * ny);
        if (score > bestScore) {
          bestScore = score; bestX = x; bestY = y; bestSpeed = candidateSpeed;
        }
        if (safe) safeFound = true;
      }
      if (safeFound) break;
    }
    flight.heading = Math.atan2(bestY, bestX);
    velocity.vx = bestX * bestSpeed;
    velocity.vy = bestY * bestSpeed;
  }

  _tacticalCourse(flight, position, velocity, towerX, towerY, towerRadius, radius, towerRange, dt) {
    const config = GameConfig.enemies.fighter.escort;
    const clearance = GameConfig.enemies.fighter.flight.clearance;
    // Halfway from the attack boundary to the core, measured at the tank center.
    const releaseDistance = towerRadius + Math.max(0, towerRange - towerRadius) * (1 - config.releaseDepth);
    let tank = this.bodyById.get(flight.escortTankId);
    if (!tank || tank.enemy !== flight.escortTank || tank.enemy.type !== 'tank') tank = null;

    if (flight.mode === 'breakout' || flight.mode === 'charge') {
      flight.chargeElapsed += dt;
      const speed = velocity.currentSpeed * (1 + (config.chargeMultiplier - 1) *
        Math.min(1, flight.chargeElapsed / config.accelerationTime));
      if (flight.mode === 'breakout' && tank) {
        const distance = Math.hypot(tank.x - towerX, tank.y - towerY) || 1;
        const rearX = (tank.x - towerX) / distance, rearY = (tank.y - towerY) / distance;
        const side = 2 * (tank.radius + radius + clearance) * flight.exitSide;
        const goalX = tank.x - rearY * side, goalY = tank.y + rearX * side;
        if (Math.hypot(goalX - position.x, goalY - position.y) > config.joinTolerance) {
          this._courseTo(goalX - position.x, goalY - position.y, speed, dt);
          return true;
        }
      }
      flight.mode = 'charge';
      flight.escortTankId = null;
      flight.escortTank = null;
      this._courseTo(towerX - position.x, towerY - position.y, speed, dt);
      return true;
    }

    if (tank && (tank.enemy.knockbackRemaining > 0 ||
      Math.hypot(tank.x - position.x, tank.y - position.y) >
        config.detachDistance + flight.escortSlot * (2 * radius + clearance + 6))) tank = null;
    if (!tank && flight.mode !== 'spiral') {
      flight.mode = 'spiral';
      flight.escortTankId = null;
      flight.escortTank = null;
    }
    if (!tank) {
      let nearest = Infinity, chosenSlot = 0;
      for (const candidate of this.neighbors) {
        if (candidate.enemy.type !== 'tank' || candidate.speed <= 0.1 || candidate.enemy.knockbackRemaining > 0) continue;
        const tankDistance = Math.hypot(candidate.x - towerX, candidate.y - towerY);
        if (tankDistance <= releaseDistance + clearance) continue;
        const distance = Math.hypot(candidate.x - position.x, candidate.y - position.y);
        if (distance > config.seekDistance || distance >= nearest) continue;
        this.occupiedSlots.clear();
        for (let i = 0; i < this.bodyCount; i++) {
          const other = this.bodies[i].flight;
          if (other && other !== flight && other.escortTank === candidate.enemy &&
            (other.mode === 'joining' || other.mode === 'escort')) this.occupiedSlots.add(other.escortSlot);
        }
        let slot = 0;
        while (this.occupiedSlots.has(slot)) slot++;
        tank = candidate; nearest = distance; chosenSlot = slot;
      }
      if (!tank) return false;
      flight.escortTankId = tank.id;
      flight.escortTank = tank.enemy;
      flight.escortSlot = chosenSlot;
      flight.mode = 'joining';
      flight.obstacle = null;
    }

    const tankDistance = Math.hypot(tank.x - towerX, tank.y - towerY) || 1;
    const rearX = (tank.x - towerX) / tankDistance, rearY = (tank.y - towerY) / tankDistance;
    const rear = tank.radius + radius + clearance + config.rearGap + flight.escortSlot * (2 * radius + clearance + 6);
    const lateral = flight.escortSlot === 0 ? 0 : (flight.escortSlot % 2 ? 1 : -1) * radius * 0.7;
    const goalX = tank.x + rearX * rear - rearY * lateral;
    const goalY = tank.y + rearY * rear + rearX * lateral;
    const errorX = goalX - position.x, errorY = goalY - position.y;
    if (Math.hypot(errorX, errorY) <= config.joinTolerance) flight.mode = 'escort';
    if (flight.mode === 'escort' && tankDistance <= releaseDistance) {
      flight.mode = 'breakout';
      flight.exitSide = flight.escortSlot === 0 ? flight.direction : (flight.escortSlot % 2 ? 1 : -1);
      flight.chargeElapsed = 0;
      flight.obstacle = null;
      return this._tacticalCourse(flight, position, velocity, towerX, towerY, towerRadius, radius, towerRange, 0);
    }
    // Feed-forward preserves the tank's speed in a settled formation. A bounded
    // correction closes the gap smoothly, rather than teleporting or attaching bodies.
    const tankSpeed = Math.min(tank.speed, Math.max(0, tankDistance - towerRadius - tank.radius) / Math.max(dt, 0.000001));
    const gain = Math.min(config.followGain, 1 / Math.max(dt, 0.000001));
    const vx = -rearX * tankSpeed + errorX * gain, vy = -rearY * tankSpeed + errorY * gain;
    const length = Math.hypot(vx, vy);
    this.course.x = length > 0 ? vx / length : -rearX;
    this.course.y = length > 0 ? vy / length : -rearY;
    this.course.speed = Math.min(velocity.currentSpeed, length);
    return true;
  }

  _courseTo(dx, dy, speed, dt) {
    const distance = Math.hypot(dx, dy) || 1;
    this.course.x = dx / distance;
    this.course.y = dy / distance;
    this.course.speed = Math.min(speed, distance / Math.max(dt, 0.000001));
  }

  _nearby(id, x, y, radius) {
    this.neighbors.length = 0;
    const minX = Math.floor((x - radius) / CELL_SIZE), maxX = Math.floor((x + radius) / CELL_SIZE);
    const minY = Math.floor((y - radius) / CELL_SIZE), maxY = Math.floor((y + radius) / CELL_SIZE);
    // A very strong knockback can create a huge prediction radius. Fall back
    // to this frame's compact body list instead of visiting empty grid cells.
    if ((maxX - minX + 1) * (maxY - minY + 1) > this.cells.size * 4) {
      for (let i = 0; i < this.bodyCount; i++) {
        const body = this.bodies[i];
        if (body.id !== id && (body.x - x) ** 2 + (body.y - y) ** 2 <= radius ** 2) this.neighbors.push(body);
      }
      return;
    }
    for (let cx = minX; cx <= maxX; cx++) for (let cy = minY; cy <= maxY; cy++) {
      const bucket = this.cells.get(cx * 65536 + cy);
      if (!bucket) continue;
      for (const body of bucket) {
        if (body.id !== id && (body.x - x) ** 2 + (body.y - y) ** 2 <= radius ** 2) this.neighbors.push(body);
      }
    }
  }

  _impact(x, y, vx, vy, body, clearance, horizon) {
    const px = body.x - x, py = body.y - y;
    const rx = vx - body.vx, ry = vy - body.vy;
    const projection = px * rx + py * ry;
    const gap = px * px + py * py - clearance * clearance;
    if (gap <= 0) return projection < 0 ? Infinity : 0;
    const speedSq = rx * rx + ry * ry;
    if (speedSq < 0.000001 || projection <= 0) return Infinity;
    const discriminant = projection * projection - speedSq * gap;
    if (discriminant < 0) return Infinity;
    const time = (projection - Math.sqrt(discriminant)) / speedSq;
    return time <= horizon ? time : Infinity;
  }
}

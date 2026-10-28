import { getHealthRatio, getHealthColor } from './HealthVisuals.js';

// Normalized geometry is built once, not per boss/frame.
function makeHealthCells(points, count) {
  const edges = points.slice(1).map((point, i) => {
    const start = points[i];
    return { start, point, length: Math.hypot(point[0] - start[0], point[1] - start[1]) };
  });
  const total = edges.reduce((sum, edge) => sum + edge.length, 0), cells = [];
  for (let cell = 0; cell < count; cell++) {
    const from = (cell + .12) / count * total, to = (cell + .88) / count * total;
    const pieces = []; let position = 0;
    for (const edge of edges) {
      const start = Math.max(from, position), end = Math.min(to, position + edge.length);
      if (end > start) {
        const a = (start - position) / edge.length, b = (end - position) / edge.length;
        const dx = edge.point[0] - edge.start[0], dy = edge.point[1] - edge.start[1];
        pieces.push([edge.start[0] + dx * a, edge.start[1] + dy * a,
          edge.start[0] + dx * b, edge.start[1] + dy * b, end - start]);
      }
      position += edge.length;
    }
    cells.push({ pieces, length: pieces.reduce((sum, piece) => sum + piece[4], 0) });
  }
  return cells;
}

const ARCHITECT_HEALTH_CELLS = makeHealthCells([[-.43,-.64],[-.3,-.76],[.3,-.76],[.43,-.64]], 6);
const CARRIER_HEALTH_CELLS = makeHealthCells([[.1,-.17],[-.69,-.65]], 8);
const SCOUT_BOSS_HEALTH_CELLS = makeHealthCells([[.8,0],[-.4,.6928203]], 6);
const RAILGUN_HEALTH_CELLS = makeHealthCells([[-.58,-.28],[-.26,-.49],[.17,-.36],[.66,-.19]],8);
const CITADEL_HEALTH_CELLS = makeHealthCells(Array.from({length:7},(_,i)=>[Math.cos(i*Math.PI/3)*.82,Math.sin(i*Math.PI/3)*.82]),24);

function traceHealthCells(ctx, cells, ratio) {
  ctx.beginPath();
  for (let i = 0; i < cells.length; i++) {
    const fill = Math.max(0, Math.min(1, ratio * cells.length - i));
    if (!fill) break;
    let remaining = cells[i].length * fill;
    for (const [x, y, endX, endY, length] of cells[i].pieces) {
      if (remaining <= 0) break;
      const part = Math.min(1, remaining / length);
      ctx.moveTo(x, y); ctx.lineTo(x + (endX - x) * part, y + (endY - y) * part);
      remaining -= length;
    }
  }
}

function drawHealthCells(ctx, radius, cells, ratio, color, background) {
  if (!background && ratio <= 0) return;
  ctx.save(); ctx.scale(radius, radius); ctx.shadowBlur = 0;
  ctx.lineCap = 'butt'; ctx.lineJoin = 'bevel';
  if (background) {
    traceHealthCells(ctx, cells, 1);
    ctx.strokeStyle = '#050b13'; ctx.lineWidth = 6 / radius; ctx.stroke();
    ctx.strokeStyle = '#2c414b'; ctx.lineWidth = 3 / radius; ctx.stroke();
  } else {
    traceHealthCells(ctx, cells, Math.max(0, Math.min(1, ratio)));
    ctx.strokeStyle = color; ctx.lineWidth = 3 / radius; ctx.stroke();
  }
  ctx.restore();
}

// Empty tracks are baked into the body / canonical plate sprites.
export function drawArchitectHealthCells(ctx, radius, ratio, color, background = false) {
  drawHealthCells(ctx, radius, ARCHITECT_HEALTH_CELLS, ratio, color, background);
}
export function drawCarrierHealthCells(ctx, radius, ratio, color, background = false) {
  drawHealthCells(ctx, radius, CARRIER_HEALTH_CELLS, ratio, color, background);
}
export function drawScoutBossHealthCells(ctx, radius, ratio, color, background = false) {
  drawHealthCells(ctx, radius, SCOUT_BOSS_HEALTH_CELLS, ratio, color, background);
}
export function drawRailgunHealthCells(ctx,radius,ratio,color,background=false) {
  drawHealthCells(ctx,radius,RAILGUN_HEALTH_CELLS,ratio,color,background);
}
export function drawCitadelHealthCells(ctx,radius,ratio,color,background=false) {
  drawHealthCells(ctx,radius,CITADEL_HEALTH_CELLS,ratio,color,background);
}

// At most four unblurred strokes per boss. Health is never a sprite key and
// never invalidates the animated hull; no live gradients or glow are used.
export function drawBossHullHealth(ctx, type, render, health, armorOpen = 0) {
  const ratio = getHealthRatio(health.current, health.max), color = getHealthColor(ratio);
  if (type === 'boss_citadel' || type === 'citadel_generator') {
    drawCitadelHealthCells(ctx,render.radius,ratio,color);
  } else if (type === 'boss_architect') {
    for (let side = 0; side < 4; side++) {
      ctx.save(); ctx.rotate(side * Math.PI / 2);
      if (armorOpen > 0) ctx.translate(0, -render.radius * .32 * armorOpen);
      drawArchitectHealthCells(ctx, render.radius, Math.max(0, Math.min(1, ratio * 4 - side)), color);
      ctx.restore();
    }
  } else if (type === 'boss_scout') {
    for (let side = 0; side < 3; side++) {
      ctx.save(); ctx.rotate(side * Math.PI * 2 / 3);
      drawScoutBossHealthCells(ctx,render.radius,Math.max(0,Math.min(1,ratio * 3 - side)),color);
      ctx.restore();
    }
  } else if (type === 'boss_carrier' || type === 'boss_railgun') {
    for (const side of [-1, 1]) {
      ctx.save(); ctx.scale(1, side);
      if(type === 'boss_railgun') drawRailgunHealthCells(ctx,render.radius,ratio,color);
      else drawCarrierHealthCells(ctx, render.radius, ratio, color);
      ctx.restore();
    }
  }
}

import { drawArchitectHealthCells } from './BossHealthVisual.js';

// Shared artwork for battle and bestiary. Geometry and glow are painted only into caches.
function polygon(ctx, points) {
  ctx.beginPath();
  points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
}

// Derived from simulation timers: pausing or knockback freezes the armor too.
// Opening belongs to overheating; closing uses the start of the next windup.
export function getArchitectArmorOpen(siege, config) {
  if (!siege) return 0;
  let progress;
  if (siege.phase === 'overheated') progress = (config.siegeCoolingDuration - siege.phaseRemaining) / .32;
  else if (siege.phase === 'windup' && siege.cycles > 0) progress = 1 - (config.siegeWindup - siege.phaseRemaining) / .28;
  else return 0;
  const t = Math.max(0, Math.min(1, progress));
  return t * t * (3 - 2 * t);
}

export function drawArchitectChassis(ctx, render, glowScale = 1, phase = '') {
  const r = render.radius, cooling = phase === 'overheated';
  ctx.save(); ctx.scale(r, r); ctx.lineJoin = 'bevel';
  ctx.fillStyle = '#090f19'; ctx.strokeStyle = '#425263'; ctx.lineWidth = 1.2 / r;
  polygon(ctx, [[-.28,-.67],[.28,-.67],[.67,-.28],[.67,.28],[.28,.67],[-.28,.67],[-.67,.28],[-.67,-.28]]);
  ctx.fill(); ctx.stroke();
  // Fixed rails and cooling channels become visible between the moving plates.
  for (let side = 0; side < 4; side++) {
    ctx.save(); ctx.rotate(side * Math.PI / 2);
    ctx.fillStyle = '#152a37'; ctx.strokeStyle = '#557080'; ctx.lineWidth = 1 / r;
    polygon(ctx, [[-.19,-.22],[.19,-.22],[.15,-.73],[-.15,-.73]]);
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = cooling ? '#91edff' : '#4d7186'; ctx.lineWidth = 1.6 / r;
    ctx.shadowColor = '#69dcff'; ctx.shadowBlur = cooling ? 5 * glowScale : 0;
    ctx.beginPath(); ctx.moveTo(-.09,-.34); ctx.lineTo(-.09,-.67);
    ctx.moveTo(.09,-.34); ctx.lineTo(.09,-.67); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#69aec1'; ctx.lineWidth = 1 / r;
    for (let vent = 0; vent < 3; vent++) {
      const y = -.4 - vent * .085;
      ctx.beginPath(); ctx.moveTo(-.14,y); ctx.lineTo(.14,y); ctx.stroke();
    }
    ctx.restore();
  }
  ctx.fillStyle = '#080f18'; ctx.strokeStyle = cooling ? '#8eeaff' : '#7c5867'; ctx.lineWidth = 1.3 / r;
  polygon(ctx, [[-.13,-.29],[.13,-.29],[.29,-.13],[.29,.13],[.13,.29],[-.13,.29],[-.29,.13],[-.29,-.13]]);
  ctx.fill(); ctx.stroke(); ctx.restore();
}

// Canonical top plate; rotate the cached sprite to obtain the other three.
export function drawArchitectPlate(ctx, render, glowScale = 1, phase = '') {
  const r = render.radius, cooling = phase === 'overheated', charging = phase === 'windup';
  const energy = cooling ? '#8eeaff' : charging ? '#ffd08b' : render.color;
  ctx.save(); ctx.scale(r, r); ctx.lineJoin = 'bevel';
  ctx.fillStyle = '#23313e'; ctx.strokeStyle = energy; ctx.lineWidth = 2 / r;
  ctx.shadowColor = energy; ctx.shadowBlur = render.glowBlur * .65 * glowScale;
  // The shallow central recess leaves clearance for the tower barrel even
  // when the facing plate has reached its fully extended cooling position.
  polygon(ctx, [[-.42,-.9],[-.13,-.9],[-.09,-.82],[.09,-.82],[.13,-.9],[.42,-.9],
    [.66,-.66],[.27,-.28],[-.27,-.28],[-.66,-.66]]);
  ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0; ctx.fillStyle = '#18232f'; ctx.strokeStyle = '#71616d'; ctx.lineWidth = .8 / r;
  polygon(ctx, [[-.33,-.8],[.33,-.8],[.48,-.65],[.2,-.36],[-.2,-.36],[-.48,-.65]]);
  ctx.fill(); ctx.stroke();
  ctx.strokeStyle = energy; ctx.lineWidth = 1.8 / r;
  ctx.shadowColor = energy; ctx.shadowBlur = 5 * glowScale;
  ctx.beginPath(); ctx.moveTo(-.25,-.81); ctx.lineTo(.25,-.81); ctx.stroke();
  ctx.shadowBlur = 0; ctx.strokeStyle = '#a58990'; ctx.lineWidth = .8 / r;
  ctx.beginPath(); ctx.moveTo(-.46,-.64); ctx.lineTo(-.21,-.39);
  ctx.moveTo(.46,-.64); ctx.lineTo(.21,-.39); ctx.stroke();
  ctx.restore();
  drawArchitectHealthCells(ctx, r, 0, '', true);
}

export function drawArchitectBody(ctx, render, glowScale = 1, phase = '', armorOpen = phase === 'overheated' ? 1 : 0) {
  drawArchitectChassis(ctx, render, glowScale, phase);
  for (let side = 0; side < 4; side++) {
    ctx.save(); ctx.rotate(side * Math.PI / 2);
    if (armorOpen > 0) ctx.translate(0, -render.radius * .32 * armorOpen);
    drawArchitectPlate(ctx, render, glowScale, phase);
    ctx.restore();
  }
}

export function drawArchitectCore(ctx, radius = 9, glowScale = 1, phase = '') {
  ctx.save();
  const cooling = phase === 'overheated';
  if (cooling) radius *= 1.18;
  const color = cooling ? '#8eeaff' : phase === 'windup' ? '#ffd08b' : '#ff7189';
  ctx.shadowColor = color; ctx.shadowBlur = 10 * glowScale;
  ctx.fillStyle = color; ctx.strokeStyle = cooling ? '#dbfaff' : '#ffb9c2'; ctx.lineWidth = 1;
  polygon(ctx, [[0,-radius],[radius,0],[0,radius],[-radius,0]]);
  ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0; ctx.fillStyle = '#ffe4df';
  const inner = radius * .42;
  polygon(ctx, [[0,-inner],[inner,0],[0,inner],[-inner,0]]);
  ctx.fill(); ctx.restore();
}

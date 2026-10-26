import { drawCarrierHealthCells } from './BossHealthVisual.js';

// Painted only into bounded sprites; both battle and bestiary share this silhouette.
function carrierPolygon(ctx, points) {
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath(); ctx.fill(); ctx.stroke();
}

export function drawCarrierBody(ctx, render, glowScale = 1, phase = 'closed') {
  const r = render.radius, exposed = phase === 'exposed', launching = phase === 'launch';
  ctx.save(); ctx.scale(r, r); ctx.lineJoin = 'miter'; ctx.lineCap = 'round';
  // The fighter's dart, stretched into a slender command ship. Deep rear
  // cutouts keep the swept wings distinct from the narrow central fuselage.
  ctx.fillStyle = '#0b1220'; ctx.strokeStyle = render.color; ctx.lineWidth = 1.7 / r;
  ctx.shadowColor = render.glowColor; ctx.shadowBlur = render.glowBlur * .65 * glowScale;
  carrierPolygon(ctx, [[1.03,0],[.24,-.09],[-.84,-.78],[-.63,-.39],[-.26,-.13],
    [-.62,-.075],[-.72,0],[-.62,.075],[-.26,.13],[-.63,.39],[-.84,.78],[.24,.09]]);
  ctx.shadowBlur = 0;
  for (const side of [-1, 1]) {
    ctx.save(); ctx.scale(1, side);
    // A single long inset follows each wing, rather than adding bulky pods.
    ctx.fillStyle = '#172134'; ctx.strokeStyle = '#77455e'; ctx.lineWidth = .7 / r;
    carrierPolygon(ctx, [[.08,-.15],[-.71,-.65],[-.57,-.41],[-.23,-.18]]);
    ctx.fillStyle = '#070d17'; ctx.strokeStyle = launching ? '#ffd28d' : '#d1688e';
    carrierPolygon(ctx, [[-.17,-.255],[-.57,-.51],[-.48,-.365],[-.26,-.22]]);
    const deckLight = launching ? '#ffdda2' : '#f182a6';
    ctx.strokeStyle = deckLight; ctx.lineWidth = 1 / r;
    ctx.shadowColor = deckLight; ctx.shadowBlur = (launching ? 7 : 2) * glowScale;
    ctx.beginPath(); ctx.moveTo(-.48, -.405); ctx.lineTo(-.26, -.26); ctx.stroke();
    // Small paired lamps light up at launch; the rest of the wing stays quiet.
    ctx.fillStyle = deckLight;
    for (let i = 0; i < 2; i++) {
      const x = -.36 + i * .1, y = -.337 + i * .064;
      carrierPolygon(ctx, [[x+.035,y],[x-.02,y-.045],[x-.02,y-.008]]);
    }
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ba718f'; ctx.lineWidth = .8 / r;
    ctx.beginPath(); ctx.moveTo(-.7, -.63); ctx.lineTo(-.57, -.43); ctx.stroke();
    ctx.restore();
  }
  // Longitudinal seams emphasize the needle nose and low-profile spine.
  ctx.strokeStyle = '#a25a78'; ctx.lineWidth = .8 / r;
  ctx.beginPath(); ctx.moveTo(.78, 0); ctx.lineTo(.2, -.055); ctx.lineTo(.08, -.09);
  ctx.moveTo(.78, 0); ctx.lineTo(.2, .055); ctx.lineTo(.08, .09); ctx.stroke();
  ctx.fillStyle = exposed ? '#123345' : '#211b2c';
  ctx.strokeStyle = exposed ? '#8deaff' : '#dd83a4'; ctx.lineWidth = 1.2 / r;
  ctx.shadowColor = exposed ? '#60dfff' : render.glowColor; ctx.shadowBlur = (exposed ? 9 : 3) * glowScale;
  // A small elongated reactor replaces the heavy hexagonal hub.
  carrierPolygon(ctx, [[.18,0],[-.055,-.105],[-.31,0],[-.055,.105]]);
  ctx.shadowBlur = 0;
  if (exposed) {
    ctx.fillStyle = '#d0faff'; ctx.strokeStyle = '#84e6ff'; ctx.lineWidth = .8 / r;
    carrierPolygon(ctx, [[.08,0],[-.055,-.045],[-.2,0],[-.055,.045]]);
  } else {
    ctx.strokeStyle = '#f49fbd'; ctx.lineWidth = .8 / r;
    ctx.beginPath(); ctx.moveTo(-.22, 0); ctx.lineTo(.09, 0); ctx.stroke();
  }
  // Two restrained engine accents at the stern, with no large bloom halo.
  ctx.strokeStyle = '#ffadcb'; ctx.lineWidth = 1.5 / r;
  ctx.shadowColor = render.glowColor; ctx.shadowBlur = 4 * glowScale;
  ctx.beginPath(); ctx.moveTo(-.63, -.04); ctx.lineTo(-.56, -.04);
  ctx.moveTo(-.63, .04); ctx.lineTo(-.56, .04); ctx.stroke();
  ctx.restore();
  for (const side of [-1, 1]) {
    ctx.save(); ctx.scale(1, side);
    drawCarrierHealthCells(ctx, r, 0, '', true); ctx.restore();
  }
}

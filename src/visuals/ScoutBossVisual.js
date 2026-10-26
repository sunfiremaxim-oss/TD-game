import { drawScoutBossHealthCells } from './BossHealthVisual.js';

function scoutBossPolygon(ctx, points) {
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
  ctx.closePath(); ctx.fill(); ctx.stroke();
}

// Three separate armor rails and corner prongs surround a triangular reactor.
// All detail is baked into one bounded hull sprite, shared with the bestiary.
export function drawScoutBossBody(ctx, render, glowScale = 1) {
  const r = render.radius;
  ctx.save(); ctx.scale(r,r); ctx.lineJoin = 'bevel'; ctx.lineCap = 'butt';
  // Recessed chassis remains visible through the gaps between armor modules.
  ctx.fillStyle = '#0a1420'; ctx.strokeStyle = '#766447'; ctx.lineWidth = 1.2 / r;
  scoutBossPolygon(ctx, [[.64,-.05],[.64,.05],[-.277,.579],[-.363,.529],[-.363,-.529],[-.277,-.579]]);
  for (let side = 0; side < 3; side++) {
    ctx.save(); ctx.rotate(side * Math.PI * 2 / 3);
    // Narrow support and energy conduit connect each prong to the reactor.
    ctx.fillStyle = '#27313a'; ctx.strokeStyle = '#8d784e'; ctx.lineWidth = 1 / r;
    scoutBossPolygon(ctx, [[.25,-.07],[.69,-.06],[.79,0],[.69,.06],[.25,.07]]);
    ctx.strokeStyle = '#ffcd69'; ctx.lineWidth = 1.7 / r;
    ctx.shadowColor = render.glowColor; ctx.shadowBlur = 4 * glowScale;
    ctx.beginPath(); ctx.moveTo(.36,0); ctx.lineTo(.66,0); ctx.stroke();
    // Chamfered side rail houses the existing health cells. Breaking the
    // outline at the corners gives a clear mechanical silhouette at phone size.
    ctx.shadowBlur = render.glowBlur * .6 * glowScale;
    ctx.fillStyle = '#19232e'; ctx.strokeStyle = render.color; ctx.lineWidth = 1.5 / r;
    scoutBossPolygon(ctx, [[.89,-.035],[.81,.105],[-.32,.757],[-.475,.79],[-.39,.595],[.66,-.025]]);
    ctx.shadowBlur = 0; ctx.strokeStyle = '#78684b'; ctx.lineWidth = .8 / r;
    ctx.beginPath(); ctx.moveTo(.59,.12); ctx.lineTo(-.30,.635); ctx.stroke();
    // Forked tips echo the scout's three vertices without becoming a solid slab.
    ctx.fillStyle = '#29303a'; ctx.strokeStyle = '#ffe29a'; ctx.lineWidth = 1.4 / r;
    scoutBossPolygon(ctx, [[1,0],[.74,-.18],[.57,-.13],[.70,0],[.57,.13],[.74,.18]]);
    ctx.strokeStyle = '#fff1c2'; ctx.lineWidth = 2 / r;
    ctx.shadowColor = render.glowColor; ctx.shadowBlur = 5 * glowScale;
    ctx.beginPath(); ctx.moveTo(.81,-.065); ctx.lineTo(.92,0); ctx.lineTo(.81,.065); ctx.stroke();
    ctx.restore();
  }
  ctx.shadowBlur = 0; ctx.fillStyle = '#080f1b'; ctx.strokeStyle = '#a88c55'; ctx.lineWidth = 1.4 / r;
  scoutBossPolygon(ctx, [[.39,0],[-.195,.33775],[-.195,-.33775]]);
  ctx.fillStyle = '#342c25'; ctx.strokeStyle = '#ffe6a0'; ctx.lineWidth = 1.6 / r;
  ctx.shadowColor = render.glowColor; ctx.shadowBlur = 8 * glowScale;
  scoutBossPolygon(ctx, [[.29,0],[-.145,.251147],[-.145,-.251147]]);
  ctx.shadowBlur = 0; ctx.fillStyle = '#ffe1a1'; ctx.strokeStyle = '#fff2d0'; ctx.lineWidth = .9 / r;
  scoutBossPolygon(ctx, [[.16,0],[-.08,.138564],[-.08,-.138564]]);
  ctx.fillStyle = '#fff6db';
  scoutBossPolygon(ctx, [[.075,0],[-.0375,.0649519],[-.0375,-.0649519]]);
  ctx.restore();
  for (let side = 0; side < 3; side++) {
    ctx.save(); ctx.rotate(side * Math.PI * 2 / 3);
    drawScoutBossHealthCells(ctx,r,0,'',true); ctx.restore();
  }
}

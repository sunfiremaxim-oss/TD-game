import { drawRailgunHealthCells } from './BossHealthVisual.js';
import { getRailgunShieldHealth } from '../combat/RailgunMechanics.js';

function railgunPolygon(ctx, points) {
  ctx.beginPath(); points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
  ctx.closePath(); ctx.fill(); ctx.stroke();
}

// A split diamond: the sniper silhouette becomes a pair of long rail arms.
// Only four fixed variants are painted into the shared enemy sprite cache.
export function drawRailgunBody(ctx,render,glowScale=1,phase='idle') {
  const r=render.radius, hot=phase==='charge'||phase==='firing', cool=phase==='cooldown';
  const light=cool?'#7bdcff':hot?'#ffe4b5':render.color;
  ctx.save(); ctx.scale(r,r); ctx.lineJoin='bevel';
  ctx.shadowColor=hot?'#ff8c30':render.glowColor; ctx.shadowBlur=render.glowBlur*.65*glowScale;
  ctx.fillStyle='#111b29'; ctx.strokeStyle=render.color; ctx.lineWidth=1.7/r;
  railgunPolygon(ctx,[[-.98,0],[-.55,-.37],[-.22,-.26],[.32,-.12],[.40,0],[.32,.12],[-.22,.26],[-.55,.37]]);
  ctx.shadowBlur=0;
  for(const side of [-1,1]) {
    ctx.save(); ctx.scale(1,side);
    // Shoulder is broad, muzzle slender. The open channel shows the barrel.
    ctx.fillStyle='#1d2937'; ctx.strokeStyle=render.color; ctx.lineWidth=1.6/r;
    railgunPolygon(ctx,[[-.74,-.24],[-.26,-.57],[.20,-.43],[1,-.14],[.91,-.055],[.31,-.18],[-.21,-.27],[-.52,-.14]]);
    ctx.strokeStyle='#725744'; ctx.lineWidth=.8/r;
    ctx.beginPath(); ctx.moveTo(-.51,-.27); ctx.lineTo(-.24,-.45); ctx.lineTo(.18,-.34); ctx.lineTo(.70,-.16); ctx.stroke();
    ctx.fillStyle='#080f1b'; ctx.strokeStyle='#a07954';
    railgunPolygon(ctx,[[.15,-.28],[.88,-.15],[.91,-.09],[.27,-.20]]);
    ctx.strokeStyle=light; ctx.lineWidth=(hot?2.7:1.5)/r;
    ctx.shadowColor=light; ctx.shadowBlur=(hot?9:3)*glowScale;
    ctx.beginPath(); ctx.moveTo(.27,-.205); ctx.lineTo(.91,-.105); ctx.stroke();
    // Three charge capacitors are readable as a group, even on small screens.
    ctx.shadowBlur=0; ctx.strokeStyle=light; ctx.lineWidth=2/r;
    for(let i=0;i<3;i++) {
      const x=-.22+i*.14, y=-.32+i*.032;
      ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+.05,y-.075); ctx.stroke();
    }
    ctx.restore();
  }
  // A narrow rear engine and suspended optical reactor preserve the diamond.
  ctx.strokeStyle='#ffb174'; ctx.lineWidth=2/r;
  ctx.beginPath(); ctx.moveTo(-.91,-.06); ctx.lineTo(-.98,0); ctx.lineTo(-.91,.06); ctx.stroke();
  ctx.fillStyle=cool?'#14313e':'#39271e'; ctx.strokeStyle=light; ctx.lineWidth=1.5/r;
  ctx.shadowColor=light; ctx.shadowBlur=(hot?10:4)*glowScale;
  railgunPolygon(ctx,[[.23,0],[-.21,-.17],[-.56,0],[-.21,.17]]);
  ctx.shadowBlur=0; ctx.fillStyle=hot?'#fff4dc':cool?'#bcf5ff':'#ffc78b'; ctx.lineWidth=.8/r;
  railgunPolygon(ctx,[[.06,0],[-.21,-.075],[-.38,0],[-.21,.075]]);
  ctx.restore();
  for(const side of [-1,1]) {
    ctx.save(); ctx.scale(1,side); drawRailgunHealthCells(ctx,r,0,'',true); ctx.restore();
  }
}

// One small shared texture; shield HP changes opacity, never the cache key.
export class RailgunShieldVisual {
  constructor(createCanvas=()=>document.createElement('canvas')) {
    this.createCanvas=createCanvas; this.layer=null;
  }
  _build() {
    this.layer=this.createCanvas(); this.layer.width=192; this.layer.height=160;
    const c=this.layer.getContext('2d'); c.translate(96,80); c.scale(64,64);
    const outline=()=>{
      c.beginPath(); c.moveTo(.70,-.65); c.lineTo(1.02,-.37); c.lineTo(1.13,0);
      c.lineTo(1.02,.37); c.lineTo(.70,.65); c.lineTo(.83,.25);
      c.lineTo(.87,0); c.lineTo(.83,-.25); c.closePath();
    };
    c.save(); outline(); c.clip();
    const fill=c.createLinearGradient(.7,0,1.15,0);
    fill.addColorStop(0,'#66dfff10'); fill.addColorStop(.65,'#75dcff40'); fill.addColorStop(1,'#d1f7ff65');
    c.fillStyle=fill; c.fillRect(.65,-.72,.55,1.44);
    c.strokeStyle='#9ceaff66'; c.lineWidth=.009;
    for(let row=-5;row<=5;row++) for(let col=0;col<5;col++) {
      const x=.60+col*.15,y=row*.1732+(col%2)*.0866;
      c.beginPath();
      for(let i=0;i<6;i++) {
        const angle=i*Math.PI/3,px=x+Math.cos(angle)*.10,py=y+Math.sin(angle)*.10;
        if(i)c.lineTo(px,py);else c.moveTo(px,py);
      }
      c.closePath();c.stroke();
    }
    c.restore(); outline();c.strokeStyle='#79dfff80';c.lineWidth=.013;
    c.shadowColor='#58d7ff';c.shadowBlur=6;c.stroke();
    c.shadowBlur=0;c.strokeStyle='#c2f4ff';c.lineWidth=.023;
    c.beginPath();c.moveTo(.87,-.50);c.lineTo(1.02,-.37);c.lineTo(1.13,0);c.lineTo(1.02,.37);c.lineTo(.87,.50);c.stroke();
  }
  draw(ctx,render,rail) {
    if(getRailgunShieldHealth(rail)<=0||rail.shieldMax<=0) return;
    if(!this.layer)this._build();
    const scale=render.radius/64,ratio=Math.max(0,Math.min(1,rail.shieldHp/rail.shieldMax));
    ctx.save();ctx.shadowBlur=0;
    ctx.globalAlpha*=.55+.30*ratio+.06*Math.sin(rail.elapsed*5);
    ctx.drawImage(this.layer,-96*scale,-80*scale,192*scale,160*scale);
    if(rail.shieldHitRemaining>0) {
      ctx.globalCompositeOperation='lighter';ctx.globalAlpha*=Math.min(1,rail.shieldHitRemaining/.16);
      ctx.drawImage(this.layer,-96*scale,-80*scale,192*scale,160*scale);
    }
    ctx.restore();
  }
}

export class RailgunBeamVisual {
  constructor(createCanvas=()=>document.createElement('canvas')) {
    this.createCanvas=createCanvas; this.beam=null;
  }
  draw(ctx,x,y,angle,length,phase,progress) {
    if(length<=0) return;
    ctx.save(); ctx.translate(x,y); ctx.rotate(angle); ctx.shadowBlur=0;
    if(phase==='charge') {
      ctx.globalAlpha*=.3+.65*progress; ctx.strokeStyle='#ffc07d'; ctx.lineWidth=.7+progress;
      ctx.setLineDash([4,5]); ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(length,0); ctx.stroke(); ctx.setLineDash([]);
      ctx.translate(length,0); ctx.strokeStyle='#ffbc7b'; ctx.lineWidth=1.2;
      const size=8-3*progress;
      ctx.beginPath(); ctx.moveTo(-size,-size); ctx.lineTo(-size,size); ctx.moveTo(size,-size); ctx.lineTo(size,size); ctx.stroke();
    } else if(phase==='firing') {
      if(!this.beam) {
        this.beam=this.createCanvas(); this.beam.width=256; this.beam.height=48;
        const c=this.beam.getContext('2d'), gradient=c.createLinearGradient(0,0,0,48);
        for(const [p,color] of [[0,'#ff802000'],[.28,'#ff802025'],[.43,'#ffb766b0'],[.49,'#fff8df'],[.51,'#fff8df'],[.57,'#ffb766b0'],[.72,'#ff802025'],[1,'#ff802000']]) gradient.addColorStop(p,color);
        c.fillStyle=gradient; c.fillRect(0,0,256,48);
      }
      ctx.globalCompositeOperation='lighter'; ctx.globalAlpha*=Math.min(1,progress*4);
      ctx.drawImage(this.beam,0,-11,length,22);
      ctx.fillStyle='#fff1cc'; ctx.fillRect(length-2,-3,4,6);
    }
    ctx.restore();
  }
}

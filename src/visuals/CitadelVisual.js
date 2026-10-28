import { drawCitadelHealthCells } from './BossHealthVisual.js';
import { AegisShieldVisual } from './AegisShieldVisual.js';
import { GameConfig } from '../config/GameConfig.js';

export function getCitadelShieldRadius() {
  return GameConfig.enemies.boss_citadel.generatorOrbit + GameConfig.enemies.citadel_generator.radius + 12;
}

// Independent atlas avoids resolution thrashing with ordinary Aegis domes.
// Six short, cached feeds visibly connect the live generators to one membrane.
export class CitadelShieldVisual {
  constructor(createCanvas = () => document.createElement('canvas')) {
    this.createCanvas = createCanvas;
    this.dome = new AegisShieldVisual(createCanvas);
    this.emitter = null;
  }
  _getEmitter() {
    if (this.emitter) return this.emitter;
    const canvas = this.createCanvas();canvas.width = canvas.height = 96;
    const c = canvas.getContext('2d');c.translate(48,48);
    const tip = getCitadelShieldRadius()-GameConfig.enemies.boss_citadel.generatorOrbit;
    c.strokeStyle = '#a5eaff';c.lineWidth = 1.3;c.lineCap = 'round';
    c.shadowColor = '#59bfff';c.shadowBlur = 7;
    c.beginPath();c.moveTo(5,0);c.lineTo(tip-1,0);c.stroke();
    // Only a local energized patch, never a hard circumference around the dome.
    c.beginPath();c.moveTo(tip-3,-8);c.quadraticCurveTo(tip+1,0,tip-3,8);c.stroke();
    c.shadowBlur = 0;c.fillStyle = '#d9f6ff';c.beginPath();c.arc(5,0,2,0,Math.PI*2);c.fill();
    this.emitter = canvas;return canvas;
  }
  draw(ctx, generatorMask, time, rotation, pixelScale = 1) {
    const mask = generatorMask & 63;
    if (!mask) return;
    this.dome.draw(ctx,0,0,getCitadelShieldRadius(),time,pixelScale,0,rotation,1.35);
    const emitter = this._getEmitter(), orbit = GameConfig.enemies.boss_citadel.generatorOrbit;
    ctx.save();ctx.shadowBlur = 0;ctx.rotate(rotation);
    for (let slot = 0; slot < 6; slot++) {
      if (!(mask & (1 << slot))) continue;
      const angle = slot*Math.PI/3;
      ctx.save();ctx.translate(Math.cos(angle)*orbit,Math.sin(angle)*orbit);ctx.rotate(angle);
      ctx.globalAlpha *= .55+.12*Math.sin(time*2.1+slot*1.3);
      ctx.drawImage(emitter,-48,-48);ctx.restore();
    }
    ctx.restore();
  }
}

function citadelHex(ctx,radius,angle=0) {
  ctx.beginPath();
  for(let i=0;i<6;i++) {
    const a=angle+i*Math.PI/3,x=Math.cos(a)*radius,y=Math.sin(a)*radius;
    if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);
  }
  ctx.closePath();
}

// Two hull states and one module sprite. Animation never enters a cache key.
export function drawCitadelBody(ctx,render,glowScale=1,phase='protected') {
  const r=render.radius,open=phase==='exposed',light=open?'#ffd89e':'#9fddff';
  ctx.save();ctx.scale(r,r);ctx.lineJoin='bevel';
  ctx.fillStyle='#0d182a';ctx.strokeStyle='#628bb2';ctx.lineWidth=2/r;
  ctx.shadowColor=render.glowColor;ctx.shadowBlur=10*glowScale;
  citadelHex(ctx,.96);ctx.fill();ctx.stroke();ctx.shadowBlur=0;
  // Six armored sectors, recessed seams and short mounting pylons.
  for(let i=0;i<6;i++) {
    ctx.save();ctx.rotate(i*Math.PI/3);
    ctx.fillStyle='#1a2c42';ctx.strokeStyle='#7dabc8';ctx.lineWidth=1.2/r;
    ctx.beginPath();ctx.moveTo(.38,-.16);ctx.lineTo(.80,-.40);ctx.lineTo(.93,0);
    ctx.lineTo(.80,.40);ctx.lineTo(.38,.16);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.strokeStyle='#314d6c';ctx.lineWidth=3/r;ctx.beginPath();ctx.moveTo(.55,0);ctx.lineTo(1.08,0);ctx.stroke();
    ctx.strokeStyle=light;ctx.lineWidth=1.2/r;ctx.beginPath();ctx.moveTo(.95,-.065);ctx.lineTo(1.04,-.065);
    ctx.moveTo(.95,.065);ctx.lineTo(1.04,.065);ctx.stroke();ctx.restore();
  }
  ctx.fillStyle=open?'#422c23':'#132e48';ctx.strokeStyle=light;ctx.lineWidth=1.7/r;
  ctx.shadowColor=light;ctx.shadowBlur=8*glowScale;citadelHex(ctx,.33,Math.PI/6);ctx.fill();ctx.stroke();
  ctx.shadowBlur=0;ctx.fillStyle=open?'#fff0c6':'#c2f0ff';citadelHex(ctx,.13,Math.PI/6);ctx.fill();
  ctx.strokeStyle=light;ctx.lineWidth=1/r;citadelHex(ctx,.23,Math.PI/6);ctx.stroke();
  ctx.restore();drawCitadelHealthCells(ctx,r,0,'',true);
}

export function drawCitadelGenerator(ctx,render,glowScale=1) {
  const r=render.radius;
  ctx.save();ctx.scale(r,r);ctx.lineJoin='bevel';
  ctx.shadowColor=render.glowColor;ctx.shadowBlur=8*glowScale;
  ctx.fillStyle='#11263a';ctx.strokeStyle='#a3eaff';ctx.lineWidth=1.5/r;
  citadelHex(ctx,1);ctx.fill();ctx.stroke();ctx.shadowBlur=0;
  ctx.fillStyle='#286084';ctx.strokeStyle='#71d5ff';ctx.lineWidth=1/r;
  citadelHex(ctx,.49,Math.PI/6);ctx.fill();ctx.stroke();
  ctx.fillStyle='#e1fbff';citadelHex(ctx,.21,Math.PI/6);ctx.fill();
  ctx.restore();drawCitadelHealthCells(ctx,r,0,'',true);
}

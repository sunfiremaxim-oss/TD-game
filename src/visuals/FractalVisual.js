import { getHealthRatio, getHealthColor } from './HealthVisuals.js';

// Geometry is generated once. Each fork is a smaller copy of its parent fork.
function makeFractalBranchGeometry() {
  const segments = [{ x: -.82, y: 0, endX: -.08, endY: 0, depth: 0 }], nodes = [];
  const grow = (x,y,angle,length,depth) => {
    for (const side of [-1,1]) {
      const direction = angle + side*Math.PI/3;
      const endX = x+Math.cos(direction)*length, endY = y+Math.sin(direction)*length;
      segments.push({x,y,endX,endY,depth});nodes.push({x:endX,y:endY,depth});
      if (depth < 3) grow(endX,endY,direction,length*.5,depth+1);
    }
  };
  grow(-.08,0,0,.62,1);
  return {segments,nodes};
}

function makeFractalCoreGeometry() {
  const segments = [], nodes = [];
  for (let arm = 0; arm < 4; arm++) {
    const angle = arm*Math.PI/2, c = Math.cos(angle), s = Math.sin(angle);
    const rotate = (x,y) => [x*c-y*s,x*s+y*c];
    for (const [x,y,endX,endY,depth] of [[.28,0,.87,0,0],[.51,0,.51,-.23,1],
      [.51,0,.51,.23,1],[.51,-.23,.66,-.23,2],[.51,.23,.66,.23,2],
      [.66,-.23,.66,-.31,3],[.66,.23,.66,.31,3]]) {
      const a = rotate(x,y), b = rotate(endX,endY);
      segments.push({x:a[0],y:a[1],endX:b[0],endY:b[1],depth});
      nodes.push({x:b[0],y:b[1],depth});
    }
  }
  return {segments,nodes};
}

const FRACTAL_BRANCH_GEOMETRY = makeFractalBranchGeometry();
const FRACTAL_CORE_GEOMETRY = makeFractalCoreGeometry();
const FRACTAL_TRACK = [[-.26,-.13],[-.13,-.26],[.13,-.26],[.26,-.13],[.26,.13],[.13,.26],[-.13,.26],[-.26,.13],[-.26,-.13]];
const FRACTAL_HEALTH_MARKS = FRACTAL_TRACK.slice(1).flatMap((end,i) => {
  const start = FRACTAL_TRACK[i], dx = end[0]-start[0], dy = end[1]-start[1];
  return [0,1].map(part => ({x:start[0]+dx*(part+.12)/2,y:start[1]+dy*(part+.12)/2,
    endX:start[0]+dx*(part+.88)/2,endY:start[1]+dy*(part+.88)/2}));
});
const FRACTAL_BRANCH_HEALTH_MARKS = [[-.70,-.065,-.15,-.065],[-.70,.065,-.15,.065],
  [-.01,-.12,.23,-.537],[-.01,.12,.23,.537]].flatMap(([x,y,endX,endY]) =>
  Array.from({length:4},(_,i)=>({x:x+(endX-x)*(i+.12)/4,y:y+(endY-y)*(i+.12)/4,
    endX:x+(endX-x)*(i+.88)/4,endY:y+(endY-y)*(i+.88)/4})));

function fractalChamferedNode(ctx,x,y,size) {
  const bevel = size*.32;
  ctx.beginPath();ctx.moveTo(x-size+bevel,y-size);ctx.lineTo(x+size-bevel,y-size);
  ctx.lineTo(x+size,y-size+bevel);ctx.lineTo(x+size,y+size-bevel);
  ctx.lineTo(x+size-bevel,y+size);ctx.lineTo(x-size+bevel,y+size);
  ctx.lineTo(x-size,y+size-bevel);ctx.lineTo(x-size,y-size+bevel);ctx.closePath();
}

function paintFractalGeometry(ctx,geometry,render,glowScale,charged,small=false) {
  const radius = render.radius, light = charged ? '#ecffdb' : render.color || '#9bf58a';
  const branch = geometry===FRACTAL_BRANCH_GEOMETRY;
  const maxDepth = small ? 2 : 3;
  ctx.save();ctx.scale(radius,radius);ctx.lineJoin = 'miter';ctx.lineCap = 'square';
  // Broad, dark struts leave real negative space between the repeated forks.
  for (let depth = 0; depth <= maxDepth; depth++) {
    ctx.beginPath();
    for (const edge of geometry.segments) {
      if (edge.depth !== depth) continue;
      ctx.moveTo(edge.x,edge.y);ctx.lineTo(edge.endX,edge.endY);
    }
    const width = .125*Math.pow(.57,depth);
    ctx.shadowBlur = 0;ctx.strokeStyle = '#061c1b';ctx.lineWidth = width+2.2/radius;ctx.stroke();
    ctx.strokeStyle = depth > 1 ? '#4ca77d' : '#77cfa0';ctx.lineWidth = width;ctx.stroke();
    ctx.strokeStyle = '#112c27';ctx.lineWidth = Math.max(.012,width-1.7/radius);ctx.stroke();
  }
  ctx.beginPath();
  for (const edge of geometry.segments) {
    if (edge.depth > maxDepth) continue;
    ctx.moveTo(edge.x,edge.y);ctx.lineTo(edge.endX,edge.endY);
  }
  ctx.strokeStyle = charged ? '#c9ffac' : '#8af79c';ctx.lineWidth = (charged?1.55:branch?1.1:.95)/radius;
  ctx.shadowColor = render.glowColor || '#67ed91';ctx.shadowBlur = (charged?9:branch?6:4)*glowScale;ctx.stroke();
  ctx.shadowBlur = 0;
  for (const node of geometry.nodes) {
    if (node.depth > maxDepth) continue;
    const size = Math.max(.023,.073*Math.pow(.62,node.depth));
    fractalChamferedNode(ctx,node.x,node.y,size);
    ctx.fillStyle = '#092b23';ctx.strokeStyle = node.depth===maxDepth ? '#94fcb1' : '#70c99b';
    ctx.lineWidth = .85/radius;ctx.fill();ctx.stroke();
    if (charged || node.depth===maxDepth) {
      ctx.fillStyle = light;ctx.fillRect(node.x-size*.26,node.y-size*.26,size*.52,size*.52);
    }
  }
  if (branch) {
    // The detached piece remains a fork, not another processor on a satellite.
    fractalChamferedNode(ctx,-.08,0,.085);ctx.fillStyle = '#174b35';ctx.strokeStyle = light;
    ctx.lineWidth = 1/radius;ctx.fill();ctx.stroke();
    ctx.fillStyle = charged ? '#f0ffcf' : '#bbffbb';ctx.fillRect(-.105,-.025,.05,.05);
  } else {
    // Only the main core has a suspended processor; the branches are its veins.
    fractalChamferedNode(ctx,0,0,.295);ctx.fillStyle = '#071c20';ctx.strokeStyle = '#589b86';ctx.lineWidth = 1/radius;ctx.fill();ctx.stroke();
    fractalChamferedNode(ctx,0,0,.16);ctx.fillStyle = charged ? '#34513a' : '#12382d';
    ctx.strokeStyle = light;ctx.lineWidth = 1.2/radius;
    ctx.shadowColor = '#8bfd9c';ctx.shadowBlur = (charged?9:4)*glowScale;ctx.fill();ctx.stroke();
    ctx.shadowBlur = 0;ctx.fillStyle = charged ? '#f0ffcf' : '#c6ffb4';
    ctx.fillRect(-.045,-.045,.09,.09);
  }
  ctx.restore();
}

// Paint only into EnemyVisualCache: phase is a fixed idle/charge/firing variant.
export function drawFractalCore(ctx,render,glowScale=1,phase='idle') {
  paintFractalGeometry(ctx,FRACTAL_CORE_GEOMETRY,render,glowScale,phase==='charge'||phase==='firing');
}

// Local +X points outward. Small fragments reuse the same repeated-fork grammar.
export function drawFractalBranch(ctx,render,glowScale=1,variant='large') {
  paintFractalGeometry(ctx,FRACTAL_BRANCH_GEOMETRY,render,glowScale,variant==='charge'||variant==='firing',variant==='small');
}

// Two unblurred strokes inside the processor; health never enters a sprite key.
export function drawFractalHealth(ctx,render,health,isBranch=false) {
  const radius = render.radius, ratio = getHealthRatio(health.current,health.max);
  const marks = isBranch ? FRACTAL_BRANCH_HEALTH_MARKS : FRACTAL_HEALTH_MARKS;
  ctx.save();ctx.scale(radius,radius);ctx.shadowBlur = 0;ctx.lineCap = 'butt';ctx.lineWidth = Math.max(1.25,Math.min(2.1,radius*.075))/radius;
  const trace = fill => {
    ctx.beginPath();
    for (let i = 0; i < marks.length; i++) {
      const weight = Math.max(0,Math.min(1,fill*marks.length-i));
      if (weight<=0) break;
      const mark = marks[i];ctx.moveTo(mark.x,mark.y);
      ctx.lineTo(mark.x+(mark.endX-mark.x)*weight,mark.y+(mark.endY-mark.y)*weight);
    }
  };
  trace(1);ctx.strokeStyle = '#31564a';ctx.stroke();
  if (ratio>0) {trace(ratio);ctx.strokeStyle = getHealthColor(ratio);ctx.stroke();}
  ctx.restore();
}

export const FRACTAL_DISCHARGE_ATLAS = Object.freeze({variants:4,columns:2,width:512,height:192});

// World-space coordinates. Fixed textures draw energy flowing from branch roots
// into the core; visual charge is independent of the single damage event.
export class FractalChargeVisual {
  constructor(createCanvas = () => document.createElement('canvas')) {
    this.createCanvas = createCanvas;this.flare = null;this.link = null;
  }
  _getFlare() {
    if (this.flare) return this.flare;
    const canvas = this.createCanvas();canvas.width = canvas.height = 48;
    const c = canvas.getContext('2d');c.translate(24,24);
    c.fillStyle = '#83ff9e';c.shadowColor = '#56ef87';c.shadowBlur = 11;
    c.beginPath();c.arc(0,0,3.1,0,Math.PI*2);c.fill();
    c.shadowBlur = 0;c.fillStyle = '#eaffd3';c.beginPath();c.arc(0,0,1.5,0,Math.PI*2);c.fill();
    this.flare = canvas;return canvas;
  }
  _getLink() {
    if (this.link) return this.link;
    const canvas = this.createCanvas();canvas.width = 128;canvas.height = 32;
    const c = canvas.getContext('2d');
    for (let state = 0; state < 2; state++) {
      const y = state*16+8;
      c.save();c.beginPath();c.rect(0,state*16,128,16);c.clip();
      c.shadowBlur = 0;c.strokeStyle = '#061c1b';c.lineWidth = 6;
      c.beginPath();c.moveTo(0,y);c.lineTo(128,y);c.stroke();
      c.strokeStyle = state ? '#c3ffb2' : '#67b78c';c.lineWidth = state ? 1.15 : .85;
      c.shadowColor = '#5af387';c.shadowBlur = state ? 4 : 0;
      c.beginPath();c.moveTo(0,y-2);c.lineTo(128,y-2);c.moveTo(0,y+2);c.lineTo(128,y+2);c.stroke();
      c.restore();
    }
    this.link = canvas;return canvas;
  }
  // Draw before the bodies, which hide the overlapping ends of the strut.
  drawLink(ctx,x1,y1,x2,y2,charged=false) {
    const dx = x2-x1,dy = y2-y1,length = Math.hypot(dx,dy);
    if (length<1) return;
    const texture = this._getLink();
    ctx.save();ctx.shadowBlur = 0;ctx.translate(x1,y1);ctx.rotate(Math.atan2(dy,dx));
    ctx.drawImage(texture,0,charged?16:0,128,16,0,-8,length,16);ctx.restore();
  }
  // progress is charge completion, 0→1. Three staggered pulses per live branch.
  draw(ctx,sourceX,sourceY,branchPositions,progress) {
    if (!branchPositions?.length) return;
    const amount = Math.max(0,Math.min(1,progress)), texture = this._getFlare();
    ctx.save();ctx.shadowBlur = 0;
    for (let branch = 0; branch < Math.min(4,branchPositions.length); branch++) {
      const point = branchPositions[branch];
      for (let pulse = 0; pulse < 3; pulse++) {
        const travel = amount*1.35-pulse*.22;
        if (travel<0 || travel>1) continue;
        const x = point.x+(sourceX-point.x)*travel,y = point.y+(sourceY-point.y)*travel;
        const size = 15-pulse*1.5;
        ctx.save();ctx.globalAlpha *= (.52+.32*Math.sin(travel*Math.PI))*(.65+amount*.35);
        ctx.drawImage(texture,x-size/2,y-size/2,size,size);ctx.restore();
      }
    }
    ctx.restore();
  }
}

// One fixed 1024×384 atlas. Seed selects one of four baked patterns, never a key.
export class FractalDischargeVisual {
  constructor(createCanvas = () => document.createElement('canvas')) {
    this.createCanvas = createCanvas;this.texture = null;
  }
  _getTexture() {
    if (this.texture) return this.texture;
    const cfg = FRACTAL_DISCHARGE_ATLAS, canvas = this.createCanvas();
    canvas.width = cfg.width*cfg.columns;canvas.height = cfg.height*Math.ceil(cfg.variants/cfg.columns);
    const ctx = canvas.getContext('2d');
    for (let variant = 0; variant < cfg.variants; variant++) {
      let state = 571+variant*1129;
      const random = () => {state = (Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
      const edges = [], points = [{x:3,y:96}];
      for (let i = 1; i <= 15; i++) points.push({x:3+i*506/15,y:96+(random()-.5)*31*Math.sin(Math.PI*i/15)});
      for (let i = 1; i < points.length; i++) edges.push([points[i-1].x,points[i-1].y,points[i].x,points[i].y]);
      const fork = (x,y,angle,length,depth) => {
        const endX = x+Math.cos(angle)*length,endY = y+Math.sin(angle)*length;
        edges.push([x,y,endX,endY]);
        if (depth<2) for (const side of [-1,1]) fork(endX,endY,angle+side*.72,length*.48,depth+1);
      };
      for (const index of [3,6,9,12]) {
        const point = points[index],side = index%2 ? -1 : 1;
        fork(point.x,point.y,side*(.82+random()*.25),32+random()*18,0);
      }
      ctx.save();ctx.translate((variant%cfg.columns)*cfg.width,Math.floor(variant/cfg.columns)*cfg.height);
      ctx.beginPath();ctx.rect(0,0,cfg.width,cfg.height);ctx.clip();
      ctx.beginPath();for (const edge of edges) {ctx.moveTo(edge[0],edge[1]);ctx.lineTo(edge[2],edge[3]);}
      ctx.lineJoin = 'bevel';ctx.strokeStyle = '#6bee95';ctx.lineWidth = 3.5;
      ctx.shadowColor = '#57ed86';ctx.shadowBlur = 10;ctx.stroke();
      ctx.shadowBlur = 0;ctx.strokeStyle = '#e8ffd7';ctx.lineWidth = 1.15;ctx.stroke();
      ctx.fillStyle = '#e8ffd7';ctx.fillRect(1,93,5,6);ctx.fillRect(506,92,5,8);ctx.restore();
    }
    this.texture = canvas;return canvas;
  }
  // progress is the remaining fraction: 1 at impact, 0 when the flash expires.
  draw(ctx,sourceX,sourceY,targetX,targetY,progress,seed=0) {
    const amount = Math.max(0,Math.min(1,progress));
    const dx = targetX-sourceX,dy = targetY-sourceY,length = Math.hypot(dx,dy);
    if (amount<=0 || length<1) return;
    const texture = this._getTexture(),cfg = FRACTAL_DISCHARGE_ATLAS;
    const frame = ((Math.floor(seed)%cfg.variants)+cfg.variants)%cfg.variants;
    const height = Math.min(100,Math.max(38,length*.4));
    ctx.save();ctx.shadowBlur = 0;ctx.translate(sourceX,sourceY);ctx.rotate(Math.atan2(dy,dx));
    ctx.globalAlpha *= Math.min(1,amount*5);
    ctx.drawImage(texture,(frame%cfg.columns)*cfg.width,Math.floor(frame/cfg.columns)*cfg.height,cfg.width,cfg.height,
      0,-height/2,length,height);ctx.restore();
  }
}

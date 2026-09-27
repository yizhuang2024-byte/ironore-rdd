// Hand-drawn line-art component library (pure SVG strings, deterministic in time).
'use strict';
const W = 1920, H = 1080;
const COL = {
  ink: '#2b2520', paper: '#f1e8d4', red: '#b8352a', pink: '#e59aa7', gold: '#c49a3c',
  night: '#14203a', nightInk: '#eadbb0', glow: '#ffd98c',
};
// Global per-frame state (set by engine before a scene function runs).
const G = { t: 0, night: false, frame: 0 };

const cl = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = x => { x = cl(x); return x * x * (3 - 2 * x); };
const easeOut = x => 1 - Math.pow(1 - cl(x), 3);
const lerp = (a, b, k) => a + (b - a) * k;
const rnd = i => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const f1 = n => (Math.round(n * 10) / 10);
const INK = () => (G.night ? COL.nightInk : COL.ink);
const BG = () => (G.night ? COL.night : COL.paper);
// draw progress of an element that starts at s and takes dur seconds
const dp = (s, dur = 1) => ease((G.t - s) / dur);

// A single "ink" path that draws itself on. fill:'bg' gives an opaque paper-coloured
// fill so foreground objects hide what is behind them.
function L(d, o = {}) {
  const p = o.p != null ? o.p : dp(o.s || 0, o.dur || 1);
  if (p <= 0.002) return '';
  const col = o.col || INK();
  let fill = o.fill || 'none';
  if (fill === 'bg') fill = BG();
  const fo = fill === 'none' ? 0 : (o.fo != null ? o.fo : 1) * cl(p * 4);
  const dash = p >= 0.998 ? '' : ` stroke-dasharray="1 1.05" stroke-dashoffset="${(1 - p).toFixed(4)}"`;
  const w = o.w != null ? o.w : 3;
  const op = o.op != null ? ` opacity="${o.op}"` : '';
  const flt = o.filter ? ` filter="url(#${o.filter})"` : '';
  return `<path d="${d}" pathLength="1"${dash} fill="${fill}" fill-opacity="${fo.toFixed(3)}" stroke="${w > 0 ? col : 'none'}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${op}${flt}/>`;
}
// Outlined "tube" (limbs, poles): thick ink stroke with a paper-coloured core.
function tube(d, w, o = {}) {
  return L(d, Object.assign({}, o, { w: w + 3.4, fill: 'none' })) +
    L(d, Object.assign({}, o, { w: w, col: o.core || BG(), fill: 'none' }));
}
// Solid fill without outline (used for accents).
function F(d, fill, o = {}) {
  const p = o.p != null ? o.p : dp(o.s || 0, o.dur || 1);
  if (p <= 0.002) return '';
  return `<path d="${d}" fill="${fill}" fill-opacity="${((o.fo != null ? o.fo : 1) * cl(p * 2)).toFixed(3)}"${o.filter ? ` filter="url(#${o.filter})"` : ''}/>`;
}
const g = (tr, inner, extra = '') => `<g transform="${tr}"${extra}>${inner}</g>`;
const circ = (cx, cy, r) => `M${cx - r},${cy} a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0 Z`;
const rect = (x, y, w, h) => `M${x},${y} h${w} v${h} h${-w} Z`;
function poly(pts, close) { return 'M' + pts.map(p => f1(p[0]) + ',' + f1(p[1])).join(' L') + (close ? ' Z' : ''); }
// smooth path through points (Catmull-Rom -> cubic)
function smooth(pts, close) {
  const n = pts.length; if (n < 2) return '';
  const P = i => close ? pts[(i + n) % n] : pts[cl(i, 0, n - 1)];
  let d = `M${f1(pts[0][0])},${f1(pts[0][1])}`;
  const m = close ? n : n - 1;
  for (let i = 0; i < m; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f1(c1[0])},${f1(c1[1])} ${f1(c2[0])},${f1(c2[1])} ${f1(p2[0])},${f1(p2[1])}`;
  }
  return d + (close ? ' Z' : '');
}
// Soft glowing halo (night lights).
function halo(x, y, r, a = 0.8, col = COL.glow) {
  const id = { [COL.glow]: 'hGlow', [COL.pink]: 'hPink', [COL.red]: 'hRed', [COL.gold]: 'hGold' }[col] || 'hGlow';
  return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="url(#${id})" opacity="${cl(a).toFixed(3)}"/>`;
}
function text(x, y, s, size, o = {}) {
  const p = o.p != null ? o.p : dp(o.s || 0, o.dur || 1);
  if (p <= 0.002) return '';
  return `<text x="${x}" y="${y}" font-family="${o.font || 'LXGW WenKai TC'}" font-size="${size}" font-weight="${o.weight || 400}" ${o.italic ? 'font-style="italic"' : ''} text-anchor="${o.anchor || 'middle'}" fill="${o.col || INK()}" opacity="${(cl(p) * (o.op != null ? o.op : 1)).toFixed(3)}" ${o.ls ? `letter-spacing="${o.ls}"` : ''}>${s}</text>`;
}

/* ---------------- nature ---------------- */
function cloud(x, y, s, o = {}) {
  const d = 'M-90,10 C-100,-15 -70,-30 -50,-20 C-45,-50 0,-55 10,-30 C25,-50 70,-45 70,-15 C95,-15 100,10 80,12 Z';
  return g(`translate(${f1(x)},${f1(y)}) scale(${s})`, L(d, Object.assign({ w: 2.4 / s, fill: 'bg', dur: 1.4 }, o)) +
    L('M-40,-5 C-25,-12 -10,-10 0,-2', Object.assign({ w: 1.6 / s, dur: 1 }, o, { s: (o.s || 0) + 0.8 })));
}
function waves(x0, x1, y, rows, t, o = {}) {
  let out = '';
  for (let r = 0; r < rows; r++) {
    const yy = y + r * (o.gap || 26), amp = (o.amp || 6) * (1 + r * 0.25), k = 0.018 - r * 0.0015;
    const ph = t * (1.1 + r * 0.3) + r * 1.7, pts = [];
    for (let x = x0; x <= x1; x += 24) pts.push([x, yy + Math.sin(x * k + ph) * amp + Math.sin(x * 0.041 - ph * 1.3) * amp * 0.4]);
    out += L(smooth(pts), { s: (o.s || 0) + r * 0.15, dur: 1.4, w: o.w || 2.2, op: o.op != null ? o.op : (0.9 - r * 0.08) });
  }
  return out;
}
// breaking foam curls moving toward the shore
function foam(x, y, t, n, o = {}) {
  let out = '';
  for (let i = 0; i < n; i++) {
    const per = 4.5, ph = ((t + i * per / n) % per) / per;
    const xx = x + i * 90 - ph * 60, yy = y + ph * 28, a = Math.sin(ph * Math.PI);
    out += L(`M${f1(xx)},${f1(yy)} q18,-16 36,-6 q-10,-2 -12,6`, { p: 1, w: 2, op: (a * 0.85).toFixed(2) });
  }
  return out;
}
function mountains(x0, y, o = {}) {
  const pts = o.pts || [[0, 0], [120, -90], [200, -60], [320, -170], [430, -80], [560, -140], [700, -40], [820, -110], [980, 0]];
  return L(smooth(pts.map(p => [x0 + p[0] * (o.sx || 1), y + p[1] * (o.sy || 1)])), Object.assign({ w: 2.2, op: 0.55, dur: 2 }, o));
}
function bird(x, y, t, s = 1, ph = 0) {
  const f = Math.sin(t * 9 + ph) * 9;
  return L(`M${f1(x - 14 * s)},${f1(y - f * s)} Q${f1(x - 6 * s)},${f1(y - 4 * s)} ${f1(x)},${f1(y)} Q${f1(x + 6 * s)},${f1(y - 4 * s)} ${f1(x + 14 * s)},${f1(y - f * s)}`, { p: 1, w: 2 });
}
function tree(x, y, s = 1, o = {}) {
  const sway = Math.sin(G.t * 1.3 + x * 0.01) * 3;
  const crown = smooth([[-60, -120], [-70, -170], [-40, -215], [0 + sway, -235], [45, -210], [70, -165], [55, -120], [0, -105]], true);
  return g(`translate(${f1(x)},${f1(y)}) scale(${s})`,
    tube('M0,0 C2,-40 -3,-80 0,-118', 12, Object.assign({ dur: 1 }, o)) +
    L(crown, Object.assign({ fill: 'bg', w: 2.6 / s, dur: 1.4 }, o, { s: (o.s || 0) + 0.3 })) +
    L(`M-30,-160 q10,-10 22,-4 M10,-190 q12,-8 22,0 M-5,-140 q10,-6 20,-2`, Object.assign({ w: 1.6 / s, op: 0.7 }, o, { s: (o.s || 0) + 1 })));
}
function smoke(x, y, t, n = 5, o = {}) {
  let out = '';
  const per = o.per || 3.2, hgt = o.h || 160;
  for (let i = 0; i < n; i++) {
    const ph = ((t + i * per / n) % per) / per;
    const yy = y - ph * hgt, xx = x + Math.sin(ph * 5 + i) * 14 * ph + (o.drift || 0) * ph;
    const a = Math.sin(ph * Math.PI) * (o.op || 0.6), r = 6 + ph * 18;
    out += L(`M${f1(xx - r)},${f1(yy)} q${f1(r * 0.5)},${f1(-r)} ${f1(r)},${f1(-r * 0.3)} q${f1(r * 0.6)},${f1(r * 0.4)} ${f1(r * 0.9)},${f1(-r * 0.7)}`, { p: 1, w: 1.8, op: a.toFixed(2) });
  }
  return out;
}

/* ---------------- people ---------------- */
// Person standing on (x,y). o: {s, phase, walk(0..1), pose, prop, hat, facing(1|-1), start, skirt, child}
function person(x, y, sc, o = {}) {
  const st = o.start || 0, dur = 0.9;
  const face = o.facing || 1;
  const walk = o.walk != null ? o.walk : 1;
  const ph = o.phase || 0;
  const sw = Math.sin(ph) * 0.5 * walk;
  const bob = Math.abs(Math.cos(ph)) * 3 * walk;
  const oo = { s: st, dur };
  const legW = 9, armW = 7;
  const leg = (a, back) => {
    const kx = Math.sin(a) * 38, ky = -75 + Math.cos(a) * 38;
    const bend = back ? 0.5 : 0.1;
    const fx = kx + Math.sin(a - bend) * 38, fy = ky + Math.cos(a - bend) * 38;
    return `M0,-75 L${f1(kx)},${f1(ky)} L${f1(fx)},${f1(Math.min(fy, 0))} l9,0`;
  };
  const arm = (a, carry) => {
    if (carry === 'up') return `M0,-126 L10,-150 L14,-176`;
    if (carry === 'fwd') return `M0,-126 L22,-104 L44,-112`;
    if (carry === 'hold') return `M0,-126 L16,-110 L26,-138`;
    if (carry === 'pray') return `M0,-126 L16,-102 L30,-118`;
    const ex = Math.sin(a) * 28, ey = -126 + Math.cos(a) * 28;
    return `M0,-126 L${f1(ex)},${f1(ey)} L${f1(ex + Math.sin(a + 0.4) * 26)},${f1(ey + Math.cos(a + 0.4) * 26)}`;
  };
  let back = '', front = '';
  const armPose = o.arms || 'swing';
  const aBack = armPose === 'swing' ? arm(-sw * 0.9) : arm(0, armPose);
  const aFront = armPose === 'swing' ? arm(sw * 0.9) : arm(0, armPose === 'up' ? 'up' : armPose);
  back += tube(leg(-sw, sw > 0), legW, oo) + tube(aBack, armW, oo);
  front += tube(leg(sw, sw < 0), legW, oo) + tube(aFront, armW, oo);
  const torso = o.robe
    ? 'M-17,-132 C-22,-110 -26,-60 -28,-40 L28,-40 C26,-60 22,-110 17,-132 Z'
    : 'M-17,-132 C-21,-110 -19,-90 -17,-72 L17,-72 C19,-90 21,-110 17,-132 Z';
  let body = L(torso, Object.assign({ fill: o.shirt || 'bg', fo: o.shirt ? 0.9 : 1, w: 3 }, oo));
  if (o.vest) body += L('M-12,-128 L-10,-80 M12,-128 L10,-80', Object.assign({ w: 2, col: COL.red }, oo));
  const head = L(circ(0, -148, 13), Object.assign({ fill: 'bg', w: 3 }, oo));
  let hat = '';
  if (o.hat === 'cap') hat = L('M-14,-152 C-12,-168 12,-168 14,-152 L24,-150', Object.assign({ fill: 'bg', w: 2.6 }, oo));
  else if (o.hat === 'bamboo') hat = L('M-28,-150 L0,-172 L28,-150 Z', Object.assign({ fill: 'bg', w: 2.6 }, oo));
  else hat = L('M-12,-156 C-8,-164 8,-165 13,-154', Object.assign({ w: 3 }, oo));
  let prop = '';
  if (o.prop === 'flag') {  // small triangular incense flag 香旗
    const fl = Math.sin(G.t * 6 + ph) * 5;
    prop = L('M44,-112 L50,-236', Object.assign({ w: 2.6 }, oo)) +
      L(`M50,-234 L${f1(96 + fl)},${f1(-214 + fl * 0.3)} L48,-196 Z`, Object.assign({ fill: COL.red, fo: 0.85, w: 2.2 }, oo));
  }
  if (o.prop === 'lamp') {
    prop = L('M44,-112 L60,-150', Object.assign({ w: 2.4 }, oo)) + L('M52,-150 C48,-125 72,-125 68,-150 Z', Object.assign({ fill: COL.red, fo: 0.9, w: 2 }, oo));
  }
  const inner = back + (o.prop ? prop : '') + body + head + hat + front;
  return g(`translate(${f1(x)},${f1(y - bob * sc)}) scale(${f1(sc * face * 100) / 100},${sc})`, inner);
}
// kneeling / bowing believer, facing right, origin at knees on ground
function kneeler(x, y, sc, o = {}) {
  const oo = { s: o.start || 0, dur: 0.9 };
  const b = Math.sin(G.t * 1.2 + x) * 1.5;
  return g(`translate(${f1(x)},${f1(y)}) scale(${(o.facing || 1) * sc},${sc})`,
    tube('M-10,0 L-48,-2 L-60,-4', 9, oo) +
    L(`M-50,-6 C-52,-40 -30,${f1(-62 + b)} 10,${f1(-60 + b)} C28,-58 30,-40 26,-26 L-44,-10 Z`, Object.assign({ fill: 'bg', w: 3 }, oo)) +
    L(circ(38, -32 + b, 12), Object.assign({ fill: 'bg', w: 3 }, oo)) +
    tube(`M16,${f1(-50 + b)} L40,-10 L56,-4`, 7, oo) +
    tube('M-40,-6 L-6,0 L10,0', 9, oo));
}

/* ---------------- sacred objects ---------------- */
// Mazu palanquin carried by four bearers. origin: ground, centre of chair.
// o: {pink, start, phase, walk, lift}
function palanquin(x, y, sc, o = {}) {
  const st = o.start || 0, ph = o.phase || 0, walk = o.walk != null ? o.walk : 1;
  const oo = { s: st, dur: 1.1 };
  const sway = Math.sin(ph * 2) * 2.5 * walk, lift = o.lift || 0;
  const py = -140 - lift;
  const bearer = (bx, p2, far) => person(bx, 0, 1, { start: st, phase: ph + p2, walk, arms: lift > 20 ? 'up' : 'hold', hat: 'cap', shirt: far ? null : null });
  let out = '';
  // far bearers
  out += g('translate(16,-6) scale(.96)', bearer(-120, Math.PI, true) + bearer(120, 0, true));
  // poles
  out += tube(`M-190,${py + sway * 0.3} L190,${py - sway * 0.3}`, 6, Object.assign({}, oo, { core: COL.gold }));
  // chair
  const cy = py + sway * 0.2;
  let chair = '';
  chair += L(rect(-46, -8, 92, 12), Object.assign({ fill: 'bg', w: 2.6 }, oo));              // base
  chair += L('M-40,-8 L-40,-96 L40,-96 L40,-8 Z', Object.assign({ fill: 'bg', w: 3 }, oo)); // body
  chair += L('M-24,-86 L-24,-20 L24,-20 L24,-86 Z', Object.assign({ w: 2, fill: COL.red, fo: 0.25 }, oo)); // opening
  chair += L(circ(0, -60, 9), Object.assign({ w: 2, fill: COL.gold, fo: 0.8 }, oo));               // Mazu face (gold)
  chair += L('M-10,-68 L10,-68 M-12,-72 L-6,-78 L0,-72 L6,-78 L12,-72', Object.assign({ w: 1.8 }, oo)); // crown
  chair += L('M-12,-50 C-14,-36 14,-36 12,-50', Object.assign({ w: 1.8, fill: COL.red, fo: 0.5 }, oo));
  chair += L('M-58,-96 C-40,-104 40,-104 58,-96 C50,-120 30,-128 0,-132 C-30,-128 -50,-120 -58,-96 Z', Object.assign({ fill: 'bg', w: 3 }, oo)); // roof
  chair += L('M-58,-96 q-8,-2 -10,-12 M58,-96 q8,-2 10,-12 M0,-132 l0,-12 m-6,6 l12,0', Object.assign({ w: 2.4 }, oo));
  chair += L(circ(0, -150, 6), Object.assign({ w: 2, fill: COL.gold, fo: 0.9 }, oo));
  if (o.pink) {
    const fl = Math.sin(G.t * 7 + ph) * 3;
    chair += L(`M-64,-92 C-60,-120 -34,-140 0,-142 C34,-140 60,-120 64,-92 C${58 + fl},-60 ${54 + fl},-30 50,-14 L-50,-14 C${-54 - fl},-30 ${-58 - fl},-60 -64,-92 Z`,
      Object.assign({ fill: COL.pink, fo: 0.88, w: 3 }, oo, { s: st + 0.4 }));
    chair += L(`M-30,-130 C-36,-90 -34,-50 -30,-16 M0,-140 C2,-100 -2,-50 0,-16 M30,-130 C${36 + fl},-90 34,-50 30,-16`, Object.assign({ w: 1.6, op: 0.6 }, oo, { s: st + 0.9 }));
    chair += L(circ(0, -150, 6), Object.assign({ w: 2, fill: COL.gold, fo: 0.9 }, oo, { s: st + 0.9 }));
  }
  out += g(`translate(0,${f1(cy)})`, chair);
  out += tube(`M-190,${py + 4 + sway * 0.3} L190,${py + 4 - sway * 0.3}`, 6, Object.assign({}, oo, { core: COL.gold }));
  // near bearers (o.part lets a scene slip other figures between the layers)
  const near = bearer(-110, 0) + bearer(110, Math.PI);
  if (o.part === 'back') return g(`translate(${f1(x)},${f1(y)}) scale(${sc})`, out);
  if (o.part === 'front') return g(`translate(${f1(x)},${f1(y)}) scale(${sc})`, near);
  return g(`translate(${f1(x)},${f1(y)}) scale(${sc})`, out + near);
}
// The lead banner 頭旗: pole + crossbar + long red banner. rise: 0 = lying, 1 = upright
function headFlag(x, y, sc, o = {}) {
  const oo = { s: o.start || 0, dur: 1.2 };
  const rise = o.rise != null ? o.rise : 1;
  const ang = (1 - rise) * -80;
  const fl = t => Math.sin(G.t * 3 + t * 4) * 6 * (0.3 + t);
  const pts = [];
  for (let k = 0; k <= 6; k++) pts.push([30 + fl(k / 6), -300 + k * 34]);
  const pts2 = pts.map(p => [p[0] + 50, p[1] + 4]).reverse();
  const ban = smooth(pts) + ' L' + pts2.map(p => f1(p[0]) + ',' + f1(p[1])).join(' L') + ' Z';
  let inner = tube('M0,0 L0,-320', 7, Object.assign({}, oo, { core: COL.gold }));
  inner += L('M-10,-306 L100,-306', Object.assign({ w: 4 }, oo));
  inner += L(ban, Object.assign({ fill: COL.red, fo: 0.9, w: 2.6 }, oo, { s: (o.start || 0) + 0.4 }));
  inner += L(smooth(pts.map(p => [p[0] + 8, p[1] + 6]).slice(0, 6)), Object.assign({ w: 1.6, col: COL.gold }, oo, { s: (o.start || 0) + 1 }));
  inner += L(circ(0, -330, 9), Object.assign({ fill: COL.gold, fo: 0.9, w: 2 }, oo));
  return g(`translate(${f1(x)},${f1(y)}) scale(${sc}) rotate(${f1(ang)})`, inner);
}
function lantern(x, y, s, o = {}) {
  const sw = Math.sin(G.t * 1.8 + x * 0.05) * 4;
  const oo = { s: o.start || 0, dur: 0.8 };
  let out = '';
  if (G.night && o.lit !== false) {
    const k = o.lit != null ? o.lit : 1;
    out += halo(x + sw * 0.5, y + 40 * s, 110 * s * k, 0.55 * k + 0.08 * Math.sin(G.t * 7 + x));
  }
  out += g(`translate(${f1(x)},${f1(y)}) rotate(${f1(sw)}) scale(${s})`,
    L('M0,0 L0,12', Object.assign({ w: 2.4 }, oo)) +
    L('M-22,20 C-34,40 -34,64 -22,82 L22,82 C34,64 34,40 22,20 Z', Object.assign({ fill: COL.red, fo: G.night ? 0.95 : 0.85, w: 2.6 }, oo)) +
    L('M-16,12 L16,12 L16,20 L-16,20 Z M-16,82 L16,82 L16,90 L-16,90 Z', Object.assign({ fill: COL.gold, fo: 0.9, w: 2 }, oo)) +
    L('M0,90 L0,108 M-5,92 L-6,106 M5,92 L6,106', Object.assign({ w: 1.6, col: COL.gold }, oo)) +
    L('M-12,24 C-18,44 -18,62 -12,78 M12,24 C18,44 18,62 12,78', Object.assign({ w: 1.4, op: 0.6 }, oo)));
  return out;
}
// Taiwanese temple facade with swallow-tail ridge. origin bottom centre.
function temple(x, y, sc, o = {}) {
  const s0 = o.start || 0;
  const S = (a, d = 1.2) => ({ s: s0 + a, dur: d });
  const name = o.name || '拱天宮';
  let out = '';
  out += L('M-400,0 L400,0 L380,-22 L-380,-22 Z', Object.assign({ fill: 'bg', w: 3 }, S(0)));
  out += L('M-360,-22 L-350,-40 L350,-40 L360,-22', Object.assign({ fill: 'bg', w: 2.6 }, S(0.2)));
  out += L(rect(-310, -270, 620, 230), Object.assign({ fill: 'bg', w: 3 }, S(0.3, 1.6)));
  // columns
  for (const cx of [-300, -190, 190, 300]) out += L(rect(cx - 12, -268, 24, 228), Object.assign({ fill: 'bg', w: 2.6 }, S(0.6)));
  for (const cx of [-190, 190]) out += L(`M${cx - 6},-240 q6,-10 12,0 q-8,20 0,40 q8,20 0,40 q-8,20 0,40`, Object.assign({ w: 1.6, col: COL.gold }, S(1.6)));
  // doors
  const open = o.doorOpen || 0;
  out += L(rect(-100, -225, 200, 185), Object.assign({ fill: G.night ? '#2a2b3a' : 'bg', w: 3 }, S(0.7)));
  if (G.night && open > 0) out += halo(0, -130, 170 * open, 0.9 * open);
  const dw = 100 * (1 - open * 0.8);
  out += L(rect(-100, -225, dw, 185), Object.assign({ fill: 'bg', w: 2.6 }, S(0.9))) + L(rect(100 - dw, -225, dw, 185), Object.assign({ fill: 'bg', w: 2.6 }, S(0.9)));
  if (open < 0.3) {
    out += L('M-70,-195 L-30,-195 L-30,-80 L-70,-80 Z M30,-195 L70,-195 L70,-80 L30,-80 Z', Object.assign({ w: 1.8, op: 0.8 }, S(1.3)));
    out += L(circ(-50, -150, 12) + circ(50, -150, 12), Object.assign({ w: 1.8, fill: COL.red, fo: 0.35 }, S(1.5)));
    for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) out += L(circ(-18 + c * 36, -190 + r * 32, 3), Object.assign({ w: 1.4, fill: COL.gold, fo: 1 }, S(1.7 + r * 0.05)));
  }
  // round windows
  for (const cx of [-245, 245]) {
    out += L(circ(cx, -160, 34), Object.assign({ fill: 'bg', w: 2.6 }, S(1)));
    out += L(`M${cx - 34},-160 L${cx + 34},-160 M${cx},-194 L${cx},-126 M${cx - 24},-184 L${cx + 24},-136 M${cx + 24},-184 L${cx - 24},-136`, Object.assign({ w: 1.4, op: 0.7 }, S(1.4)));
  }
  // plaque
  out += L(rect(-80, -262, 160, 34), Object.assign({ fill: COL.red, fo: 0.9, w: 2.4 }, S(1.1)));
  out += text(0, -236, name, 26, { s: s0 + 1.6, dur: 0.6, col: COL.gold, weight: 700, ls: 6 });
  // roof
  const ridgeY = -360;
  out += L('M-380,-262 C-300,-282 -200,-290 0,-292 C200,-290 300,-282 380,-262 C392,-262 404,-270 412,-284 C380,-300 340,-318 320,-340 L-320,-340 C-340,-318 -380,-300 -412,-284 C-404,-270 -392,-262 -380,-262 Z',
    Object.assign({ fill: 'bg', w: 3.2 }, S(0.5, 1.6)));
  let tiles = '';
  for (let i = -8; i <= 8; i++) tiles += `M${i * 38},-296 L${i * 36},-338 `;
  out += L(tiles, Object.assign({ w: 1.4, op: 0.55 }, S(1.8, 1.2)));
  // ridge with swallow tails
  out += L(`M-320,-340 L320,-340 L320,${ridgeY + 8} C360,${ridgeY + 6} 400,${ridgeY - 10} 432,${ridgeY - 44} C404,${ridgeY - 24} 370,${ridgeY - 12} 320,${ridgeY - 8} L-320,${ridgeY - 8} C-370,${ridgeY - 12} -404,${ridgeY - 24} -432,${ridgeY - 44} C-400,${ridgeY - 10} -360,${ridgeY + 6} -320,${ridgeY + 8} Z`,
    Object.assign({ fill: 'bg', w: 3.2 }, S(0.9, 1.6)));
  out += L(`M-300,${ridgeY + 2} L300,${ridgeY + 2}`, Object.assign({ w: 2, col: COL.red, op: 0.8 }, S(2)));
  // ridge centre: pearl & dragons (simplified)
  out += L(circ(0, ridgeY - 30, 13), Object.assign({ fill: COL.gold, fo: 0.9, w: 2.4 }, S(2.2, 0.8)));
  out += L(`M-24,${ridgeY - 26} l-8,-6 M24,${ridgeY - 26} l8,-6 M0,${ridgeY - 43} l0,-10`, Object.assign({ w: 2 }, S(2.4, 0.6)));
  out += L(`M-40,${ridgeY - 10} C-70,${ridgeY - 40} -110,${ridgeY - 30} -150,${ridgeY - 10} M40,${ridgeY - 10} C70,${ridgeY - 40} 110,${ridgeY - 30} 150,${ridgeY - 10}`, Object.assign({ w: 2.4 }, S(2.3, 1)));
  if (o.lanterns !== false) {
    out += lantern(-150, -262, 0.8, { start: s0 + 1.8, lit: o.lit });
    out += lantern(150, -262, 0.8, { start: s0 + 1.8, lit: o.lit });
  }
  return g(`translate(${f1(x)},${f1(y)}) scale(${sc})`, out);
}
// village house (low brick house with tiled roof)
function house(x, y, sc, o = {}) {
  const S = (a, d = 1) => ({ s: (o.start || 0) + a, dur: d });
  const w = o.w || 260;
  let out = L(rect(-w / 2, -130, w, 130), Object.assign({ fill: 'bg', w: 2.8 }, S(0)));
  out += L(`M${-w / 2 - 20},-126 L${-w / 2 + 10},-176 L${w / 2 - 10},-176 L${w / 2 + 20},-126 Z`, Object.assign({ fill: 'bg', w: 2.8 }, S(0.3)));
  let tl = ''; for (let i = -w / 2 + 10; i < w / 2; i += 22) tl += `M${i},-128 L${i + 4},-174 `;
  out += L(tl, Object.assign({ w: 1.2, op: 0.5 }, S(0.8)));
  out += L(rect(-30, -100, 60, 100), Object.assign({ fill: G.night ? '#3a3040' : 'bg', w: 2.4 }, S(0.5)));
  out += L(rect(-w / 2 + 25, -100, 50, 40) + rect(w / 2 - 75, -100, 50, 40), Object.assign({ w: 2, fill: G.night && o.lit ? COL.glow : 'bg', fo: G.night && o.lit ? 0.35 * o.lit : 1 }, S(0.6)));
  let br = ''; for (let yy = -20; yy > -130; yy -= 22) br += `M${-w / 2 + 6},${yy} l24,0 M${w / 2 - 40},${yy - 11} l24,0 `;
  out += L(br, Object.assign({ w: 1.2, op: 0.45 }, S(1)));
  if (o.lantern) out += lantern(0, -128, 0.55, { start: (o.start || 0) + 0.8, lit: o.lit });
  if (G.night && o.lit) out += halo(-w / 2 + 50, -80, 60 * o.lit, 0.5 * o.lit) + halo(w / 2 - 50, -80, 60 * o.lit, 0.5 * o.lit);
  return g(`translate(${f1(x)},${f1(y)}) scale(${sc})`, out);
}
// moon blocks (jiaobei). face: 'flat' | 'round'
function jiao(x, y, rot, s, face, o = {}) {
  const d = 'M-30,0 C-26,-22 26,-22 30,0 C18,-6 -18,-6 -30,0 Z';
  const fill = face === 'flat' ? COL.pink : COL.red;
  return g(`translate(${f1(x)},${f1(y)}) rotate(${f1(rot)}) scale(${s})`,
    L(d, Object.assign({ fill, fo: 0.95, w: 2.4 }, o)) + (face === 'round' ? L('M-16,-10 C-6,-15 8,-15 16,-10', Object.assign({ w: 1.4, col: COL.gold }, o)) : ''));
}
// firework burst centred (x,y) at local time tt since launch
function firework(x, y, tt, seed, r = 180, o = {}) {
  if (tt < 0) return '';
  let out = '';
  const rise = 0.7;
  if (tt < rise) {
    const k = tt / rise, yy = y + 420 * (1 - easeOut(k));
    return L(`M${x},${f1(yy + 30)} L${x},${f1(yy)}`, { p: 1, w: 2.5, col: COL.glow }) + halo(x, yy, 26, 0.8);
  }
  const k = (tt - rise) / 2.4; if (k > 1) return '';
  const R = r * easeOut(Math.min(1, k * 1.8)), a = 1 - k;
  out += halo(x, y, r * 1.3 * (0.6 + k), 0.55 * a * a);
  const n = 22, cols = [COL.glow, COL.pink, COL.gold, '#ff9a7a'];
  for (let i = 0; i < n; i++) {
    const an = i / n * Math.PI * 2 + seed, rr = R * (0.85 + rnd(seed * 50 + i) * 0.25);
    const x1 = x + Math.cos(an) * rr, y1 = y + Math.sin(an) * rr + k * k * 60;
    const x0 = x + Math.cos(an) * rr * 0.6, y0 = y + Math.sin(an) * rr * 0.6 + k * k * 40;
    const c = cols[(i + Math.floor(seed)) % cols.length];
    out += L(`M${f1(x0)},${f1(y0)} L${f1(x1)},${f1(y1)}`, { p: 1, w: 3, col: c, op: a.toFixed(2) });
    out += `<circle cx="${f1(x1)}" cy="${f1(y1)}" r="3.5" fill="${c}" opacity="${(a * (0.6 + 0.4 * Math.sin(tt * 30 + i))).toFixed(2)}"/>`;
  }
  return `<g filter="url(#glow)">${out}</g>`;
}
// string of firecrackers bursting from one end
function firecrackers(x, y, len, tt, o = {}) {
  let out = '';
  const n = 26, burnt = cl(tt / (o.dur || 4)) * n;
  for (let i = 0; i < n; i++) {
    const xx = x + i * len / n, yy = y + Math.sin(i * 0.7) * 6;
    if (i >= burnt) out += L(rect(xx - 4, yy - 12, 8, 16), { p: 1, w: 1.5, fill: COL.red, fo: 0.9 });
  }
  if (tt > 0 && burnt < n) {
    const bx = x + burnt * len / n;
    for (let j = 0; j < 9; j++) {
      const an = rnd(Math.floor(G.frame / 2) * 13 + j) * Math.PI * 2, rr = 20 + rnd(G.frame * 7 + j) * 45;
      out += L(`M${f1(bx)},${f1(y - 4)} L${f1(bx + Math.cos(an) * rr)},${f1(y - 4 + Math.sin(an) * rr - 10)}`, { p: 1, w: 2.4, col: j % 2 ? COL.gold : COL.red });
    }
    out += halo(bx, y - 6, 90, G.night ? 0.9 : 0.5);
    for (let j = 0; j < 14; j++) { // paper scraps
      const px = bx - 30 - rnd(j * 3.1) * 140, py = y - 10 - rnd(j * 5.7 + Math.floor(tt * 3)) * 60;
      out += `<rect x="${f1(px)}" y="${f1(py)}" width="5" height="3" fill="${COL.red}" opacity=".8" transform="rotate(${f1(rnd(j) * 180)},${f1(px)},${f1(py)})"/>`;
    }
  }
  if (tt > 0) out += smoke(x + burnt * len / n - 60, y - 10, G.t, 7, { h: 200, op: 0.5, per: 2.5 });
  return out;
}

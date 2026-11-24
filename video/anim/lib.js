// ───────── core helpers: timing, randomness, hand-drawn primitives ─────────
const W = 1920, H = 1080;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const ease = x => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
const es = (t, a, b) => ease(seg(t, a, b));
const lerp = (a, b, k) => a + (b - a) * k;
const f1 = v => Math.round(v * 10) / 10;

function rng(seed) {             // mulberry32: deterministic per-frame randomness
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// palettes: deep navy ink on cream paper by day; cream-gold ink on navy by night
const DAY = { name: 'day', bg: '#f3ecdd', paper: '#f3ecdd', ink: '#1b3a6b', ink2: '#5b77a3', gold: '#c39a3e', white: '#ffffff', soft: 'rgba(27,58,107,0.16)' };
const NIGHT = { name: 'night', bg: '#0f2140', paper: '#0f2140', ink: '#ead9ab', ink2: '#9aa6bd', gold: '#ffd27a', white: '#ffffff', soft: 'rgba(234,217,171,0.14)' };
let C = DAY;

let _clip = 0;          // clip id counter, reset each frame
let _defs = [];         // per-frame defs (clip paths)

// A stroked path that "draws itself": p in [0,1] is how much of the line exists.
// occ=true fills with the paper colour at once so the shape hides what is behind it.
function P(d, p = 1, o = {}) {
  if (p <= 0) return '';
  const w = o.w ?? 3, stroke = o.stroke ?? C.ink, op = o.op ?? 1;
  let fill = o.fill ?? 'none', fo = o.fo ?? 1;
  if (o.occ) { fill = o.fill ?? C.paper; }
  const fillOp = fill === 'none' ? 0 : (o.occ ? fo * clamp(p * 4) : fo * clamp((p - 0.5) / 0.5));
  const dash = p >= 1 ? (o.dash ? `stroke-dasharray="${o.dash}"` : '')
    : `pathLength="1000" stroke-dasharray="${f1(1000 * p)} 2000"`;
  return `<path d="${d}" fill="${fill}" fill-opacity="${fillOp.toFixed(3)}" stroke="${stroke}" stroke-width="${w}" ${dash} opacity="${op}" stroke-linecap="round" stroke-linejoin="round" ${o.extra || ''}/>`;
}
// filled shape without outline (e.g. glowing lights, ore heaps)
const F = (d, fill, op = 1, extra = '') => `<path d="${d}" fill="${fill}" opacity="${op}" stroke="none" ${extra}/>`;

const pts2d = pts => 'M' + pts.map(p => `${f1(p[0])} ${f1(p[1])}`).join(' L');
// smooth Catmull-Rom → cubic bezier through points
function smooth(pts, closed = false) {
  if (pts.length < 3) return pts2d(pts);
  const P_ = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
  let d = `M${f1(P_[1][0])} ${f1(P_[1][1])}`;
  for (let i = 1; i < P_.length - 2; i++) {
    const [p0, p1, p2, p3] = [P_[i - 1], P_[i], P_[i + 1], P_[i + 2]];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f1(c1[0])} ${f1(c1[1])} ${f1(c2[0])} ${f1(c2[1])} ${f1(p2[0])} ${f1(p2[1])}`;
  }
  return closed ? d + 'Z' : d;
}
const circ = (cx, cy, r) => `M${f1(cx + r)} ${f1(cy)} A${r} ${r} 0 1 1 ${f1(cx - r)} ${f1(cy)} A${r} ${r} 0 1 1 ${f1(cx + r)} ${f1(cy)}Z`;
const ell = (cx, cy, rx, ry) => `M${f1(cx + rx)} ${f1(cy)} A${rx} ${ry} 0 1 1 ${f1(cx - rx)} ${f1(cy)} A${rx} ${ry} 0 1 1 ${f1(cx + rx)} ${f1(cy)}Z`;
const rect = (x, y, w, h) => `M${f1(x)} ${f1(y)} H${f1(x + w)} V${f1(y + h)} H${f1(x)}Z`;
const line = (x1, y1, x2, y2) => `M${f1(x1)} ${f1(y1)} L${f1(x2)} ${f1(y2)}`;
const g = (inner, tr = '', extra = '') => `<g ${tr ? `transform="${tr}"` : ''} ${extra}>${inner}</g>`;

// estimated text width (CJK ≈ 1em, latin ≈ 0.52em)
function tw(s, size) {
  let w = 0;
  for (const ch of s) w += /[\u0000-ɏ -⁯]/.test(ch) ? (ch === ' ' ? 0.3 : 0.53) : 1.0;
  return w * size;
}
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Text that writes in from left to right (clip reveal)
function T(x, y, s, o = {}) {
  const p = o.p ?? 1;
  if (p <= 0) return '';
  const size = o.size ?? 40, anchor = o.anchor ?? 'start';
  const fill = o.fill ?? C.ink, weight = o.weight ?? 400, op = o.op ?? 1;
  const style = o.italic ? 'font-style="italic"' : '';
  const width = tw(s, size) * 1.08 + 20;
  const x0 = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x - 10;
  let clip = '';
  if (p < 1) {
    const id = 'c' + (_clip++);
    _defs.push(`<clipPath id="${id}"><rect x="${f1(x0)}" y="${f1(y - size * 1.2)}" width="${f1(width * p)}" height="${f1(size * 1.7)}"/></clipPath>`);
    clip = `clip-path="url(#${id})"`;
  }
  const stroke = o.halo ? `stroke="${o.halo}" stroke-width="${o.haloW ?? 8}" paint-order="stroke" stroke-linejoin="round"` : '';
  return `<text x="${f1(x)}" y="${f1(y)}" font-size="${size}" text-anchor="${anchor}" fill="${fill}" font-weight="${weight}" ${style} opacity="${op}" ${stroke} ${clip} ${o.extra || ''}>${esc(s)}</text>`;
}

// camera: slow push-in / pan.  Returns a transform string about the frame centre.
function cam(z, x = 0, y = 0) {
  return `translate(${W / 2} ${H / 2}) scale(${z.toFixed(4)}) translate(${f1(-W / 2 + x)} ${f1(-H / 2 + y)})`;
}

// line-time lookup (absolute seconds) for narration-synced events
const LINE = {};
for (const l of TL.lines) LINE[l.id] = l;

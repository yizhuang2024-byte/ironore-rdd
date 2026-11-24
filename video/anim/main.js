// ───────── frame compositor ─────────
const stage = document.getElementById('stage');
const XF = 0.7;                      // cross-fade length between scenes (s)
let PAPER_DAY = '', PAPER_NIGHT = '';

// paper grain generated once (deterministic) so it never flickers
function makePaper(base, speck, fibre, seed) {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, W, H);
  const R = rng(seed);
  const img = x.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (R() - 0.5) * 14;
    d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.9;
  }
  x.putImageData(img, 0, 0);
  // soft blotches
  for (let i = 0; i < 70; i++) {
    const cx = R() * W, cy = R() * H, r = 60 + R() * 240;
    const gr = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    gr.addColorStop(0, speck); gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
  }
  // fibres
  x.strokeStyle = fibre; x.lineWidth = 0.8;
  for (let i = 0; i < 900; i++) {
    const cx = R() * W, cy = R() * H, a = R() * Math.PI, l = 4 + R() * 16;
    x.beginPath(); x.moveTo(cx, cy); x.quadraticCurveTo(cx + Math.cos(a) * l * 0.5 + R() * 3, cy + Math.sin(a) * l * 0.5, cx + Math.cos(a) * l, cy + Math.sin(a) * l); x.stroke();
  }
  // vignette
  const v = x.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.0);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(60,40,10,0.16)');
  x.fillStyle = v; x.fillRect(0, 0, W, H);
  return cv.toDataURL('image/jpeg', 0.92);
}

function defs(t) {
  const seed = 1 + (Math.floor(t * 8) % 6);            // line "boil": 8 jitter states per second
  return `<defs>
  <filter id="rough" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="2" seed="${seed}" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <filter id="glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="7"/></filter>
  <filter id="softshadow" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="6"/></filter>
  ${_defs.join('')}
  </defs>`;
}

function sceneLayer(sc, t, op) {
  _clip_scene = sc.name;
  const lt = t - sc.start, D = sc.end - sc.start;
  const body = SCENES[sc.name](t, lt, D, sc);
  const pal = C;
  const paper = pal.name === 'night' ? PAPER_NIGHT : PAPER_DAY;
  return `<g opacity="${op.toFixed(4)}"><image href="${paper}" x="0" y="0" width="${W}" height="${H}"/><g filter="url(#rough)">${body}</g></g>`;
}
let _clip_scene = '';

function subtitle(t) {
  const l = TL.lines.find(l => t >= l.start - 0.12 && t <= l.end + 0.3);
  if (!l) return '';
  const op = Math.min(seg(t, l.start - 0.12, l.start + 0.1), 1 - seg(t, l.end + 0.1, l.end + 0.3));
  const zs = 48, ensz = 31;
  const w = Math.max(tw(l.zh, zs), tw(l.en, ensz) * 1.04) + 90;
  const x0 = (W - w) / 2, y0 = 922, h = 128;
  return `<g opacity="${op.toFixed(3)}">
    <rect x="${f1(x0)}" y="${y0}" width="${f1(w)}" height="${h}" rx="22" fill="#0f2140" fill-opacity="0.62"/>
    <text x="${W / 2}" y="${y0 + 56}" font-size="${zs}" text-anchor="middle" fill="#ffffff" font-weight="700" letter-spacing="1">${esc(l.zh)}</text>
    <text x="${W / 2}" y="${y0 + 104}" font-size="${ensz}" text-anchor="middle" fill="#f1e6c8" font-style="italic">${esc(l.en)}</text>
  </g>`;
}

function frameSVG(t) {
  _clip = 0; _defs = [];
  const sc = TL.scenes;
  let i = sc.findIndex(s => t < s.end); if (i < 0) i = sc.length - 1;
  let layers = '';
  const cur = sc[i];
  // cross-fade: the incoming scene fades in over the outgoing one around each boundary
  if (i > 0 && t < cur.start + XF / 2) {
    const k = ease(seg(t, cur.start - XF / 2, cur.start + XF / 2));
    layers += sceneLayer(sc[i - 1], t, 1) + sceneLayer(cur, t, k);
  } else if (i < sc.length - 1 && t > cur.end - XF / 2) {
    const k = ease(seg(t, cur.end - XF / 2, cur.end + XF / 2));
    layers += sceneLayer(cur, t, 1) + sceneLayer(sc[i + 1], t, k);
  } else layers += sceneLayer(cur, t, 1);
  // fade in from paper at the very start
  const fin = 1 - seg(t, 0, 0.5);
  const head = fin > 0 ? `<rect width="${W}" height="${H}" fill="${DAY.bg}" opacity="${fin.toFixed(3)}"/>` : '';
  return defs(t) + `<rect width="${W}" height="${H}" fill="${DAY.bg}"/>` + layers + head + subtitle(t);
}

// render one frame and resolve only after the browser has painted it (2 rAFs)
window.renderFrame = async function (t) {
  stage.innerHTML = frameSVG(t);
  await document.fonts.ready;
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  return stage.childElementCount;
};

// collect every string that will ever be drawn so all glyphs are loaded before frame 0
window.init = async function () {
  PAPER_DAY = makePaper('#f3ecdd', 'rgba(150,110,50,0.05)', 'rgba(120,95,60,0.18)', 11);
  PAPER_NIGHT = makePaper('#0f2140', 'rgba(140,170,220,0.04)', 'rgba(200,210,235,0.07)', 12);
  const seen = new Set();
  for (let t = 0; t < TL.total; t += 0.25) { stage.innerHTML = frameSVG(t); for (const ch of stage.textContent) seen.add(ch); }
  for (const ch of TL.lines.map(l => l.zh + l.en).join('') + TL.title.join('')) seen.add(ch);
  const text = Array.from(seen).join('');
  window.ALLTEXT = text;
  for (const wgt of ['400', '700']) for (const st of ['normal', 'italic']) await document.fonts.load(`${st} ${wgt} 40px "LXGW WenKai TC"`, text);
  await document.fonts.ready;
  return { glyphs: text.length, fonts: [...document.fonts].filter(f => f.status === 'loaded').length };
};

// Scene definitions. Every scene: cam keyframes [[t, cx, cy, zoom], ...] and draw(t, dur).
// CUES lists scene-local sound-effect times; audio/mix.py reads them via node.
'use strict';
const CUES = {
  s01_coast: [['waves', 0, 14.1], ['gong', 6.9], ['gulls', 1.0]],
  s02_title: [['stamp', 2.8], ['gong', 0.3]],
  s03_jiao: [['jiao', 3.1], ['jiao2', 3.35], ['jiao', 8.8], ['jiao2', 9.05], ['bell', 9.4]],
  s04_depart: [['firecrackers', 1.5, 7.0], ['gong', 2.0], ['drum', 2.2]],
  s05_route: [['drumroll', 1.0]],
  s06_pink: [['run', 0, 13.6], ['whoosh', 5.8]],
  s07_river: [['river', 0, 8.8], ['splash', 1.4], ['splash', 3.2], ['splash', 5.1], ['splash', 6.9]],
  s08_village: [['pour', 2.0], ['crowd', 5.5, 13.6], ['gong', 7.0]],
  s09_beigang: [['fire', 0.5, 12.3], ['bell', 3.6], ['bell', 6.2], ['seal', 8.9]],
  s10_return: [['firecrackers', 0.5, 3.0], ['shout', 7.4], ['firework', 7.0], ['firework', 7.7], ['firework', 8.5], ['firework', 9.3], ['firework', 10.2], ['firework', 11.1]],
  s11_closing: [['waves', 0, 23.5], ['gulls', 3.0], ['gulls', 15.0]],
  s12_end: [['gong', 0.6]],
};

// shoreline helper for the coast scenes
function shoreX(pts, y) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if ((y - a[1]) * (y - b[1]) <= 0) return lerp(a[0], b[0], (y - a[1]) / (b[1] - a[1] || 1));
  }
  return pts[pts.length - 1][0];
}
function stars(n, seed, ymax) {
  let out = '';
  for (let i = 0; i < n; i++) {
    const x = rnd(seed + i) * 1920 * 1.3 - 150, y = rnd(seed + i * 3.3) * ymax;
    const a = 0.35 + 0.5 * Math.abs(Math.sin(G.t * (1 + rnd(i) * 2) + i));
    out += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(1.2 + rnd(i * 7) * 1.6)}" fill="${COL.nightInk}" opacity="${a.toFixed(2)}"/>`;
  }
  return out;
}
function moon(x, y) {
  return halo(x, y, 150, 0.35) + L(`M${x - 30},${y - 40} A50,50 0 1,0 ${x + 40},${y + 30} A40,40 0 1,1 ${x - 30},${y - 40} Z`, { s: 0.2, dur: 1.2, w: 2.4, fill: COL.glow, fo: 0.8 });
}
function censer(x, y, sc, o = {}) {
  const oo = { s: o.start || 0, dur: 1 };
  let out = L('M-70,-20 L-80,0 M70,-20 L80,0 M0,-20 L0,4', Object.assign({ w: 5 }, oo));
  out += L('M-90,-110 C-96,-60 -80,-24 -60,-18 L60,-18 C80,-24 96,-60 90,-110 Z', Object.assign({ fill: 'bg', w: 3.2 }, oo));
  out += L('M-100,-110 L100,-110 L96,-124 L-96,-124 Z', Object.assign({ fill: 'bg', w: 3 }, oo));
  out += L('M-96,-100 C-120,-100 -120,-70 -94,-72 M96,-100 C120,-100 120,-70 94,-72', Object.assign({ w: 3 }, oo));
  out += L('M-60,-80 C-30,-66 30,-66 60,-80', Object.assign({ w: 1.8, col: COL.gold }, oo, { s: (o.start || 0) + 0.6 }));
  out += text(0, -42, o.label || '', 26, { s: (o.start || 0) + 0.8, col: COL.red, weight: 700 });
  if (o.fire) {
    const fl = k => Math.sin(G.t * 9 + k) * 6;
    out += halo(0, -130, 120, 0.4);
    out += L(`M-50,-124 C-46,${-150 + fl(1)} -30,-150 -26,${-176 + fl(2)} C-14,-150 -6,-160 0,${-196 + fl(3)} C8,-160 20,-156 26,${-178 + fl(4)} C32,-150 44,-148 50,-124 Z`, { p: 1, w: 2.4, col: COL.red, fill: COL.gold, fo: 0.55 });
    out += L(`M-24,-124 C-20,-140 -10,-146 0,${-164 + fl(5)} C10,-146 20,-140 24,-124 Z`, { p: 1, w: 1.8, col: COL.red, fill: COL.red, fo: 0.5 });
  }
  return g(`translate(${f1(x)},${f1(y)}) scale(${sc})`, out);
}

const SC = {};

/* 1. coast: Baishatun Gongtian Temple facing the sea; the lead banner is raised */
SC.s01_coast = {
  cam: [[0, 960, 540, 1.0], [14, 1180, 560, 1.12]],
  draw(t) {
    const shore = [[-200, 930], [200, 850], [520, 770], [800, 690], [980, 640], [1100, 612]];
    let o = '';
    o += cloud(260 + t * 9, 180, 1.1, { s: 0.2 }) + cloud(1250 + t * 6, 130, 0.8, { s: 0.6 }) + cloud(820 + t * 12, 260, 0.6, { s: 1.0 });
    o += mountains(1000, 612, { s: 0.3, sx: 1.1, sy: 0.7 });
    o += L('M-300,610 L1100,610', { s: 0, dur: 1.5, w: 2.2, op: 0.8 });
    // waves between horizon and shore
    for (let r = 0; r < 9; r++) {
      const y = 628 + r * r * 3.2 + r * 14, x1 = shoreX(shore, y) - 30, amp = 2 + r * 0.9, pts = [];
      for (let x = -300; x <= x1; x += 26) pts.push([x, y + Math.sin(x * 0.02 + t * (1 + r * 0.25) + r) * amp]);
      o += L(smooth(pts), { s: 0.4 + r * 0.12, dur: 1.2, w: 1.6 + r * 0.15, op: 0.75 });
    }
    o += foam(40, 850, t, 8);
    o += L(smooth(shore), { s: 0.3, dur: 1.6, w: 3 });
    o += L('M1100,612 C1300,640 1600,660 2200,668', { s: 0.5, dur: 1.4, w: 2.6 });
    o += L('M-200,1000 C200,960 600,900 900,860 C1200,830 1600,830 2200,840', { s: 0.6, dur: 1.6, w: 2.2, op: 0.7 });
    let grass = ''; for (let i = 0; i < 22; i++) { const x = 900 + i * 60 + rnd(i) * 30, y = 700 + rnd(i * 2) * 120; grass += `M${f1(x)},${f1(y)} l-4,-14 M${f1(x + 6)},${f1(y)} l4,-16 `; }
    o += L(grass, { s: 1.2, dur: 1.5, w: 1.6, op: 0.7 });
    for (let i = 0; i < 3; i++) o += bird(300 + t * (55 + i * 8) + i * 90, 330 + i * 26 + Math.sin(t + i) * 10, t, 1, i);
    // temple, incense burner
    o += temple(1450, 780, 0.82, { start: 0.3 });
    o += censer(1060, 800, 0.55, { start: 1.2, label: '天公爐' });
    o += smoke(1060, 730, t, 6, { h: 170, op: 0.55 });
    // raising the lead banner (放頭旗)
    const rise = easeOut((t - 4.2) / 2.7);
    o += headFlag(1830, 860, 0.95, { start: 1.6, rise });
    o += person(1760, 870, 0.8, { start: 1.8, walk: 0, arms: 'up', hat: 'cap', facing: 1 });
    o += person(1900, 872, 0.8, { start: 1.9, walk: 0, arms: 'up', hat: 'cap', facing: -1 });
    // pilgrims walking along the beach toward the temple
    for (let i = 0; i < 4; i++) o += person(380 + i * 70 + t * 26, 905 - i * 6 - t * 1.5, 0.62 - i * 0.03, { start: 1.5 + i * 0.2, phase: t * 5.5 + i * 1.3, prop: i % 2 ? 'flag' : null, hat: i === 2 ? 'bamboo' : 'cap' });
    return o;
  },
};

/* 2. title card: title strokes draw on, seal stamps down */
SC.s02_title = {
  cam: [[0, 960, 540, 1.0], [6.5, 960, 540, 1.05]],
  draw(t) {
    let o = '';
    o += cloud(300 + t * 10, 200, 0.9, { s: 0 }) + cloud(1550 + t * 7, 170, 0.7, { s: 0.2 });
    o += waves(-100, 2020, 880, 4, t, { s: 0, op: 0.35, gap: 34 });
    const p = ease((t - 0.3) / 2.2), pf = ease((t - 1.6) / 1.4);
    o += `<text x="960" y="520" font-family="LXGW WenKai TC" font-weight="700" font-size="168" text-anchor="middle" letter-spacing="18" fill="${COL.ink}" fill-opacity="${pf.toFixed(3)}" stroke="${COL.ink}" stroke-width="3" stroke-dasharray="1400 1400" stroke-dashoffset="${f1(1400 * (1 - p))}">白沙屯媽祖進香</text>`;
    o += L('M520,572 C760,556 1160,556 1400,572', { s: 1.8, dur: 1, w: 5, col: COL.red });
    o += text(960, 650, 'The Baishatun Mazu Pilgrimage', 56, { s: 2.2, dur: 0.9, font: 'EB Garamond', italic: true });
    o += text(960, 712, '苗栗通霄 · 白沙屯  ⟶  雲林 · 北港', 34, { s: 2.8, dur: 0.9, op: 0.8, ls: 4 });
    // seal stamp
    if (t > 2.8) {
      const k = (t - 2.8) / 0.25, s = k < 1 ? lerp(1.8, 1, easeOut(k)) : 1 + Math.sin(Math.min((t - 3.05) * 18, Math.PI)) * 0.04 * (t < 3.3 ? 1 : 0);
      const a = cl(k * 1.5);
      o += g(`translate(1640,360) rotate(-6) scale(${f1(s * 100) / 100})`,
        `<rect x="-62" y="-62" width="124" height="124" rx="10" fill="${COL.red}" opacity="${(0.9 * a).toFixed(2)}"/>` +
        `<rect x="-52" y="-52" width="104" height="104" rx="6" fill="none" stroke="${COL.paper}" stroke-width="3" opacity="${a.toFixed(2)}"/>` +
        `<text x="0" y="-6" font-family="LXGW WenKai TC" font-weight="700" font-size="46" text-anchor="middle" fill="${COL.paper}" opacity="${a.toFixed(2)}">進</text>` +
        `<text x="0" y="42" font-family="LXGW WenKai TC" font-weight="700" font-size="46" text-anchor="middle" fill="${COL.paper}" opacity="${a.toFixed(2)}">香</text>`);
    }
    return o;
  },
};

/* 3. casting the moon blocks in front of Mazu */
function tossBlocks(t, t0, faces, landX) {
  const fl = 0.9;
  let o = '';
  const k = t - t0;
  if (k < 0) return '';
  for (let b = 0; b < 2; b++) {
    const x0 = 640, y0 = 790, x1 = landX + b * 110, y1 = 940;
    let x, y, rot, face;
    if (k < fl) {
      const u = k / fl;
      x = lerp(x0, x1, u); y = lerp(y0, y1, u) - Math.sin(u * Math.PI) * 170;
      rot = u * 720 * (b ? -1 : 1) + b * 40; face = Math.floor(u * 8 + b) % 2 ? 'flat' : 'round';
    } else {
      const u = k - fl;
      const bounce = u < 0.3 ? Math.sin(u / 0.3 * Math.PI) * 26 * (1 - b * 0.3) : 0;
      x = x1 + Math.min(u, 0.3) * 60 * (b ? 1 : -0.6); y = y1 - bounce; rot = u < 0.3 ? (1 - u / 0.3) * 40 : 0; face = faces[b];
    }
    o += jiao(x, y, rot, 1.25, face, { p: 1 });
  }
  return o;
}
SC.s03_jiao = {
  cam: [[0, 960, 520, 1.0], [7, 930, 590, 1.1], [13.2, 900, 690, 1.32]],
  draw(t) {
    let o = '';
    // interior: beams, back wall
    o += L('M-100,120 L2020,120 M-100,150 L2020,150', { s: 0, dur: 1.3, w: 3 });
    for (const x of [140, 1780]) o += L(rect(x - 26, 150, 52, 800), { s: 0.1, dur: 1.2, fill: 'bg', w: 3 });
    for (const x of [140, 1780]) o += L(`M${x - 8},200 q10,20 0,40 q-10,20 0,40 q10,20 0,40 q-10,20 0,40`, { s: 1, dur: 1, w: 1.6, col: COL.gold });
    o += L('M-100,880 L2020,880', { s: 0.2, dur: 1.2, w: 3 });
    let tiles = ''; for (let i = -6; i < 30; i++) tiles += `M${i * 90},880 L${i * 130 - 700},1100 `;
    o += L(tiles, { s: 0.6, dur: 1.4, w: 1.2, op: 0.35 });
    // curtain / canopy over the shrine
    o += L('M520,160 C640,230 1280,230 1400,160 L1400,190 C1280,260 640,260 520,190 Z', { s: 0.4, dur: 1.2, fill: COL.red, fo: 0.8, w: 2.6 });
    o += L('M560,196 L560,240 M700,230 L700,272 M960,240 L960,284 M1220,230 L1220,272 M1360,196 L1360,240', { s: 1, dur: 0.8, w: 1.6, col: COL.gold });
    // Mazu statue
    const bs = Math.sin(t * 1.3) * 2;
    let m = '';
    m += L('M-130,0 C-120,-80 -100,-160 -70,-200 L70,-200 C100,-160 120,-80 130,0 Z', { s: 0.6, dur: 1.2, fill: 'bg', w: 3 });
    m += L('M-70,-200 C-40,-150 -30,-80 -40,0 M70,-200 C40,-150 30,-80 40,0 M-90,-120 C-40,-100 40,-100 90,-120', { s: 1.2, dur: 1, w: 1.8, op: 0.7 });
    m += L('M-24,-150 L24,-150 L20,-60 L-20,-60 Z', { s: 1.4, dur: 0.8, fill: COL.gold, fo: 0.6, w: 2 });
    m += L(circ(0, -236, 34), { s: 0.8, dur: 0.9, fill: COL.gold, fo: 0.55, w: 3 });
    m += L('M-12,-240 q6,-4 10,0 M4,-240 q6,-4 10,0 M-6,-220 q6,4 12,0', { s: 1.4, dur: 0.6, w: 1.8 });
    m += L('M-56,-262 L56,-262 L48,-290 L24,-278 L0,-306 L-24,-278 L-48,-290 Z', { s: 1, dur: 0.9, fill: COL.gold, fo: 0.85, w: 2.4 });
    m += L('M-64,-262 L64,-262', { s: 1.2, dur: 0.6, w: 4 });
    let beads = '';
    for (let i = -5; i <= 5; i++) { const sx = i * 11 + Math.sin(t * 2 + i) * 1.2; beads += `M${f1(sx)},-262 L${f1(sx + bs * 0.3)},${-226 + Math.abs(i) * 2} `; }
    m += L(beads, { s: 1.6, dur: 0.6, w: 1.4, col: COL.red });
    o += g('translate(960,560)', m);
    // altar table
    o += L('M440,560 L1480,560 L1480,590 L440,590 Z', { s: 0.3, dur: 1, fill: 'bg', w: 3 });
    o += L('M470,590 L470,880 M1450,590 L1450,880', { s: 0.5, dur: 0.8, w: 5 });
    o += L('M520,590 L1400,590 L1370,800 L550,800 Z', { s: 0.6, dur: 1.2, fill: COL.red, fo: 0.85, w: 2.6 });
    o += L('M600,630 C700,690 820,610 960,660 C1100,710 1220,630 1320,690', { s: 1.4, dur: 1.2, w: 2, col: COL.gold });
    o += text(960, 760, '天上聖母', 44, { s: 1.6, col: COL.gold, weight: 700, ls: 12 });
    // candles
    for (const cx of [620, 1300]) {
      o += L(rect(cx - 12, 470, 24, 90), { s: 0.8, dur: 0.8, fill: COL.red, fo: 0.9, w: 2.4 });
      const fl = Math.sin(t * 11 + cx) * 3;
      o += halo(cx, 450, 50, 0.35) + L(`M${cx},${468} C${cx - 10},458 ${cx - 4 + fl},440 ${cx + fl},428 C${cx + 6 + fl},442 ${cx + 10},458 ${cx},468 Z`, { s: 1, dur: 0.5, fill: COL.gold, fo: 0.9, w: 1.6, col: COL.red });
    }
    // incense burner & sticks
    o += L('M880,560 C870,520 880,500 890,496 L1030,496 C1040,500 1050,520 1040,560 Z', { s: 1, dur: 0.9, fill: 'bg', w: 2.8 });
    o += L('M940,496 L932,420 M960,496 L960,414 M980,496 L988,420', { s: 1.4, dur: 0.6, w: 2 });
    o += smoke(932, 418, t, 4, { h: 150, op: 0.5 }) + smoke(988, 418, t + 1, 4, { h: 150, op: 0.5 });
    o += lantern(300, 160, 1.05, { start: 0.8 }) + lantern(1620, 160, 1.05, { start: 0.8 });
    // kneeling worshipper tossing blocks
    const toss = (t > 1.7 && t < 2.3) || (t > 7.4 && t < 8.0);
    o += g('translate(560,930) scale(1.35)',
      tube('M-10,0 L-48,-2 L-60,-4', 9, { s: 0.9, dur: 0.8 }) +
      L('M-46,-6 C-48,-50 -40,-96 -6,-104 C12,-100 14,-60 8,-10 Z', { s: 0.9, dur: 0.8, fill: 'bg', w: 3 }) +
      L(circ(-2, -122, 14), { s: 0.9, dur: 0.8, fill: 'bg', w: 3 }) +
      L('M-14,-130 C-10,-140 8,-140 12,-128', { s: 1, dur: 0.6, w: 3 }) +
      tube(toss ? 'M-6,-96 L24,-110 L52,-128' : 'M-6,-96 L18,-80 L36,-96', 7, { s: 0.9, dur: 0.8 }) +
      tube('M-30,-6 L4,0 L20,0', 9, { s: 0.9, dur: 0.8 }));
    // blocks in hand before each toss
    if (t > 1.0 && t < 2.2) o += jiao(612, 800, -20, 1.0, 'round', { p: 1 });
    if (t > 6.9 && t < 7.9) o += jiao(612, 800, -20, 1.0, 'round', { p: 1 });
    // throw 1 (laughing blocks), throw 2 (holy blocks: one flat, one round)
    if (t < 6.8) o += `<g opacity="${(1 - cl((t - 6.2) / 0.5)).toFixed(2)}">${tossBlocks(t, 2.2, ['flat', 'flat'], 880)}</g>`;
    o += tossBlocks(t, 7.9, ['flat', 'round'], 900);
    if (t > 9.3) {
      const a = ease((t - 9.3) / 0.6);
      o += `<g opacity="${a.toFixed(2)}">` + L(circ(990, 900, 110), { p: 1, w: 3, col: COL.red, op: 0.8 }) + `</g>` +
        text(1160, 850, '聖筊', 58, { p: a, col: COL.red, weight: 700 }) +
        text(1160, 900, 'a holy answer', 30, { p: a, font: 'EB Garamond', italic: true, col: COL.red });
    }
    return o;
  },
};

/* 4. night departure: palanquin leaves the temple amid firecrackers */
SC.s04_depart = {
  cam: [[0, 1120, 540, 1.04], [13.5, 860, 600, 1.12]],
  draw(t) {
    let o = '';
    o += stars(70, 3, 520) + moon(260, 170);
    o += cloud(700 + t * 6, 150, 0.8, { s: 0.3 });
    o += L('M-200,800 L2200,800', { s: 0, dur: 1.2, w: 2.4 });
    o += house(-80, 800, 0.9, { start: 0.3, lit: 1, lantern: true });
    o += temple(1260, 800, 1.0, { start: 0.2, doorOpen: ease((t - 0.8) / 1.2) });
    // palanquin emerges from the doorway toward the viewer and heads left
    const k = ease((t - 2.0) / 9.5);
    const px = lerp(1260, 560, k), py = lerp(800, 930, k), ps = lerp(0.52, 0.9, k);
    if (t > 1.9) o += palanquin(px, py, ps, { start: 1.9, phase: t * 5.2, pink: true });
    // lead banner walks ahead
    const fk = ease((t - 2.6) / 10);
    o += headFlag(lerp(980, 240, fk), lerp(860, 960, fk), 0.9, { start: 0.8 });
    o += person(lerp(960, 220, fk), lerp(862, 962, fk), 0.85, { start: 0.8, phase: t * 5, walk: t > 2.6 ? 1 : 0, arms: 'up', hat: 'cap' });
    // firecrackers
    o += firecrackers(120, 1010, 760, t - 1.5, { dur: 7 });
    // foreground crowd (backs), with incense flags
    for (let i = 0; i < 9; i++) {
      const x = 1180 + i * 105 - t * 22, y = 1110 + (i % 2) * 18;
      o += person(x, y, 1.35, { start: 0.6 + i * 0.1, phase: t * 4.2 + i, prop: i % 3 === 0 ? 'flag' : (i % 3 === 1 ? 'lamp' : null), hat: 'cap' });
    }
    return o;
  },
};

/* 5. no fixed route: the map, the palanquin wandering south */
const ROUTE = (() => {
  const pts = []; let x = 780;
  for (let y = 330; y <= 2060; y += 18) {
    x = 820 + Math.sin(y * 0.006) * 110 + Math.sin(y * 0.017 + 1) * 45 + Math.sin(y * 0.041) * 18;
    pts.push([x, y]);
  }
  // a detour loop near Changhua
  const loop = [];
  for (let i = 0; i < 38; i++) { const a = i / 38 * Math.PI * 2; loop.push([900 + Math.sin(a) * 90, 1320 - Math.cos(a) * 60 + 60]); }
  const idx = pts.findIndex(p => p[1] >= 1260);
  pts.splice(idx, 0, ...loop.map(p => [p[0] - 20, p[1] - 60]));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, total: cum[cum.length - 1] };
})();
function routeAt(p) {
  const L0 = p * ROUTE.total; let i = ROUTE.cum.findIndex(c => c >= L0); if (i <= 0) return ROUTE.pts[0];
  const a = ROUTE.pts[i - 1], b = ROUTE.pts[i], u = (L0 - ROUTE.cum[i - 1]) / (ROUTE.cum[i] - ROUTE.cum[i - 1] || 1);
  return [lerp(a[0], b[0], u), lerp(a[1], b[1], u)];
}
SC.s05_route = {
  cam: null,
  camFn(t) {
    const p = ease((t - 1.2) / 10.5), h = routeAt(p);
    const out = ease((t - 11.6) / 2.2);
    return [lerp(h[0] + 60, 960, out), lerp(cl(h[1], 480, 1900), 1170, out), lerp(1.12, 0.47, out)];
  },
  draw(t) {
    let o = '';
    const coast = [[640, -100], [660, 200], [700, 330], [650, 600], [600, 900], [560, 1200], [540, 1500], [560, 1800], [600, 2100], [620, 2500]];
    o += L(smooth(coast), { s: 0, dur: 1.5, w: 3.4 });
    for (let r = 0; r < 26; r++) {
      const y = 60 + r * 94, x1 = shoreX(coast, y) - 40, pts = [];
      for (let x = -600; x <= x1; x += 30) pts.push([x, y + Math.sin(x * 0.03 + t * 1.2 + r) * 5]);
      o += L(smooth(pts), { s: 0.3 + r * 0.03, dur: 1, w: 1.6, op: 0.45 });
    }
    // mountains to the east
    for (let r = 0; r < 9; r++) o += mountains(1200, 260 + r * 260, { s: 0.4 + r * 0.05, sx: 0.8, sy: 0.9, op: 0.5 });
    // rivers
    const rivers = [[560, '大安溪'], [700, '大甲溪'], [1150, '大肚溪'], [1720, '濁水溪']];
    rivers.forEach(([ry, name], i) => {
      const pts = []; for (let x = 1400; x >= shoreX(coast, ry); x -= 40) pts.push([x, ry + Math.sin(x * 0.012 + i) * 18 + (1400 - x) * 0.03]);
      o += L(smooth(pts), { s: 0.8 + i * 0.1, dur: 1.2, w: 2, op: 0.7 });
      o += L(smooth(pts.map(p => [p[0], p[1] + 10])), { s: 0.9 + i * 0.1, dur: 1.2, w: 1.4, op: 0.5 });
      o += text(1330, ry - 16, name, 30, { s: 1.2, op: 0.75 });
    });
    // county labels and boundaries
    [['苗栗', 250], ['臺中', 900], ['彰化', 1380], ['雲林', 1930]].forEach(([n, y], i) => {
      o += text(1120, y, n, 62, { s: 0.6 + i * 0.1, op: 0.8, weight: 700, ls: 10 });
    });
    for (const by of [620, 1120, 1690]) { let d = ''; for (let x = 600; x < 1500; x += 36) d += `M${x},${by + Math.sin(x * 0.02) * 8} l18,0 `; o += L(d, { s: 1, dur: 1, w: 1.6, op: 0.5 }); }
    // start & end
    o += L(circ(ROUTE.pts[0][0], ROUTE.pts[0][1], 16), { s: 0.8, dur: 0.6, fill: COL.red, w: 2.4 });
    o += text(ROUTE.pts[0][0] - 150, ROUTE.pts[0][1] + 12, '白沙屯', 44, { s: 0.9, weight: 700 });
    const E = ROUTE.pts[ROUTE.pts.length - 1];
    o += L(circ(E[0], E[1], 16), { s: 0.8, dur: 0.6, fill: COL.red, w: 2.4 });
    o += text(E[0] - 130, E[1] + 12, '北港', 44, { s: 0.9, weight: 700 });
    // the route drawn behind the palanquin
    const p = ease((t - 1.2) / 10.5);
    o += L(poly(ROUTE.pts), { p, w: 6, col: COL.red, op: 0.9 });
    const h = routeAt(p), h2 = routeAt(Math.min(1, p + 0.004));
    const ang = Math.atan2(h2[1] - h[1], h2[0] - h[0]);
    // footsteps along the route
    let steps = '';
    for (let q = 0.01; q < p; q += 0.012) { const a = routeAt(q); steps += `M${f1(a[0] + 14)},${f1(a[1])} l5,0 `; }
    o += L(steps, { p: 1, w: 3, op: 0.5 });
    o += g(`translate(${f1(h[0])},${f1(h[1])}) rotate(${f1(Math.sin(t * 6) * 3)})`, palanquin(0, 60, 0.32, { start: 0.9, phase: t * 7, pink: true }));
    o += `<g opacity="${(0.3 + 0.2 * Math.sin(ang)).toFixed(2)}"></g>`;
    // compass
    o += g('translate(1650,200)', L(circ(0, 0, 50), { s: 1, w: 2 }) + L('M0,-70 L12,0 L0,70 L-12,0 Z', { s: 1.2, w: 2, fill: COL.red, fo: 0.5 }) + text(0, -84, '北', 32, { s: 1.4 }));
    return o;
  },
};

/* 6. the "pink supercar" at full speed */
SC.s06_pink = {
  cam: [[0, 960, 560, 1.0], [13.6, 1000, 600, 1.1]],
  draw(t) {
    let o = '';
    const speed = t < 5.8 ? 1 : lerp(1, 1.7, ease((t - 5.8) / 1.2));
    const dist = t * 260 + Math.max(0, t - 5.8) * 150;
    o += cloud(300 - t * 12 + 1400, 170, 1, { s: 0 }) + cloud(700 - t * 10, 230, 0.7, { s: 0.3 });
    // far mountains (slow parallax)
    for (let k = -1; k < 3; k++) o += mountains(((k * 1100 - dist * 0.08) % 3300 + 3300) % 3300 - 1100, 560, { s: 0.2, sx: 1.15, sy: 0.9 });
    o += L('M-200,600 L2200,600', { s: 0.2, dur: 1, w: 2, op: 0.7 });
    // rice paddies
    let fields = ''; for (let i = 0; i < 4; i++) fields += `M-200,${630 + i * i * 12 + i * 22} L2200,${630 + i * i * 12 + i * 22} `;
    o += L(fields, { s: 0.4, dur: 1.2, w: 1.4, op: 0.5 });
    let sprouts = ''; for (let i = 0; i < 60; i++) { const x = ((i * 67 - dist * 0.45) % 2400 + 2400) % 2400 - 200, y = 640 + (i % 4) * 34; sprouts += `M${f1(x)},${y} l-3,-10 M${f1(x + 4)},${y} l3,-11 `; }
    o += L(sprouts, { s: 0.8, dur: 1, w: 1.4, op: 0.55 });
    // trees & poles (mid parallax)
    for (let i = 0; i < 5; i++) { const x = ((i * 520 - dist * 0.6) % 2600 + 2600) % 2600 - 300; o += tree(x, 780, 0.85 + (i % 2) * 0.15, { s: 0.3 }); }
    for (let i = 0; i < 4; i++) { const x = ((i * 700 + 300 - dist * 0.6) % 2800 + 2800) % 2800 - 300; o += L(`M${f1(x)},790 L${f1(x)},420 M${f1(x - 30)},440 L${f1(x + 30)},440`, { s: 0.5, dur: 1, w: 3.2 }); }
    o += L('M-200,420 C400,450 900,450 2200,430', { s: 0.8, dur: 1, w: 1.2, op: 0.5 });
    // road
    o += L('M-200,800 L2200,800', { s: 0.2, dur: 1, w: 3 });
    o += L('M-200,1000 L2200,1000', { s: 0.3, dur: 1, w: 2.4, op: 0.7 });
    let dash = ''; for (let i = 0; i < 12; i++) { const x = ((i * 220 - dist) % 2640 + 2640) % 2640 - 300; dash += `M${f1(x)},930 l110,0 `; }
    o += L(dash, { s: 0.5, dur: 0.8, w: 3, op: 0.6 });
    const run = t * 6.2 * speed;
    // followers behind
    for (let i = 0; i < 5; i++) o += person(140 + i * 110 + Math.sin(t * 1.3 + i) * 20, 920 + (i % 2) * 14, 0.9, { start: 0.6 + i * 0.1, phase: run * 1.05 + i * 1.7, prop: i % 2 ? 'flag' : null, hat: 'cap' });
    // speed lines
    const sl = cl((speed - 1) / 0.7) * 0.8 + 0.25;
    let lines = ''; for (let i = 0; i < 9; i++) { const y = 560 + i * 38, x = 560 - ((t * 900 + i * 173) % 400); lines += `M${f1(x)},${y} l${f1(-120 - rnd(i) * 140)},0 `; }
    o += L(lines, { p: 1, w: 2.2, op: sl.toFixed(2) });
    // palanquin
    const bob = Math.sin(run * 2) * 5;
    o += palanquin(1000 + Math.sin(t * 0.7) * 30, 930 + bob, 1.05, { start: 0.4, phase: run, pink: true });
    // dust puffs at the bearers' feet
    for (let i = 0; i < 6; i++) { const ph = ((t * speed * 2 + i / 6) % 1); o += L(`M${f1(820 - ph * 160)},${f1(925 - ph * 30)} q12,-18 26,-4 q10,-14 22,0`, { p: 1, w: 1.8, op: (0.7 * (1 - ph)).toFixed(2) }); }
    // lead banner ahead
    o += headFlag(1640 + Math.sin(t) * 20, 920, 0.95, { start: 0.8 });
    o += person(1620 + Math.sin(t) * 20, 922, 0.95, { start: 0.8, phase: run, arms: 'up', hat: 'cap' });
    return o;
  },
};

/* 7. wading across the Zhuoshui River (2001) */
SC.s07_river = {
  cam: [[0, 820, 600, 1.3], [8.8, 1120, 630, 1.4]],
  draw(t) {
    let o = '';
    o += cloud(400 + t * 10, 160, 0.9, { s: 0 }) + cloud(1500 + t * 8, 120, 0.7, { s: 0.2 });
    o += mountains(-100, 470, { s: 0.1, sx: 2.3, sy: 0.6 });
    // Xiluo Bridge (red steel truss) in the distance
    let truss = 'M-200,470 L2200,470 M-200,420 L2200,420 ';
    for (let x = -200; x < 2200; x += 60) truss += `M${x},470 L${x + 30},420 L${x + 60},470 `;
    o += L(truss, { s: 0.3, dur: 2, w: 2.4, col: COL.red, op: 0.85 });
    let piers = ''; for (let x = -100; x < 2200; x += 240) piers += `M${x},470 L${x},560 M${x + 20},470 L${x + 20},560 `;
    o += L(piers, { s: 0.6, dur: 1, w: 2.2 });
    o += text(1700, 395, '西螺大橋', 30, { s: 1.4, op: 0.7 });
    o += L('M-200,560 C400,550 1200,570 2200,556', { s: 0.2, dur: 1.2, w: 2.4 });
    // flowing water lines (behind people)
    for (let r = 0; r < 6; r++) { const y = 590 + r * 32; let d = ''; for (let i = 0; i < 9; i++) { const x = ((i * 300 + r * 90 + t * (60 + r * 12)) % 2700) - 400; d += `M${f1(x)},${f1(y + Math.sin(x * 0.01 + r) * 3)} q40,-8 80,0 q40,8 80,0 `; } o += L(d, { s: 0.4 + r * 0.1, dur: 1, w: 1.6, op: 0.6 }); }
    // wading crowd and palanquin (lower bodies hidden by the water band)
    const wx = t * 70;
    for (let i = 0; i < 6; i++) o += person(120 + i * 150 + wx * 0.9, 812 + (i % 2) * 14, 1.0, { start: 0.5 + i * 0.1, phase: t * 3 + i * 1.3, walk: 0.5, prop: i % 2 ? 'flag' : null, hat: i % 3 ? 'cap' : 'bamboo' });
    o += palanquin(900 + wx, 822, 1.0, { start: 0.3, phase: t * 3, walk: 0.5, pink: true, lift: 36 });
    // water surface in front
    const surf = []; for (let x = -300; x <= 2300; x += 30) surf.push([x, 760 + Math.sin(x * 0.015 + t * 2) * 5]);
    o += L(smooth(surf) + ' L2300,1200 L-300,1200 Z', { s: 0.2, dur: 1.2, fill: 'bg', w: 3 });
    for (let r = 0; r < 7; r++) { let d = ''; const y = 800 + r * 40; for (let i = 0; i < 8; i++) { const x = ((i * 330 + r * 120 + t * (70 + r * 10)) % 2800) - 400; d += `M${f1(x)},${f1(y)} q50,-9 100,0 q50,9 100,0 `; } o += L(d, { s: 0.5 + r * 0.1, dur: 1, w: 1.8, op: 0.55 }); }
    // splashes & ripples around waders
    const walkers = [900 + wx - 110, 900 + wx + 110, 900 + wx - 125, 900 + wx + 125];
    for (let i = 0; i < 6; i++) walkers.push(120 + i * 150 + wx * 0.9);
    walkers.forEach((x, i) => {
      const ph = (t * 1.1 + i * 0.37) % 1;
      o += L(`M${f1(x - 30 - ph * 30)},${f1(764 + ph * 6)} q${f1(30 + ph * 30)},${f1(-10 - ph * 6)} ${f1(60 + ph * 60)},0`, { p: 1, w: 1.8, op: (0.8 * (1 - ph)).toFixed(2) });
      const sp = (t * 1.6 + i * 0.29) % 1;
      if (sp < 0.4) for (let j = 0; j < 3; j++) o += `<circle cx="${f1(x - 10 + j * 12)}" cy="${f1(752 - Math.sin(sp / 0.4 * Math.PI) * (20 + j * 8))}" r="2.6" fill="${COL.ink}" opacity=".6"/>`;
    });
    o += text(300, 880, '濁水溪 · 2001', 44, { s: 1.4, op: 0.75, weight: 700 });
    return o;
  },
};

/* 8. villagers serve tea; believers kneel as the palanquin passes over them */
SC.s08_village = {
  cam: [[0, 820, 650, 1.08], [13.6, 1160, 690, 1.14]],
  draw(t) {
    let o = '';
    o += cloud(600 + t * 8, 150, 0.8, { s: 0 }) + cloud(1600 + t * 6, 190, 0.6, { s: 0.3 });
    o += L('M-200,760 L2400,760', { s: 0, dur: 1.2, w: 2.6 });
    o += house(160, 760, 0.95, { start: 0.2, lantern: true }) + house(560, 760, 0.85, { start: 0.4, w: 220 });
    o += tree(860, 770, 0.9, { s: 0.5 });
    o += house(1300, 760, 0.95, { start: 0.5, lantern: true }) + house(1720, 760, 0.9, { start: 0.6, w: 240 }) + house(2150, 760, 0.9, { start: 0.7 });
    o += L('M-200,1010 L2400,1010', { s: 0.3, dur: 1, w: 2.2, op: 0.7 });
    // tea table and host
    const pour = ease((t - 1.6) / 0.6) * (1 - ease((t - 4.2) / 0.6));
    o += person(300, 900, 1.0, { start: 0.6, walk: 0, robe: true, arms: 'fwd', hat: 'none', facing: 1 });
    o += L('M150,850 L520,850 L520,866 L150,866 Z', { s: 0.6, dur: 0.8, fill: 'bg', w: 2.8 });
    o += L('M170,866 L180,960 M500,866 L490,960', { s: 0.7, dur: 0.6, w: 3.2 });
    o += L('M150,850 L520,850 L510,880 L160,880 Z', { s: 0.8, dur: 0.8, fill: COL.red, fo: 0.8, w: 2.2 });
    for (let i = 0; i < 5; i++) { const cx = 200 + i * 58; o += L(`M${cx - 14},826 L${cx + 14},826 L${cx + 10},850 L${cx - 10},850 Z`, { s: 1 + i * 0.1, dur: 0.5, fill: 'bg', w: 2.2 }); o += smoke(cx, 820, t + i * 0.7, 2, { h: 60, op: 0.45, per: 2.2 }); }
    // teapot tilting
    o += g(`translate(360,${f1(790 - pour * 30)}) rotate(${f1(pour * 38)})`, L('M-26,0 C-34,-30 26,-30 26,0 C26,12 -26,12 -26,0 Z M26,-8 L46,-22 M-26,-8 C-44,-10 -44,8 -26,6', { s: 0.9, dur: 0.8, fill: 'bg', w: 2.6 }) + L('M-8,-20 L8,-20 L4,-28 L-4,-28 Z', { s: 1.1, dur: 0.4, w: 2 }));
    if (pour > 0.8) o += L(`M${f1(404)},${f1(760)} C410,780 402,800 404,822`, { p: 1, w: 2, op: 0.7 });
    o += text(560, 800, '奉茶', 44, { s: 1.4, col: COL.red, weight: 700 });
    // kneeling believers and the palanquin passing over them
    const px = lerp(2250, 800, ease((t - 5.2) / 8.2));
    const walkP = t * 4.6;
    o += palanquin(px, 930, 0.95, { start: 0, phase: walkP, pink: true, part: 'back', lift: 10 });
    for (let i = 0; i < 4; i++) o += kneeler(1080 + i * 150, 930, 1.05, { start: 1 + i * 0.15, facing: -1 });
    o += palanquin(px, 930, 0.95, { start: 0, phase: walkP, pink: true, part: 'front', lift: 10 });
    return o;
  },
};

/* 9. Beigang Chaotian Temple: gathering the fire (刈火) */
function ladlePos(t) {
  const cyc = (u, a, b) => { const k = cl((u - a) / (b - a)); return Math.sin(k * Math.PI); };
  const k1 = cl((t - 2.2) / 2), k2 = cl((t - 4.8) / 2);
  const k = t < 4.5 ? k1 : k2;
  const x = lerp(860, 1270, ease(k)), y = lerp(780, 810, ease(k)) - Math.sin(k * Math.PI) * 120;
  const has = (t > 2.2 && t < 4.3) || (t > 4.8 && t < 6.9);
  return [x, y, has, k];
}
SC.s09_beigang = {
  cam: [[0, 960, 520, 1.0], [6, 1000, 600, 1.12], [12.3, 1130, 700, 1.32]],
  draw(t) {
    let o = '';
    o += cloud(400 + t * 8, 120, 0.9, { s: 0 }) + cloud(1500 + t * 6, 100, 0.7, { s: 0.2 });
    // Chaotian Temple (two stacked roofs for its grander hall)
    o += g('translate(960,300) scale(0.62)', temple(0, 0, 1, { start: 0.8, name: '北港', lanterns: false }));
    o += g('translate(960,640) scale(1.12)', temple(0, 0, 1, { start: 0.2, name: '朝天宮', lanterns: true }));
    o += L('M-200,660 L2200,660', { s: 0.1, dur: 1, w: 2.6 });
    o += L('M-200,1000 L2200,1000', { s: 0.2, dur: 1, w: 2, op: 0.6 });
    // censer with the eternal fire
    o += censer(820, 960, 1.2, { start: 0.8, fire: true, label: '萬年香火' });
    o += smoke(820, 760, t, 7, { h: 360, op: 0.6, per: 3.6, drift: 60 });
    // fire urn on a carrying frame
    let urn = L('M-70,-10 C-86,-60 -70,-120 -50,-130 L50,-130 C70,-120 86,-60 70,-10 Z', { s: 1, dur: 1, fill: 'bg', w: 3 });
    urn += L('M-56,-130 L56,-130 L50,-144 L-50,-144 Z', { s: 1.2, dur: 0.6, fill: 'bg', w: 2.6 });
    urn += L('M-110,0 L110,0 M-100,0 L-100,-200 L100,-200 L100,0', { s: 1.1, dur: 0.9, w: 4 });
    urn += text(0, -60, '火', 48, { s: 1.4, col: COL.red, weight: 700 });
    const seal = ease((t - 8.6) / 0.9);
    if (seal > 0) urn += L('M-60,-144 L60,-20 M60,-144 L-60,-20', { p: seal, w: 12, col: COL.red, op: 0.9 }) + L(rect(-26, -100, 52, 34), { p: seal, w: 2, fill: COL.paper, fo: 1, col: COL.red }) + text(0, -76, '封', 24, { p: seal, col: COL.red, weight: 700 });
    if (t > 2 && t < 8) urn += halo(0, -140, 80, 0.35);
    o += g('translate(1270,960) scale(1.1)', urn);
    // priest with ladle
    const [lx, ly, has] = ladlePos(t);
    o += person(1060, 960, 1.15, { start: 0.9, walk: 0, robe: true, hat: 'cap', arms: 'fwd', facing: t < 2.2 || (t > 4.4 && t < 4.8) ? -1 : (lx < 1060 ? -1 : 1) });
    if (t > 1.4) {
      o += L(`M1060,${f1(960 - 1.15 * 110)} L${f1(lx)},${f1(ly)}`, { p: 1, w: 4 });
      o += L(`M${f1(lx - 18)},${f1(ly)} C${f1(lx - 16)},${f1(ly + 16)} ${f1(lx + 16)},${f1(ly + 16)} ${f1(lx + 18)},${f1(ly)} Z`, { p: 1, w: 2.4, fill: 'bg' });
      if (has) { o += halo(lx, ly, 40, 0.8); for (let j = 0; j < 4; j++) o += `<circle cx="${f1(lx - 9 + j * 6)}" cy="${f1(ly + 2 - rnd(j + G.frame) * 4)}" r="3" fill="${j % 2 ? COL.red : COL.gold}"/>`; }
    }
    o += text(1270, 700, '刈火', 52, { s: 2.0, col: COL.red, weight: 700, ls: 8 });
    return o;
  },
};

/* 10. night return: lamps lit along the way, fireworks over the temple */
SC.s10_return = {
  cam: [[0, 900, 560, 1.0], [13.5, 1180, 500, 1.08]],
  draw(t) {
    let o = '';
    o += stars(80, 11, 460) + moon(1500, 130);
    const fws = [[7.0, 1500, 260, 190], [7.7, 1180, 200, 150], [8.5, 1780, 230, 170], [9.3, 1350, 150, 210], [10.2, 1650, 300, 150], [11.1, 1250, 260, 180], [11.9, 1850, 160, 160]];
    fws.forEach(([s, x, y, r], i) => { o += firework(x, y, t - s, i * 1.7 + 0.5, r); });
    o += L('M-200,780 L2400,780', { s: 0, dur: 1, w: 2.4 });
    o += temple(1640, 780, 0.8, { start: 0.2, doorOpen: 0.6 });
    const hs = [[-40, 240], [320, 220], [640, 250], [980, 230]];
    hs.forEach(([x, w], i) => { const lit = ease((t - (3.6 - i * 0.7)) / 0.6); o += house(x, 780, 0.9, { start: 0.3 + i * 0.1, w, lantern: true, lit }); });
    o += L('M-200,1040 L2400,1040', { s: 0.3, dur: 1, w: 2, op: 0.6 });
    // procession heading home
    const shout = t > 7.4 && t < 9.4;
    for (let i = 0; i < 6; i++) o += person(-60 + i * 120 + t * 40, 960 + (i % 2) * 16, 0.95, { start: 0.5 + i * 0.1, phase: t * 4.5 + i * 1.4, prop: i % 2 ? 'lamp' : 'flag', hat: 'cap', arms: shout && i % 2 === 0 ? 'up' : 'swing' });
    o += palanquin(900 + t * 40, 980, 0.95, { start: 0.3, phase: t * 4.5, pink: true });
    for (let i = 0; i < 5; i++) { const x = 1150 + i * 150 + t * 18; o += person(x, 1110, 1.3, { start: 0.8 + i * 0.1, phase: t * 3.5 + i, hat: 'cap', arms: shout ? 'up' : 'swing', prop: i === 2 ? 'lamp' : null }); }
    if (shout) o += text(1000, 560, '進喔！', 88, { p: ease((t - 7.4) / 0.3) * (1 - ease((t - 9.0) / 0.4)), col: COL.glow, weight: 700 });
    o += firecrackers(1200, 800, 300, t - 0.5, { dur: 2.8 });
    return o;
  },
};

/* 11. closing: dawn over the coast, a long line of pilgrims, grandmother and child */
SC.s11_closing = {
  cam: [[0, 1120, 660, 1.28], [23.5, 960, 540, 1.0]],
  draw(t) {
    let o = '';
    const sunY = lerp(610, 470, ease(t / 20));
    o += halo(420, sunY, 260, 0.5, COL.pink);
    o += L(circ(420, sunY, 58), { s: 0.2, dur: 1.2, w: 2.6, fill: COL.red, fo: 0.75 });
    let rays = ''; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + t * 0.05; rays += `M${f1(420 + Math.cos(a) * 80)},${f1(sunY + Math.sin(a) * 80)} L${f1(420 + Math.cos(a) * 110)},${f1(sunY + Math.sin(a) * 110)} `; }
    o += L(rays, { s: 1, dur: 1, w: 2, col: COL.red, op: 0.6 });
    o += cloud(900 + t * 7, 200, 1.0, { s: 0.3 }) + cloud(1500 + t * 5, 150, 0.7, { s: 0.6 });
    // horizon, sea covers the lower part of the sun
    o += L('M-200,600 L2400,600 L2400,640 L-200,640 Z', { s: 0, dur: 1.2, w: 0, fill: 'bg' });
    o += L('M-200,600 L1200,600', { s: 0, dur: 1.2, w: 2.4 });
    o += `<rect x="-300" y="601" width="1500" height="700" fill="${COL.paper}"/>`;
    for (let r = 0; r < 8; r++) { const y = 620 + r * r * 3 + r * 16, pts = []; for (let x = -300; x <= 1100 - r * 60; x += 26) pts.push([x, y + Math.sin(x * 0.02 + t * (1 + r * 0.2) + r) * (2 + r)]); o += L(smooth(pts), { s: 0.3 + r * 0.1, dur: 1, w: 1.6, op: 0.7 }); }
    o += L(`M${f1(360)},${f1(620)} L480,620 M380,640 L460,640 M400,660 L440,660`, { s: 1, dur: 0.8, w: 2.4, col: COL.red, op: 0.6 });
    // land and winding coastal road to the horizon
    o += L('M1200,600 C1500,610 1900,610 2400,606', { s: 0.2, dur: 1, w: 2.2 });
    o += L('M900,1200 C1000,900 1300,820 1150,700 C1080,650 1200,620 1260,604', { s: 0.4, dur: 1.6, w: 3 });
    o += L('M1500,1200 C1450,920 1500,820 1300,700 C1220,650 1280,620 1290,604', { s: 0.5, dur: 1.6, w: 3 });
    o += L('M-200,760 C200,760 500,780 900,860', { s: 0.4, dur: 1.2, w: 2.6 });
    for (let i = 0; i < 3; i++) o += tree(1700 + i * 170, 760 + i * 40, 0.8 + i * 0.1, { s: 0.6 });
    // procession: small figures along the road, heading to the horizon
    const bz = (p0, p1, p2, p3, u) => { const k = 1 - u; return [0, 1].map(j => k * k * k * p0[j] + 3 * k * k * u * p1[j] + 3 * k * u * u * p2[j] + u * u * u * p3[j]); };
    const road = u => u < 0.5 ? bz([1200, 1200], [1225, 910], [1400, 820], [1225, 700], u * 2) : bz([1225, 700], [1150, 650], [1240, 620], [1275, 604], u * 2 - 1);
    const figs = [];
    for (let i = 0; i < 16; i++) figs.push(0.3 + ((i / 16 + t * 0.006) % 1) * 0.62);
    figs.sort((a, b) => b - a).forEach((u, i) => {
      const [x, y] = road(u), s = 0.06 + 0.8 * Math.pow(cl((y - 604) / 596), 1.3);
      o += person(x, y, s, { start: 1.4 + (1 - u) * 1.5, phase: t * 4 + i * 2, prop: i % 4 === 0 ? 'flag' : null, hat: 'cap' });
    });
    const pp = road(0.95);
    o += palanquin(pp[0], pp[1], 0.08, { start: 2, phase: t * 4, pink: true });
    // grandmother and child in the foreground
    const gx = 620 + t * 12;
    o += person(gx, 930, 1.25, { start: 1.2, phase: t * 2.6, robe: true, hat: 'bamboo', prop: 'flag' });
    o += person(gx + 100, 934, 0.8, { start: 1.5, phase: t * 3.4 + 1, hat: 'none' });
    o += L(`M${f1(gx + 24)},${f1(930 - 1.25 * 80)} Q${f1(gx + 56)},${f1(930 - 1.25 * 62)} ${f1(gx + 86)},${f1(934 - 0.8 * 88)}`, { s: 2, dur: 0.6, w: 3 });
    for (let i = 0; i < 4; i++) o += bird(300 + t * (40 + i * 6) + i * 70, 300 + i * 30 + Math.sin(t * 0.7 + i) * 10, t, 1, i);
    return o;
  },
};

/* 12. end card */
SC.s12_end = {
  cam: [[0, 960, 540, 1.0], [11, 960, 540, 1.04]],
  draw(t) {
    let o = '';
    o += waves(-100, 2020, 930, 3, t, { s: 0, op: 0.35, gap: 34 });
    o += censer(1600, 900, 0.55, { start: 0.2 }) + smoke(1600, 830, t, 6, { h: 260, op: 0.5, drift: -30 });
    o += text(960, 260, '白沙屯媽祖進香', 96, { s: 0.2, dur: 1, weight: 700, ls: 10 });
    o += text(960, 330, 'The Baishatun Mazu Pilgrimage', 44, { s: 0.6, dur: 1, font: 'EB Garamond', italic: true });
    o += L('M660,372 C820,362 1100,362 1260,372', { s: 0.8, dur: 0.8, w: 4, col: COL.red });
    const lines = [
      ['畫面 Visuals：SVG 向量程式繪製 · 手繪線稿風格', 30],
      ['旁白 Narration：Kokoro TTS 中文男聲（離線合成）', 30],
      ['配樂 Music：程式合成原創 · 古箏 · 笛子 · 鑼鼓', 30],
      ['資料來源 Sources', 28],
      ['內政部臺灣宗教文化地圖 · 白沙屯媽祖婆網站 · 國家文化記憶庫', 24],
      ['維基百科 · 遠見 · 天下 · 風傳媒 · 知新聞 · 中時新聞網', 24],
    ];
    lines.forEach(([s, sz], i) => { o += text(960, 450 + i * 52 + (i > 2 ? 18 : 0), s, sz, { s: 1.2 + i * 0.25, dur: 0.8, op: i > 3 ? 0.75 : 0.9 }); });
    o += text(960, 820, '感謝收看 · Thank you', 40, { s: 3, dur: 1, col: COL.red, weight: 700 });
    return o;
  },
};
if (typeof module !== 'undefined') module.exports = { CUES, SC };

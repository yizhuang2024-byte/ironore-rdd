// ───────── reusable hand-drawn components (all occlude what is behind them) ─────────

// cloud drifting horizontally, wraps across [-400, W+400]
function cloud(x, y, s, p = 1, o = {}) {
  const d = smooth([[-60, 10], [-70, -15], [-40, -35], [-10, -30], [10, -55], [50, -50], [65, -25], [95, -20], [100, 5], [70, 18], [-40, 18]], true);
  return g(P(d, p, { occ: true, w: o.w ?? 2.6, stroke: o.stroke ?? C.ink2, fill: o.fill }) +
    P('M-30 -8 Q -10 -22 12 -14', p, { w: 1.6, stroke: o.stroke ?? C.ink2, op: 0.6 }),
    `translate(${f1(x)} ${f1(y)}) scale(${s})`);
}
function drift(x0, speed, t, span = W + 800) {
  return ((x0 + speed * t) % span + span) % span - 400;
}
function clouds(t, list, p = 1) {
  return list.map(([x, y, s, v]) => cloud(drift(x, v, t), y, s, p)).join('');
}

// sun with slowly turning rays
function sun(x, y, r, t, p = 1) {
  let s = P(circ(x, y, r), p, { occ: true, w: 3, stroke: C.gold });
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2 + t * 0.15;
    s += P(line(x + Math.cos(a) * (r + 14), y + Math.sin(a) * (r + 14), x + Math.cos(a) * (r + 34 + (i % 2) * 12), y + Math.sin(a) * (r + 34 + (i % 2) * 12)), p, { w: 2.4, stroke: C.gold });
  }
  return s;
}

// animated sea: several sine lines scrolling sideways
function waves(x0, x1, y0, rows, t, p = 1, o = {}) {
  let s = '';
  for (let r = 0; r < rows; r++) {
    const y = y0 + r * (o.gap ?? 26), amp = (o.amp ?? 5) * (1 - r * 0.08), k = 0.022 - r * 0.0015;
    const pts = [];
    const ph = t * (1.3 + r * 0.25) * (r % 2 ? -1 : 1) + r;
    for (let x = x0; x <= x1; x += 24) pts.push([x, y + Math.sin(x * k + ph) * amp]);
    s += P(smooth(pts), p, { w: r === 0 ? 2.6 : 1.8, stroke: r === 0 ? C.ink : C.ink2, op: 1 - r * 0.12 });
  }
  return s;
}

// smoke / steam puffs rising from (x,y)
function smoke(x, y, t, o = {}) {
  const n = o.n ?? 6, life = o.life ?? 4, rise = o.rise ?? 160, seed = o.seed ?? 1;
  let s = '';
  for (let i = 0; i < n; i++) {
    const ph = ((t / life) + i / n) % 1;
    const R = rng(seed * 100 + i)();
    const px = x + Math.sin(ph * 3 + i) * 12 + ph * (o.drift ?? 50) + (R - 0.5) * 10;
    const py = y - ph * rise;
    const r = (o.r0 ?? 10) + ph * (o.r1 ?? 34);
    const op = Math.sin(ph * Math.PI) * (o.op ?? 0.9);
    s += P(smooth([[px - r, py], [px - r * 0.7, py - r * 0.75], [px, py - r], [px + r * 0.75, py - r * 0.7], [px + r, py], [px + r * 0.6, py + r * 0.7], [px - r * 0.6, py + r * 0.7]], true), 1,
      { occ: !o.ghost, w: 2, stroke: o.stroke ?? C.ink2, op: op.toFixed(3) });
  }
  return s;
}

// dust kicked up behind vehicles
function dust(x, y, t, seed = 3, n = 5) {
  return smoke(x, y, t, { n, life: 1.6, rise: 40, r0: 6, r1: 26, drift: -90, seed, op: 0.7 });
}

// sparks: gold particles bursting from (x,y) at time phase ph∈[0,1]
function sparks(x, y, ph, seed = 1, n = 16, spread = 1, up = 1) {
  if (ph <= 0 || ph >= 1) return '';
  const R = rng(seed);
  let s = '';
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (R() - 0.5) * Math.PI * 1.4 * spread;
    const v = 120 + R() * 220;
    const px = x + Math.cos(a) * v * ph, py = y + Math.sin(a) * v * ph * up + 260 * ph * ph;
    const L = 10 * (1 - ph) + 3;
    s += P(line(px, py, px - Math.cos(a) * L, py - Math.sin(a) * L), 1, { w: 2.6, stroke: C.gold, op: (1 - ph).toFixed(3) });
  }
  return s;
}

// walking person (hard hat).  dir=1 walks right.  Walk cycle from phase.
function person(x, y, s, t, o = {}) {
  const ph = t * (o.speed ?? 6);
  const sw = Math.sin(ph) * 0.45, dir = o.dir ?? 1;
  const leg = (a) => line(0, -60, Math.sin(a) * 34, -2);
  const arm = (a) => line(0, -108, Math.sin(a) * 30, -70);
  const bob = Math.abs(Math.cos(ph)) * 3;
  let b = '';
  b += P(leg(sw), 1, { w: 4 }) + P(leg(-sw), 1, { w: 4 });
  b += P(`M-14 -118 Q -16 -86 -10 -58 L10 -58 Q 16 -86 14 -118 Z`, 1, { occ: true, w: 3 }); // torso
  b += P(arm(-sw), 1, { w: 3.6 });
  if (o.hammer != null) {
    const a = o.hammer; // hammer swing angle
    b += P(line(0, -108, 34 * Math.cos(a), -108 + 34 * Math.sin(a)), 1, { w: 3.6 });
    b += P(line(34 * Math.cos(a), -108 + 34 * Math.sin(a), 70 * Math.cos(a), -108 + 70 * Math.sin(a)), 1, { w: 4 });
    b += P(rect(70 * Math.cos(a) - 10, -108 + 70 * Math.sin(a) - 8, 20, 16), 1, { occ: true, w: 3 });
  } else b += P(arm(sw), 1, { w: 3.6 });
  b += P(circ(0, -134, 15), 1, { occ: true, w: 3 });
  if (o.hat !== false) b += P('M-18 -140 Q 0 -162 18 -140 Z M-22 -140 H22', 1, { occ: true, w: 3, stroke: C.ink });
  if (o.cart) {
    b += P(rect(26, -66, 70, 34), 1, { occ: true, w: 3 }) + P(circ(40, -24, 9), 1, { occ: true, w: 2.6 }) + P(circ(84, -24, 9), 1, { occ: true, w: 2.6 });
    b += F(smooth([[30, -66], [45, -84], [62, -78], [80, -88], [92, -66]], false) + 'Z', C.ink, 0.35);
    b += P(line(4, -84, 28, -60), 1, { w: 3 });
  }
  return g(b, `translate(${f1(x)} ${f1(y - bob)}) scale(${dir * s} ${s})`);
}

// ore train: locomotive at the right end, cars trailing left.  x = nose position
function train(x, y, cars, t, o = {}) {
  const s = o.s ?? 1;
  let b = '';
  const wheel = (cx, cy, r) => {
    const a = (x / r) % (Math.PI * 2);
    return P(circ(cx, cy, r), 1, { occ: true, w: 2.6 }) + P(line(cx + Math.cos(a) * r, cy + Math.sin(a) * r, cx - Math.cos(a) * r, cy - Math.sin(a) * r), 1, { w: 1.8 });
  };
  for (let i = cars - 1; i >= 0; i--) {
    const cx = -250 - i * 158;
    b += P(`M${cx} -78 L${cx + 148} -78 L${cx + 140} -22 L${cx + 8} -22 Z`, 1, { occ: true, w: 3 });
    b += F(smooth([[cx + 6, -78], [cx + 30, -100], [cx + 60, -94], [cx + 90, -108], [cx + 124, -96], [cx + 144, -78]]) + 'Z', C.ink, 0.30);
    b += P(smooth([[cx + 6, -78], [cx + 30, -100], [cx + 60, -94], [cx + 90, -108], [cx + 124, -96], [cx + 144, -78]]), 1, { w: 2 });
    b += P(line(cx + 74, -74, cx + 74, -26), 1, { w: 1.4, op: 0.6 });
    b += wheel(cx + 30, -12, 12) + wheel(cx + 118, -12, 12);
    b += P(line(cx + 148, -40, cx + 158, -40), 1, { w: 3 });
  }
  // locomotive
  b += P(`M-240 -112 L-40 -112 L-6 -80 L0 -22 L-240 -22 Z`, 1, { occ: true, w: 3.2 });
  b += P(rect(-210, -100, 58, 34), 1, { w: 2.4 }) + P(rect(-140, -100, 58, 34), 1, { w: 2.4 });
  b += P(line(-240, -60, 0, -60), 1, { w: 2, op: 0.7 });
  b += F(circ(-12, -70, 9), C.gold, 0.9) + F(circ(-12, -70, 22), C.gold, 0.18);
  b += wheel(-200, -12, 13) + wheel(-160, -12, 13) + wheel(-80, -12, 13) + wheel(-40, -12, 13);
  return g(b, `translate(${f1(x)} ${f1(y)}) scale(${s})`);
}

// rail track
function rail(x0, x1, y, p = 1) {
  let s = P(line(x0, y, x1, y), p, { w: 3 }) + P(line(x0, y + 8, x1, y + 8), p, { w: 2, op: 0.7 });
  for (let x = x0; x < x1; x += 40) s += P(line(x, y - 2, x + 14, y + 14), p, { w: 1.6, op: 0.6 });
  return s;
}

// flat-topped Pilbara mesa ridge; pts given as [x,y] top line
function ridge(pts, base, p = 1, o = {}) {
  const d = smooth(pts) + ` L${pts[pts.length - 1][0]} ${base} L${pts[0][0]} ${base} Z`;
  let s = F(d, C.paper, clamp(p * 4)) + P(smooth(pts), p, { w: o.w ?? 2.8, stroke: o.stroke ?? C.ink });
  // strata hatching
  if (o.strata) for (let k = 1; k <= o.strata; k++) {
    const q = pts.map(([x, y]) => [x, y + k * (o.sgap ?? 18)]);
    s += P(smooth(q.slice(1, -1)), p, { w: 1.4, op: 0.45, stroke: o.stroke ?? C.ink });
  }
  return s;
}

// spinifex tuft
function tuft(x, y, s, t, p = 1) {
  let d = '';
  for (let i = -3; i <= 3; i++) {
    const sway = Math.sin(t * 1.6 + x * 0.01 + i) * 3;
    d += `M${x + i * 6 * s} ${y} Q ${x + i * 10 * s + sway} ${y - 22 * s} ${x + i * 14 * s + sway * 1.6} ${y - 38 * s - Math.abs(i) * -2} `;
  }
  return P(d, p, { w: 2.2, stroke: C.ink });
}

// bulk ore carrier.  bob with waves.
function ship(x, y, s, t, o = {}) {
  const bob = Math.sin(t * 1.4 + x * 0.003) * 4, tilt = Math.sin(t * 1.1 + 1) * 0.8;
  let b = '';
  b += P('M-330 -40 L320 -40 L290 30 L-300 30 Z', 1, { occ: true, w: 3.4 }); // hull
  b += P(line(-310, 0, 304, 0), 1, { w: 2, op: 0.7 });
  for (let i = 0; i < 6; i++) b += P(rect(-230 + i * 72, -58, 56, 18), 1, { occ: true, w: 2.4 }); // hatches
  if (o.loaded) for (let i = 0; i < 6; i++) b += F(smooth([[-228 + i * 72, -58], [-214 + i * 72, -70], [-200 + i * 72, -66], [-176 + i * 72, -58]]) + 'Z', C.ink, 0.35);
  b += P('M210 -40 L210 -120 L290 -120 L290 -40 Z', 1, { occ: true, w: 3 }); // bridge
  b += P(rect(222, -108, 22, 14) + rect(254, -108, 22, 14), 1, { w: 2 });
  b += P('M250 -120 L250 -150 L276 -150 L276 -120', 1, { occ: true, w: 3 }); // funnel
  b += P(line(-300, -40, -300, -90) + line(-300, -90, -270, -80), 1, { w: 2 });
  if (o.lights) {
    b += F(circ(233, -101, 4), C.gold) + F(circ(265, -101, 4), C.gold) + F(circ(-300, -92, 4), C.gold);
    b += `<g filter="url(#glow)">${F(circ(233, -101, 7), C.gold, 0.8)}${F(circ(265, -101, 7), C.gold, 0.8)}${F(circ(-300, -92, 7), C.gold, 0.8)}</g>`;
  }
  let sm = o.smoke === false ? '' : smoke(263, -150, t, { n: 5, life: 3.5, rise: 120, r0: 8, r1: 26, drift: -70, seed: 7 });
  return g(sm + b, `translate(${f1(x)} ${f1(y + bob)}) rotate(${tilt.toFixed(2)}) scale(${s})`);
}

// small tug boat
function tug(x, y, s, t) {
  const bob = Math.sin(t * 2 + x * 0.01) * 3;
  const b = P('M-60 -10 L60 -10 L48 16 L-52 16 Z', 1, { occ: true, w: 3 }) + P(rect(-20, -38, 40, 28), 1, { occ: true, w: 2.6 }) + P(line(10, -38, 10, -54), 1, { w: 2.6 });
  return g(b, `translate(${f1(x)} ${f1(y + bob)}) scale(${s})`);
}

// seabird (simple "v" with flapping)
function bird(x, y, s, t, seed = 0) {
  const f = Math.sin(t * 9 + seed) * 10;
  return P(`M${x - 18 * s} ${y - f * s * 0.5} Q ${x - 8 * s} ${y - 10 * s} ${x} ${y} Q ${x + 8 * s} ${y - 10 * s} ${x + 18 * s} ${y - f * s * 0.5}`, 1, { w: 2.2 });
}

// haul truck
function haulTruck(x, y, s, t, dir = 1) {
  let b = '';
  b += P('M-120 -70 L60 -70 L80 -110 L-130 -110 Z', 1, { occ: true, w: 3 }); // tray
  b += F(smooth([[-124, -110], [-90, -132], [-50, -124], [-10, -138], [40, -126], [76, -110]]) + 'Z', C.ink, 0.32);
  b += P('M60 -70 L120 -70 L120 -120 L84 -120 L60 -100 Z', 1, { occ: true, w: 3 }); // cab
  b += P(rect(90, -112, 22, 18), 1, { w: 2 });
  b += P(line(-130, -70, 120, -70) + line(-120, -46, 120, -46), 1, { w: 2.4 });
  for (const wx of [-80, 80]) {
    const a = x / 34;
    b += P(circ(wx, -24, 30), 1, { occ: true, w: 3.4 }) + P(circ(wx, -24, 12), 1, { w: 2 }) + P(line(wx + Math.cos(a) * 12, -24 + Math.sin(a) * 12, wx + Math.cos(a) * 28, -24 + Math.sin(a) * 28), 1, { w: 2 });
  }
  return g(b, `translate(${f1(x)} ${f1(y)}) scale(${dir * s} ${s})`);
}

// excavator with swinging arm (a in radians)
function excavator(x, y, s, t) {
  const a = Math.sin(t * 1.3) * 0.35;
  let b = '';
  b += P(rect(-90, -40, 180, 40), 1, { occ: true, w: 3 }) + P(line(-80, -20, 80, -20), 1, { w: 1.6, op: 0.6 });
  b += P('M-70 -40 L70 -40 L70 -110 L-20 -110 L-70 -80 Z', 1, { occ: true, w: 3 });
  b += P(rect(20, -102, 40, 30), 1, { w: 2 });
  const bx = -70, by = -90;
  const ex = bx - 130 * Math.cos(0.5 + a), ey = by - 130 * Math.sin(0.5 + a);
  const fx = ex - 90 * Math.cos(-1.1 + a * 2), fy = ey - 90 * Math.sin(-1.1 + a * 2);
  b += P(line(bx, by, ex, ey), 1, { w: 7 }) + P(line(ex, ey, fx, fy), 1, { w: 6 });
  b += P(`M${fx - 22} ${fy - 10} L${fx + 18} ${fy - 12} L${fx + 8} ${fy + 22} L${fx - 18} ${fy + 18} Z`, 1, { occ: true, w: 3 });
  return g(b, `translate(${f1(x)} ${f1(y)}) scale(${s})`);
}

// blast furnace with stack, stove and smoke
function blastFurnace(x, y, s, t, p = 1) {
  let b = '';
  b += smoke(60, -380, t, { n: 7, life: 5, rise: 230, r0: 14, r1: 46, drift: 60, seed: 11 });
  b += P('M-70 0 L-90 -120 L-60 -260 L-40 -340 L40 -340 L60 -260 L90 -120 L70 0 Z', p, { occ: true, w: 3.4 });
  for (let k = 1; k < 6; k++) b += P(line(-85 + k * 2, -k * 55, 85 - k * 2, -k * 55), p, { w: 1.6, op: 0.55 });
  b += P(rect(110, -300, 60, 300), p, { occ: true, w: 3 }) + P(rect(185, -260, 50, 260), p, { occ: true, w: 3 });
  b += P('M-40 -340 L-20 -380 L20 -380 L40 -340', p, { occ: true, w: 3 });
  b += P(rect(40, -380, 40, 20), p, { w: 2 });
  b += F(ell(0, -40, 26, 16), C.gold, 0.85) + `<g filter="url(#glow)">${F(ell(0, -40, 30, 20), C.gold, 0.6)}</g>`;
  return g(b, `translate(${f1(x)} ${f1(y)}) scale(${s})`);
}

// bloomery furnace (ancient) with fire and smoke
function bloomery(x, y, s, t, p = 1) {
  let b = smoke(0, -190, t, { n: 6, life: 4, rise: 200, r0: 10, r1: 40, drift: 40, seed: 5 });
  b += P('M-80 0 Q -70 -120 -24 -190 L24 -190 Q 70 -120 80 0 Z', p, { occ: true, w: 3.4 });
  for (let i = 0; i < 6; i++) b += P(`M${-70 + i * 26} ${-20 - (i % 2) * 40} q 10 -6 20 0`, p, { w: 1.6, op: 0.5 });
  const fl = Math.sin(t * 12) * 4;
  b += P(`M-26 0 Q -28 -40 0 -52 Q 28 -40 26 0 Z`, p, { occ: true, w: 2.6 });
  b += F(`M-16 0 Q -14 ${-26 - fl} 0 ${-40 - fl} Q 12 ${-24 + fl} 16 0 Z`, C.gold, 0.9);
  return g(b, `translate(${f1(x)} ${f1(y)}) scale(${s})`);
}

function anvil(x, y, s) {
  return g(P('M-70 -60 L70 -60 L60 -40 L20 -34 L30 0 L-30 0 L-20 -34 L-70 -46 L-100 -58 Z', 1, { occ: true, w: 3.2 }), `translate(${f1(x)} ${f1(y)}) scale(${s})`);
}

// Bessemer converter: egg shaped vessel tilted by ang (deg)
function converter(x, y, s, ang, t, p = 1) {
  let b = '';
  b += P(rect(-150, -40, 20, 200) + rect(130, -40, 20, 200), p, { occ: true, w: 3 }); // stands
  const vessel = P('M-90 60 Q -110 -40 -60 -120 L-36 -170 L36 -170 L60 -120 Q 110 -40 90 60 Q 0 110 -90 60 Z', p, { occ: true, w: 3.4 })
    + P(line(-100, 0, 100, 0) + line(-96, 40, 96, 40), p, { w: 1.6, op: 0.6 })
    + F(ell(0, -170, 34, 8), C.gold, 0.9);
  b += g(vessel, `rotate(${ang.toFixed(2)})`);
  b += P(circ(-140, -30, 16) + circ(140, -30, 16), p, { occ: true, w: 3 });
  return g(b, `translate(${f1(x)} ${f1(y)}) scale(${s})`);
}

function chimney(x, y, h, t, seed) {
  return smoke(x, y - h, t, { n: 6, life: 4.5, rise: 200, r0: 10, r1: 36, drift: 50, seed }) + P(rect(x - 16, y - h, 32, h), 1, { occ: true, w: 3 }) + P(line(x - 20, y - h, x + 20, y - h), 1, { w: 3.4 });
}

// propeller plane flying to the right
function plane(x, y, s, t) {
  let b = '';
  b += P('M-120 0 Q -60 -22 60 -18 Q 110 -14 120 0 Q 110 14 60 16 Q -60 18 -120 0 Z', 1, { occ: true, w: 3 });
  b += P('M-10 -4 L-40 -70 L-14 -70 L30 -4 Z', 1, { occ: true, w: 2.6 }); // top wing
  b += P('M-104 -4 L-130 -40 L-116 -40 L-90 -6 Z', 1, { occ: true, w: 2.4 }); // tail
  b += P(rect(40, -14, 22, 10), 1, { w: 2 });
  const sp = Math.cos(t * 50) * 34;
  b += P(line(124, -sp, 124, sp), 1, { w: 2.6 }) + P(circ(122, 0, 5), 1, { occ: true, w: 2 });
  return g(b, `translate(${f1(x)} ${f1(y)}) rotate(${(Math.sin(t * 1.5) * 2).toFixed(2)}) scale(${s})`);
}

// wind turbine
function turbine(x, y, h, t, p = 1, speed = 1.4) {
  let b = P(`M${x - 8} ${y} L${x - 3} ${y - h} L${x + 3} ${y - h} L${x + 8} ${y} Z`, p, { occ: true, w: 2.6 });
  for (let i = 0; i < 3; i++) {
    const a = t * speed + i * Math.PI * 2 / 3;
    const ex = x + Math.cos(a) * h * 0.45, ey = y - h + Math.sin(a) * h * 0.45;
    const nx = -Math.sin(a) * 9, ny = Math.cos(a) * 9;
    b += P(`M${f1(x)} ${f1(y - h)} L${f1((x + ex) / 2 + nx)} ${f1((y - h + ey) / 2 + ny)} L${f1(ex)} ${f1(ey)} Z`, p, { occ: true, w: 2.4 });
  }
  b += P(circ(x, y - h, 8), p, { occ: true, w: 2.6 });
  return b;
}

// tropical cyclone symbol: rotating spiral arms (southern hemisphere: clockwise)
function cyclone(x, y, R, t, o = {}) {
  const rot = -t * (o.spin ?? 1.6);
  let b = '';
  const arms = 4;
  for (let a = 0; a < arms; a++) {
    const pts = [];
    for (let k = 0; k <= 26; k++) {
      const u = k / 26;
      const ang = rot + a * Math.PI * 2 / arms - u * 3.4;
      const r = R * (0.12 + u * 0.95);
      pts.push([x + Math.cos(ang) * r, y + Math.sin(ang) * r * 0.92]);
    }
    b += P(smooth(pts), o.p ?? 1, { w: 3 - a * 0.25, stroke: o.stroke ?? C.ink, op: o.op ?? 1 });
  }
  b += P(circ(x, y, R * 0.1), o.p ?? 1, { w: 2.6, stroke: o.stroke ?? C.ink, op: o.op ?? 1 });
  return b;
}

// diagonal rain over a box
function rain(t, x0, y0, w, h, n, o = {}) {
  const R = rng(o.seed ?? 99);
  let d = '';
  for (let i = 0; i < n; i++) {
    const sx = R() * w, sp = 900 + R() * 500, off = R() * h;
    const yy = (off + t * sp) % h;
    const xx = (sx - yy * 0.25 + w) % w;
    const L = 22 + R() * 18;
    d += `M${f1(x0 + xx)} ${f1(y0 + yy)} l${f1(-L * 0.25)} ${f1(L)} `;
  }
  return P(d, 1, { w: o.w ?? 1.6, stroke: o.stroke ?? C.ink2, op: o.op ?? 0.55 });
}

// glowing light (night scenes)
function lamp(x, y, r, t, seed = 0, k = 1) {
  const fl = (0.85 + 0.15 * Math.sin(t * 5 + seed * 2.3)) * k;
  return `<g filter="url(#glow)">${F(circ(x, y, r * 2.4), C.gold, (0.35 * fl).toFixed(3))}</g>` + F(circ(x, y, r), C.gold, (0.95 * fl).toFixed(3));
}

// card (paper panel) used for charts / notes
function card(x, y, w, h, p = 1, o = {}) {
  return P(rect(x, y, w, h), p, { occ: true, w: o.w ?? 3, fill: o.fill }) + (o.double ? P(rect(x + 10, y + 10, w - 20, h - 20), p, { w: 1.4, op: 0.6 }) : '');
}

// ───────── geography (approximate outlines, hand-traced from lon/lat) ─────────
const AUS = [[113.6, -22.0], [114.2, -26.0], [115.0, -29.5], [115.7, -32.0], [115.0, -34.3], [118, -35], [121.9, -33.9], [124, -33], [126, -32.3], [129, -31.6], [131.2, -31.5], [134, -32.5], [135.6, -34.8], [137.5, -33.5], [138, -35.6], [139.5, -36.5], [140.9, -38.0], [143.5, -38.8], [144.9, -37.9], [146.4, -39.1], [148, -37.8], [150, -37.5], [150.2, -35.7], [151.2, -33.9], [152.5, -32.4], [153.6, -28.6], [153.1, -27.0], [152.7, -25.3], [150.8, -23.2], [149.0, -21.0], [146.3, -19.0], [145.4, -16.0], [145.3, -14.8], [143.5, -14.0], [142.5, -10.7], [141.6, -13.0], [141.5, -15.5], [140.8, -17.5], [139.3, -17.4], [137.0, -15.9], [135.4, -14.8], [136.0, -13.0], [136.8, -12.2], [135.0, -12.1], [132.6, -11.5], [131.0, -12.2], [130.0, -13.0], [129.4, -14.9], [127.7, -14.1], [126.0, -14.0], [125.0, -15.0], [123.6, -16.4], [122.2, -17.9], [121.0, -19.5], [118.6, -20.3], [116.7, -20.6], [114.6, -21.8]];
const TAS = [[144.6, -40.7], [148.3, -40.9], [148.3, -42.2], [147.0, -43.6], [145.2, -42.2]];
// Pilbara coast detail Broome → Exmouth → Carnarvon
const PILB = [[123.0, -16.6], [122.6, -17.3], [122.2, -17.9], [121.8, -18.6], [121.2, -19.3], [120.4, -19.8], [119.6, -20.0], [118.6, -20.3], [118.0, -20.4], [117.2, -20.6], [116.7, -20.6], [116.2, -20.9], [115.5, -21.3], [114.9, -21.6], [114.4, -21.8], [114.1, -21.9], [113.8, -22.4], [113.7, -23.0], [113.6, -24.0], [113.5, -24.6]];
function proj(lon, lat, o) { return [o.x + (lon - o.lon0) * o.k, o.y + (o.lat0 - lat) * o.k]; }

// terrain: paper-filled body, only the top contour is inked (no seams on the sides)
function terrain(top, base, p = 1, o = {}) {
  const d = (o.raw ? pts2d(top) : smooth(top));
  const body = d + ` L${f1(top[top.length - 1][0])} ${base} L${f1(top[0][0])} ${base} Z`;
  return F(body, C.paper, clamp(p * 4)) + P(d, p, { w: o.w ?? 3, stroke: o.stroke ?? C.ink });
}

// blacksmith striking an anvil: geometry solved so the hammer head lands on the anvil face
function smith(xa, yg, s, t, beat = 0.9, seed = 0) {
  const ph = (t % beat) / beat;
  const a = ph < 0.25 ? lerp(-1.7, 0.756, ease(ph / 0.25)) : lerp(0.756, -1.7, ease((ph - 0.25) / 0.75));
  let b = anvil(xa, yg, s) + person(xa + 71 * s, yg, s, 0, { hammer: a, dir: -1, hat: false });
  const sp = (((t - 0.25 * beat) % beat) + beat) % beat / beat;
  b += sparks(xa + 20 * s, yg - 62 * s, sp * 1.4, Math.floor((t - 0.25 * beat) / beat) + 50 + seed, 16);
  return b;
}

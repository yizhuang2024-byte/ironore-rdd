// ───────── scenes.  Each returns the SVG for absolute time t; lt = local time, D = duration ─────────
// L(id) → local start time of narration line id (so animation beats land on the spoken words)
function mkL(sc) { return id => LINE[id].start - sc.start; }
function mkLe(sc) { return id => LINE[id].end - sc.start; }
// camera pan between panels: returns x offset given breakpoints [[time, x], ...]
function panX(lt, keys, dur = 1.1) {
  let x = keys[0][1];
  for (let i = 1; i < keys.length; i++) x = lerp(x, keys[i][1], es(lt, keys[i][0] - dur / 2, keys[i][0] + dur / 2));
  return x;
}
const BG = () => P(rect(-4000, -2000, 12000, 6000), 1, { fill: C.bg, occ: true, w: 0 }) ;

// ═════ 1. OPEN — Pilbara landscape, ore train crossing, inset map ═════
function sceneOpen(t, lt, D, sc) {
  C = DAY;
  let s = '';
  s += sun(1560, 200, 62, lt, es(lt, 0.1, 1.2));
  s += clouds(lt, [[100, 150, 1.1, 18], [700, 110, 0.8, 12], [1200, 250, 0.9, 22], [1700, 130, 1.2, 15]], es(lt, 0.2, 1.4));
  s += ridge([[-100, 520], [80, 520], [140, 470], [420, 466], [470, 510], [700, 505], [760, 455], [1080, 450], [1120, 500], [1340, 500]], 680, es(lt, 0.2, 1.8), { stroke: C.ink2, w: 2.4, strata: 2, sgap: 16 });
  s += ridge([[-100, 600], [200, 600], [260, 545], [560, 538], [620, 590], [900, 585], [960, 560], [1180, 556], [1250, 610], [1360, 640]], 760, es(lt, 0.4, 2.0), { strata: 3, sgap: 18 });
  // Indian Ocean on the right
  s += terrain([[1300, 780], [1360, 700], [1420, 660], [1520, 640], [2100, 630]], 800, es(lt, 0.5, 1.8));
  s += waves(1420, 2060, 668, 5, lt, es(lt, 0.8, 2.0), { gap: 24, amp: 4 });
  s += T(1700, 560, '印度洋 Indian Ocean', { size: 30, anchor: 'middle', p: es(lt, 1.5, 2.6), fill: C.ink2 });
  // ground, rail and the ore train
  s += P(rect(-200, 760, 2400, 400), 1, { occ: true, w: 0 }) + P(line(-200, 760, 2200, 760), es(lt, 0.3, 1.5), { w: 2.6 });
  s += rail(-200, 2200, 842, es(lt, 0.5, 1.6));
  const tx = -300 + lt * 210;
  s += dust(tx - 260, 820, lt, 3) + dust(tx - 900, 830, lt + 0.7, 4) + dust(tx - 1500, 830, lt + 0.3, 5);
  s += train(tx, 838, 12, lt);
  // foreground tufts occlude the track
  for (const [x, k] of [[120, 1.2], [380, 0.9], [760, 1.3], [1100, 1.0], [1480, 1.25], [1800, 0.95]]) s += tuft(x, 960, k, lt, es(lt, 0.6, 1.6));
  s += person(drift(200, 38, lt, 2400), 1010, 0.62, lt, { speed: 5 });
  s += P(line(-200, 960, 2200, 960), es(lt, 0.5, 1.6), { w: 1.6, op: 0.5 });
  // inset map
  const mp = es(lt, 0.6, 2.4);
  let m = card(70, 70, 440, 340, mp, { double: true });
  const o = { x: 105, y: 100, lon0: 112, lat0: -10, k: 8.6 };
  m += P(smooth(AUS.map(([a, b]) => proj(a, b, o)), true), es(lt, 1.0, 3.2), { w: 2.4, occ: true, fill: C.paper });
  m += P(smooth(TAS.map(([a, b]) => proj(a, b, o)), true), es(lt, 2.6, 3.2), { w: 2 });
  const [px, py] = proj(118.5, -22.2, o);
  const pulse = 0.5 + 0.5 * Math.sin(lt * 4);
  if (lt > 2.6) m += P(circ(px, py, 10 + pulse * 10), 1, { w: 2.4, stroke: C.gold, op: (1 - pulse * 0.6).toFixed(2) }) + F(circ(px, py, 7), C.gold);
  m += T(px + 22, py - 18, '皮爾巴拉', { size: 30, p: es(lt, 2.8, 3.6), weight: 700 });
  m += T(px + 22, py + 16, 'Pilbara, WA', { size: 22, p: es(lt, 3.0, 3.8), italic: true });
  s += m;
  return g(s, cam(1 + 0.06 * es(lt, 0, D), -30 * lt / D, 0));
}

// ═════ 2. TITLE CARD — anvil struck in rhythm, sparks fly ═════
function sceneTitle(t, lt, D, sc) {
  C = DAY;
  let s = '';
  s += clouds(lt, [[0, 120, 0.8, 20], [900, 90, 0.7, 14], [1500, 160, 0.9, 24]], es(lt, 0, 0.8));
  s += P(rect(300, 250, 1320, 500), es(lt, 0.0, 1.2), { w: 3 }) + P(rect(318, 268, 1284, 464), es(lt, 0.3, 1.5), { w: 1.4, op: 0.7 });
  for (const [cx, cy] of [[300, 250], [1620, 250], [300, 750], [1620, 750]]) s += P(circ(cx, cy, 12), es(lt, 1.0, 1.6), { w: 2.4, stroke: C.gold, occ: true });
  const [tz, sz, te, se] = TL.title;
  s += T(960, 450, tz, { size: 112, anchor: 'middle', weight: 700, p: es(lt, 0.5, 2.0) });
  s += P(smooth([[560, 485], [800, 495], [1100, 488], [1360, 492]]), es(lt, 1.6, 2.4), { w: 3, stroke: C.gold });
  s += T(960, 560, sz, { size: 46, anchor: 'middle', p: es(lt, 1.6, 2.8) });
  s += T(960, 630, te, { size: 40, anchor: 'middle', italic: true, p: es(lt, 2.0, 3.2) });
  s += T(960, 680, se, { size: 28, anchor: 'middle', italic: true, p: es(lt, 2.4, 3.6), fill: C.ink2 });
  // anvil & hammer
  s += P(line(-100, 1000, 2100, 1000), 1, { w: 2.4 });
  s += smoke(820, 960, lt, { n: 4, life: 3, rise: 90, r0: 6, r1: 20, seed: 21, op: 0.6 });
  s += smith(930, 1000, 1.25, lt, 0.95, 3);
  return g(s, cam(1.0 + 0.03 * es(lt, 0, D)));
}

// ═════ 3. HISTORY — meteor → beads; bloomery & smith; Bessemer converter pours ═════
function sceneHistory(t, lt, D, sc) {
  C = DAY;
  const L = mkL(sc);
  const xB = L(4), xC = L(5);
  const camX = panX(lt, [[0, 0], [xB - 0.2, -1920], [xC - 0.2, -3840]]);
  let s = '';
  // timeline ribbon across the three panels
  s += P(line(-200, 150, 6000, 150), es(lt, 0, 1.2), { w: 2.4 });
  const ticks = [[960, '約 3200 BC', '隕鐵珠 Meteoritic iron beads · Gerzeh, Egypt'], [2880, '約 1200 BC', '冶鐵擴散 · 鐵器時代 Iron Age'], [4800, '1856', '貝塞麥轉爐 Bessemer process']];
  ticks.forEach(([x, a, b], i) => {
    const st = [0.2, xB - 0.6, xC - 0.6][i];
    s += P(circ(x, 150, 14), es(lt, st, st + 0.5), { occ: true, w: 3, stroke: C.gold });
    s += T(x, 112, a, { size: 46, anchor: 'middle', weight: 700, p: es(lt, st + 0.2, st + 1.0) });
    s += T(x, 214, b, { size: 32, anchor: 'middle', p: es(lt, st + 0.5, st + 1.6), fill: C.ink2 });
  });
  // Panel A — desert, meteor, beads
  s += clouds(lt, [[200, 300, 0.7, 10], [1300, 280, 0.8, 14], [2600, 300, 0.7, 12], [4300, 290, 0.8, 16]]);
  s += terrain([[-200, 820], [200, 790], [600, 815], [1000, 780], [1500, 810], [1960, 860]], 1200, es(lt, 0.1, 1.2));
  s += P('M1300 800 L1420 660 L1540 800 Z M1500 800 L1580 710 L1660 800 Z', es(lt, 0.3, 1.4), { occ: true, w: 2.6, stroke: C.ink2 });
  const mk = seg(lt, 0.5, 1.5);
  if (mk > 0 && mk < 1) {
    const mx = lerp(-100, 700, mk), my = lerp(260, 640, mk);
    s += P(line(mx - 220 * (1 - mk * 0.5), my - 105 * (1 - mk * 0.5), mx, my), 1, { w: 4, stroke: C.gold });
    s += F(circ(mx, my, 10), C.gold) + `<g filter="url(#glow)">${F(circ(mx, my, 18), C.gold, 0.6)}</g>`;
  }
  if (lt > 1.5) s += sparks(700, 650, (lt - 1.5) / 1.1, 31, 14);
  // beads necklace (nine beads)
  const neck = []; for (let i = 0; i <= 20; i++) { const u = i / 20; neck.push([420 + u * 560, 470 + Math.sin(u * Math.PI) * 150]); }
  s += P(smooth(neck), es(lt, 1.8, 3.0), { w: 2 });
  for (let i = 0; i < 9; i++) {
    const u = 0.1 + i * 0.1, bx = 420 + u * 560, by = 470 + Math.sin(u * Math.PI) * 150;
    const bp = es(lt, 2.2 + i * 0.14, 2.6 + i * 0.14);
    if (bp > 0) s += P(ell(bx, by, 16 * bp, 22 * bp), 1, { occ: true, fill: C.gold, w: 2.6, fo: 0.85 });
  }
  s += person(drift(1200, -30, lt, 2200) % 1800, 900, 0.7, lt, { dir: -1, hat: false, speed: 5 });
  // Panel B — bloomery + smith
  s += P(line(1920, 860, 3840, 860), 1, { w: 2.6 });
  s += bloomery(2500, 860, 1.4, lt);
  s += smith(3060, 860, 1.2, lt, 0.9, 40);
  s += T(2640, 760, '塊煉鐵爐 Bloomery', { size: 30, p: es(lt, xB, xB + 1), fill: C.ink2 });
  // Panel C — Bessemer converter pouring, chimneys
  s += P(line(3840, 900, 5760, 900), 1, { w: 2.6 });
  s += chimney(5250, 900, 420, lt, 61) + chimney(5420, 900, 360, lt + 1.3, 62) + chimney(5580, 900, 300, lt + 0.6, 63);
  s += P('M5150 900 L5150 640 L5700 560 L5700 900', 1, { occ: true, w: 3 });
  const tilt = -62 * es(lt, xC + 0.8, xC + 2.2);
  if (tilt < -40) {
    const k = seg(tilt, -40, -62);
    s += P(`M4330 600 Q 4280 ${700} 4300 ${740 + 30 * k}`, 1, { w: 10, stroke: C.gold });
    s += sparks(4300, 760, (lt * 1.7) % 1, Math.floor(lt * 1.7) + 70, 20, 1.4);
    s += sparks(4300, 760, (lt * 1.7 + 0.5) % 1, Math.floor(lt * 1.7 + 0.5) + 90, 20, 1.4);
  }
  s += P('M4220 900 L4240 760 L4380 760 L4400 900 Z', 1, { occ: true, w: 3 }); // ladle
  s += F('M4246 772 L4374 772 L4376 790 L4244 790 Z', C.gold, 0.8 * clamp(-tilt / 62));
  s += converter(4480, 640, 1.15, tilt, lt);
  s += person(drift(4000, 40, lt, 900) + 3700, 990, 0.7, lt);
  s += P(line(3840, 990, 5760, 990), 1, { w: 1.6, op: 0.5 });
  return g(s, cam(1.03 + 0.02 * Math.sin(lt * 0.3), camX, 0));
}

// ═════ 4. DISCOVERY — 1952 flight over the Hamersley; 1960 export ban partly lifted ═════
function sceneDiscovery(t, lt, D, sc) {
  C = DAY;
  const L = mkL(sc);
  const x2 = L(7);
  const camX = panX(lt, [[0, 0], [x2 - 0.3, -1920]], 1.3);
  let s = '';
  s += clouds(lt, [[0, 180, 1.0, 26], [600, 300, 0.7, 18], [1300, 140, 1.1, 30], [1900, 260, 0.8, 20], [2700, 170, 1.0, 16], [3300, 240, 0.8, 22]]);
  s += ridge([[-200, 640], [100, 640], [160, 560], [520, 552], [580, 620], [800, 615], [860, 520], [1240, 512], [1300, 600], [1500, 600], [1560, 560], [1860, 556], [1950, 640], [2100, 650]], 900, es(lt, 0, 1.4), { strata: 4, sgap: 20 });
  // outcrop highlight when the plane passes
  const px = -250 + lt * 260;
  const hl = es(lt, 2.4, 3.2);
  if (hl > 0) {
    const pu = 0.5 + 0.5 * Math.sin(lt * 5);
    s += P(ell(1050, 520, 120 + pu * 14, 34 + pu * 6), hl, { w: 3, stroke: C.gold });
    s += T(1050, 455, '鐵礦露頭 ore outcrop', { size: 32, anchor: 'middle', p: es(lt, 2.8, 3.8), weight: 700 });
    s += T(1050, 760, '1952 · 哈默斯利山脈 Hamersley Range', { size: 34, anchor: 'middle', p: es(lt, 3.2, 4.4), halo: C.paper });
  }
  s += P(line(-200, 900, 4000, 900), 1, { w: 2.6 });
  s += plane(px, 300 + Math.sin(lt * 0.8) * 18, 1.0, lt);
  for (const [x, k] of [[150, 1.2], [520, 0.9], [980, 1.2], [1400, 1.0], [1750, 1.1]]) s += tuft(x, 960, k, lt);
  s += person(drift(300, 36, lt, 1800), 1010, 0.6, lt);
  // Panel 2: coast, export document stamped, ship departs
  s += terrain([[1900, 900], [2300, 880], [2600, 900]], 1200, 1);
  s += P(rect(2600, 820, 1500, 400), 1, { occ: true, w: 0 }) + waves(2600, 4000, 840, 6, lt, 1, { gap: 26 });
  s += P('M2560 900 L2560 820 L2700 820 L2700 900', 1, { w: 3 });
  const sx = 3100 + Math.max(0, lt - x2 - 1.0) * 90;
  s += ship(sx, 820, 0.8, lt, { loaded: true });
  const dp = es(lt, x2 - 0.4, x2 + 0.8);
  s += card(2140, 300, 760, 420, dp, { double: true });
  s += T(2520, 390, '鐵礦石出口禁令', { size: 52, anchor: 'middle', weight: 700, p: es(lt, x2, x2 + 1) });
  s += T(2520, 445, 'Iron ore export embargo', { size: 32, anchor: 'middle', italic: true, p: es(lt, x2 + 0.3, x2 + 1.2) });
  s += T(2520, 530, '1938 →', { size: 60, anchor: 'middle', p: es(lt, x2 + 0.5, x2 + 1.3) });
  const st = seg(lt, x2 + 1.6, x2 + 2.0);
  if (st > 0) {
    const sc2 = 1 + (1 - st) * 0.8;
    s += g(P(rect(-210, -62, 420, 124), 1, { w: 5, stroke: C.gold }) + T(0, -6, '1960 部分解除', { size: 50, anchor: 'middle', fill: C.gold, weight: 700 }) + T(0, 42, 'PARTLY LIFTED', { size: 30, anchor: 'middle', fill: C.gold, weight: 700 }),
      `translate(2520 630) rotate(-6) scale(${sc2.toFixed(3)})`, `opacity="${st.toFixed(2)}"`);
  }
  s += T(2520, 790, '資料：澳洲國家博物館 National Museum of Australia', { size: 24, anchor: 'middle', p: es(lt, x2 + 1.2, x2 + 2.2), fill: C.ink2 });
  return g(s, cam(1.02 + 0.04 * es(lt, 0, D), camX, 0));
}

// ═════ 5. PRODUCTION — open pit + USGS bars; Port Hedland loading; voyage to China's furnaces ═════
function sceneProduction(t, lt, D, sc) {
  C = DAY;
  const L = mkL(sc);
  const camX = panX(lt, [[0, 0], [L(10) - 0.3, -1920], [L(11) - 0.3, -3840]], 1.3);
  let s = '';
  s += clouds(lt, [[0, 120, 0.9, 20], [800, 90, 0.7, 14], [1600, 140, 1.0, 22], [2500, 100, 0.8, 18], [3300, 130, 0.9, 16], [4200, 90, 0.8, 20], [5000, 140, 1.0, 14]]);
  // Panel A — open pit
  const pit = [];
  for (let k = 0; k < 5; k++) {
    const w = 820 - k * 140, y = 520 + k * 70;
    pit.push(P(smooth([[100 + (820 - w) / 2, y], [510 - w / 2 + 300, y + 12], [100 + (820 - w) / 2 + w, y]]), es(lt, 0.1 + k * 0.15, 1 + k * 0.15), { w: 2.4 }));
  }
  s += P(line(-200, 520, 1960, 520), es(lt, 0, 0.8), { w: 2.6 }) + pit.join('');
  s += P(line(-200, 940, 1960, 940), 1, { w: 1.6, op: 0.5 });
  const tp = (lt * 0.09) % 1, tri = tp < 0.5 ? tp * 2 : 2 - tp * 2;
  s += dust(lerp(150, 760, tri) + 60, 600 + tri * 220, lt, 8, 4);
  s += haulTruck(lerp(150, 760, tri), 600 + tri * 220, 0.55, lt, tp < 0.5 ? 1 : -1);
  s += excavator(380, 900, 0.7, lt);
  s += haulTruck(150, 905, 0.5, 0, 1);
  // USGS bars
  const bp = es(lt, 0.2, 1.2);
  s += card(1000, 230, 860, 670, bp, { double: true });
  s += T(1430, 310, '2025 鐵礦石產量（可用礦石，估計）', { size: 36, anchor: 'middle', weight: 700, p: es(lt, 0.6, 1.6) });
  s += T(1430, 352, 'Usable iron ore mine production, 2025e · USGS MCS 2026', { size: 22, anchor: 'middle', italic: true, p: es(lt, 0.8, 1.8), fill: C.ink2 });
  const bars = [['澳洲 Australia', 980], ['巴西 Brazil', 420], ['印度 India', 310], ['中國 China', 290]];
  bars.forEach(([n, v], i) => {
    const y = 400 + i * 92, gp = es(lt, L(8) + 0.3 + i * 0.35, L(8) + 1.6 + i * 0.35);
    s += T(1040, y + 42, n, { size: 30, p: es(lt, L(8) + i * 0.3, L(8) + 0.8 + i * 0.3) });
    const w = 470 * v / 980 * gp;
    if (gp > 0) s += P(rect(1250, y + 10, Math.max(w, 2), 46), 1, { occ: true, w: 2.6, fill: i === 0 ? C.gold : C.paper, fo: i === 0 ? 0.85 : 1 });
    for (let h = 1260; h < 1250 + w - 6; h += 16) s += P(line(h, y + 54, h + 14, y + 12), 1, { w: 1.2, op: 0.4 });
    s += T(1260 + w + 10, y + 46, gp > 0.98 ? `${v} Mt` : '', { size: 28, weight: 700 });
  });
  const sp = es(lt, L(9), L(9) + 1.6);
  if (sp > 0) {
    const A = 0.377 * sp * 2 * Math.PI;
    s += P(circ(1740, 815, 44), 1, { w: 2, op: 0.5 });
    s += P(`M1740 771 A 44 44 0 ${A > Math.PI ? 1 : 0} 1 ${f1(1740 + 44 * Math.sin(A))} ${f1(815 - 44 * Math.cos(A))}`, 1, { w: 10, stroke: C.gold });
    s += T(1670, 826, '≈38% / 全球 2,600 Mt', { size: 30, anchor: 'end', weight: 700, p: es(lt, L(9) + 0.5, L(9) + 1.5) });
  }
  // Panel B — Port Hedland
  const ox = 1920;
  s += P(rect(ox + 20, 700, 2200, 400), 1, { occ: true, w: 0 }) + waves(ox + 900, ox + 2000, 720, 8, lt, 1, { gap: 26 });
  s += P(`M${ox} 700 L${ox + 900} 700 L${ox + 900} 1100`, 1, { w: 3 });
  for (let k = 0; k < 3; k++) s += P(`M${ox + 40 + k * 260} 700 L${ox + 150 + k * 260} 560 L${ox + 260 + k * 260} 700 Z`, 1, { occ: true, w: 2.8 }) + F(`M${ox + 60 + k * 260} 700 L${ox + 150 + k * 260} 580 L${ox + 240 + k * 260} 700 Z`, C.ink, 0.12);
  s += P(`M${ox + 100} 520 L${ox + 1050} 440`, 1, { w: 4 }) + P(`M${ox + 100} 540 L${ox + 1050} 460`, 1, { w: 2 });
  for (let k = 0; k < 18; k++) { const u = ((k / 18) + lt * 0.15) % 1; s += F(ell(ox + 100 + u * 950, 528 - u * 80, 10, 5), C.ink, 0.7); }
  for (let x = ox + 200; x < ox + 1000; x += 160) s += P(line(x, 520 - (x - ox - 100) * 0.084, x, 700), 1, { w: 2.4 });
  s += P(`M${ox + 1050} 440 L${ox + 1350} 470 L${ox + 1350} 490`, 1, { w: 4 });
  s += P(rect(ox + 1000, 430, 60, 270), 1, { occ: true, w: 3 });
  s += ship(ox + 1380, 760, 1.0, lt, { loaded: true });
  const fall = (lt * 3) % 1;
  s += P(`M${ox + 1350} 490 L${ox + 1350} 690`, 1, { w: 6, stroke: C.ink, op: 0.55, dash: '10 8', extra: `stroke-dashoffset="${f1(-fall * 36)}"` });
  s += tug(ox + 1750 + Math.sin(lt * 0.4) * 90, 830, 0.9, lt);
  s += bird(ox + 400 + lt * 30 % 600, 300, 1.2, lt, 1) + bird(ox + 470 + lt * 30 % 600, 330, 1.0, lt, 2) + bird(ox + 1200 + Math.sin(lt) * 40, 260, 1.1, lt, 3);
  s += person(ox + 200 + (lt * 40) % 600, 700, 0.55, lt);
  const cp = es(lt, L(10) + 0.2, L(10) + 1.2);
  s += card(ox + 1100, 120, 760, 230, cp, { double: true });
  s += T(ox + 1480, 190, '黑德蘭港 Port Hedland', { size: 44, anchor: 'middle', weight: 700, p: es(lt, L(10) + 0.4, L(10) + 1.4) });
  const cnt = 577.7 * es(lt, L(10) + 0.8, L(10) + 3.0);
  s += T(ox + 1480, 262, `2024–25 吞吐量 ${cnt.toFixed(1)} Mt`, { size: 38, anchor: 'middle', p: es(lt, L(10) + 0.8, L(10) + 1.6) });
  s += T(ox + 1480, 318, '鐵礦 iron ore 98.5% · Pilbara Ports', { size: 26, anchor: 'middle', italic: true, p: es(lt, L(10) + 1.4, L(10) + 2.4), fill: C.ink2 });
  // Panel C — voyage & blast furnaces
  const oc = 3840;
  s += P(rect(oc - 100, 720, 2200, 400), 1, { occ: true, w: 0 }) + waves(oc - 100, oc + 1000, 740, 7, lt, 1, { gap: 26 });
  const shx = oc + lerp(-100, 640, seg(lt, L(11) - 0.8, D));
  s += ship(shx, 780, 0.75, lt, { loaded: true });
  s += P(`M${oc + 1000} 720 L${oc + 2100} 720`, 1, { w: 3 });
  for (let i = 0; i < 6; i++) {
    const bh = 140 + (i % 3) * 60, gp = es(lt, L(11) + i * 0.25, L(11) + 1 + i * 0.25);
    if (gp > 0) s += P(rect(oc + 1150 + i * 90, 720 - bh * gp, 60, bh * gp), 1, { occ: true, w: 2.4, stroke: C.ink2 });
  }
  s += chimney(oc + 1820, 720, 330, lt, 81) + chimney(oc + 1900, 720, 280, lt + 1, 82);
  s += blastFurnace(oc + 1300, 720, 1.05, lt) + blastFurnace(oc + 1620, 720, 0.85, lt + 2);
  s += card(oc + 980, 110, 860, 200, es(lt, L(11), L(11) + 1), { double: true });
  s += T(oc + 1410, 180, '中國 2024 粗鋼產量', { size: 44, anchor: 'middle', weight: 700, p: es(lt, L(11) + 0.2, L(11) + 1.2) });
  s += T(oc + 1410, 250, `China crude steel ${(1005.1 * es(lt, L(11) + 0.6, L(11) + 2.6)).toFixed(1)} Mt · worldsteel`, { size: 32, anchor: 'middle', italic: true, p: es(lt, L(11) + 0.6, L(11) + 1.4) });
  return g(s, cam(1.02 + 0.03 * Math.sin(lt * 0.25), camX, 0));
}

// ═════ 6. PRICE — World Bank monthly line draws itself in sync with the narration ═════
function scenePrice(t, lt, D, sc) {
  C = DAY;
  const L = mkL(sc), Le = mkLe(sc);
  const N = PRICE.length;                                  // 2013M01 … 2026M10
  const idx = m => { const y = +m.slice(0, 4), mo = +m.slice(5); return (y - 2013) * 12 + mo - 1; };
  const X0 = 250, X1 = 1700, Y0 = 860, Y1 = 250, VMAX = 240;
  const xf = i => X0 + (X1 - X0) * i / (N - 1), yf = v => Y0 - (Y0 - Y1) * v / VMAX;
  // progress (month index) keyed to narration lines
  const keys = [[L(12) - 0.2, 0], [Le(12), 11], [L(13), 11], [Le(13), idx('2015M12')], [L(14), idx('2015M12')], [Le(14), idx('2019M07')], [L(15), idx('2019M07')], [Le(15), idx('2021M06')], [L(16), idx('2021M06')], [Le(16), N - 1]];
  let m = 0;
  for (let i = 1; i < keys.length; i++) if (lt >= keys[i - 1][0]) m = lerp(keys[i - 1][1], keys[i][1], es(lt, keys[i - 1][0], keys[i][0]));
  let s = '';
  s += clouds(lt, [[0, 80, 0.7, 16], [700, 60, 0.6, 12], [1400, 90, 0.75, 20]]);
  s += card(150, 130, 1640, 830, es(lt, 0, 1.0), { double: true });
  s += T(250, 205, '鐵礦石月均價（美元／乾噸）', { size: 40, weight: 700, p: es(lt, 0.3, 1.3) });
  s += T(1700, 205, 'Iron ore, CFR spot, US$/dmt · World Bank Pink Sheet', { size: 24, anchor: 'end', italic: true, p: es(lt, 0.5, 1.5), fill: C.ink2 });
  for (const v of [0, 50, 100, 150, 200]) {
    s += P(line(X0, yf(v), X1, yf(v)), es(lt, 0.4, 1.4), { w: v ? 1.2 : 2.6, op: v ? 0.35 : 1, dash: v ? '6 8' : null });
    s += T(X0 - 16, yf(v) + 9, `${v}`, { size: 24, anchor: 'end', p: es(lt, 0.8, 1.4), fill: C.ink2 });
  }
  for (let y = 2013; y <= 2026; y++) {
    const x = xf((y - 2013) * 12);
    s += P(line(x, Y0, x, Y0 + 10), es(lt, 0.6, 1.4), { w: 2 }) + T(x + 2, Y0 + 40, `${y}`, { size: 23, anchor: 'start', p: es(lt, 0.8, 1.6), fill: C.ink2 });
  }
  // cyclone markers on the time axis (foreshadowing next scene)
  const cyc = [['2019M03', 'Veronica'], ['2020M02', 'Damien'], ['2023M04', 'Ilsa'], ['2025M02', 'Zelia'], ['2026M03', 'Narelle']];
  // the price line itself
  const mi = Math.floor(m), mf = m - mi;
  const pts = [];
  for (let i = 0; i <= mi && i < N; i++) pts.push([xf(i), yf(PRICE[i][1])]);
  if (mi + 1 < N && mf > 0) pts.push([xf(mi + mf), yf(lerp(PRICE[mi][1], PRICE[mi + 1][1], mf))]);
  if (pts.length > 1) {
    s += F(pts2d(pts) + ` L${f1(pts[pts.length - 1][0])} ${Y0} L${X0} ${Y0} Z`, C.ink, 0.07);
    s += P(pts2d(pts), 1, { w: 4 });
  }
  const cur = pts[pts.length - 1] || [X0, Y0];
  const curV = mi + 1 < N ? lerp(PRICE[mi][1], PRICE[Math.min(mi + 1, N - 1)][1], mf) : PRICE[N - 1][1];
  // annotations
  const ann = (i, txt1, txt2, at, dx, dy, gold = false) => {
    const p = es(lt, at, at + 0.9);
    if (p <= 0) return '';
    const x = xf(i), y = yf(PRICE[i][1]);
    let a = P(circ(x, y, 12), p, { w: 3, stroke: gold ? C.gold : C.ink, occ: true });
    a += P(`M${f1(x + Math.sign(dx) * 14)} ${f1(y + Math.sign(dy) * 10)} Q ${f1(x + dx * 0.4)} ${f1(y + dy)} ${f1(x + dx)} ${f1(y + dy)}`, p, { w: 2 });
    const anc = dx < 0 ? 'end' : 'start';
    a += T(x + dx + (dx < 0 ? -10 : 10), y + dy - 6, txt1, { size: 34, weight: 700, anchor: anc, p, halo: C.paper, fill: gold ? C.gold : C.ink });
    a += T(x + dx + (dx < 0 ? -10 : 10), y + dy + 30, txt2, { size: 24, italic: true, anchor: anc, p: es(lt, at + 0.3, at + 1.2), halo: C.paper, fill: C.ink2 });
    return a;
  };
  if (lt > Le(12) - 0.3) {
    const p = es(lt, Le(12) - 0.3, Le(12) + 0.6);
    s += P(line(xf(0), yf(135.37), xf(11), yf(135.37)), p, { w: 3, stroke: C.gold, dash: p >= 1 ? '10 6' : null });
    s += T(xf(1), yf(172), '2013 年均 ≈ $135', { size: 30, weight: 700, p, halo: C.paper });
  }
  s += ann(idx('2015M12'), '$40.5（2015.12）', '中國需求放緩・供給大增', Le(13) - 0.3, 60, 14);
  s += ann(idx('2019M01'), '2019.01 淡水河谷潰壩', 'Vale Brumadinho dam collapse', L(14) + 1.0, -40, -140);
  s += ann(idx('2021M06'), '$214.4（2021.06）', '期間最高月均價 period high', Le(15) - 0.3, 70, -10, true);
  s += ann(N - 1, '$90.8', '2026.10', Le(16) - 0.4, -20, -110);
  // pen tip + live value
  if (pts.length > 1 && lt < Le(16) + 0.5) {
    s += F(circ(cur[0], cur[1], 8), C.gold) + `<g filter="url(#glow)">${F(circ(cur[0], cur[1], 14), C.gold, 0.5)}</g>`;
    s += T(cur[0] + 16, cur[1] - 18, `$${curV.toFixed(1)}`, { size: 28, weight: 700, halo: C.paper });
  }
  // cyclone ticks appear during last line
  cyc.forEach(([mm, nm], k) => {
    const p = es(lt, L(16) + 0.8 + k * 0.25, L(16) + 1.4 + k * 0.25);
    if (p > 0) {
      const x = xf(idx(mm));
      s += g(cyclone(0, 0, 16, lt, { p, stroke: C.gold }), `translate(${f1(x)} ${Y0 - 26})`);
    }
  });
  if (lt > L(16) + 0.8) s += T(X1, Y0 - 56, '氣旋事件 cyclone events', { size: 22, anchor: 'end', p: es(lt, L(16) + 0.8, L(16) + 1.8), fill: C.gold, halo: C.paper });
  // worker pushing an ore cart along beneath the axis, following the pen
  s += person(clamp(cur[0] - 60, 200, 1640), 129, 0.6, lt, { cart: true, speed: 6 });
  return g(s, cam(1.0 + 0.03 * es(lt, 0, D), -(cur[0] - 960) * 0.03, 0));
}

// ═════ 7. CYCLONE — night: Pilbara coast map, glowing ports, storms, rain ═════
function sceneCyclone(t, lt, D, sc) {
  C = NIGHT;
  const L = mkL(sc);
  const o = { x: 40, y: 70, lon0: 112.6, lat0: -16.2, k: 112 };
  let s = '';
  // lightning flash
  const fl = [3.1, 9.4, 15.8, 22.2, 27.0].reduce((a, ft) => Math.max(a, Math.max(0, 1 - Math.abs(lt - ft) / 0.12)), 0);
  if (fl > 0) s += F(rect(-200, -200, 2400, 1500), C.ink, (0.12 * fl).toFixed(3));
  // stars
  const R = rng(5);
  for (let i = 0; i < 60; i++) { const x = R() * 1920, y = R() * 400, tw_ = 0.4 + 0.6 * Math.abs(Math.sin(lt * 1.5 + i)); s += F(circ(x, y, 1.6), C.ink, (tw_ * 0.5).toFixed(2)); }
  // coast + land
  const coast = PILB.map(([a, b]) => proj(a, b, o));
  const land = smooth(coast) + ` L${f1(coast[coast.length - 1][0])} 1200 L2000 1200 L2000 ${f1(coast[0][1])} Z`;
  s += F(land, C.paper, 1) + P(smooth(coast), es(lt, 0, 1.6), { w: 3 });
  // cyclone-prone band (hatched strip offshore)
  const band = es(lt, L(17) + 0.4, L(17) + 2.0);
  if (band > 0) {
    const off = coast.map(([x, y]) => [x - 40, y - 60]);
    s += P(smooth(off), band, { w: 26, stroke: C.gold, op: 0.18 });
    s += P(smooth(off), band, { w: 2, stroke: C.gold, dash: band >= 1 ? '12 10' : null });
    s += T(60, 200, '最易遭熱帶氣旋侵襲的海岸', { size: 34, p: es(lt, L(17) + 1, L(17) + 2.2), fill: C.gold, weight: 700 });
    s += T(60, 240, "Australia's most cyclone-prone coast", { size: 24, italic: true, p: es(lt, L(17) + 1.3, L(17) + 2.5), fill: C.gold });
  }
  // inland mines + rail to ports
  const mines = [[117.8, -22.7, 'Tom Price'], [119.7, -23.35, 'Newman']];
  const ports = [[118.6, -20.3, '黑德蘭港 Port Hedland'], [116.7, -20.6, '丹皮爾 Dampier'], [117.2, -20.65, '']];
  const railp = es(lt, 0.6, 2.4);
  s += P(smooth([proj(119.7, -23.35, o), proj(119.2, -22.0, o), proj(118.8, -21.0, o), proj(118.6, -20.35, o)]), railp, { w: 2, dash: railp >= 1 ? '8 8' : null, stroke: C.ink2 });
  s += P(smooth([proj(117.8, -22.7, o), proj(117.3, -21.6, o), proj(116.8, -20.7, o)]), railp, { w: 2, dash: railp >= 1 ? '8 8' : null, stroke: C.ink2 });
  // train light moving along rail
  const tr = (lt * 0.08) % 1; const [ta, tb] = proj(lerp(119.7, 118.6, tr), lerp(-23.35, -20.35, tr), o);
  s += lamp(ta, tb, 4, lt, 9);
  mines.forEach(([a, b, n]) => { const [x, y] = proj(a, b, o); s += lamp(x, y, 5, lt, a) + T(x + 14, y + 8, n, { size: 22, fill: C.ink2, p: es(lt, 1, 2) }); });
  // port lights (dim when a storm is on top of them)
  const storms = [
    { id: 18, path: [[120.6, -16.6], [119.9, -18.2], [119.0, -19.6], [118.3, -20.3]] },   // Veronica (illustrative)
    { id: 19, path: [[121.6, -16.2], [121.0, -17.6], [120.2, -19.3], [119.6, -20.4]] },   // Ilsa (illustrative)
    { id: 20, path: [[120.2, -17.0], [119.6, -18.6], [119.1, -19.8], [118.9, -20.6]] },   // Q1-2025 storms (illustrative)
    { id: 21, path: [[118.8, -17.4], [117.6, -18.6], [116.3, -19.7], [114.9, -20.6]] },   // Mitchell (illustrative)
  ];
  let active = null;
  for (const st of storms) { const a = L(st.id) - 0.6, b = (st.id < 21 ? L(st.id + 1) - 0.6 : D); if (lt >= a && lt < b) active = { ...st, k: seg(lt, a, b), a, b }; }
  let stormXY = null;
  if (lt < L(18) - 0.6) {
    // generic storm spinning offshore during the intro line
    const k = es(lt, 0.4, L(18) - 0.6);
    stormXY = proj(lerp(119.6, 119.0, k), lerp(-17.0, -18.0, k), o);
  } else if (active) {
    const pth = active.path, u = ease(active.k) * (pth.length - 1), i = Math.min(Math.floor(u), pth.length - 2), f = u - i;
    stormXY = proj(lerp(pth[i][0], pth[i + 1][0], f), lerp(pth[i][1], pth[i + 1][1], f), o);
    s += P(smooth(pth.map(([a, b]) => proj(a, b, o))), clamp(active.k * 1.4), { w: 2, stroke: C.ink2, dash: '4 10', op: 0.7 });
  }
  ports.forEach(([a, b, n], i) => {
    const [x, y] = proj(a, b, o);
    const dd = stormXY ? Math.hypot(stormXY[0] - x, stormXY[1] - y) : 999;
    const k = clamp(dd / 260, 0.25, 1);
    s += lamp(x, y, 7, lt, i, k) + lamp(x + 10, y + 6, 4, lt, i + 3, k);
    if (n) s += T(x + (i === 1 ? -16 : 18), y + (i === 1 ? 36 : 34), n, { size: 28, anchor: i === 1 ? 'end' : 'start', weight: 700, p: es(lt, 1.2, 2.4) });
  });
  // ships waiting at anchorage move out to sea as a storm approaches
  const [hx, hy] = proj(118.6, -20.3, o);
  for (let i = 0; i < 4; i++) {
    const away = stormXY ? clamp(1 - Math.hypot(stormXY[0] - hx, stormXY[1] - hy) / 520) : 0;
    const sx = hx - 60 - i * 70 - away * 220, sy = hy - 70 - i * 26 - away * 140;
    s += g(P('M-26 -6 L26 -6 L20 6 L-22 6 Z', 1, { occ: true, w: 2 }) + P(rect(12, -16, 10, 10), 1, { w: 1.6 }), `translate(${f1(sx + Math.sin(lt + i) * 3)} ${f1(sy)})`) + lamp(sx + 16, sy - 18, 2.4, lt, i + 7);
  }
  if (stormXY) s += cyclone(stormXY[0], stormXY[1], 120, lt, { spin: 2.2, stroke: C.ink });
  s += T(...proj(113.2, -16.8, o), '路徑為示意 tracks illustrative', { size: 20, fill: C.ink2, p: es(lt, L(18), L(18) + 1), italic: true });
  // event ledger on the right
  s += card(1360, 70, 520, 820, es(lt, 0.3, 1.4), { double: true });
  s += T(1620, 140, '熱帶氣旋 × 鐵礦出口', { size: 38, anchor: 'middle', weight: 700, p: es(lt, 0.6, 1.6) });
  s += T(1620, 180, 'Tropical cyclones × iron ore exports', { size: 22, anchor: 'middle', italic: true, p: es(lt, 0.8, 1.8), fill: C.ink2 });
  const rows = [
    [18, '2019 · TC Veronica', '力拓估計減產 ~14 Mt', 'Rio Tinto est. loss', 14],
    [19, '2023 · TC Ilsa', '黑德蘭港停止裝船 ~2 天', 'no loading ~2 days', 0],
    [20, '2025 Q1 · 4 cyclones', '力拓出貨損失 ~13 Mt', 'Rio Tinto shipments', 13],
    [21, '2026 Q1 · Mitchell, Narelle', '力拓出貨影響 ~8 Mt', 'Rio Tinto shipments', 8],
  ];
  rows.forEach(([id, h, a, b, v], i) => {
    const y = 250 + i * 150, p = es(lt, L(id) + 0.1, L(id) + 1.1);
    if (p <= 0) return;
    s += g(cyclone(0, 0, 20, lt, { p, stroke: C.gold }), `translate(1410 ${y + 18})`);
    s += T(1445, y + 28, h, { size: 30, weight: 700, p });
    s += T(1445, y + 66, a, { size: 28, p: es(lt, L(id) + 0.4, L(id) + 1.4), fill: C.gold });
    if (v) { const bp = es(lt, L(id) + 0.8, L(id) + 2.0); s += P(rect(1445, y + 80, 380 * v / 14 * bp + 1, 14), 1, { occ: true, fill: C.gold, fo: 0.8, w: 1.4, stroke: C.gold }); }
    s += T(1445, y + 122, b, { size: 20, italic: true, p: es(lt, L(id) + 0.6, L(id) + 1.6), fill: C.ink2 });
  });
  s += T(1620, 868, '數字為公司／港口公告之估計', { size: 20, anchor: 'middle', fill: C.ink2, p: es(lt, L(18) + 1, L(18) + 2) });
  // rain over everything, heavier when a storm is active
  s += rain(lt, -100, -100, 2100, 1300, stormXY ? 260 : 120, { stroke: C.ink2, op: 0.4, seed: 17 });
  s += rain(lt * 1.2, -100, -100, 2100, 1300, stormXY ? 120 : 50, { stroke: C.ink, op: 0.25, seed: 23, w: 1.2 });
  return g(s, cam(1.0 + 0.05 * es(lt, 0, D), -20 * es(lt, 0, D), 0));
}

// ═════ 8. FUTURE — Simandou route; 2031 forecast; green DRI steel with turbines ═════
function sceneFuture(t, lt, D, sc) {
  C = DAY;
  const L = mkL(sc);
  const camX = panX(lt, [[0, 0], [L(23) - 0.3, -1920], [L(24) - 0.3, -3840]], 1.3);
  let s = '';
  s += clouds(lt, [[0, 110, 0.9, 20], [700, 170, 0.7, 14], [1500, 100, 1.0, 22], [2300, 150, 0.8, 18], [3100, 110, 0.9, 16], [3900, 160, 0.8, 20], [4700, 100, 1.0, 14]]);
  // Panel A — Guinea → China route
  s += P(rect(-200, 640, 2100, 600), 1, { occ: true, w: 0 }) + waves(-200, 1880, 660, 9, lt, 1, { gap: 26 });
  s += terrain([[-200, 640], [60, 640], [160, 580], [300, 520], [420, 520], [440, 640]], 700, es(lt, 0, 1.2), { raw: true });
  s += terrain([[1500, 640], [1560, 560], [1880, 548], [1900, 640]], 700, es(lt, 0.2, 1.4), { raw: true });
  s += ridge([[-200, 520], [-40, 470], [120, 500], [260, 440], [400, 520]], 640, es(lt, 0, 1.2), { strata: 2 });
  s += T(260, 380, '幾內亞 Guinea', { size: 40, anchor: 'middle', weight: 700, p: es(lt, 0.4, 1.4) });
  s += T(260, 424, '西芒杜 Simandou', { size: 30, anchor: 'middle', p: es(lt, 0.6, 1.6) });
  s += blastFurnace(1700, 560, 0.55, lt) + chimney(1880, 560, 200, lt, 91);
  s += T(1680, 320, '中國 China', { size: 40, anchor: 'middle', weight: 700, p: es(lt, 0.6, 1.6) });
  const route = [[420, 700], [800, 860], [1200, 880], [1520, 700]];
  s += P(smooth(route), es(lt, L(22), L(22) + 1.6), { w: 3, stroke: C.gold, dash: lt > L(22) + 1.6 ? '14 10' : null });
  const u = seg(lt, L(22) + 0.4, L(23) + 0.2);
  const rx = (k) => { const q = k * 3, i = Math.min(Math.floor(q), 2), f = q - i; return [lerp(route[i][0], route[i + 1][0], f), lerp(route[i][1], route[i + 1][1], f)]; };
  const [sx, sy] = rx(ease(u));
  s += ship(sx, sy, 0.42, lt, { loaded: true });
  s += card(560, 230, 800, 210, es(lt, L(22) + 0.3, L(22) + 1.3), { double: true });
  s += T(960, 305, '規劃產能 1.2 億噸／年', { size: 46, anchor: 'middle', weight: 700, p: es(lt, L(22) + 0.6, L(22) + 1.6) });
  s += T(960, 370, 'Planned capacity 120 Mt/y · first cargo Dec 2025', { size: 26, anchor: 'middle', italic: true, p: es(lt, L(22) + 1, L(22) + 2), fill: C.ink2 });
  s += person(drift(100, 40, lt, 1400) - 200, 640, 0.5, lt);
  // Panel B — forecast
  const ox = 1920;
  s += card(ox + 260, 200, 1400, 650, es(lt, L(23) - 0.4, L(23) + 0.6), { double: true });
  s += T(ox + 960, 280, '澳洲政府預估 Australian Government forecast', { size: 38, anchor: 'middle', weight: 700, p: es(lt, L(23), L(23) + 1) });
  s += P(line(ox + 400, 760, ox + 1540, 760), es(lt, L(23), L(23) + 0.8), { w: 2.6 });
  const pA = [ox + 520, 760 - 90.8 * 3.4], pB = [ox + 1400, 760 - 64 * 3.4];
  const fp = es(lt, L(23) + 0.6, L(23) + 2.4);
  s += F(circ(pA[0], pA[1], 12), C.ink, fp > 0 ? 1 : 0);
  s += P(`M${pA[0]} ${pA[1]} Q ${(pA[0] + pB[0]) / 2} ${pA[1] - 10} ${pB[0]} ${pB[1]}`, fp, { w: 4, stroke: C.gold, dash: fp >= 1 ? '14 10' : null });
  if (fp >= 1) s += P(circ(pB[0], pB[1], 14), 1, { occ: true, w: 3.4, stroke: C.gold });
  s += T(pA[0], pA[1] - 30, '2026.10 實際 $90.8', { size: 32, anchor: 'middle', p: es(lt, L(23) + 0.4, L(23) + 1.2), halo: C.paper });
  s += T(pA[0], 800, 'World Bank (actual)', { size: 22, anchor: 'middle', italic: true, p: es(lt, L(23) + 0.4, L(23) + 1.2), fill: C.ink2 });
  s += T(pB[0], pB[1] + 64, '2031 ≈ US$64（實質）', { size: 36, anchor: 'middle', weight: 700, fill: C.gold, p: es(lt, L(23) + 2.0, L(23) + 3), halo: C.paper });
  s += T(pB[0], 800, 'forecast, real terms · REQ Sep 2026', { size: 22, anchor: 'middle', italic: true, p: es(lt, L(23) + 2.2, L(23) + 3.2), fill: C.ink2 });
  s += T(ox + 960, 345, '供給增加・需求轉弱 → 價格走低', { size: 32, anchor: 'middle', p: es(lt, L(23) + 2.6, L(23) + 3.6), fill: C.ink2 });
  s += P(line(ox - 60, 900, ox + 1980, 900), 1, { w: 1.6, op: 0.5 });
  s += person(ox + 120 + (lt * 45) % 1600, 900, 0.5, lt);
  // Panel C — green steel (DRI) with wind + solar + hydrogen
  const oc = 3840;
  s += P(line(oc - 100, 820, oc + 2100, 820), 1, { w: 2.6 });
  for (const [x, h, sp] of [[oc + 120, 420, 1.3], [oc + 330, 360, 1.6], [oc + 520, 300, 1.1]]) s += turbine(x, 820, h, lt, 1, sp);
  for (let i = 0; i < 4; i++) s += P(`M${oc + 640 + i * 90} 820 L${oc + 660 + i * 90} 760 L${oc + 730 + i * 90} 760 L${oc + 710 + i * 90} 820 Z`, 1, { occ: true, w: 2.2 }) + P(line(oc + 650 + i * 90, 790, oc + 720 + i * 90, 790), 1, { w: 1.2, op: 0.6 });
  s += P(ell(oc + 1080, 740, 90, 70), 1, { occ: true, w: 3 }) + T(oc + 1080, 754, 'H₂', { size: 46, anchor: 'middle', weight: 700, fill: C.gold });
  s += P(rect(oc + 1240, 380, 150, 440), 1, { occ: true, w: 3.2 }) + P('M' + (oc + 1240) + ' 380 L' + (oc + 1290) + ' 330 L' + (oc + 1340) + ' 330 L' + (oc + 1390) + ' 380', 1, { occ: true, w: 3 });
  s += smoke(oc + 1315, 330, lt, { n: 6, life: 4.5, rise: 160, r0: 10, r1: 34, drift: 40, seed: 101, op: 0.6 });
  s += T(oc + 1315, 470, 'DRI', { size: 40, anchor: 'middle', weight: 700 });
  s += P(`M${oc + 1400} 700 L${oc + 1820} 600`, 1, { w: 4 }) + P(`M${oc + 1400} 720 L${oc + 1820} 620`, 1, { w: 2 });
  for (let k = 0; k < 12; k++) { const u2 = ((k / 12) + lt * 0.2) % 1; s += P(circ(oc + 1820 - u2 * 420, 600 + u2 * 100 - 10, 8), 1, { occ: true, fill: C.gold, fo: 0.8, w: 1.6 }); }
  s += T(oc + 1700, 560, '≥ 67% Fe', { size: 44, anchor: 'middle', weight: 700, fill: C.gold, p: es(lt, L(24) + 0.6, L(24) + 1.4), halo: C.paper });
  s += card(oc + 260, 120, 1400, 160, es(lt, L(24) - 0.2, L(24) + 0.8), { double: true });
  s += T(oc + 960, 190, '直接還原鐵 DRI · 綠色煉鋼', { size: 44, anchor: 'middle', weight: 700, p: es(lt, L(24), L(24) + 1) });
  s += T(oc + 960, 245, 'Pilbara ores are mostly 56–62% Fe; upgrading is being studied · CSIRO, IEEFA', { size: 24, anchor: 'middle', italic: true, p: es(lt, L(24) + 0.6, L(24) + 1.8), fill: C.ink2 });
  s += person(oc + 200 + (lt * 50) % 1500, 900, 0.6, lt);
  s += P(line(oc - 100, 900, oc + 2100, 900), 1, { w: 1.6, op: 0.5 });
  return g(s, cam(1.02 + 0.03 * Math.sin(lt * 0.25), camX, 0));
}

// ═════ 9. CLOSING — night harbour: a glowing bead becomes the moon, a laden ship sails out ═════
function sceneClosing(t, lt, D, sc) {
  C = NIGHT;
  let s = '';
  const R = rng(77);
  for (let i = 0; i < 110; i++) { const x = R() * 1920, y = R() * 560, tw_ = 0.35 + 0.65 * Math.abs(Math.sin(lt * 1.2 + i * 1.7)); s += F(circ(x, y, 1.4 + R() * 1.2), C.ink, (tw_ * 0.7).toFixed(2)); }
  // bead → moon
  const k = es(lt, 0.2, 2.4);
  const mx = lerp(960, 1500, k), my = lerp(540, 200, k), mr = lerp(26, 70, k);
  s += `<g filter="url(#glow)">${F(circ(mx, my, mr * 1.4), C.gold, 0.35)}</g>` + P(circ(mx, my, mr), 1, { occ: true, fill: C.gold, fo: 0.25 + 0.6 * (1 - k), w: 3, stroke: C.gold });
  // sea, reflections
  s += P(rect(-200, 700, 2400, 500), 1, { occ: true, w: 0 }) + waves(-200, 2100, 720, 9, lt, es(lt, 0.4, 1.6), { gap: 28 });
  for (let i = 0; i < 6; i++) s += P(line(mx - 40 + Math.sin(lt * 2 + i) * 20, 740 + i * 34, mx + 40 + Math.sin(lt * 2 + i) * 20, 740 + i * 34), 1, { w: 3, stroke: C.gold, op: (0.5 - i * 0.07).toFixed(2) });
  // harbour on the left with lights, lighthouse beam
  s += P('M-200 700 L520 700 L520 620 L380 620 L380 560 L300 560 L300 700', es(lt, 0.3, 1.6), { occ: true, w: 3 });
  for (const [x, y] of [[40, 690], [120, 690], [200, 690], [340, 600], [420, 640], [470, 640]]) s += lamp(x, y, 4, lt, x);
  s += P('M600 700 L620 470 L660 470 L680 700 Z', es(lt, 0.3, 1.6), { occ: true, w: 3 }) + P(rect(610, 440, 60, 30), 1, { occ: true, w: 3 });
  const ba = Math.sin(lt * 1.1) * 0.6 + 0.3;
  s += `<g filter="url(#glow)">${F(`M640 455 L${f1(640 + 900 * Math.cos(ba))} ${f1(455 + 120 * Math.sin(ba) - 60)} L${f1(640 + 900 * Math.cos(ba))} ${f1(455 + 120 * Math.sin(ba) + 60)} Z`, C.gold, 0.16)}</g>` + lamp(640, 455, 9, lt, 3);
  s += ship(lerp(700, 1500, es(lt, 0.6, D)), 730, 0.9, lt, { loaded: true, lights: true });
  s += bird(1200 + lt * 20, 380, 1.2, lt, 1) + bird(1250 + lt * 20, 410, 1.0, lt, 2);
  return g(s, cam(1.0 + 0.05 * es(lt, 0, D), -15 * es(lt, 0, D), 0));
}

// ═════ 10. END CARD — sources & credits; ore train runs along the bottom ═════
function sceneEnd(t, lt, D, sc) {
  C = DAY;
  let s = '';
  s += clouds(lt, [[0, 70, 0.6, 14], [900, 60, 0.5, 10], [1500, 90, 0.6, 18]]);
  s += T(960, 140, '資料來源 Sources', { size: 58, anchor: 'middle', weight: 700, p: es(lt, 0.1, 1.0) });
  s += P(smooth([[700, 170], [900, 178], [1100, 172], [1220, 176]]), es(lt, 0.6, 1.4), { w: 3, stroke: C.gold });
  const src = [
    '世界銀行 World Bank — Pink Sheet 月度商品價格 (2026.11)',
    '美國地質調查局 USGS — Mineral Commodity Summaries 2026',
    '澳洲工業科學資源部 DISR — Resources & Energy Quarterly 2026.09',
    '世界鋼鐵協會 worldsteel — World Steel in Figures 2025',
    'Pilbara Ports — Port of Port Hedland fact sheet 2024-25',
    '力拓 Rio Tinto / 必和必拓 BHP — 氣旋與季度生產公告',
    'Argus、Reuters (via Mining.com)、S&P Global — 港口與市場報導',
    'UCL (2013) 隕鐵珠研究；Britannica 貝塞麥法',
    '澳洲國家博物館 NMA — 1960 鐵礦出口禁令',
    'CSIRO、IEEFA — 綠色鋼鐵與礦石品位',
  ];
  src.forEach((x, i) => { s += T(260, 240 + i * 52, '• ' + x, { size: 30, p: es(lt, 0.6 + i * 0.22, 1.4 + i * 0.22) }); });
  s += T(960, 800, '完整清單與網址見 sources.md（附每句旁白對應來源）', { size: 28, anchor: 'middle', p: es(lt, 3.2, 4.2), fill: C.ink2 });
  s += T(960, 850, '旁白：Microsoft 中文（台灣）曉臻 HsiaoChen 神經語音｜配樂與音效：程式原創合成｜畫面：SVG 程式繪製', { size: 24, anchor: 'middle', p: es(lt, 3.6, 4.8), fill: C.ink2 });
  s += rail(-200, 2200, 1040, 1);
  s += train(-200 + lt * 260, 1036, 10, lt, { s: 0.55 });
  s += dust(-330 + lt * 260, 1020, lt, 4);
  const fade = es(lt, D - 1.2, D);
  if (fade > 0) s += F(rect(-200, -200, 2400, 1500), C.bg, fade.toFixed(3));
  return g(s, cam(1.0 + 0.02 * es(lt, 0, D)));
}

const SCENES = { open: sceneOpen, title: sceneTitle, history: sceneHistory, discovery: sceneDiscovery, production: sceneProduction, price: scenePrice, cyclone: sceneCyclone, future: sceneFuture, closing: sceneClosing, end: sceneEnd };

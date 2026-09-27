/* 疫苗怎麼作用？ How Do Vaccines Work? — deterministic canvas renderer.
   render(ctx, t, timeline, opts) draws the full 1920×1080 frame at time t (seconds).
   All motion is a pure function of t, so the live player and the frame-by-frame
   MP4 export produce identical pictures. */
(function (global) {
  'use strict';
  const W = 1920, H = 1080;
  const FONT = '"Noto Sans TC","Noto Sans CJK TC","PingFang TC","Microsoft JhengHei",sans-serif';
  const C = {
    bg0: '#040914', bg1: '#0a1733', grid: 'rgba(90,150,255,0.07)',
    virus: '#ff5d73', spike: '#ffb547', vaccine: '#3ce0c8', dendritic: '#b58cff',
    helper: '#4da3ff', bcell: '#5fe39a', plasma: '#b8f36b', antibody: '#ffd166',
    killer: '#ff6bd6', memory: '#7cf3ff', host: '#f3c9a8', macro: '#ff9f5a',
    text: '#eef4ff', sub: '#9fb3d9', dim: '#5d6f95'
  };

  // ---------- math helpers ----------
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const easeInOut = k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const easeOut = k => 1 - Math.pow(1 - k, 3);
  const easeBack = k => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
  const seg = (t, a, b, e = easeInOut) => e(clamp((t - a) / (b - a)));
  const rnd = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const TAU = Math.PI * 2;

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function glowCircle(ctx, x, y, r, color, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hexA(color, a)); g.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  function blobPath(ctx, x, y, r, t, amp, n, seed) {
    ctx.beginPath();
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * TAU;
      let d = r;
      for (let k = 1; k <= n; k++) d += amp * r * Math.sin(a * (k + 1) + t * (0.6 + k * 0.3) + seed * k) / (k * 1.6);
      const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
  }
  // body fill with inner gradient + rim
  function cellBody(ctx, color, x, y, r, alpha = 1) {
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.1);
    g.addColorStop(0, hexA('#ffffff', 0.55 * alpha));
    g.addColorStop(0.25, hexA(color, 0.9 * alpha));
    g.addColorStop(1, hexA(color, 0.35 * alpha));
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = Math.max(2, r * 0.06); ctx.strokeStyle = hexA(color, alpha); ctx.stroke();
  }

  // ---------- characters ----------
  const Draw = {};
  Draw.virus = (ctx, x, y, r, t, o = {}) => {
    const a = o.alpha ?? 1, faded = o.faded, col = faded ? '#8b93a7' : (o.color || C.virus);
    const sp = faded ? '#a9afbd' : C.spike, n = o.spikes || 12, rot = (o.rot ?? t * 0.25);
    ctx.save(); ctx.globalAlpha *= a;
    if (!faded) glowCircle(ctx, x, y, r * 2.1, col, 0.25);
    for (let i = 0; i < n; i++) {
      const ang = rot + (i / n) * TAU, wob = Math.sin(t * 2 + i) * 0.04;
      const x1 = x + Math.cos(ang) * r * 0.9, y1 = y + Math.sin(ang) * r * 0.9;
      const x2 = x + Math.cos(ang + wob) * r * 1.42, y2 = y + Math.sin(ang + wob) * r * 1.42;
      ctx.strokeStyle = sp; ctx.lineWidth = r * 0.07; ctx.lineCap = 'round';
      if (faded) ctx.setLineDash([r * 0.06, r * 0.06]);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]);
      const hl = o.highlight ? 0.5 + 0.5 * Math.sin(t * 6 + i) : 0;
      if (hl) glowCircle(ctx, x2, y2, r * 0.4, C.spike, 0.6 * hl);
      ctx.fillStyle = sp; ctx.beginPath(); ctx.arc(x2, y2, r * 0.15, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.arc(x2 - r * 0.04, y2 - r * 0.04, r * 0.05, 0, TAU); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    if (faded) { ctx.setLineDash([r * 0.12, r * 0.08]); }
    cellBody(ctx, col, x, y, r, faded ? 0.7 : 1); ctx.setLineDash([]);
    // capsid pattern
    ctx.strokeStyle = hexA('#ffffff', faded ? 0.12 : 0.2); ctx.lineWidth = r * 0.03;
    for (let i = 0; i < 6; i++) {
      const ang = rot * 0.5 + i * TAU / 6;
      ctx.beginPath(); ctx.arc(x + Math.cos(ang) * r * 0.45, y + Math.sin(ang) * r * 0.45, r * 0.22, 0, TAU); ctx.stroke();
    }
    // RNA squiggle core
    ctx.strokeStyle = hexA(faded ? '#c9ced8' : '#ffe1e6', 0.8); ctx.lineWidth = r * 0.05;
    ctx.beginPath();
    for (let i = 0; i <= 30; i++) {
      const k = i / 30, ang = k * TAU * 1.6 + rot, rad = r * 0.18 + r * 0.12 * Math.sin(k * 20 + t);
      const px = x + Math.cos(ang) * rad, py = y + Math.sin(ang) * rad;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke();
    if (faded) { // "inactivated" cross-hatch
      ctx.strokeStyle = 'rgba(200,210,230,0.5)'; ctx.lineWidth = r * 0.05;
      ctx.beginPath(); ctx.moveTo(x - r * 0.5, y - r * 0.5); ctx.lineTo(x + r * 0.5, y + r * 0.5); ctx.stroke();
    }
    ctx.restore();
  };
  Draw.spikeProtein = (ctx, x, y, s, t, o = {}) => {
    ctx.save(); ctx.globalAlpha *= o.alpha ?? 1; ctx.translate(x, y); ctx.rotate(o.rot ?? Math.sin(t) * 0.2);
    glowCircle(ctx, 0, -s * 0.5, s * 1.1, C.spike, 0.3);
    ctx.strokeStyle = C.spike; ctx.lineWidth = s * 0.16; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, s * 0.6); ctx.lineTo(0, -s * 0.3); ctx.stroke();
    for (const dx of [-0.28, 0, 0.28]) {
      ctx.fillStyle = C.spike; ctx.beginPath(); ctx.ellipse(dx * s, -s * 0.5, s * 0.2, s * 0.32, dx, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(-s * 0.1, -s * 0.62, s * 0.07, 0, TAU); ctx.fill();
    ctx.restore();
  };
  Draw.bacterium = (ctx, x, y, s, t, o = {}) => {
    ctx.save(); ctx.globalAlpha *= o.alpha ?? 1; ctx.translate(x, y); ctx.rotate(o.rot ?? -0.25 + Math.sin(t * 0.7) * 0.08);
    const L = s * 1.6, R = s * 0.55, col = '#7fd46b';
    glowCircle(ctx, 0, 0, s * 1.9, col, 0.18);
    ctx.strokeStyle = hexA(col, 0.6); ctx.lineWidth = 3;
    for (let f = 0; f < 3; f++) { // flagella
      ctx.beginPath();
      for (let i = 0; i <= 30; i++) {
        const k = i / 30, px = L + k * s * 1.4, py = (f - 1) * R * 0.6 + Math.sin(k * 12 - t * 8 + f) * s * 0.12 * k;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
    rr(ctx, -L - R, -R, 2 * (L + R), 2 * R, R); cellBody(ctx, col, 0, 0, L * 0.9);
    for (let i = 0; i < 10; i++) { // antigen dots on surface
      const px = -L + (i / 9) * 2 * L;
      for (const sy of [-1, 1]) {
        const hl = o.highlight ? 0.5 + 0.5 * Math.sin(t * 6 + i + sy) : 0;
        if (hl) glowCircle(ctx, px, sy * R * 1.05, s * 0.25, C.spike, 0.6 * hl);
        ctx.fillStyle = C.spike; ctx.beginPath(); ctx.arc(px, sy * R * 1.05, s * 0.08, 0, TAU); ctx.fill();
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-L * 0.6, -R * 0.2); ctx.bezierCurveTo(-L * 0.2, R * 0.4, L * 0.2, -R * 0.4, L * 0.6, R * 0.1); ctx.stroke();
    ctx.restore();
  };
  Draw.lnp = (ctx, x, y, r, t, o = {}) => { // lipid nanoparticle carrying mRNA
    ctx.save(); ctx.globalAlpha *= o.alpha ?? 1;
    glowCircle(ctx, x, y, r * 1.8, C.vaccine, 0.2);
    const n = 28;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + t * 0.2;
      ctx.fillStyle = hexA(C.vaccine, 0.9);
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.09, 0, TAU); ctx.fill();
      ctx.strokeStyle = hexA(C.vaccine, 0.5); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9); ctx.lineTo(x + Math.cos(a) * r * 0.72, y + Math.sin(a) * r * 0.72); ctx.stroke();
    }
    ctx.fillStyle = hexA(C.vaccine, 0.12); ctx.beginPath(); ctx.arc(x, y, r * 0.7, 0, TAU); ctx.fill();
    // mRNA ribbon
    ctx.lineWidth = r * 0.07; ctx.lineCap = 'round';
    const pts = [];
    for (let i = 0; i <= 40; i++) { const k = i / 40; pts.push([x - r * 0.5 + k * r, y + Math.sin(k * 14 + t * 2) * r * 0.22]); }
    ctx.strokeStyle = '#ffffff'; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p))); ctx.stroke();
    const bc = ['#ff5d73', '#ffd166', '#4da3ff', '#5fe39a'];
    pts.forEach((p, i) => { if (i % 4 === 0) { ctx.fillStyle = bc[(i / 4) % 4]; ctx.beginPath(); ctx.arc(p[0], p[1] + r * 0.08, r * 0.05, 0, TAU); ctx.fill(); } });
    ctx.restore();
  };
  Draw.syringe = (ctx, x, y, s, t, o = {}) => {
    ctx.save(); ctx.globalAlpha *= o.alpha ?? 1; ctx.translate(x, y); ctx.rotate(o.rot ?? -0.6);
    const fill = o.fill ?? 0.7, L = s * 2.2, R = s * 0.28;
    glowCircle(ctx, 0, 0, s * 2, C.vaccine, 0.14);
    ctx.fillStyle = 'rgba(200,230,255,0.12)'; ctx.strokeStyle = 'rgba(210,235,255,0.85)'; ctx.lineWidth = 3;
    rr(ctx, -L / 2, -R, L, 2 * R, 8); ctx.fill(); ctx.stroke();
    const g = ctx.createLinearGradient(-L / 2, 0, L / 2, 0); g.addColorStop(0, hexA(C.vaccine, 0.9)); g.addColorStop(1, hexA(C.memory, 0.9));
    ctx.fillStyle = g; rr(ctx, L / 2 - L * fill, -R + 5, L * fill - 5, 2 * R - 10, 5); ctx.fill();
    ctx.strokeStyle = 'rgba(210,235,255,0.6)'; ctx.lineWidth = 2;
    for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(-L / 2 + i * L / 6, -R); ctx.lineTo(-L / 2 + i * L / 6, -R * 0.4); ctx.stroke(); }
    ctx.fillStyle = 'rgba(210,235,255,0.9)';
    const pl = -L / 2 - (1 - fill) * L * 0.6;
    ctx.fillRect(pl - s * 0.6, -3, s * 0.6 + (-L / 2 - pl) + 6, 6); rr(ctx, pl - s * 0.7, -R * 1.2, s * 0.12, R * 2.4, 3); ctx.fill();
    rr(ctx, -L / 2 - 6, -R * 1.5, 10, R * 3, 3); ctx.fill();
    ctx.beginPath(); ctx.moveTo(L / 2, -R * 0.4); ctx.lineTo(L / 2 + s * 0.2, -R * 0.2); ctx.lineTo(L / 2 + s * 0.2, R * 0.2); ctx.lineTo(L / 2, R * 0.4); ctx.fill();
    ctx.strokeStyle = 'rgba(230,240,255,0.95)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(L / 2 + s * 0.2, 0); ctx.lineTo(L / 2 + s * 1.0, 0); ctx.stroke();
    ctx.restore();
  };
  Draw.dendritic = (ctx, x, y, r, t, o = {}) => {
    ctx.save(); ctx.globalAlpha *= o.alpha ?? 1;
    glowCircle(ctx, x, y, r * 2.6, C.dendritic, 0.22);
    const arms = 7;
    ctx.beginPath();
    for (let i = 0; i <= arms * 16; i++) {
      const a = (i / (arms * 16)) * TAU + 0.3;
      const k = (Math.cos(a * arms + Math.sin(t + a * 2) * 0.4) + 1) / 2;
      const d = r * (0.95 + 0.9 * Math.pow(k, 3) + 0.05 * Math.sin(t * 2 + a * 5));
      const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath(); cellBody(ctx, C.dendritic, x, y, r * 1.4);
    ctx.fillStyle = hexA('#5b3aa8', 0.7); blobPath(ctx, x + r * 0.1, y + r * 0.05, r * 0.45, t, 0.08, 2, 3); ctx.fill();
    ctx.restore();
  };
  Draw.helperT = (ctx, x, y, r, t, o = {}) => {
    ctx.save(); ctx.globalAlpha *= o.alpha ?? 1;
    glowCircle(ctx, x, y, r * 2.2, C.helper, 0.25);
    for (let i = 0; i < 14; i++) { // TCR receptors
      const a = (i / 14) * TAU + t * 0.1;
      ctx.strokeStyle = hexA(C.helper, 0.9); ctx.lineWidth = r * 0.07; ctx.lineCap = 'round';
      const x1 = x + Math.cos(a) * r, y1 = y + Math.sin(a) * r, x2 = x + Math.cos(a) * r * 1.2, y2 = y + Math.sin(a) * r * 1.2;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 + Math.cos(a + 0.6) * r * 0.1, y2 + Math.sin(a + 0.6) * r * 0.1);
      ctx.moveTo(x2, y2); ctx.lineTo(x2 + Math.cos(a - 0.6) * r * 0.1, y2 + Math.sin(a - 0.6) * r * 0.1); ctx.stroke();
    }
    blobPath(ctx, x, y, r, t, 0.03, 3, 1); cellBody(ctx, C.helper, x, y, r);
    ctx.fillStyle = hexA('#1d4f9e', 0.75); ctx.beginPath(); ctx.arc(x + r * 0.08, y + r * 0.05, r * 0.5, 0, TAU); ctx.fill();
    if (o.badge) { ctx.fillStyle = '#fff'; ctx.font = `800 ${r * 0.42}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(o.badge, x + r * 0.08, y + r * 0.07); }
    ctx.restore();
  };
  Draw.antibody = (ctx, x, y, s, ang, o = {}) => {
    ctx.save(); ctx.globalAlpha *= o.alpha ?? 1; ctx.translate(x, y); ctx.rotate(ang);
    const col = o.color || C.antibody;
    if (o.glow !== false) glowCircle(ctx, 0, 0, s * 1.3, col, 0.25);
    ctx.strokeStyle = col; ctx.lineWidth = s * 0.22; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(0, s * 0.75); ctx.lineTo(0, 0); ctx.lineTo(-s * 0.5, -s * 0.6); ctx.moveTo(0, 0); ctx.lineTo(s * 0.5, -s * 0.6); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = s * 0.07;
    ctx.beginPath(); ctx.moveTo(-s * 0.18, -s * 0.25); ctx.lineTo(-s * 0.45, -s * 0.58); ctx.stroke();
    ctx.restore();
  };
  Draw.bcell = (ctx, x, y, r, t, o = {}) => {
    ctx.save(); ctx.globalAlpha *= o.alpha ?? 1;
    const col = o.color || C.bcell;
    glowCircle(ctx, x, y, r * 2.1, col, 0.24 + (o.active ? 0.2 * Math.sin(t * 8) + 0.2 : 0));
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + t * 0.15;
      Draw.antibody(ctx, x + Math.cos(a) * r * 1.15, y + Math.sin(a) * r * 1.15, r * 0.28, a + Math.PI / 2, { color: col, glow: false });
    }
    blobPath(ctx, x, y, r, t, 0.035, 3, 5); cellBody(ctx, col, x, y, r);
    ctx.fillStyle = hexA('#1d7a45', 0.7); ctx.beginPath(); ctx.arc(x - r * 0.05, y + r * 0.08, r * 0.52, 0, TAU); ctx.fill();
    ctx.restore();
  };
  Draw.plasma = (ctx, x, y, r, t, o = {}) => {
    ctx.save(); ctx.globalAlpha *= o.alpha ?? 1;
    glowCircle(ctx, x, y, r * 2, C.plasma, 0.28);
    ctx.beginPath(); ctx.ellipse(x, y, r * 1.18, r, 0.2, 0, TAU); cellBody(ctx, C.plasma, x, y, r);
    ctx.strokeStyle = hexA('#5d8a1c', 0.8); ctx.lineWidth = r * 0.05;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(x + r * 0.2, y, r * (0.35 + i * 0.13), r * (0.25 + i * 0.12), 0.2, -1.2, 1.2); ctx.stroke(); }
    ctx.fillStyle = hexA('#4d7a12', 0.85); ctx.beginPath(); ctx.arc(x - r * 0.5, y, r * 0.3, 0, TAU); ctx.fill();
    ctx.restore();
  };
  Draw.killerT = (ctx, x, y, r, t, o = {}) => {
    ctx.save(); ctx.globalAlpha *= o.alpha ?? 1;
    glowCircle(ctx, x, y, r * 2.2, C.killer, 0.26);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU - t * 0.2, l = 1.18 + 0.06 * Math.sin(t * 5 + i);
      ctx.strokeStyle = C.killer; ctx.lineWidth = r * 0.06; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); ctx.lineTo(x + Math.cos(a) * r * l, y + Math.sin(a) * r * l); ctx.stroke();
    }
    blobPath(ctx, x, y, r, t, 0.04, 3, 9); cellBody(ctx, C.killer, x, y, r);
    ctx.fillStyle = hexA('#8a1f6f', 0.8); ctx.beginPath(); ctx.arc(x + r * 0.1, y, r * 0.45, 0, TAU); ctx.fill();
    for (let i = 0; i < 7; i++) { // granules
      const a = i * 0.9 + 0.4, d = r * 0.68;
      ctx.fillStyle = '#ffd1f3'; ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * 0.08, 0, TAU); ctx.fill();
    }
    ctx.restore();
  };
  Draw.hostCell = (ctx, x, y, r, t, o = {}) => {
    const inf = o.infected ?? 0, die = o.die ?? 0;
    ctx.save(); ctx.globalAlpha *= (o.alpha ?? 1) * (1 - die * 0.85);
    if (inf > 0) glowCircle(ctx, x, y, r * 1.6, C.virus, 0.3 * inf * (0.7 + 0.3 * Math.sin(t * 5)));
    const rs = r * (1 - die * 0.35);
    if (die > 0.02) { // apoptotic blebs
      for (let i = 0; i < 8; i++) {
        const a = i * TAU / 8 + 0.3, d = rs * (1 + die * 0.5);
        ctx.fillStyle = hexA(C.host, 0.6); ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * 0.14 * die, 0, TAU); ctx.fill();
      }
    }
    blobPath(ctx, x, y, rs, t * 0.5, 0.04, 3, o.seed || 2);
    cellBody(ctx, inf > 0.5 ? '#f0a58f' : C.host, x, y, rs, 0.85);
    ctx.fillStyle = hexA('#b77a5d', 0.75); ctx.beginPath(); ctx.arc(x - rs * 0.15, y - rs * 0.1, rs * 0.33, 0, TAU); ctx.fill();
    if (inf > 0) for (let i = 0; i < 4; i++) {
      const a = i * 1.6 + t * 0.6;
      Draw.virus(ctx, x + Math.cos(a) * rs * 0.55, y + Math.sin(a) * rs * 0.5, rs * 0.13, t, { alpha: inf, spikes: 8 });
    }
    ctx.restore();
  };
  Draw.macrophage = (ctx, x, y, r, t, o = {}) => {
    ctx.save(); ctx.globalAlpha *= o.alpha ?? 1;
    glowCircle(ctx, x, y, r * 2.1, C.macro, 0.22);
    blobPath(ctx, x, y, r, t * 1.4, 0.14, 4, 7); cellBody(ctx, C.macro, x, y, r);
    ctx.fillStyle = hexA('#9a4a17', 0.7); blobPath(ctx, x + r * 0.15, y + r * 0.1, r * 0.38, t, 0.1, 2, 2); ctx.fill();
    ctx.restore();
  };
  Draw.memory = (ctx, x, y, r, t, o = {}) => {
    ctx.save(); ctx.globalAlpha *= o.alpha ?? 1;
    const col = o.color || C.memory;
    for (let i = 0; i < 3; i++) { // halo rings
      const k = ((t * 0.5 + i / 3) % 1);
      ctx.strokeStyle = hexA(col, 0.5 * (1 - k)); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, r * (1.2 + k * 1.3), 0, TAU); ctx.stroke();
    }
    glowCircle(ctx, x, y, r * 2.2, col, 0.35);
    blobPath(ctx, x, y, r, t, 0.03, 3, 4); cellBody(ctx, col, x, y, r);
    ctx.fillStyle = hexA(o.core || '#16707e', 0.75); ctx.beginPath(); ctx.arc(x, y + r * 0.05, r * 0.5, 0, TAU); ctx.fill();
    // little star = "remembers"
    ctx.fillStyle = '#ffffff'; ctx.save(); ctx.translate(x, y + r * 0.05); ctx.rotate(t * 0.8);
    ctx.beginPath(); for (let i = 0; i < 10; i++) { const rad = i % 2 ? r * 0.12 : r * 0.3, a = i * Math.PI / 5; ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); } ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.restore();
  };
  Draw.person = (ctx, x, y, s, o = {}) => {
    ctx.save(); ctx.globalAlpha *= o.alpha ?? 1;
    const col = o.color || '#8fa3c8';
    if (o.shield) {
      ctx.strokeStyle = hexA(C.vaccine, 0.75 * o.shield); ctx.lineWidth = 3; ctx.fillStyle = hexA(C.vaccine, 0.1 * o.shield);
      ctx.beginPath(); ctx.arc(x, y - s * 0.55, s * 1.05, 0, TAU); ctx.fill(); ctx.stroke();
    }
    if (o.warn) glowCircle(ctx, x, y - s * 0.5, s * 1.6, C.spike, 0.35 * o.warn);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x, y - s * 1.05, s * 0.32, 0, TAU); ctx.fill();
    rr(ctx, x - s * 0.42, y - s * 0.66, s * 0.84, s * 0.95, s * 0.36); ctx.fill();
    ctx.restore();
  };

  // ---------- labels ----------
  // A glass pill with zh (bold) over en; optional leader line to (ax, ay).
  function label(ctx, x, y, zh, en, color, a, o = {}) {
    if (a <= 0.01) return;
    const k = easeBack(clamp(a)), zs = o.size || 30, es = Math.round(zs * 0.62);
    ctx.save();
    ctx.font = `700 ${zs}px ${FONT}`; const wz = ctx.measureText(zh).width;
    ctx.font = `500 ${es}px ${FONT}`; const we = ctx.measureText(en).width;
    const w = Math.max(wz, we) + 44, h = zs + es + 26;
    if (o.ax !== undefined) {
      ctx.globalAlpha = clamp(a);
      ctx.strokeStyle = hexA(color, 0.8); ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
      const ex = clamp(o.ax, x - w / 2, x + w / 2), ey = o.ay < y ? y - h / 2 : y + h / 2;
      ctx.beginPath(); ctx.moveTo(o.ax, o.ay); ctx.lineTo(Math.abs(o.ay - y) < h / 2 ? (o.ax < x ? x - w / 2 : x + w / 2) : ex, Math.abs(o.ay - y) < h / 2 ? y : ey); ctx.stroke();
      ctx.setLineDash([]); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(o.ax, o.ay, 5, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = clamp(a); ctx.translate(x, y); ctx.scale(0.85 + 0.15 * k, 0.85 + 0.15 * k);
    ctx.shadowColor = hexA(color, 0.45); ctx.shadowBlur = 24;
    rr(ctx, -w / 2, -h / 2, w, h, 16); ctx.fillStyle = 'rgba(7,14,32,0.82)'; ctx.fill();
    ctx.shadowBlur = 0; ctx.strokeStyle = hexA(color, 0.9); ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = color; rr(ctx, -w / 2 + 10, -h / 2 + 12, 5, h - 24, 2.5); ctx.fill();
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.text; ctx.font = `700 ${zs}px ${FONT}`; ctx.fillText(zh, 4, -h / 2 + 12 + zs * 0.92);
    ctx.fillStyle = hexA(color, 1); ctx.font = `500 ${es}px ${FONT}`; ctx.fillText(en, 4, h / 2 - 13);
    ctx.restore();
  }
  function heading(ctx, x, y, zh, en, a, color = C.text, size = 64) {
    if (a <= 0.01) return;
    ctx.save(); ctx.globalAlpha = clamp(a); ctx.textAlign = 'center';
    ctx.translate(0, (1 - easeOut(clamp(a))) * 20);
    ctx.fillStyle = color; ctx.font = `900 ${size}px ${FONT}`; ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 20;
    ctx.fillText(zh, x, y);
    ctx.fillStyle = C.sub; ctx.font = `500 ${Math.round(size * 0.45)}px ${FONT}`; ctx.fillText(en, x, y + size * 0.78);
    ctx.restore();
  }
  function card(ctx, x, y, w, h, color, a) {
    ctx.save(); ctx.globalAlpha = clamp(a);
    const g = ctx.createLinearGradient(x, y, x, y + h); g.addColorStop(0, 'rgba(20,36,72,0.72)'); g.addColorStop(1, 'rgba(8,16,36,0.72)');
    rr(ctx, x, y, w, h, 26); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = hexA(color, 0.55); ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }
  function arrow(ctx, x1, y1, x2, y2, color, a, prog = 1) {
    if (a <= 0.01 || prog <= 0) return;
    const xe = lerp(x1, x2, prog), ye = lerp(y1, y2, prog), ang = Math.atan2(ye - y1, xe - x1);
    ctx.save(); ctx.globalAlpha = clamp(a); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.setLineDash([2, 12]); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(xe, ye); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(xe, ye); ctx.lineTo(xe - Math.cos(ang - 0.5) * 22, ye - Math.sin(ang - 0.5) * 22);
    ctx.lineTo(xe - Math.cos(ang + 0.5) * 22, ye - Math.sin(ang + 0.5) * 22); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function burst(ctx, x, y, r, color, k) {
    if (k <= 0 || k >= 1) return;
    ctx.save(); ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = color; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(x, y, r * (0.3 + k), 0, TAU); ctx.stroke();
    for (let i = 0; i < 12; i++) {
      const a = i * TAU / 12, r1 = r * (0.4 + k * 0.9), r2 = r * (0.6 + k * 1.2);
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); ctx.lineTo(x + Math.cos(a) * r2, y + Math.sin(a) * r2); ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- background ----------
  let bgCache = null;
  function background(ctx, t, accent) {
    if (!bgCache) {
      bgCache = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
      const b = bgCache.getContext('2d');
      const g = b.createRadialGradient(W * 0.5, H * 0.42, 50, W * 0.5, H * 0.5, W * 0.75);
      g.addColorStop(0, C.bg1); g.addColorStop(1, C.bg0); b.fillStyle = g; b.fillRect(0, 0, W, H);
      b.strokeStyle = C.grid; b.lineWidth = 1;
      for (let x = 0; x <= W; x += 60) { b.beginPath(); b.moveTo(x + 0.5, 0); b.lineTo(x + 0.5, H); b.stroke(); }
      for (let y = 0; y <= H; y += 60) { b.beginPath(); b.moveTo(0, y + 0.5); b.lineTo(W, y + 0.5); b.stroke(); }
      b.fillStyle = 'rgba(120,180,255,0.16)';
      for (let x = 0; x <= W; x += 60) for (let y = 0; y <= H; y += 60) { b.beginPath(); b.arc(x, y, 1.6, 0, TAU); b.fill(); }
      const v = b.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.72);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.65)'); b.fillStyle = v; b.fillRect(0, 0, W, H);
    }
    ctx.drawImage(bgCache, 0, 0);
    // accent nebula drifting
    const ax = W * 0.5 + Math.sin(t * 0.07) * 380, ay = H * 0.45 + Math.cos(t * 0.05) * 140;
    glowCircle(ctx, ax, ay, 760, accent, 0.10);
    glowCircle(ctx, W - ax * 0.6, H - ay * 0.5, 520, '#3a6bff', 0.07);
    // floating bokeh particles
    for (let i = 0; i < 46; i++) {
      const sp = 8 + rnd(i) * 22, x = (rnd(i + 3) * W + t * sp * (rnd(i + 7) > 0.5 ? 1 : -1) + W * 4) % (W + 100) - 50;
      const y = (rnd(i + 11) * H + Math.sin(t * 0.3 + i) * 30);
      const r = 1.5 + rnd(i + 5) * 4, a = 0.12 + 0.25 * rnd(i + 9) * (0.6 + 0.4 * Math.sin(t + i));
      ctx.fillStyle = `rgba(150,200,255,${a})`; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
    // scanning light sweep
    const sx = ((t * 120) % (W + 800)) - 400;
    const sg = ctx.createLinearGradient(sx - 200, 0, sx + 200, 0);
    sg.addColorStop(0, 'rgba(120,200,255,0)'); sg.addColorStop(0.5, 'rgba(120,200,255,0.025)'); sg.addColorStop(1, 'rgba(120,200,255,0)');
    ctx.fillStyle = sg; ctx.fillRect(sx - 200, 0, 400, H);
  }

  // ---------- scenes ----------
  // Each scene gets S = { lt, D, c:[cue starts rel], e:[cue ends rel], t }
  const ACCENT = ['#3ce0c8', '#ff5d73', '#3ce0c8', '#b58cff', '#5fe39a', '#ff6bd6', '#7cf3ff', '#4da3ff', '#ffd166', '#3ce0c8'];
  const Scenes = [];

  // 0 — Prologue
  Scenes[0] = (ctx, S) => {
    const { lt, t, c } = S;
    const ta = seg(lt, 0.1, 1.2), up = seg(lt, c[1] - 0.3, c[1] + 0.9);
    const ty = lerp(470, 215, up), sz = lerp(104, 64, up);
    // title
    ctx.save(); ctx.globalAlpha = ta; ctx.textAlign = 'center';
    ctx.shadowColor = hexA(C.vaccine, 0.6); ctx.shadowBlur = 40;
    const g = ctx.createLinearGradient(W / 2 - 400, 0, W / 2 + 400, 0); g.addColorStop(0, '#9ff7ea'); g.addColorStop(1, '#8fc2ff');
    ctx.fillStyle = g; ctx.font = `900 ${sz}px ${FONT}`; ctx.fillText('疫苗怎麼作用？', W / 2, ty);
    ctx.shadowBlur = 0; ctx.fillStyle = C.sub; ctx.font = `500 ${sz * 0.42}px ${FONT}`; ctx.fillText('How Do Vaccines Work?', W / 2, ty + sz * 0.72);
    ctx.restore();
    if (up < 0.02) { // hero ornament under the title
      Draw.syringe(ctx, W / 2 - 330, 640, 70, t, { alpha: ta * 0.9, rot: -0.35, fill: 0.75 });
      Draw.memory(ctx, W / 2 + 330, 640, 60, t, { alpha: ta * 0.9 });
      Draw.antibody(ctx, W / 2, 660, 60, Math.sin(t) * 0.2, { alpha: ta });
    }
    const pa = seg(lt, c[1] - 0.1, c[1] + 0.9), fx = 600, fy = 700;
    if (pa > 0) {
      ctx.save(); ctx.globalAlpha = pa;
      // human silhouette
      const col = '#27406f';
      glowCircle(ctx, fx, fy - 150, 300, '#3a6bff', 0.16);
      ctx.fillStyle = col; ctx.strokeStyle = '#5b86d6'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(fx, fy - 300, 70, 0, TAU); ctx.fill(); ctx.stroke();
      rr(ctx, fx - 115, fy - 215, 230, 300, 90); ctx.fill(); ctx.stroke();
      rr(ctx, fx + 100, fy - 200, 60, 230, 30); ctx.fill(); ctx.stroke();
      ctx.restore();
      // injection site pulse
      const px = fx + 132, py = fy - 150;
      Draw.syringe(ctx, px + 150 - seg(lt, c[1] + 0.2, c[1] + 1.2) * 70, py - 70, 40, t, { alpha: pa * (1 - seg(lt, c[2] - 0.5, c[2])), rot: Math.PI + 0.5, fill: 0.7 - seg(lt, c[1] + 1.2, c[1] + 2.2) * 0.5 });
      glowCircle(ctx, px, py, 40 + 10 * Math.sin(t * 5), C.vaccine, 0.6 * pa);
      // zoom lens
      const za = seg(lt, c[2] - 0.4, c[2] + 0.8), lx = 1250, ly = 590, lr = 260;
      if (za > 0) {
        ctx.save(); ctx.globalAlpha = za;
        ctx.strokeStyle = hexA(C.vaccine, 0.5); ctx.lineWidth = 2; ctx.setLineDash([8, 8]);
        ctx.beginPath(); ctx.moveTo(px, py - 30); ctx.lineTo(lx - lr * 0.7, ly - lr * 0.72); ctx.moveTo(px, py + 30); ctx.lineTo(lx - lr * 0.7, ly + lr * 0.72); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(lx, ly, lr * easeOut(za), 0, TAU); ctx.fillStyle = 'rgba(40,10,30,0.85)'; ctx.fill();
        ctx.save(); ctx.clip();
        glowCircle(ctx, lx, ly, lr, '#ff4d6d', 0.25);
        for (let i = 0; i < 9; i++) { // red blood cells
          const a = i * 0.7 + t * 0.15, d = 60 + rnd(i) * 180;
          const x = lx + Math.cos(a) * d + (t * 30 + i * 90) % 60, y = ly + Math.sin(a * 1.3) * d * 0.8;
          ctx.fillStyle = hexA('#d9304f', 0.7); ctx.beginPath(); ctx.ellipse(x, y, 34, 22, a, 0, TAU); ctx.fill();
          ctx.fillStyle = hexA('#8f1330', 0.6); ctx.beginPath(); ctx.ellipse(x, y, 14, 8, a, 0, TAU); ctx.fill();
        }
        Draw.helperT(ctx, lx - 90, ly - 70, 44, t, {}); Draw.bcell(ctx, lx + 100, ly + 40, 44, t, {});
        Draw.dendritic(ctx, lx - 40, ly + 120, 30, t, {}); Draw.killerT(ctx, lx + 70, ly - 140, 32, t, {});
        ctx.restore();
        ctx.strokeStyle = hexA(C.vaccine, 0.9); ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(lx, ly, lr * easeOut(za), 0, TAU); ctx.stroke();
        ctx.restore();
        label(ctx, lx + 360, ly - 170, '免疫系統', 'Immune system', C.vaccine, seg(lt, c[2] + 0.4, c[2] + 1.1), { ax: lx + lr * 0.8, ay: ly - lr * 0.5 });
      }
      label(ctx, fx - 260, fy - 330, '人體', 'Human body', '#8fb4ff', seg(lt, c[1] + 0.4, c[1] + 1.1), { ax: fx - 60, ay: fy - 300 });
      label(ctx, fx + 250, fy + 70, '接種部位', 'Injection site', C.vaccine, seg(lt, c[1] + 1.0, c[1] + 1.7), { ax: px, ay: py + 10 });
    }
  };

  // 1 — Pathogens & antigens
  Scenes[1] = (ctx, S) => {
    const { lt, t, c } = S;
    const va = seg(lt, 0.1, 1.0, easeOut), ba = seg(lt, 0.6, 1.5, easeOut), hl = lt > c[1] + 0.8;
    const vx = 620, vy = 540, vr = 130;
    Draw.virus(ctx, vx, vy + Math.sin(t) * 10, vr * (0.6 + 0.4 * va), t, { alpha: va, highlight: hl });
    Draw.bacterium(ctx, 1180, 560 + Math.cos(t) * 8, 110 * (0.6 + 0.4 * ba), t, { alpha: ba, highlight: hl });
    label(ctx, vx, 250, '病毒', 'Virus', C.virus, seg(lt, 0.8, 1.4));
    label(ctx, 1200, 330, '細菌', 'Bacterium', '#7fd46b', seg(lt, 1.2, 1.8));
    label(ctx, 900, 800, '病原體', 'Pathogens', C.text, seg(lt, 1.6, 2.2), { size: 26 });
    // antigen callout
    const ca = seg(lt, c[1] + 0.3, c[1] + 1.1), cx = 1600, cy = 390, cr = 150;
    if (ca > 0) {
      const sx = vx + Math.cos(-0.45) * vr * 1.42, sy = vy + Math.sin(-0.45) * vr * 1.42;
      ctx.save(); ctx.globalAlpha = ca; ctx.strokeStyle = hexA(C.spike, 0.6); ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(cx - cr, cy); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(cx, cy, cr * easeOut(ca), 0, TAU); ctx.fillStyle = 'rgba(40,25,5,0.8)'; ctx.fill();
      ctx.strokeStyle = C.spike; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
      Draw.spikeProtein(ctx, cx, cy + 20, 110 * easeOut(ca), t, { alpha: ca });
      label(ctx, cx, cy + 225, '抗原', 'Antigen', C.spike, seg(lt, c[1] + 0.8, c[1] + 1.4));
    }
    // recognition: antibody-shaped receptor scanning the antigen
    const ra = seg(lt, c[2] - 0.1, c[2] + 0.8);
    if (ra > 0) {
      const rx = 1600, ry = 700 - 40 * seg(lt, c[2] + 0.4, c[2] + 1.4);
      ctx.save(); ctx.globalAlpha = ra;
      const k = (lt * 1.2) % 1;
      ctx.strokeStyle = hexA(C.helper, 0.8 * (1 - k)); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy + 20, 60 + k * 90, 0, TAU); ctx.stroke();
      ctx.restore();
      // reticle
      ctx.save(); ctx.globalAlpha = ra; ctx.strokeStyle = C.helper; ctx.lineWidth = 3; ctx.translate(cx, cy + 10); ctx.rotate(t);
      for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.arc(0, 0, 118, -0.35, 0.35); ctx.stroke(); }
      ctx.restore();
      void rx; void ry;
      label(ctx, 1600, 160, '辨認敵人', 'Recognize the invader', C.helper, seg(lt, c[2] + 0.5, c[2] + 1.1), { size: 26 });
    }
  };

  // 2 — What is a vaccine
  Scenes[2] = (ctx, S) => {
    const { lt, t, c } = S;
    const cards = [
      { x: 270, a: seg(lt, c[0] - 0.2, c[0] + 0.6), zh: '減毒／不活化病原體', en: 'Weakened / inactivated', col: '#a9b3c9' },
      { x: 750, a: seg(lt, c[1] + 0.1, c[1] + 0.9), zh: '蛋白質片段', en: 'Protein piece', col: C.spike },
      { x: 1230, a: seg(lt, c[1] + 1.6, c[1] + 2.4), zh: 'mRNA 指令', en: 'mRNA instructions', col: C.vaccine }
    ];
    const cw = 400, ch = 470, cy = 180;
    cards.forEach((k, i) => {
      if (k.a <= 0) return;
      const y = cy + (1 - easeOut(k.a)) * 40;
      card(ctx, k.x, y, cw, ch, k.col, k.a);
      const mx = k.x + cw / 2, my = y + 190;
      if (i === 0) { Draw.virus(ctx, mx - 55, my - 20, 60, t, { alpha: k.a, faded: true }); Draw.virus(ctx, mx + 75, my + 55, 40, t + 2, { alpha: k.a, faded: true, spikes: 10 }); }
      if (i === 1) for (let j = 0; j < 3; j++) Draw.spikeProtein(ctx, mx - 90 + j * 90, my + (j % 2 ? 30 : -20) + Math.sin(t * 1.5 + j) * 8, 58, t + j, { alpha: k.a, rot: (j - 1) * 0.35 });
      if (i === 2) Draw.lnp(ctx, mx, my, 105, t, { alpha: k.a });
      ctx.save(); ctx.globalAlpha = k.a; ctx.textAlign = 'center';
      ctx.fillStyle = C.text; ctx.font = `700 32px ${FONT}`; ctx.fillText(k.zh, mx, y + ch - 92);
      ctx.fillStyle = k.col; ctx.font = `500 22px ${FONT}`; ctx.fillText(k.en, mx, y + ch - 56);
      ctx.fillStyle = hexA(k.col, 0.9); ctx.font = `800 22px ${FONT}`; ctx.fillText(['A', 'B', 'C'][i], mx, y + 44);
      ctx.restore();
    });
    // bottom banner
    const ba = seg(lt, c[2] + 0.2, c[2] + 1.0);
    if (ba > 0) {
      const bx = W / 2, by = 760;
      ctx.save(); ctx.globalAlpha = ba;
      rr(ctx, bx - 520, by - 48, 1040, 96, 48); ctx.fillStyle = 'rgba(10,40,44,0.85)'; ctx.fill(); ctx.strokeStyle = hexA(C.vaccine, 0.9); ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = C.vaccine; ctx.beginPath(); ctx.arc(bx - 460, by, 26, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#04201d'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(bx - 472, by); ctx.lineTo(bx - 462, by + 11); ctx.lineTo(bx - 446, by - 10); ctx.stroke();
      ctx.textAlign = 'left'; ctx.fillStyle = C.text; ctx.font = `700 32px ${FONT}`; ctx.fillText('認識敵人的特徵，一般不會引發疾病', bx - 410, by - 4);
      ctx.fillStyle = C.vaccine; ctx.font = `500 21px ${FONT}`; ctx.fillText("Learn the enemy's features — generally without causing the disease", bx - 410, by + 28);
      ctx.restore();
    }
    // syringe gathering
    Draw.syringe(ctx, 1770, 400, 74, t, { alpha: seg(lt, c[0] + 0.3, c[0] + 1.2) * (1 - ba * 0.3), rot: -Math.PI / 2, fill: 0.3 + 0.5 * seg(lt, c[0], c[2]) });
    label(ctx, 1770, 640, '疫苗', 'Vaccine', C.vaccine, seg(lt, c[0] + 0.8, c[0] + 1.4), { size: 26 });
  };

  // 3 — Sounding the alarm
  Scenes[3] = (ctx, S) => {
    const { lt, t, c } = S;
    const dx = 640, dy = 540, da = seg(lt, 0, 0.8, easeOut);
    Draw.dendritic(ctx, dx, dy, 95, t, { alpha: da });
    // antigens drifting in and being engulfed
    for (let i = 0; i < 5; i++) {
      const st = c[0] + 0.2 + i * 0.3, k = seg(lt, st, st + 1.2);
      const sx = 200 + rnd(i) * 150, sy = 260 + i * 130;
      if (k < 1) Draw.spikeProtein(ctx, lerp(sx, dx, k), lerp(sy, dy, k), 34 * (1 - k * 0.6), t + i, { alpha: da * (1 - k * 0.7) });
    }
    label(ctx, dx - 20, 250, '樹突細胞', 'Dendritic cell', C.dendritic, seg(lt, 0.6, 1.2), { ax: dx, ay: dy - 110 });
    // presenting antigen on surface
    const pa = seg(lt, c[1] - 0.3, c[1] + 0.5);
    const ax = dx + 160, ay = dy - 10;
    if (pa > 0) {
      Draw.spikeProtein(ctx, ax, ay, 44, t, { alpha: pa, rot: Math.PI / 2 });
      label(ctx, ax + 20, 790, '展示抗原', 'Presented antigen', C.spike, seg(lt, c[1] + 0.2, c[1] + 0.8), { ax: ax + 10, ay: ay + 30, size: 26 });
    }
    // helper T approaches
    const hk = seg(lt, c[1], c[1] + 1.4), hx = lerp(1500, 1000, hk), hy = 540;
    Draw.helperT(ctx, hx, hy + Math.sin(t * 1.5) * 6, 90, t, { alpha: seg(lt, c[1] - 0.4, c[1] + 0.4) });
    label(ctx, hx + 20, 300, '輔助型T細胞', 'Helper T cell', C.helper, seg(lt, c[1] + 0.3, c[1] + 0.9), { ax: hx, ay: hy - 100 });
    // alarm
    const al = lt - (c[2] - 0.1);
    if (al > 0) {
      const mx = (ax + hx - 90) / 2 + 20;
      for (let i = 0; i < 4; i++) {
        const k = ((al * 0.8 + i / 4) % 1);
        ctx.save(); ctx.strokeStyle = hexA(C.spike, 0.7 * (1 - k)); ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(mx, hy, 60 + k * 420, 0, TAU); ctx.stroke(); ctx.restore();
      }
      burst(ctx, mx, hy, 60, '#ffffff', clamp(al / 0.8));
      const ia = seg(al, 0.1, 0.6, easeBack);
      ctx.save(); ctx.globalAlpha = clamp(ia); ctx.translate(mx, 200); ctx.scale(ia, ia);
      ctx.fillStyle = C.spike; ctx.beginPath(); ctx.moveTo(0, -56); ctx.lineTo(56, 44); ctx.lineTo(-56, 44); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2a1600'; ctx.font = `900 60px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('!', 0, 36);
      ctx.restore();
      label(ctx, 1560, 780, '免疫反應啟動', 'Immune response ON', C.spike, seg(al, 0.4, 1.0), { size: 26 });
    }
  };

  // 4 — B cells & antibodies
  Scenes[4] = (ctx, S) => {
    const { lt, t, c } = S;
    // B cell clones: 1 → 2 → 4 → 7
    const g1 = seg(lt, c[0] + 0.3, c[0] + 0.9), g2 = seg(lt, c[0] + 0.9, c[0] + 1.5), g3 = seg(lt, c[0] + 1.5, c[0] + 2.1);
    const base = [[330, 520]];
    const pos = [
      [330, 520],
      [lerp(330, 250, g1), lerp(520, 400, g1)],
      [lerp(330, 250, g1), lerp(520, 640, g1)],
      [lerp(330, 440, g2), lerp(520, 330, g2)],
      [lerp(330, 440, g2), lerp(520, 710, g2)],
      [lerp(330, 140, g3), lerp(520, 520, g3)],
      [lerp(330, 150, g3), lerp(520, 280, g3)]
    ];
    const vis = [1, g1, g1, g2, g2, g3, g3];
    const fadeB = seg(lt, c[2] + 0.5, c[3] + 1.0);
    void base;
    pos.forEach((p, i) => { if (vis[i] > 0) Draw.bcell(ctx, p[0] + Math.sin(t + i) * 5, p[1] + Math.cos(t * 1.2 + i) * 5, 46, t + i, { alpha: seg(lt, 0, 0.6) * Math.min(1, vis[i] * 2) * (1 - fadeB * 0.5), active: lt < c[1] }); });
    label(ctx, 330, 190, 'B細胞', 'B cell', C.bcell, seg(lt, 0.4, 1.0));
    if (g1 > 0.5) {
      ctx.save(); ctx.globalAlpha = seg(lt, c[0] + 0.6, c[0] + 1.2); ctx.fillStyle = C.bcell; ctx.font = `800 30px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillText('×' + (g3 > 0.5 ? 7 : g2 > 0.5 ? 5 : 3), 330, 860); ctx.restore();
    }
    // plasma cells
    const pa = seg(lt, c[1] - 0.2, c[1] + 0.8);
    const pcs = [[700, 420], [720, 660]];
    pcs.forEach((p, i) => { if (pa > 0) Draw.plasma(ctx, p[0], p[1] + Math.sin(t + i) * 6, 64, t, { alpha: pa }); });
    arrow(ctx, 480, 520, 610, 520, C.plasma, pa, pa);
    label(ctx, 710, 200, '漿細胞', 'Plasma cell', C.plasma, seg(lt, c[1] + 0.3, c[1] + 0.9), { ax: 700, ay: 350 });
    // viruses: approach host cell wall, get coated, then are swallowed by a macrophage
    const viruses = [[1340, 360], [1440, 560], [1300, 700]];
    const block = seg(lt, c[2], c[2] + 1.2);
    const tag = seg(lt, c[3], c[3] + 2.2);
    const macroX = 1530, macroY = 760;
    const vstate = viruses.map((v, i) => {
      const push = Math.sin(t * 3 + i) * 10 * (1 - block);
      const mk = seg(lt, c[3] + 0.3 + i * 0.35, c[3] + 1.4 + i * 0.35);
      const gone = seg(lt, c[3] + 1.2 + i * 0.35, c[3] + 1.7 + i * 0.35);
      return { x: lerp(v[0] + push, macroX, mk * 0.95), y: lerp(v[1], macroY, mk * 0.95), s: 1 - mk * 0.7, a: seg(lt, 0.2, 1.0) * (1 - gone) };
    });
    vstate.forEach((v, i) => Draw.virus(ctx, v.x, v.y, 48 * v.s, t + i, { alpha: v.a, spikes: 10 }));
    // antibody stream: each antibody flies to its virus and stays bound to it
    const abStart = c[1] + 0.6;
    for (let i = 0; i < 26; i++) {
      const st = abStart + i * 0.14, k = clamp((lt - st) / 1.8);
      if (k <= 0) continue;
      const src = pcs[i % 2], v = vstate[i % 3], ang = (i * 2.4) % TAU;
      const tx = v.x + Math.cos(ang) * 88 * v.s, ty = v.y + Math.sin(ang) * 88 * v.s;
      const e = easeInOut(k), x = lerp(src[0] + 70, tx, e), y = lerp(src[1], ty, e) + Math.sin(k * Math.PI) * (rnd(i) - 0.5) * 160;
      Draw.antibody(ctx, x, y, 26 * (k < 1 ? 1 : v.s), k < 1 ? t * 2 + i : ang - Math.PI / 2, { alpha: k < 1 ? 1 : v.a });
    }
    label(ctx, 1030, 200, '抗體', 'Antibody', C.antibody, seg(lt, c[1] + 1.2, c[1] + 1.8));
    label(ctx, 1390, 180, '病毒', 'Virus', C.virus, seg(lt, 0.6, 1.2) * (1 - tag), { size: 26, ax: 1340, ay: 290 });
    // host cell membrane at right edge
    ctx.save(); ctx.globalAlpha = seg(lt, 0.2, 1.0);
    const mg = ctx.createLinearGradient(1700, 0, 1920, 0); mg.addColorStop(0, hexA(C.host, 0.5)); mg.addColorStop(1, hexA(C.host, 0.15));
    ctx.fillStyle = mg; ctx.beginPath(); ctx.moveTo(1920, 120);
    for (let y = 120; y <= 900; y += 10) ctx.lineTo(1690 + Math.sin(y * 0.02 + t) * 12 + Math.pow((y - 510) / 390, 2) * 90, y);
    ctx.lineTo(1920, 900); ctx.closePath(); ctx.fill(); ctx.restore();
    label(ctx, 1790, 250, '人體細胞', 'Body cell', C.host, seg(lt, 0.8, 1.4), { size: 24 });
    if (block > 0) { // stop marks
      [[1600, 380], [1640, 600]].forEach(([x, y]) => {
        ctx.save(); ctx.globalAlpha = block * (1 - tag); ctx.strokeStyle = C.virus; ctx.lineWidth = 8; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x - 20, y - 20); ctx.lineTo(x + 20, y + 20); ctx.moveTo(x + 20, y - 20); ctx.lineTo(x - 20, y + 20); ctx.stroke(); ctx.restore();
      });
      label(ctx, 1560, 470, '阻止入侵', 'Entry blocked', C.virus, seg(lt, c[2] + 0.6, c[2] + 1.2) * (1 - tag), { size: 24 });
    }
    // macrophage clears tagged viruses
    const ma = seg(lt, c[3] - 0.2, c[3] + 0.6);
    if (ma > 0) {
      Draw.macrophage(ctx, macroX, macroY, 70 + 8 * tag, t, { alpha: ma });
      label(ctx, 1180, 790, '巨噬細胞清除', 'Macrophage clears', C.macro, seg(lt, c[3] + 0.4, c[3] + 1.0), { size: 24, ax: macroX - 75, ay: macroY + 10 });
    }
  };

  // 5 — Killer T cells
  Scenes[5] = (ctx, S) => {
    const { lt, t, c } = S;
    const cells = [[430, 560, 0], [720, 560, 1], [1010, 560, 0], [1300, 560, 1], [1590, 560, 0]];
    const kill = [seg(lt, c[1] + 0.2, c[1] + 1.2), seg(lt, c[1] + 1.0, c[1] + 2.0)];
    // killer path: visit cell 1 then cell 3
    const k1 = seg(lt, 0.2, c[1] + 0.1), k2 = seg(lt, c[1] + 0.6, c[1] + 1.2);
    let kx = lerp(170, 720, k1), ky = lerp(380, 400, k1);
    if (k2 > 0) { kx = lerp(720, 1300, k2); ky = 400 - Math.sin(k2 * Math.PI) * 60; }
    cells.forEach(([x, y, inf], i) => {
      const idx = i === 1 ? 0 : i === 3 ? 1 : -1;
      Draw.hostCell(ctx, x, y, 110, t, { infected: inf, die: idx >= 0 ? kill[idx] : 0, seed: i + 1, alpha: seg(lt, 0, 0.7) });
      if (idx >= 0) {
        // granule release
        const g = seg(lt, c[1] + 0.1 + idx * 0.8, c[1] + 0.8 + idx * 0.8);
        if (g > 0 && g < 1) for (let j = 0; j < 8; j++) {
          ctx.fillStyle = hexA('#ffd1f3', 1 - g); ctx.beginPath(); ctx.arc(lerp(x, x + Math.cos(j) * 140, g), lerp(y - 130, y + Math.sin(j) * 90, g), 7, 0, TAU); ctx.fill();
        }
      }
    });
    // scanning beam
    const sa = seg(lt, c[0] + 0.4, c[0] + 1.0) * (1 - seg(lt, c[1] + 1.8, c[1] + 2.4));
    if (sa > 0) {
      ctx.save(); ctx.globalAlpha = sa * 0.8;
      const bg = ctx.createLinearGradient(kx, ky, kx, ky + 300); bg.addColorStop(0, hexA(C.killer, 0.45)); bg.addColorStop(1, hexA(C.killer, 0));
      ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(kx - 30, ky + 30); ctx.lineTo(kx + 30, ky + 30); ctx.lineTo(kx + 130, ky + 300); ctx.lineTo(kx - 130, ky + 300); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    Draw.killerT(ctx, kx, ky, 72, t, { alpha: seg(lt, 0, 0.6) });
    label(ctx, clamp(kx, 200, 1700), ky - 175, '殺手T細胞', 'Killer T cell', C.killer, seg(lt, 0.4, 1.0), { ax: kx, ay: ky - 95 });
    label(ctx, 860, 820, '受感染細胞', 'Infected cell', C.virus, seg(lt, c[0] + 1.2, c[0] + 1.8), { ax: 720, ay: 670 });
    label(ctx, 1590, 820, '健康細胞', 'Healthy cell', C.host, seg(lt, c[0] + 1.6, c[0] + 2.2), { ax: 1590, ay: 670 });
    label(ctx, 1660, 330, '阻止病毒複製', 'Stops viral copying', C.killer, seg(lt, c[1] + 1.4, c[1] + 2.0), { size: 24 });
  };

  // 6 — Memory cells
  Scenes[6] = (ctx, S) => {
    const { lt, t, c } = S;
    // crowd of effector cells fades out, two transform
    const fade = seg(lt, c[0] + 0.4, c[1] + 0.3);
    for (let i = 0; i < 12; i++) {
      const a = i * TAU / 12 + t * 0.1, d = 300 + 40 * Math.sin(i * 3);
      const x = 760 + Math.cos(a) * d * 1.2, y = 520 + Math.sin(a) * d * 0.62;
      const al = seg(lt, 0, 0.6) * (1 - fade);
      if (al <= 0.01) continue;
      (i % 3 === 0 ? Draw.killerT : i % 3 === 1 ? Draw.bcell : Draw.helperT)(ctx, x, y, 34, t + i, { alpha: al * 0.8 });
    }
    const tr = seg(lt, c[1] - 0.2, c[1] + 0.8);
    const b = [560, 520], tc = [960, 520];
    Draw.bcell(ctx, b[0], b[1], 70, t, { alpha: seg(lt, 0, 0.6) * (1 - tr) });
    Draw.killerT(ctx, tc[0], tc[1], 70, t, { alpha: seg(lt, 0, 0.6) * (1 - tr) });
    if (tr > 0) {
      burst(ctx, b[0], b[1], 90, C.memory, tr); burst(ctx, tc[0], tc[1], 90, C.memory, tr);
      Draw.memory(ctx, b[0], b[1], 70, t, { alpha: tr, color: '#7cf3c4', core: '#127a55' });
      Draw.memory(ctx, tc[0], tc[1], 70, t + 1, { alpha: tr, color: '#9fc9ff', core: '#1d4f9e' });
    }
    label(ctx, b[0], 250, tr > 0.5 ? '記憶B細胞' : 'B細胞', tr > 0.5 ? 'Memory B cell' : 'B cell', tr > 0.5 ? '#7cf3c4' : C.bcell, seg(lt, 0.4, 1.0));
    label(ctx, tc[0], 250, tr > 0.5 ? '記憶T細胞' : 'T細胞', tr > 0.5 ? 'Memory T cell' : 'T cell', tr > 0.5 ? '#9fc9ff' : C.killer, seg(lt, 0.6, 1.2));
    label(ctx, 760, 780, '長壽', 'Long-lived', C.memory, seg(lt, c[1] + 0.4, c[1] + 1.0), { size: 26 });
    // memory archive
    const ma = seg(lt, c[2] - 0.2, c[2] + 0.7);
    if (ma > 0) {
      const ax = 1480, ay = 520;
      arrow(ctx, 1080, 520, 1300, 520, C.memory, ma, ma);
      ctx.save(); ctx.globalAlpha = ma; ctx.translate(ax, ay); ctx.rotate(Math.sin(t * 0.5) * 0.03);
      ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + Math.PI / 6; ctx.lineTo(Math.cos(a) * 170, Math.sin(a) * 170); } ctx.closePath();
      ctx.fillStyle = 'rgba(10,40,60,0.85)'; ctx.fill(); ctx.strokeStyle = C.memory; ctx.lineWidth = 3; ctx.stroke();
      ctx.restore();
      Draw.virus(ctx, ax, ay - 10, 60, t, { alpha: ma * 0.9, color: '#8a6cff' });
      ctx.save(); ctx.globalAlpha = ma * (0.6 + 0.4 * Math.sin(t * 4)); ctx.strokeStyle = C.memory; ctx.lineWidth = 3; ctx.setLineDash([10, 8]);
      ctx.strokeRect(ax - 110, ay - 120, 220, 220); ctx.restore();
      label(ctx, ax, 800, '記住敵人的樣子', 'Remembers the enemy', C.memory, seg(lt, c[2] + 0.2, c[2] + 0.8), { size: 26 });
    }
  };

  // 7 — The real invasion (left: scene, right: schematic chart)
  Scenes[7] = (ctx, S) => {
    const { lt, t, c } = S;
    // left scene
    const lx = 470, ly = 520;
    ctx.save(); ctx.globalAlpha = seg(lt, 0, 0.6);
    rr(ctx, 110, 190, 720, 640, 30); ctx.fillStyle = 'rgba(8,16,36,0.55)'; ctx.fill(); ctx.strokeStyle = 'rgba(124,243,255,0.25)'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    const act = seg(lt, c[1] - 0.2, c[1] + 0.5), clear = seg(lt, c[2], c[2] + 2.0);
    for (let i = 0; i < 6; i++) {
      const k = seg(lt, 0.2 + i * 0.25, 1.8 + i * 0.25, easeOut);
      const sx = 790, sy = 330 + i * 80, tx = 530 + (i % 2) * 130, ty = 330 + i * 80;
      const x = lerp(sx, tx, k), y = lerp(sy, ty, k);
      const dead = clamp(clear * 1.6 - i * 0.12);
      if (dead < 1) Draw.virus(ctx, x, y, 34 * (1 - dead * 0.5), t + i, { alpha: (1 - dead) * clamp((lt - 0.2 - i * 0.25) * 3), spikes: 10 });
      if (act > 0 && dead < 1) for (let j = 0; j < 3; j++) { // antibodies coat
        const a = j * 2.1 + i, d = 58 * (1 - 0.3 * act);
        Draw.antibody(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, 18, a - Math.PI / 2, { alpha: act * (1 - dead), glow: false });
      }
    }
    Draw.memory(ctx, 300, 420, 58, t, { alpha: seg(lt, 0, 0.6), color: '#7cf3c4', core: '#127a55' });
    Draw.memory(ctx, 300, 640, 58, t + 1, { alpha: seg(lt, 0, 0.6), color: '#9fc9ff', core: '#1d4f9e' });
    if (act > 0) { burst(ctx, 300, 420, 80, '#7cf3c4', act); burst(ctx, 300, 640, 80, '#9fc9ff', act); }
    label(ctx, 300, 250, '記憶細胞', 'Memory cells', C.memory, seg(lt, 0.3, 0.9), { size: 26 });
    label(ctx, 640, 250, '真正的病原體', 'Real pathogen', C.virus, seg(lt, 0.9, 1.5), { size: 24 });
    // chart
    const ca = seg(lt, c[1] - 0.4, c[1] + 0.4);
    if (ca > 0) {
      const x0 = 1020, y0 = 760, cw = 760, chh = 480;
      ctx.save(); ctx.globalAlpha = ca;
      rr(ctx, x0 - 60, y0 - chh - 70, cw + 110, chh + 150, 26); ctx.fillStyle = 'rgba(8,16,36,0.72)'; ctx.fill(); ctx.strokeStyle = 'rgba(77,163,255,0.35)'; ctx.stroke();
      ctx.strokeStyle = '#6f85b3'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x0, y0 - chh); ctx.lineTo(x0, y0); ctx.lineTo(x0 + cw, y0); ctx.stroke();
      ctx.fillStyle = C.sub; ctx.font = `500 22px ${FONT}`; ctx.textAlign = 'right'; ctx.fillText('時間 Time →', x0 + cw, y0 + 34);
      ctx.save(); ctx.translate(x0 - 22, y0 - chh / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('免疫反應 Immune response', 0, 0); ctx.restore();
      ctx.textAlign = 'left'; ctx.fillStyle = C.dim; ctx.font = `500 18px ${FONT}`; ctx.fillText('示意圖 Schematic', x0 + 14, y0 - chh + 4);
      const draw = (f, col, p, dash) => {
        ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.setLineDash(dash); ctx.beginPath();
        for (let i = 0; i <= 120 * p; i++) { const k = i / 120, v = f(k); const px = x0 + k * cw, py = y0 - v * chh * 0.9; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
        ctx.stroke(); ctx.setLineDash([]);
      };
      const bump = (k, m, s, h) => h * Math.exp(-Math.pow((k - m) / s, 2));
      const p1 = seg(lt, c[1] + 0.1, c[1] + 1.6), p2 = seg(lt, c[1] + 0.9, c[1] + 2.4);
      draw(k => bump(k, 0.62, 0.17, 0.42), '#8b93a7', p1, [10, 10]);
      draw(k => bump(k, 0.28, 0.13, 1.0) + 0.02, C.memory, p2, []);
      ctx.restore();
      label(ctx, x0 + 560, y0 - 250, '第一次遇到', 'First encounter', '#a9b3c9', seg(lt, c[1] + 1.2, c[1] + 1.8), { size: 22 });
      label(ctx, x0 + 420, y0 - chh + 40, '有記憶：更快、更強', 'With memory: faster & stronger', C.memory, seg(lt, c[1] + 2.0, c[1] + 2.6), { size: 22 });
    }
  };

  // 8 — Side effects & herd immunity
  Scenes[8] = (ctx, S) => {
    const { lt, t, c } = S;
    const out = seg(lt, c[2] - 0.6, c[2]);
    if (out < 1) {
      ctx.save(); ctx.globalAlpha = 1 - out;
      // arm
      const ax = 560, ay = 520, a0 = seg(lt, 0, 0.7);
      ctx.globalAlpha *= a0;
      // bust: head, torso and left upper arm with a bandage
      ctx.fillStyle = '#27406f'; ctx.strokeStyle = '#6d93dc'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(ax - 60, ay - 170, 78, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ax - 250, ay + 300); ctx.lineTo(ax - 250, ay + 20); ctx.quadraticCurveTo(ax - 250, ay - 70, ax - 150, ay - 75);
      ctx.lineTo(ax + 40, ay - 75); ctx.quadraticCurveTo(ax + 130, ay - 70, ax + 130, ay + 20); ctx.lineTo(ax + 130, ay + 300); ctx.closePath(); ctx.fill(); ctx.stroke();
      rr(ctx, ax + 105, ay - 60, 95, 330, 47); ctx.fill(); ctx.stroke();
      const bx = ax + 152, by = ay + 20;
      ctx.save(); ctx.translate(bx, by); ctx.rotate(-0.15);
      ctx.fillStyle = '#f5e6c8'; rr(ctx, -44, -24, 88, 48, 14); ctx.fill();
      ctx.fillStyle = '#e9c98f'; rr(ctx, -16, -16, 32, 32, 6); ctx.fill();
      ctx.restore();
      const sore = seg(lt, c[0], c[0] + 0.6);
      for (let i = 0; i < 3; i++) { const k = (lt * 0.9 + i / 3) % 1; ctx.strokeStyle = hexA('#ff8a5c', 0.8 * (1 - k) * sore); ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(bx, by, 40 + k * 110, 0, TAU); ctx.stroke(); }
      ctx.restore();
      label(ctx, 800, 300, '手臂痠痛', 'Sore arm', '#ff8a5c', seg(lt, c[0] + 0.3, c[0] + 0.9) * (1 - out), { ax: bx + 30, ay: by - 20 });
      // thermometer
      const tx = 1180, ty = 520, ta = seg(lt, c[0] + 0.9, c[0] + 1.5) * (1 - out);
      ctx.save(); ctx.globalAlpha = ta;
      ctx.fillStyle = 'rgba(220,235,255,0.15)'; ctx.strokeStyle = '#cfe0ff'; ctx.lineWidth = 3;
      rr(ctx, tx - 22, ty - 200, 44, 250, 22); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(tx, ty + 80, 46, 0, TAU); ctx.fill(); ctx.stroke();
      const lvl = 0.45 + 0.12 * seg(lt, c[0] + 1.2, c[1]) - 0.3 * seg(lt, c[1] + 1.5, c[2] - 0.6);
      ctx.fillStyle = '#ff7a6b'; ctx.beginPath(); ctx.arc(tx, ty + 80, 34, 0, TAU); ctx.fill(); rr(ctx, tx - 11, ty + 50 - 240 * lvl, 22, 240 * lvl + 20, 11); ctx.fill();
      ctx.restore();
      label(ctx, tx + 10, 250, '輕微發燒', 'Mild fever', '#ff7a6b', seg(lt, c[0] + 1.2, c[0] + 1.8) * (1 - out));
      // days timeline
      const da = seg(lt, c[1] + 0.4, c[1] + 1.2) * (1 - out);
      if (da > 0) {
        ctx.save(); ctx.globalAlpha = da;
        for (let d = 0; d < 3; d++) {
          const x = 1480 + d * 120, y = 520, f = 1 - d * 0.38;
          rr(ctx, x - 48, y - 62, 96, 116, 16); ctx.fillStyle = 'rgba(16,30,62,0.92)'; ctx.fill(); ctx.strokeStyle = 'rgba(160,190,240,0.55)'; ctx.lineWidth = 2; ctx.stroke();
          ctx.fillStyle = C.text; ctx.font = `700 20px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(`第${d + 1}天`, x, y - 34); ctx.fillStyle = C.sub; ctx.font = `500 15px ${FONT}`; ctx.fillText(`Day ${d + 1}`, x, y - 14);
          glowCircle(ctx, x, y + 22, 34, '#ff8a5c', 0.8 * f); ctx.fillStyle = hexA('#ff8a5c', 0.25 + 0.75 * f); ctx.beginPath(); ctx.arc(x, y + 22, 14 * f + 4, 0, TAU); ctx.fill();
        }
        ctx.restore();
        label(ctx, 1600, 760, '通常幾天內消退', 'Usually fades in days', C.vaccine, seg(lt, c[1] + 0.9, c[1] + 1.5) * (1 - out), { size: 24 });
      }
      label(ctx, 980, 790, '免疫系統正在工作', 'Immune system at work', C.vaccine, seg(lt, c[1], c[1] + 0.6) * (1 - out), { size: 24 });
    }
    // herd immunity grid
    const ha = seg(lt, c[2] - 0.2, c[2] + 0.6);
    if (ha > 0) {
      const cols = 9, rows = 4, gx = 400, gy = 290, sx = 140, sy = 140;
      const unv = new Set([4, 13, 20, 29, 33]); // can't be vaccinated
      const vul = new Set([4, 13, 29]);
      const pts = [];
      for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
        const i = r * cols + q, x = gx + q * sx + (r % 2) * 40, y = gy + r * sy;
        pts.push([x, y]);
        const sh = unv.has(i) ? 0 : seg(lt, c[2] + 0.1 + ((q + r) % 5) * 0.12, c[2] + 0.7 + ((q + r) % 5) * 0.12);
        Draw.person(ctx, x, y + 30, 46, { alpha: ha, shield: sh, color: unv.has(i) ? '#f2c38a' : '#8fa3c8', warn: vul.has(i) ? 0.5 + 0.5 * Math.sin(t * 3) : 0 });
      }
      // viruses arrive from outside and are stopped by the vaccinated neighbours of the unprotected
      const attacks = [[1760, 170, 5], [230, 470, 12], [1760, 690, 30]];
      attacks.forEach(([sx0, sy0, target], j) => {
        const st = c[3] - 0.9 + j * 0.45;
        const k = seg(lt, st, st + 0.9), [x2, y2] = pts[target];
        if (k <= 0) return;
        const kk = Math.min(k, 0.82), x = lerp(sx0, x2, kk), y = lerp(sy0, y2 - 20, kk) - Math.sin(kk * Math.PI) * 40;
        const fade = seg(lt, st + 1.0, st + 1.8);
        Draw.virus(ctx, x, y, 16, t, { alpha: ha * (1 - fade), spikes: 8 });
        if (k > 0.8) {
          ctx.save(); ctx.globalAlpha = ha * (1 - fade); ctx.strokeStyle = C.vaccine; ctx.lineWidth = 6; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(x - 16, y - 16); ctx.lineTo(x + 16, y + 16); ctx.moveTo(x + 16, y - 16); ctx.lineTo(x - 16, y + 16); ctx.stroke(); ctx.restore();
          burst(ctx, x, y, 40, C.vaccine, clamp((lt - st - 0.72) / 0.6));
        }
      });
      label(ctx, 540, 175, '已接種', 'Vaccinated', C.vaccine, seg(lt, c[2] + 0.5, c[2] + 1.1), { size: 24, ax: pts[1][0], ay: pts[1][1] - 60 });
      label(ctx, pts[4][0], 175, '無法接種的人', "Can't be vaccinated", '#f2c38a', seg(lt, c[3], c[3] + 0.6), { size: 24, ax: pts[4][0], ay: pts[4][1] - 50 });
      label(ctx, 1000, 825, '群體免疫', 'Herd immunity', C.vaccine, seg(lt, c[3] + 0.4, c[3] + 1.0), { size: 26 });
    }
  };

  // 9 — Takeaway / end card
  Scenes[9] = (ctx, S) => {
    const { lt, t, c } = S;
    const sx = 960, sy = 480, sa = seg(lt, 0, 0.9, easeOut);
    const endA = seg(lt, c[2] + 1.6, c[2] + 2.4);
    ctx.save(); ctx.globalAlpha = sa * (1 - endA);
    // shield
    ctx.translate(sx, sy); ctx.scale(0.9 + 0.1 * sa, 0.9 + 0.1 * sa);
    glowCircle(ctx, 0, 0, 380, C.vaccine, 0.22);
    ctx.beginPath(); ctx.moveTo(0, -210); ctx.bezierCurveTo(110, -170, 160, -170, 180, -150); ctx.bezierCurveTo(185, 20, 120, 150, 0, 220);
    ctx.bezierCurveTo(-120, 150, -185, 20, -180, -150); ctx.bezierCurveTo(-160, -170, -110, -170, 0, -210); ctx.closePath();
    const g = ctx.createLinearGradient(0, -210, 0, 220); g.addColorStop(0, hexA(C.vaccine, 0.85)); g.addColorStop(1, hexA('#1c6f9e', 0.85));
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#bafcf1'; ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 16; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const ck = seg(lt, 0.5, 1.3);
    ctx.beginPath(); ctx.moveTo(-70, 0); ctx.lineTo(lerp(-70, -15, clamp(ck * 2)), lerp(0, 60, clamp(ck * 2)));
    if (ck > 0.5) ctx.lineTo(lerp(-15, 85, (ck - 0.5) * 2), lerp(60, -70, (ck - 0.5) * 2)); ctx.stroke();
    ctx.restore();
    // orbiting cells
    const orb = [Draw.bcell, Draw.helperT, Draw.killerT, Draw.memory, Draw.dendritic];
    orb.forEach((f, i) => { const a = t * 0.3 + i * TAU / 5; f(ctx, sx + Math.cos(a) * 360, sy + Math.sin(a) * 200, 30, t + i, { alpha: sa * 0.8 * (1 - endA) }); });
    label(ctx, 420, 330, '不是百分之百保證', 'Not a 100% guarantee', '#a9b3c9', seg(lt, c[0] + 0.3, c[0] + 0.9) * (1 - endA), { size: 26 });
    label(ctx, 1500, 330, '最安全的方法之一', 'One of the safest ways', C.vaccine, seg(lt, c[1] + 0.4, c[1] + 1.0) * (1 - endA), { size: 26 });
    // doctor & pharmacist icons
    const da = seg(lt, c[2], c[2] + 0.7) * (1 - endA);
    if (da > 0) {
      [[520, 690, '醫師', 'Doctor'], [1400, 690, '藥師', 'Pharmacist']].forEach(([x, y, zh, en], i) => {
        ctx.save(); ctx.globalAlpha = da; glowCircle(ctx, x, y, 120, C.helper, 0.3);
        ctx.beginPath(); ctx.arc(x, y, 70, 0, TAU); ctx.fillStyle = 'rgba(12,28,60,0.9)'; ctx.fill(); ctx.strokeStyle = C.helper; ctx.lineWidth = 3; ctx.stroke();
        ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = 7; ctx.lineCap = 'round';
        if (i === 0) { // stethoscope
          ctx.beginPath(); ctx.moveTo(x - 25, y - 35); ctx.lineTo(x - 25, y); ctx.arc(x, y, 25, Math.PI, 0, true); ctx.lineTo(x + 25, y - 35); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x, y + 25); ctx.quadraticCurveTo(x + 5, y + 45, x + 30, y + 35); ctx.stroke(); ctx.beginPath(); ctx.arc(x + 34, y + 28, 9, 0, TAU); ctx.fill();
        } else { // capsule
          ctx.save(); ctx.translate(x, y); ctx.rotate(-0.7); rr(ctx, -40, -17, 80, 34, 17); ctx.stroke(); ctx.fillRect(0, -17, 40, 34);
          ctx.beginPath(); ctx.arc(40 - 17, 0, 17, -Math.PI / 2, Math.PI / 2); ctx.fill(); ctx.restore();
        }
        ctx.restore();
        label(ctx, x, y + 125, zh, en, C.helper, da, { size: 24 });
      });
    }
    // end card
    if (endA > 0) {
      heading(ctx, W / 2, 440, '疫苗怎麼作用？', 'How Do Vaccines Work?', endA, '#9ff7ea', 84);
      ctx.save(); ctx.globalAlpha = endA; ctx.textAlign = 'center'; ctx.fillStyle = C.sub; ctx.font = `500 24px ${FONT}`;
      ctx.fillText('本影片為衛教科普用途，不能取代專業醫療建議', W / 2, 620);
      ctx.fillText('For health education only — not a substitute for professional medical advice', W / 2, 660);
      ctx.restore();
      Draw.antibody(ctx, W / 2 - 360, 440, 50, -0.3, { alpha: endA }); Draw.antibody(ctx, W / 2 + 360, 440, 50, 0.3, { alpha: endA });
    }
  };

  // ---------- HUD ----------
  function fmt(s) { s = Math.max(0, Math.floor(s)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
  function hud(ctx, t, tl, ci, alpha) {
    const ch = tl.chapters[ci];
    // chapter chip (top-left)
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.font = `700 30px ${FONT}`; const wz = ctx.measureText(ch.zh).width;
    ctx.font = `500 19px ${FONT}`; const we = ctx.measureText(ch.en).width;
    const w = 96 + Math.max(wz, we) + 34;
    rr(ctx, 44, 36, w, 84, 20); ctx.fillStyle = 'rgba(7,14,32,0.78)'; ctx.fill(); ctx.strokeStyle = hexA(ACCENT[ci], 0.55); ctx.lineWidth = 2; ctx.stroke();
    rr(ctx, 56, 48, 64, 60, 14); ctx.fillStyle = hexA(ACCENT[ci], 0.18); ctx.fill();
    ctx.fillStyle = ACCENT[ci]; ctx.font = `800 30px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(String(ci + 1).padStart(2, '0'), 88, 89);
    ctx.textAlign = 'left'; ctx.fillStyle = C.text; ctx.font = `700 30px ${FONT}`; ctx.fillText(ch.zh, 136, 76);
    ctx.fillStyle = C.sub; ctx.font = `500 19px ${FONT}`; ctx.fillText(ch.en, 136, 104);
    // series title (top-right)
    ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(200,220,255,0.55)'; ctx.font = `600 22px ${FONT}`; ctx.fillText('疫苗怎麼作用？  How Do Vaccines Work?', W - 48, 72);
    // progress bar
    const x0 = 48, x1 = W - 48, y = 1046, bw = x1 - x0, D = tl.duration;
    tl.chapters.forEach((c, i) => {
      const a = x0 + (c.start / D) * bw + (i ? 3 : 0), b = x0 + (c.end / D) * bw - 3;
      rr(ctx, a, y, b - a, 8, 4); ctx.fillStyle = 'rgba(120,150,210,0.22)'; ctx.fill();
      const f = clamp((t - c.start) / (c.end - c.start));
      if (f > 0) { rr(ctx, a, y, Math.max(8, (b - a) * f), 8, 4); const g = ctx.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, '#3ce0c8'); g.addColorStop(1, '#4da3ff'); ctx.fillStyle = g; ctx.fill(); }
    });
    const px = x0 + (t / D) * bw;
    glowCircle(ctx, px, y + 4, 20, '#7cf3ff', 0.6); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(px, y + 4, 7, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(200,220,255,0.6)'; ctx.font = `600 18px ${FONT}`; ctx.textAlign = 'right'; ctx.fillText(`${fmt(t)} / ${fmt(D)}`, x1, y - 12);
    ctx.restore();
  }
  function subtitles(ctx, t, tl, mode) {
    if (mode === 'off') return;
    const cue = tl.cues.find(c => t >= c.start - 0.05 && t < c.end + 0.18);
    if (!cue) return;
    const a = clamp(Math.min((t - cue.start + 0.05) / 0.15, (cue.end + 0.18 - t) / 0.15));
    const showZh = mode !== 'en', showEn = mode !== 'zh';
    ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center';
    ctx.font = `700 46px ${FONT}`; const wz = showZh ? ctx.measureText(cue.zh).width : 0;
    ctx.font = `500 30px ${FONT}`; const we = showEn ? ctx.measureText(cue.en).width : 0;
    const w = Math.max(wz, we) + 64, h = (showZh ? 62 : 0) + (showEn ? 44 : 0) + 22;
    const yb = 1018;
    rr(ctx, W / 2 - w / 2, yb - h, w, h, 18); ctx.fillStyle = 'rgba(3,7,18,0.72)'; ctx.fill();
    let y = yb - h + 12;
    if (showZh) { ctx.fillStyle = '#ffffff'; ctx.font = `700 46px ${FONT}`; ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 6; ctx.fillText(cue.zh, W / 2, y + 48); y += 62; }
    if (showEn) { ctx.fillStyle = '#ffe9a8'; ctx.font = `500 30px ${FONT}`; ctx.shadowBlur = 4; ctx.fillText(cue.en, W / 2, y + 34); }
    ctx.restore();
  }

  function chapterAt(tl, t) {
    let i = tl.chapters.findIndex(c => t >= c.start && t < c.end);
    return i < 0 ? (t < 0 ? 0 : tl.chapters.length - 1) : i;
  }

  function render(ctx, t, tl, opts = {}) {
    const ci = chapterAt(tl, t), ch = tl.chapters[ci];
    ctx.save();
    ctx.setTransform(opts.scale || 1, 0, 0, opts.scale || 1, 0, 0);
    background(ctx, t, ACCENT[ci]);
    const cues = tl.cues.filter(c => c.ch === ci);
    const S = { t, lt: t - ch.start, D: ch.end - ch.start, c: cues.map(c => c.start - ch.start), e: cues.map(c => c.end - ch.start) };
    const fin = clamp(S.lt / 0.45), fout = ci === tl.chapters.length - 1 ? 1 : clamp((S.D - S.lt) / 0.4);
    const a = Math.min(fin, fout);
    ctx.save(); ctx.globalAlpha = a;
    const z = 1.025 - 0.025 * easeOut(fin);
    ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2);
    Scenes[ci](ctx, S);
    ctx.restore();
    hud(ctx, t, tl, ci, 1);
    subtitles(ctx, t, tl, opts.subs || 'both');
    ctx.restore();
  }

  global.VaxAnim = { W, H, render, Draw, C, label, FONT, chapterAt };
})(typeof window !== 'undefined' ? window : globalThis);

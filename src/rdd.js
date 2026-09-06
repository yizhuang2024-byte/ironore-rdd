// ═══════════════════════════════════════════════════════════════
// RDD 統計核心 — 局部多項式估計 + 穩健性檢定（RBA）
//
// 本模組不依賴任何外部統計套件，所有推論量均在此實作：
//   · Student-t 分布 CDF（正則化不完全 Beta 函數）
//   · 加權多項式最小平方 + HC1 三明治變異數
//   · 局部線性/二次 RDD 估計（三角/均勻/Epanechnikov 核）
//   · 帶寬選擇（ROT 經驗法則、留一交叉驗證）
//   · 隨機化推論、安慰劑斷點、Donut-hole、Jackknife
//
// ⚠️ 樣本僅 n=14 個颶風季。所有漸近推論（t 檢定、HC 變異數）在此
//    樣本量下都不可靠，因此隨機化推論（randomization inference）
//    才是主要的顯著性依據，t/p 值僅供對照。
// ═══════════════════════════════════════════════════════════════

// ── 特殊函數 ─────────────────────────────────────────────────
const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012,
  9.9843695780195716e-6, 1.5056327351493116e-7,
];

export function logGamma(z) {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  let x = 0.99999999999980993;
  LANCZOS.forEach((c, i) => { x += c / (z + i + 1); });
  const t = z + LANCZOS.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

// 連分數展開（Numerical Recipes betacf）
function betacf(a, b, x) {
  const TINY = 1e-30;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 3e-12) break;
  }
  return h;
}

/** 正則化不完全 Beta 函數 I_x(a,b) */
export function betai(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  return x < (a + 1) / (a + b + 2)
    ? (bt * betacf(a, b, x)) / a
    : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** Student-t 雙尾 p 值（取代原本的指數近似式） */
export function tTestP(t, df) {
  if (!isFinite(t) || !(df > 0)) return 1;
  return +betai(df / 2, 0.5, df / (df + t * t)).toFixed(4);
}

// ── 核函數 ───────────────────────────────────────────────────
export const KERNELS = {
  triangular: (u) => Math.max(0, 1 - Math.abs(u)),
  uniform: (u) => (Math.abs(u) <= 1 ? 1 : 0),
  epanechnikov: (u) => Math.max(0, 0.75 * (1 - u * u)),
};
export const KERNEL_LABELS = { triangular: '三角核', uniform: '均勻核', epanechnikov: 'Epanechnikov' };

// ── 線性代數 ─────────────────────────────────────────────────
function matInverse(A) {
  const n = A.length;
  const M = A.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-11) return null; // 奇異矩陣（點太少或共線）
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col];
    for (let j = 0; j < 2 * n; j++) M[col][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (!f) continue;
      for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[col][j];
    }
  }
  return M.map((row) => row.slice(n));
}

/**
 * 加權多項式最小平方，附 HC1 異質變異數穩健三明治變異數。
 * @returns {{beta:number[], V:number[][], resid:number[], n:number, k:number}|null}
 */
export function wls(xs, ys, ws, degree) {
  const k = degree + 1;
  const n = xs.length;
  if (n < k) return null;
  const X = xs.map((x) => Array.from({ length: k }, (_, j) => x ** j));
  const XtWX = Array.from({ length: k }, () => Array(k).fill(0));
  const XtWy = Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < k; a++) {
      XtWy[a] += ws[i] * X[i][a] * ys[i];
      for (let b = 0; b < k; b++) XtWX[a][b] += ws[i] * X[i][a] * X[i][b];
    }
  }
  const inv = matInverse(XtWX);
  if (!inv) return null;
  const beta = inv.map((row) => row.reduce((s, v, j) => s + v * XtWy[j], 0));
  const resid = ys.map((y, i) => y - X[i].reduce((s, v, j) => s + v * beta[j], 0));
  // meat = Σ wᵢ² eᵢ² xᵢ xᵢ'
  const meat = Array.from({ length: k }, () => Array(k).fill(0));
  const hc1 = n > k ? n / (n - k) : 1;
  for (let i = 0; i < n; i++) {
    const c = ws[i] ** 2 * resid[i] ** 2 * hc1;
    for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) meat[a][b] += c * X[i][a] * X[i][b];
  }
  const V = inv.map((rowA) =>
    inv.map((_, b) => {
      let s = 0;
      for (let p = 0; p < k; p++) for (let q = 0; q < k; q++) s += rowA[p] * meat[p][q] * inv[q][b];
      return s;
    }),
  );
  return { beta, V, resid, n, k };
}

/** 未加權簡單線性回歸（保留給散點趨勢線用） */
export function linReg(xs, ys) {
  const n = xs.length;
  if (n < 2) return { a: 0, b: 0, r2: 0 };
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let ss = 0, st = 0;
  xs.forEach((x, i) => { ss += (x - mx) * (ys[i] - my); st += (x - mx) ** 2; });
  const b = st ? ss / st : 0;
  const a = my - b * mx;
  const sst = ys.reduce((s, v) => s + (v - my) ** 2, 0);
  const sse = ys.reduce((s, v, i) => s + (v - (a + b * xs[i])) ** 2, 0);
  return { a, b, r2: sst ? Math.max(0, 1 - sse / sst) : 0 };
}

// ── RDD 局部多項式估計 ───────────────────────────────────────
/**
 * 銳型 RDD 局部多項式估計。
 * @param {object} o
 * @param {number[]} o.rv     跑動變數減斷點後的值（0 = 斷點）
 * @param {number[]} o.y      結果變數
 * @param {number}   o.h      帶寬（絕對值，非倍數）
 * @param {string}   o.kernel 核函數名稱
 * @param {number}   o.poly   多項式階數（0=均值差、1=局部線性、2=局部二次）
 * @param {number}   o.donut  甜甜圈半徑，剔除 |rv| < donut 的觀測
 */
export function rdEstimate({ rv, y, h, kernel = 'triangular', poly = 1, donut = 0 }) {
  const K = KERNELS[kernel] || KERNELS.triangular;
  const side = (isRight) => {
    const xs = [], ys = [], ws = [], idx = [];
    rv.forEach((v, i) => {
      if (Math.abs(v) > h || Math.abs(v) < donut) return;
      if (isRight ? v < 0 : v >= 0) return;
      const w = K(v / h);
      if (w <= 0) return;
      xs.push(v); ys.push(y[i]); ws.push(w); idx.push(i);
    });
    return { xs, ys, ws, idx };
  };
  const L = side(false), R = side(true);
  const need = poly + 2; // 每側至少要比參數數多一個點才有殘差自由度
  const base = {
    valid: false, ate: 0, se: 0, t: 0, p: 1, ci: [0, 0], d: 0,
    nc: L.xs.length, nt: R.xs.length, cm: 0, tm: 0, h, kernel, poly, donut,
    fitL: null, fitR: null,
  };
  const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
  base.cm = +mean(L.ys).toFixed(2);
  base.tm = +mean(R.ys).toFixed(2);
  if (L.xs.length < need || R.xs.length < need) return base;

  const fL = wls(L.xs, L.ys, L.ws, poly);
  const fR = wls(R.xs, R.ys, R.ws, poly);
  if (!fL || !fR) return base;

  const ate = fR.beta[0] - fL.beta[0];
  const varSum = fL.V[0][0] + fR.V[0][0];
  const se = varSum > 0 ? Math.sqrt(varSum) : 0;
  const df = Math.max(L.xs.length + R.xs.length - 2 * (poly + 1), 1);
  const t = se > 0 ? ate / se : 0;
  // Cohen's d 用併組標準差（描述性，未加權）
  const sd = (a, m) => (a.length > 1 ? Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)) : 0);
  const sL = sd(L.ys, mean(L.ys)), sR = sd(R.ys, mean(R.ys));
  const nL = L.ys.length, nR = R.ys.length;
  const sp = nL + nR > 2
    ? Math.sqrt(((nL - 1) * sL ** 2 + (nR - 1) * sR ** 2) / (nL + nR - 2))
    : 0;
  const tCrit = 1.96 + 2.4 / df; // t 分布 95% 臨界值的簡易近似（df 小時較保守）
  return {
    ...base,
    valid: true,
    ate: +ate.toFixed(2),
    se: +se.toFixed(3),
    t: +t.toFixed(3),
    p: tTestP(t, df),
    df,
    ci: [+(ate - tCrit * se).toFixed(2), +(ate + tCrit * se).toFixed(2)],
    d: sp ? +((mean(R.ys) - mean(L.ys)) / sp).toFixed(3) : 0,
    fitL: fL, fitR: fR,
    xsL: L.xs, xsR: R.xs, idxL: L.idx, idxR: R.idx,
  };
}

// ── 帶寬選擇 ─────────────────────────────────────────────────
/** Silverman/IK 型經驗法則帶寬：1.84 · SD(rv) · n^(−1/5) */
export function rotBandwidth(rv) {
  const n = rv.length;
  if (n < 2) return 0;
  const m = rv.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(rv.reduce((s, v) => s + (v - m) ** 2, 0) / (n - 1));
  return +(1.84 * sd * n ** (-1 / 5)).toFixed(3);
}

/**
 * 留一交叉驗證帶寬：對每個觀測，用同側、距離 h 內的其他點做局部線性
 * 外推到該點，取 CV 誤差最小的 h。小樣本下比漸近公式務實。
 */
export function cvBandwidth(rv, y, grid) {
  let best = null;
  grid.forEach((h) => {
    let sse = 0, used = 0;
    rv.forEach((v0, i) => {
      const xs = [], ys = [], ws = [];
      rv.forEach((v, j) => {
        if (j === i) return;
        if (Math.abs(v - v0) > h) return;
        if ((v0 >= 0) !== (v >= 0)) return; // 只用同側的點，不跨斷點外推
        const w = KERNELS.triangular((v - v0) / h);
        if (w <= 0) return;
        xs.push(v - v0); ys.push(y[j]); ws.push(w);
      });
      if (xs.length < 3) return;
      const f = wls(xs, ys, ws, 1);
      if (!f) return;
      sse += (y[i] - f.beta[0]) ** 2;
      used += 1;
    });
    if (used < Math.max(4, rv.length * 0.4)) return; // 覆蓋率太低的帶寬不採計
    const mse = sse / used;
    if (!best || mse < best.mse) best = { h, mse: +mse.toFixed(3), used };
  });
  return best;
}

// ── 穩健性檢定（RBA） ────────────────────────────────────────
/** 帶寬敏感度曲線 */
export function bandwidthCurve(rv, y, grid, opts = {}) {
  return grid.map((h) => {
    const r = rdEstimate({ rv, y, h, ...opts });
    return {
      h: +h.toFixed(2),
      ate: r.valid ? r.ate : null,
      lo: r.valid ? r.ci[0] : null,
      hi: r.valid ? r.ci[1] : null,
      p: r.valid ? r.p : null,
      n: r.nc + r.nt,
      nc: r.nc, nt: r.nt,
      valid: r.valid,
    };
  });
}

/** 多項式階數 × 核函數的規格曲線 */
export function specificationGrid(rv, y, h, polys = [0, 1, 2], kernels = ['triangular', 'uniform', 'epanechnikov']) {
  const out = [];
  polys.forEach((poly) => kernels.forEach((kernel) => {
    const r = rdEstimate({ rv, y, h, poly, kernel });
    out.push({ poly, kernel, ate: r.valid ? r.ate : null, se: r.se, p: r.valid ? r.p : null, nc: r.nc, nt: r.nt, valid: r.valid });
  }));
  return out;
}

/** Donut-hole：逐步剔除斷點附近的觀測，看估計是否由邊界點驅動 */
export function donutScan(rv, y, h, radii, opts = {}) {
  return radii.map((donut) => {
    const r = rdEstimate({ rv, y, h, donut, ...opts });
    return { donut, ate: r.valid ? r.ate : null, p: r.valid ? r.p : null, nc: r.nc, nt: r.nt, valid: r.valid };
  });
}

/** Jackknife：逐季剔除，找出影響力最大的觀測並算刀切標準誤 */
export function jackknife(rv, y, h, opts = {}) {
  const full = rdEstimate({ rv, y, h, ...opts });
  const reps = [];
  rv.forEach((_, i) => {
    const rv2 = rv.filter((__, j) => j !== i);
    const y2 = y.filter((__, j) => j !== i);
    const r = rdEstimate({ rv: rv2, y: y2, h, ...opts });
    reps.push({ i, ate: r.valid ? r.ate : null, valid: r.valid });
  });
  const ok = reps.filter((r) => r.valid).map((r) => r.ate);
  let seJack = 0;
  if (ok.length > 1) {
    const m = ok.reduce((s, v) => s + v, 0) / ok.length;
    seJack = Math.sqrt(((ok.length - 1) / ok.length) * ok.reduce((s, v) => s + (v - m) ** 2, 0));
  }
  return { full: full.valid ? full.ate : null, reps, seJack: +seJack.toFixed(3), min: ok.length ? Math.min(...ok) : null, max: ok.length ? Math.max(...ok) : null };
}

/**
 * 隨機化推論（Freedman–Lane 殘差置換）。
 * 先在帶寬窗內配適「無處置效果」的簡化模型（共同截距＋共同斜率），
 * 取殘差重新排列後加回配適值，再重算 ATE，得到不依賴漸近理論的 p 值。
 * 直接洗牌 y 會把跑動變數的斜率誤算成處置效果的變異，使檢定過度保守；
 * 殘差置換保留斜率結構，在 n=14 這種小樣本下才有可用的檢定力。
 * 使用固定種子的偽隨機數，確保 UI 重繪時結果一致。
 */
export function randomizationTest(rv, y, h, opts = {}, maxDraws = 2000) {
  const inWin = [];
  rv.forEach((v, i) => { if (Math.abs(v) <= h) inWin.push(i); });
  const n = inWin.length;
  const nR = inWin.filter((i) => rv[i] >= 0).length;
  const obs = rdEstimate({ rv, y, h, ...opts });
  const fail = { valid: false, p: 1, obs: obs.valid ? obs.ate : null, draws: 0, dist: [], nWin: n };
  if (!obs.valid || n < 4 || nR === 0 || nR === n) return fail;

  const xsWin = inWin.map((i) => rv[i]);
  const ysWin = inWin.map((i) => y[i]);
  const K = KERNELS[opts.kernel || 'triangular'] || KERNELS.triangular;
  const wsWin = xsWin.map((v) => Math.max(K(v / h), 1e-6));
  const reduced = wls(xsWin, ysWin, wsWin, 1); // 虛無模型：跨斷點無跳躍
  if (!reduced) return fail;
  const fitted = xsWin.map((v) => reduced.beta[0] + reduced.beta[1] * v);
  const resid = ysWin.map((v, i) => v - fitted[i]);

  const rng = (() => { let s = 20260906; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; })();
  const stats = [];
  for (let d = 0; d < maxDraws; d++) {
    const perm = resid.slice();
    for (let i = perm.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    const yStar = fitted.map((f, i) => f + perm[i]);
    const r = rdEstimate({ rv: xsWin, y: yStar, h, ...opts });
    if (r.valid) stats.push(r.ate);
  }
  if (stats.length < 50) return { ...fail, draws: stats.length };
  const extreme = stats.filter((s) => Math.abs(s) >= Math.abs(obs.ate)).length;
  return {
    valid: true,
    obs: obs.ate,
    draws: stats.length,
    nWin: n,
    p: +((extreme + 1) / (stats.length + 1)).toFixed(4), // 加一修正，避免 p=0
    dist: stats,
  };
}

/**
 * 安慰劑斷點：把斷點移到別處重估。真實效果應該只在真斷點出現。
 * 回傳每個假斷點的 ATE，以及 |假 ATE| ≥ |真 ATE| 的比例（安慰劑 p 值）。
 */
export function placeboCutoffs(x, y, trueCut, h, opts = {}) {
  const sorted = [...x].sort((a, b) => a - b);
  const q = (p) => {
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };
  const lo = q(0.2), hi = q(0.8);
  const steps = 25;
  const rows = [];
  for (let s = 0; s <= steps; s++) {
    const c = lo + ((hi - lo) * s) / steps;
    const rv = x.map((v) => v - c);
    const r = rdEstimate({ rv, y, h, ...opts });
    rows.push({
      cut: +c.toFixed(2),
      ate: r.valid ? r.ate : null,
      isTrue: Math.abs(c - trueCut) < 1e-9,
      near: Math.abs(c - trueCut) <= h / 2,
      valid: r.valid,
    });
  }
  const real = rdEstimate({ rv: x.map((v) => v - trueCut), y, h, ...opts });
  const far = rows.filter((r) => r.valid && !r.near);
  const extreme = far.filter((r) => Math.abs(r.ate) >= Math.abs(real.ate)).length;
  return {
    rows,
    trueAte: real.valid ? real.ate : null,
    nFar: far.length,
    extreme,
    p: far.length ? +((extreme + 1) / (far.length + 1)).toFixed(3) : null,
  };
}

/** 密度／堆疊診斷：斷點兩側的觀測數是否失衡（McCrary 檢定的小樣本替代） */
export function densityCheck(rv, h) {
  const nL = rv.filter((v) => v < 0 && Math.abs(v) <= h).length;
  const nR = rv.filter((v) => v >= 0 && Math.abs(v) <= h).length;
  const n = nL + nR;
  if (n < 2) return { nL, nR, z: 0, p: 1 };
  // 二項檢定的常態近似：H0 為兩側各半
  const z = (nR - n / 2) / Math.sqrt(n / 4);
  const p = +(2 * (1 - normCDF(Math.abs(z)))).toFixed(3);
  return { nL, nR, z: +z.toFixed(2), p };
}

function normCDF(z) {
  // Abramowitz & Stegun 26.2.17
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-(z * z) / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}

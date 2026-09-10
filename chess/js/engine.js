/*
 * engine.js — 對弈用的電腦棋手
 *
 * 作法是標準的 alpha-beta 搜尋加上迭代加深：
 *   ・局面評估 = 子力價值 + 位置價值表（PST）
 *   ・搜尋時對同一個棋盤陣列做「走 / 還原」，不複製棋盤
 *   ・走法排序把吃子（依 MVV-LVA）排前面，剪枝效率差很多
 *   ・葉節點再做一層只算吃子的靜態搜尋，避免「地平線效應」
 *     （剛好在交換到一半的時候停下來，把局面評估得離譜）
 *
 * 規則判斷一律呼叫 rules.js，這裡不重複實作任何規則，
 * 以免兩邊對規則的理解出現分歧。
 */
(function (root) {
  'use strict';
  const XQ = root.XQ;
  const { W, H, at, rowOf, colOf, RED, BLACK, opposite, colorOf, typeOf } = XQ;

  const MATE = 100000;          // 將死的分數
  const INF = 1e9;

  /* ── 子力價值 ─────────────────────────────────────────── */
  const VALUE = { K: 60000, R: 900, C: 450, N: 400, A: 200, B: 200, P: 100 };

  /* ── 位置價值表 ───────────────────────────────────────────
   * 以紅方視角建表（row 0 是對方底線），黑方用上下鏡射。
   */
  function makeTables() {
    const blank = () => new Int32Array(90);
    const T = { K: blank(), A: blank(), B: blank(), N: blank(), R: blank(), C: blank(), P: blank() };

    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const i = at(r, c);
        const central = c >= 3 && c <= 5 ? 1 : (c >= 2 && c <= 6 ? 0.5 : 0);
        const edge = (c === 0 || c === W - 1) ? 1 : 0;

        // 兵：過河才有價值，越接近對方九宮越強，但沉到底線反而用處變小
        const pawnRow = [60, 70, 55, 35, 20, 5, 0, 0, 0, 0][r];
        T.P[i] = pawnRow + (r <= 4 ? central * 10 : 0);

        // 馬：怕邊怕角，過河到中路最有力
        T.N[i] = -12 * edge + (r >= 2 && r <= 6 ? 10 + central * 6 : 0) - (r === 9 ? 6 : 0);

        // 炮：中路（當頭炮）與沉底線都有價值，邊路較差
        T.C[i] = central * 8 - 5 * edge + (r === 0 ? 6 : 0) + (r >= 5 && r <= 7 ? 4 : 0);

        // 車：越過河越活躍，對方的底二路特別可怕
        T.R[i] = (9 - r) * 3 + central * 6 + (r <= 1 ? 12 : 0);

        // 仕相：待在標準防守位置，避免電腦沒事亂晃
        T.A[i] = 0;
        T.B[i] = 0;

        // 帥：留在底線最安全，往前走要扣分
        T.K[i] = r === 9 ? 8 : (r === 8 ? -8 : -25);
      }
    }
    // 仕相的標準位置
    for (const [r, c, v] of [[9, 3, 6], [9, 5, 6], [8, 4, 10]]) T.A[at(r, c)] = v;
    for (const [r, c, v] of [[9, 2, 6], [9, 6, 6], [7, 0, 4], [7, 4, 10], [7, 8, 4], [5, 2, 3], [5, 6, 3]])
      T.B[at(r, c)] = v;
    return T;
  }
  const PST_RED = makeTables();
  // 黑方鏡射：黑方的 (r,c) 等於紅方的 (9-r,c)
  const PST_BLACK = (() => {
    const out = {};
    for (const k in PST_RED) {
      const t = new Int32Array(90);
      for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) t[at(r, c)] = PST_RED[k][at(H - 1 - r, c)];
      out[k] = t;
    }
    return out;
  })();

  /* ── 查表 ──────────────────────────────────────────────────
   * 搜尋的熱路徑上每一步都要算分。typeOf()／colorOf() 會做
   * toUpperCase() 這類字串運算，在每秒數十萬次的呼叫下代價很高，
   * 因此先把「棋子字元 → 各格的帶號分數」整張表算好。
   */
  const CONTRIB = {};      // 字元 → Int32Array(90)，已含正負號（紅正黑負）
  const CHAR_VALUE = {};   // 字元 → 子力價值（排序用，不帶號）
  for (const t of ['K', 'A', 'B', 'N', 'R', 'C', 'P']) {
    const red = new Int32Array(90), black = new Int32Array(90);
    for (let i = 0; i < 90; i++) {
      red[i] = VALUE[t] + PST_RED[t][i];
      black[i] = -(VALUE[t] + PST_BLACK[t][i]);
    }
    CONTRIB[t] = red;
    CONTRIB[t.toLowerCase()] = black;
    CHAR_VALUE[t] = VALUE[t];
    CHAR_VALUE[t.toLowerCase()] = VALUE[t];
  }

  /* ── 局面評估（回傳紅方視角的分數） ───────────────────── */
  function evaluate(board, table) {
    const C = table || CONTRIB;
    let score = 0;
    for (let i = 0; i < 90; i++) {
      const p = board[i];
      if (p) score += C[p][i];
    }
    return score;
  }

  /* ── 搜尋 ─────────────────────────────────────────────── */
  class Engine {
    constructor() {
      this.nodes = 0;
      this.aborted = false;
    }

    /**
     * 準備這一手要用的分數表。
     *
     * 弱等級不是靠「隨機挑一個還不錯的著法」來變弱——那樣會挑到根本沒算過
     * 的爛棋。這裡改成在評估表上加一點隨機偏差：搜尋過程本身完全自洽
     * （alpha-beta 依然正確、照樣找得到殺棋），只是對局面的價值判斷會略有
     * 偏差，因此棋力自然下降，而且每一局都不一樣。
     */
    _prepareTable(noise) {
      if (!noise) { this.C = CONTRIB; return; }
      const C = {};
      for (const ch in CONTRIB) {
        const src = CONTRIB[ch];
        const dst = new Int32Array(90);
        const sign = ch === ch.toUpperCase() ? 1 : -1;
        for (let i = 0; i < 90; i++) {
          dst[i] = src[i] + sign * Math.round((Math.random() * 2 - 1) * noise);
        }
        C[ch] = dst;
      }
      this.C = C;
    }

    // 走 / 還原：直接改同一個陣列，比每步複製棋盤快得多。
    // 同時增量更新分數，這樣葉節點不必再掃過整個棋盤。
    _make(from, to) {
      const b = this.b;
      const moving = b[from];
      const cap = b[to];
      const C = this.C;
      this.score += C[moving][to] - C[moving][from];
      if (cap) this.score -= C[cap][to];
      b[to] = moving;
      b[from] = '';
      if (moving === 'K') this.kr = to;
      else if (moving === 'k') this.kb = to;
      return cap;
    }

    _unmake(from, to, cap) {
      const b = this.b;
      const moving = b[to];
      b[from] = moving;
      b[to] = cap;
      const C = this.C;
      this.score += C[moving][from] - C[moving][to];
      if (cap) this.score += C[cap][to];
      if (moving === 'K') this.kr = from;
      else if (moving === 'k') this.kb = from;
    }

    // 兩將照面（白臉將）
    _facing() {
      if (this.kr < 0 || this.kb < 0) return false;
      const c = colOf(this.kr);
      if (c !== colOf(this.kb)) return false;
      const b = this.b;
      for (let r = rowOf(this.kb) + 1, end = rowOf(this.kr); r < end; r++) {
        if (b[at(r, c)]) return false;
      }
      return true;
    }

    _inCheck(side) {
      const king = side === RED ? this.kr : this.kb;
      if (king < 0) return true;
      if (this._facing()) return true;
      return XQ.isAttacked(this.b, king, opposite(side));
    }

    /** 目前局面下 side 的所有合法著法 */
    _legal(side) {
      const out = [];
      for (const m of XQ.genMoves(this.b, side)) {
        const cap = this._make(m.from, m.to);
        if (!this._inCheck(side)) {
          m.cap = cap;
          out.push(m);
        }
        this._unmake(m.from, m.to, cap);
      }
      return out;
    }

    /** 走法排序：吃大子用小子優先（MVV-LVA），其餘按歷史分數 */
    _order(moves) {
      for (const m of moves) {
        if (m.cap) {
          m.score = 1e6 + CHAR_VALUE[m.cap] * 8 - CHAR_VALUE[this.b[m.from]];
        } else {
          m.score = this.history[m.from * 90 + m.to] || 0;
        }
      }
      moves.sort((a, b) => b.score - a.score);
      return moves;
    }

    _timeUp() {
      if (this.aborted) return true;
      // 每 1024 個節點才看一次時鐘，避免 Date.now() 成為瓶頸
      if ((++this.nodes & 1023) === 0 && Date.now() > this.deadline) this.aborted = true;
      return this.aborted;
    }

    /** 靜態搜尋：只往下算吃子，把局面算到「沒得吃」才評估 */
    _quiesce(side, alpha, beta, qdepth, ply) {
      if (this._timeUp()) return 0;
      const sign = side === RED ? 1 : -1;

      if (this._inCheck(side)) {
        // 被將軍時不能停下來評估，必須把應將的著法算完
        if (qdepth <= 0) return sign * this.score;
        const moves = this._order(this._legal(side));
        if (moves.length === 0) return -(MATE - ply);
        let best = -INF;
        for (const m of moves) {
          const cap = this._make(m.from, m.to);
          const v = -this._quiesce(opposite(side), -beta, -alpha, qdepth - 1, ply + 1);
          this._unmake(m.from, m.to, cap);
          if (this.aborted) return 0;
          if (v > best) best = v;
          if (best > alpha) alpha = best;
          if (alpha >= beta) break;
        }
        return best;
      }

      const stand = sign * this.score;
      if (stand >= beta) return stand;
      if (stand > alpha) alpha = stand;
      if (qdepth <= 0) return stand;

      let best = stand;
      const caps = this._order(this._legal(side).filter((m) => m.cap));
      for (const m of caps) {
        const cap = this._make(m.from, m.to);
        const v = -this._quiesce(opposite(side), -beta, -alpha, qdepth - 1, ply + 1);
        this._unmake(m.from, m.to, cap);
        if (this.aborted) return 0;
        if (v > best) best = v;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
      }
      return best;
    }

    _alphaBeta(side, depth, alpha, beta, ply) {
      if (this._timeUp()) return 0;
      if (depth <= 0) return this._quiesce(side, alpha, beta, 6, ply);

      const moves = this._order(this._legal(side));
      // 象棋中被將死與困斃（無著可走）同樣判負
      if (moves.length === 0) return -(MATE - ply);

      let best = -INF;
      for (const m of moves) {
        const cap = this._make(m.from, m.to);
        const v = -this._alphaBeta(opposite(side), depth - 1, -beta, -alpha, ply + 1);
        this._unmake(m.from, m.to, cap);
        if (this.aborted) return 0;
        if (v > best) best = v;
        if (best > alpha) {
          alpha = best;
          if (!m.cap) this.history[m.from * 90 + m.to] = (this.history[m.from * 90 + m.to] || 0) + depth * depth;
        }
        if (alpha >= beta) break;
      }
      return best;
    }

    /**
     * 找出 side 的一手棋。
     * @param {string[]} board 棋盤
     * @param {string} side 走棋方
     * @param {object} opts maxDepth 最大深度、timeMs 時間上限、
     *   slack 容許誤差（在最佳分數這個範圍內的著法隨機選一個，讓每局不一樣）、
     *   avoid 應避免重複的局面 key 集合
     * @returns {{move:{from,to}, score:number, depth:number, nodes:number}|null}
     */
    think(board, side, opts) {
      const o = Object.assign({ maxDepth: 4, timeMs: 1000, slack: 0, noise: 0, avoid: null }, opts || {});
      this.b = board.slice();
      this.kr = XQ.findKing(this.b, RED);
      this.kb = XQ.findKing(this.b, BLACK);
      this._prepareTable(o.noise);
      this.score = evaluate(this.b, this.C);   // 之後由 _make/_unmake 增量維護
      this.history = {};
      this.nodes = 0;
      this.aborted = false;
      this.deadline = Date.now() + o.timeMs;

      let roots = this._order(this._legal(side));
      if (roots.length === 0) return null;

      let bestList = [{ move: roots[0], score: -INF, exact: true }];
      let reachedDepth = 0;

      for (let depth = 1; depth <= o.maxDepth; depth++) {
        const scored = [];
        let alpha = -INF;
        for (const m of roots) {
          // 搜尋窗的上界要放寬 slack，這樣「和最佳著法只差 slack 以內」的著法
          // 才會拿到精確分數。若直接用 alpha 當上界，這些著法只會得到一個
          // 上界值（可能剛好等於 alpha），拿去比較就會誤選到根本沒算過的爛棋。
          const floor = alpha === -INF ? -INF : alpha - o.slack;
          const childBeta = floor === -INF ? INF : -floor;
          const cap = this._make(m.from, m.to);
          let v = -this._alphaBeta(opposite(side), depth - 1, -INF, childBeta, 1);
          // 避免無意義的重複局面
          if (o.avoid && o.avoid.has(XQ.toFen(this.b, opposite(side)))) v -= 60;
          this._unmake(m.from, m.to, cap);
          if (this.aborted) break;
          // 超過下界才是精確值；沒超過的只是上界，不能拿來挑選
          scored.push({ move: m, score: v, exact: floor === -INF || v > floor });
          if (v > alpha) alpha = v;
        }
        if (this.aborted) break;

        scored.sort((a, b) => b.score - a.score);
        bestList = scored;
        reachedDepth = depth;
        roots = scored.map((s) => s.move);          // 下一層先搜這一層的好棋
        if (scored[0].score >= MATE - 100) break;    // 已經找到殺棋，不必再深入
      }

      const top = bestList[0].score;
      const pool = bestList.filter((s) => s.exact && s.score >= top - o.slack);
      const pick = (pool.length ? pool : bestList)[
        Math.floor(Math.random() * (pool.length || 1))];
      return {
        move: { from: pick.move.from, to: pick.move.to },
        score: pick.score,
        depth: reachedDepth,
        nodes: this.nodes,
      };
    }
  }

  const LEVELS = {
    easy: { name: '初級', maxDepth: 2, timeMs: 500, noise: 55, slack: 0 },
    normal: { name: '中級', maxDepth: 4, timeMs: 1200, noise: 15, slack: 0 },
    hard: { name: '高級', maxDepth: 6, timeMs: 2500, noise: 0, slack: 0 },
  };

  root.XQEngine = { Engine, evaluate, VALUE, LEVELS, MATE };
})(window);

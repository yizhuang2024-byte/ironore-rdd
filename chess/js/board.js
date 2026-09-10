/*
 * board.js — 可動畫的象棋棋盤元件
 *
 * 棋子以絕對定位擺放，換位置時交由 CSS transition 產生滑動動畫，
 * 因此每一步都看得到棋子實際「走」過去的過程。
 */
(function (root) {
  'use strict';
  const XQ = root.XQ;
  const { W, H, at, rowOf, colOf } = XQ;

  const CN_DIGITS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const U = 100;                      // SVG 每格單位
  const GW = (W - 1) * U, GH = (H - 1) * U;

  function el(tag, cls, attrs) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }
  function svgEl(tag, attrs) {
    const n = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  /* ── 棋盤線條 ─────────────────────────────────────────── */
  function buildGrid() {
    // viewBox 必須剛好等於「交叉點範圍」，才會與棋子的百分比定位對齊；
    // 外框畫在 viewBox 之外，靠 overflow:visible 顯示。
    const svg = svgEl('svg', {
      class: 'xq-grid',
      viewBox: `0 0 ${GW} ${GH}`,
      preserveAspectRatio: 'none',
    });

    const line = (x1, y1, x2, y2, cls) =>
      svg.appendChild(svgEl('line', { x1, y1, x2, y2, class: cls || 'xq-line' }));

    // 橫線 10 條
    for (let r = 0; r < H; r++) line(0, r * U, GW, r * U);
    // 直線：中間 7 條在楚河漢界處斷開
    line(0, 0, 0, GH);
    line(GW, 0, GW, GH);
    for (let c = 1; c < W - 1; c++) {
      line(c * U, 0, c * U, 4 * U);
      line(c * U, 5 * U, c * U, GH);
    }
    // 九宮斜線
    line(3 * U, 0, 5 * U, 2 * U); line(5 * U, 0, 3 * U, 2 * U);
    line(3 * U, 7 * U, 5 * U, 9 * U); line(5 * U, 7 * U, 3 * U, 9 * U);
    // 外框
    svg.appendChild(svgEl('rect', {
      x: -U * 0.18, y: -U * 0.18, width: GW + U * 0.36, height: GH + U * 0.36,
      class: 'xq-border', fill: 'none',
    }));

    // 炮位與兵位的「星位」標記
    const stars = [[2,1],[2,7],[3,0],[3,2],[3,4],[3,6],[3,8],
                   [6,0],[6,2],[6,4],[6,6],[6,8],[7,1],[7,7]];
    for (const [r, c] of stars) {
      const x = c * U, y = r * U, d = 9, g = 5;
      for (const [sx, sy] of [[-1,-1],[1,-1],[-1,1],[1,1]]) {
        if ((c === 0 && sx < 0) || (c === W - 1 && sx > 0)) continue;
        const px = x + sx * g, py = y + sy * g;
        svg.appendChild(svgEl('path', {
          class: 'xq-star',
          d: `M ${px} ${py + sy * d} L ${px} ${py} L ${px + sx * d} ${py}`,
          fill: 'none',
        }));
      }
    }

    // 楚河漢界
    const t = (x, txt) => {
      const n = svgEl('text', { x, y: 4.5 * U, class: 'xq-river-text' });
      n.textContent = txt;
      svg.appendChild(n);
    };
    t(GW * 0.27, '楚 河'); t(GW * 0.73, '漢 界');
    return svg;
  }

  /* ── 棋盤元件 ─────────────────────────────────────────── */
  class Board {
    /**
     * @param {HTMLElement} host  容器
     * @param {object} opts
     *   interactive  是否可點擊走子
     *   onMove(from,to)  使用者走子時的回呼
     *   coords       是否顯示路數座標
     */
    constructor(host, opts) {
      this.opts = Object.assign({ interactive: false, coords: true }, opts || {});
      this.board = new Array(90).fill('');
      this.side = XQ.RED;
      this.selected = -1;
      this.hints = [];
      this.locked = false;
      this._pieces = new Map();     // id → {el, code, index}
      this._occ = new Array(90).fill(null);
      this._seq = 0;

      host.classList.add('xq-host');
      host.innerHTML = '';

      if (this.opts.coords) host.appendChild(this._coordBar('top'));

      const frame = el('div', 'xq-frame');
      const inner = el('div', 'xq-inner');
      inner.appendChild(buildGrid());
      this.layerMark = el('div', 'xq-layer xq-marks');
      this.layerPiece = el('div', 'xq-layer xq-pieces');
      inner.append(this.layerMark, this.layerPiece);
      frame.appendChild(inner);
      host.appendChild(frame);

      if (this.opts.coords) host.appendChild(this._coordBar('bottom'));

      this.inner = inner;
      inner.addEventListener('click', (e) => this._onClick(e));
      this.host = host;
    }

    _coordBar(which) {
      const flipped = !!this.opts.flipped;
      // 未翻轉時上方是黑方；翻轉後（黑方在下）兩條座標列互換
      const blackSide = (which === 'top') !== flipped;
      const bar = el('div', 'xq-coords xq-coords-' + which);
      for (let i = 0; i < W; i++) {
        const col = flipped ? W - 1 - i : i;
        const n = el('span', null);
        // 黑方由黑方右手邊起算 1~9；紅方由紅方右手邊起算 一~九（紅方路數 = 9 - col）
        n.textContent = blackSide ? String(col + 1) : CN_DIGITS[W - 1 - col];
        n.style.left = (i / (W - 1)) * 100 + '%';     // 與棋子用同一套定位
        bar.appendChild(n);
      }
      return bar;
    }

    /* 座標換算（翻轉時等於把棋盤旋轉 180 度） */
    _place(node, index) {
      const f = !!this.opts.flipped;
      const col = f ? W - 1 - colOf(index) : colOf(index);
      const row = f ? H - 1 - rowOf(index) : rowOf(index);
      node.style.left = (col / (W - 1)) * 100 + '%';
      node.style.top = (row / (H - 1)) * 100 + '%';
    }

    /* ── 設定局面（不做動畫） ─────────────────────────── */
    setPosition(board, side) {
      this.board = board.slice();
      if (side) this.side = side;
      this.selected = -1;
      this.layerPiece.innerHTML = '';
      this._pieces.clear();
      this._occ.fill(null);
      for (let i = 0; i < 90; i++) if (this.board[i]) this._spawn(this.board[i], i);
      this.clearMarks();
      this.renderHints();
    }

    setFen(fen) {
      const p = XQ.parseFen(fen);
      this.setPosition(p.board, p.side);
    }

    _spawn(code, index) {
      const id = ++this._seq;
      const node = el('div', 'xq-piece ' + (XQ.colorOf(code) === XQ.RED ? 'red' : 'black'));
      node.dataset.id = id;
      const face = el('span', 'xq-face');
      face.textContent = XQ.NAMES[XQ.colorOf(code)][XQ.typeOf(code)];
      node.appendChild(face);
      this._place(node, index);
      this.layerPiece.appendChild(node);
      this._pieces.set(id, { el: node, code, index });
      this._occ[index] = id;
      return id;
    }

    /* ── 走一步（有動畫） ──────────────────────────────── */
    move(from, to, opts) {
      const dur = (opts && opts.duration) != null ? opts.duration : 380;
      const id = this._occ[from];
      if (id == null) { // 保險：資料不同步時直接重繪
        this.board = XQ.applyMove(this.board, { from, to });
        this.setPosition(this.board, this.side);
        return Promise.resolve();
      }
      const capturedId = this._occ[to];
      if (capturedId != null) {
        const cap = this._pieces.get(capturedId);
        cap.el.classList.add('captured');
        this._pieces.delete(capturedId);
        setTimeout(() => cap.el.remove(), dur + 60);
      }

      const p = this._pieces.get(id);
      this._occ[from] = null;
      this._occ[to] = id;
      p.index = to;
      p.el.style.transitionDuration = dur + 'ms';
      p.el.classList.add('moving');
      this._place(p.el, to);

      this.board = XQ.applyMove(this.board, { from, to });
      this.side = XQ.opposite(XQ.colorOf(p.code));
      this.selected = -1;
      this.markMove(from, to);
      this.renderHints();

      return new Promise((res) => setTimeout(() => {
        p.el.classList.remove('moving');
        this._flagCheck();
        res();
      }, dur + 20));
    }

    /* ── 標記 ─────────────────────────────────────────── */
    clearMarks() {
      this.layerMark.innerHTML = '';
      this.layerPiece.querySelectorAll('.sel,.in-check')
        .forEach((n) => n.classList.remove('sel', 'in-check'));
    }

    markMove(from, to) {
      this.layerMark.innerHTML = '';
      for (const [i, cls] of [[from, 'from'], [to, 'to']]) {
        const m = el('div', 'xq-mark xq-last ' + cls);
        this._place(m, i);
        this.layerMark.appendChild(m);
      }
      this._lastMove = [from, to];
    }

    _flagCheck() {
      this.layerPiece.querySelectorAll('.in-check').forEach((n) => n.classList.remove('in-check'));
      for (const s of [XQ.RED, XQ.BLACK]) {
        if (XQ.inCheck(this.board, s)) {
          const k = XQ.findKing(this.board, s);
          const id = this._occ[k];
          if (id != null) this._pieces.get(id).el.classList.add('in-check');
        }
      }
    }

    /** 顯示某格可走的位置（教學用；不改變選取狀態） */
    showMovesOf(index) {
      this.selected = index;
      this.renderHints();
    }

    renderHints() {
      this.layerMark.querySelectorAll('.xq-dot,.xq-cap').forEach((n) => n.remove());
      this.layerPiece.querySelectorAll('.sel').forEach((n) => n.classList.remove('sel'));
      if (this.selected < 0) return;
      const id = this._occ[this.selected];
      if (id != null) this._pieces.get(id).el.classList.add('sel');
      for (const m of XQ.movesFrom(this.board, this.selected)) {
        const d = el('div', this.board[m.to] ? 'xq-mark xq-cap' : 'xq-mark xq-dot');
        this._place(d, m.to);
        this.layerMark.appendChild(d);
      }
    }

    /* ── 點擊處理 ─────────────────────────────────────── */
    _indexFromEvent(e) {
      const r = this.inner.getBoundingClientRect();
      let c = Math.round(((e.clientX - r.left) / r.width) * (W - 1));
      let row = Math.round(((e.clientY - r.top) / r.height) * (H - 1));
      if (c < 0 || c >= W || row < 0 || row >= H) return -1;
      // 點得太偏就忽略，避免誤觸
      const dx = Math.abs((e.clientX - r.left) / r.width * (W - 1) - c);
      const dy = Math.abs((e.clientY - r.top) / r.height * (H - 1) - row);
      if (dx > 0.48 || dy > 0.48) return -1;
      if (this.opts.flipped) { c = W - 1 - c; row = H - 1 - row; }
      return at(row, c);
    }

    _onClick(e) {
      if (this.locked) return;
      const i = this._indexFromEvent(e);
      if (i < 0) return;
      if (this.opts.onSquare) { this.opts.onSquare(i); return; }   // 擺棋模式
      if (!this.opts.interactive) return;
      const piece = this.board[i];

      if (this.selected >= 0 && this.selected !== i) {
        if (XQ.isLegalMove(this.board, this.selected, i)) {
          const from = this.selected;
          this.selected = -1;
          if (this.opts.onMove) this.opts.onMove(from, i);
          return;
        }
      }
      if (piece && XQ.colorOf(piece) === this.side) {
        this.selected = this.selected === i ? -1 : i;
      } else {
        this.selected = -1;
      }
      this.renderHints();
    }
  }

  root.XQBoard = { Board, buildGrid };
})(window);

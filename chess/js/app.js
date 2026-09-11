/*
 * app.js — 網站互動邏輯
 */
(function (root) {
  'use strict';
  const XQ = root.XQ;
  const D = root.XQData;
  const { Board } = root.XQBoard;

  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  /* ── 共用：一條著法線的播放器 ─────────────────────────
   * 提供上一步／下一步／自動播放，往前走時棋子是動畫滑過去的。
   */
  class LinePlayer {
    constructor(boardHost, listHost, opts) {
      this.opts = opts || {};
      this.board = new Board(boardHost, { interactive: false });
      this.listHost = listHost;
      this.cur = 0;              // 已經走了幾步
      this.playing = false;
      this.steps = [];
    }

    load(fen, steps, opts) {
      this.stop();
      this.fen = fen;
      this.steps = steps || [];
      this.hideNotes = !!(opts && opts.hideNotes);
      // 預先算出每一步的中文記譜與各階段局面
      const start = XQ.parseFen(fen);
      let b = start.board;
      this.frames = [b.slice()];
      this.texts = [];
      for (const s of this.steps) {
        this.texts.push(XQ.moveToChinese(b, s.from, s.to));
        b = XQ.applyMove(b, { from: s.from, to: s.to });
        this.frames.push(b.slice());
      }
      this.cur = 0;
      this.board.setPosition(this.frames[0], start.side);
      this.renderList();
      this.emit();
    }

    renderList() {
      if (!this.listHost) return;
      this.listHost.innerHTML = '';
      const ol = el('ol');
      this.steps.forEach((s, i) => {
        const redMove = i % 2 === 0;
        const li = el('li', (redMove ? 'red' : 'black') + (this.hideNotes ? ' hidden-note' : ''));
        li.append(
          el('span', 'n', redMove ? String(i / 2 + 1) + '.' : ''),
          el('span', 'mv', this.texts[i]),
          el('span', 'note', s.note || '')
        );
        li.addEventListener('click', () => this.goto(i + 1));
        ol.appendChild(li);
      });
      this.listHost.appendChild(ol);
      this.markList();
    }

    revealNotes() {
      this.hideNotes = false;
      $$('li', this.listHost).forEach((li) => li.classList.remove('hidden-note'));
    }

    markList() {
      if (!this.listHost) return;
      $$('li', this.listHost).forEach((li, i) => li.classList.toggle('on', i === this.cur - 1));
      const on = $('li.on', this.listHost);
      if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
    }

    /** 跳到第 n 步之後的局面；往前一步用動畫，其餘直接重繪 */
    goto(n, animate) {
      n = Math.max(0, Math.min(this.steps.length, n));
      if (n === this.cur) return Promise.resolve();
      const forwardOne = n === this.cur + 1;
      if (forwardOne && animate !== false) {
        const s = this.steps[this.cur];
        this.cur = n;
        this.markList();
        this.emit();
        return this.board.move(s.from, s.to);
      }
      this.cur = n;
      const side = n % 2 === 0 ? XQ.parseFen(this.fen).side
        : XQ.opposite(XQ.parseFen(this.fen).side);
      this.board.setPosition(this.frames[n], side);
      if (n > 0) {
        const s = this.steps[n - 1];
        this.board.markMove(s.from, s.to);
      }
      this.board._flagCheck();
      this.markList();
      this.emit();
      return Promise.resolve();
    }

    next() { return this.goto(this.cur + 1); }
    prev() { return this.goto(this.cur - 1); }
    reset() { this.stop(); return this.goto(0); }

    async play() {
      if (this.playing) { this.stop(); return; }
      if (this.cur >= this.steps.length) await this.goto(0);
      this.playing = true;
      this.emit();
      while (this.playing && this.cur < this.steps.length) {
        await this.next();
        await new Promise((r) => setTimeout(r, 620));
      }
      this.playing = false;
      this.emit();
    }

    stop() { this.playing = false; this.emit(); }
    emit() { if (this.opts.onChange) this.opts.onChange(this); }
  }

  /* ── 建立標準控制列 ───────────────────────────────── */
  function makeControls(player, extra) {
    const bar = el('div', 'controls');
    const mk = (label, fn, cls) => {
      const b = el('button', 'btn' + (cls ? ' ' + cls : ''), label);
      b.addEventListener('click', fn);
      bar.appendChild(b);
      return b;
    };
    const bFirst = mk('⏮ 開始', () => player.reset());
    const bPrev = mk('← 上一步', () => player.prev());
    const bNext = mk('下一步 →', () => player.next());
    const bPlay = mk('▶ 自動播放', () => player.play(), 'primary');
    if (extra) extra(mk);
    player.opts.onChange = (p) => {
      bFirst.disabled = bPrev.disabled = p.cur === 0 || p.playing;
      bNext.disabled = p.cur >= p.steps.length || p.playing;
      bPlay.textContent = p.playing ? '⏸ 暫停' : (p.cur >= p.steps.length ? '↺ 重新播放' : '▶ 自動播放');
    };
    return bar;
  }

  /* ── 一、棋子走法 ─────────────────────────────────── */
  function initRules() {
    const host = $('#rules-board');
    const board = new Board(host, { interactive: false });
    const listHost = $('#rules-list');
    const info = $('#rules-info');
    let cur = D.PIECES[0];

    function show(p) {
      cur = p;
      const pos = XQ.parseFen(p.fen);
      board.setPosition(pos.board, pos.side);
      board.showMovesOf(p.focus);
      info.innerHTML = '';
      info.append(
        el('h3', null, p.name),
        Object.assign(el('div', 'rule-box'), { textContent: p.rule }),
        el('p', null, p.detail),
        el('p', 'lead', '棋盤上的綠點就是這個棋子目前所有合法的落點（由規則引擎即時算出）。')
      );
      $$('button', listHost).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === p.id)));
    }

    D.PIECES.forEach((p) => {
      const b = el('button', 'pick');
      b.dataset.id = p.id;
      const t = el('div', 't');
      t.append(el('span', null, p.glyph + '　' + p.name));
      b.append(t, el('div', 'd', p.rule));
      b.addEventListener('click', () => show(p));
      listHost.appendChild(b);
    });
    show(cur);
  }

  /* ── 二、記譜法 ───────────────────────────────────── */
  function initNotation() {
    const player = new LinePlayer($('#nota-board'), $('#nota-list'), {});
    $('#nota-controls').replaceWith(makeControls(player));
    player.load(D.OPENING.fen, D.OPENING.steps);
  }

  /* ── 三、戰術 ─────────────────────────────────────── */
  function initTactics() {
    const player = new LinePlayer($('#tac-board'), $('#tac-list'), {});
    const controls = makeControls(player);
    $('#tac-controls').replaceWith(controls);
    const listHost = $('#tac-list-pick');
    const info = $('#tac-info');
    let cur = null;

    function show(t) {
      cur = t;
      info.innerHTML = '';
      info.append(
        el('h3', null, t.name + '　（' + t.mateIn + ' 步殺）'),
        Object.assign(el('div', 'rule-box'), { textContent: t.idea }),
        el('p', null, '辨認要領：' + t.key)
      );
      player.load(t.fen, t.steps);
      $$('button', listHost).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === t.id)));
    }

    D.TACTICS.forEach((t) => {
      const b = el('button', 'pick');
      b.dataset.id = t.id;
      const title = el('div', 't');
      title.append(el('span', null, t.name), el('span', 'tag', t.mateIn + ' 步殺'));
      b.append(title, el('div', 'd', t.idea));
      b.addEventListener('click', () => show(t));
      listHost.appendChild(b);
    });
    show(D.TACTICS[0]);
  }

  /* ── 四、殘局挑戰 ─────────────────────────────────── */
  const SOLVED_KEY = 'xq-solved';
  const loadSolved = () => {
    try { return new Set(JSON.parse(localStorage.getItem(SOLVED_KEY) || '[]')); }
    catch (e) { return new Set(); }
  };
  const saveSolved = (s) => {
    try { localStorage.setItem(SOLVED_KEY, JSON.stringify(Array.from(s))); } catch (e) { /* 忽略 */ }
  };

  class PuzzleView {
    constructor() {
      this.solved = loadSolved();
      this.boardHost = $('#puz-board');
      this.board = new Board(this.boardHost, {
        interactive: true,
        onMove: (f, t) => this.userMove(f, t),
      });
      this.status = $('#puz-status');
      this.listHost = $('#puz-moves');
      this.info = $('#puz-info');
      this.pickHost = $('#puz-pick');
      this.buildPicker();
      this.buildControls();
    }

    buildPicker() {
      D.PUZZLES.forEach((p) => {
        const b = el('button', 'pick');
        b.dataset.id = p.id;
        const t = el('div', 't');
        t.append(
          el('span', null, p.name),
          el('span', 'tag', p.level),
          el('span', 'tag' + (this.solved.has(p.id) ? ' solved' : ''), this.solved.has(p.id) ? '✓ 已破解' : p.mateIn + ' 步殺')
        );
        b.append(t);
        b.addEventListener('click', () => this.load(p));
        this.pickHost.appendChild(b);
      });
    }

    refreshPicker() {
      $$('button', this.pickHost).forEach((b) => {
        b.setAttribute('aria-pressed', String(this.cur && b.dataset.id === this.cur.id));
        const tags = $$('.tag', b);
        const p = D.PUZZLES.find((x) => x.id === b.dataset.id);
        if (this.solved.has(p.id)) {
          tags[1].textContent = '✓ 已破解';
          tags[1].classList.add('solved');
        }
      });
    }

    buildControls() {
      const bar = el('div', 'controls');
      const mk = (label, fn, cls) => {
        const b = el('button', 'btn' + (cls ? ' ' + cls : ''), label);
        b.addEventListener('click', fn);
        bar.appendChild(b);
        return b;
      };
      mk('↺ 重來', () => this.load(this.cur));
      this.bHint = mk('💡 提示', () => this.hint());
      this.bSolve = mk('▶ 看解答', () => this.showSolution(), 'primary');
      $('#puz-controls').replaceWith(bar);
    }

    load(p) {
      this.cur = p;
      const pos = XQ.parseFen(p.fen);
      this.start = pos;
      this.board.setPosition(pos.board, pos.side);
      this.board.locked = false;
      this.remaining = p.mateIn;
      this.history = [];
      this.finished = false;
      this.usedHint = false;
      this.listHost.innerHTML = '';
      this.info.innerHTML = '';
      this.info.append(
        el('h3', null, p.name),
        el('p', null, '輪紅方走棋，請在 ' + p.mateIn + ' 步之內將死黑方。' + (p.note ? p.note : '')),
        Object.assign(el('div', 'rule-box hint-box'), { textContent: '想一想：' + p.hint })
      );
      this.bHint.disabled = false;
      this.bSolve.disabled = false;
      this.say('點選紅方棋子，再點目標位置走棋。', '');
      this.refreshPicker();
    }

    say(text, kind) {
      this.status.textContent = text;
      this.status.className = 'status' + (kind ? ' ' + kind : '');
    }

    pushMove(board, from, to, note) {
      const redMove = XQ.colorOf(board[from]) === XQ.RED;
      const li = el('li', redMove ? 'red' : 'black');
      li.append(
        el('span', 'n', redMove ? String(this.history.length / 2 + 1) + '.' : ''),
        el('span', 'mv', XQ.moveToChinese(board, from, to)),
        el('span', 'note', note || '')
      );
      $('ol', this.listHost) || this.listHost.appendChild(el('ol'));
      $('ol', this.listHost).appendChild(li);
      this.history.push({ from, to });
      li.scrollIntoView({ block: 'nearest' });
    }

    /** 這一著是否仍然保持連將殺（不限定標準答案，任何能殺的走法都算對） */
    isWinning(board, move, maxN) {
      const nb = XQ.applyMove(board, move);
      if (XQ.legalMoves(nb, XQ.BLACK).length === 0) return 1;
      if (!XQ.inCheck(nb, XQ.BLACK)) return 0;
      for (let n = 1; n <= maxN; n++) {
        let ok = true;
        for (const d of XQ.legalMoves(nb, XQ.BLACK)) {
          if (!XQ.findMate(XQ.applyMove(nb, d), XQ.RED, n)) { ok = false; break; }
        }
        if (ok) return n + 1;
      }
      return 0;
    }

    async userMove(from, to) {
      if (this.finished || this.board.locked) return;
      const board = this.board.board;
      const win = this.isWinning(board, { from, to }, this.remaining);
      if (!win) {
        const nb = XQ.applyMove(board, { from, to });
        this.say(XQ.inCheck(nb, XQ.BLACK)
          ? '這一著雖然將軍，但黑方守得住，接不下去了。再想想別的攻法。'
          : '這一著沒有將軍，黑方有喘息的機會。本題要求連續將軍把對方殺死。', 'bad');
        this.board.selected = -1;
        this.board.renderHints();
        return;
      }

      this.pushMove(board, from, to);
      this.board.locked = true;
      await this.board.move(from, to);

      if (XQ.legalMoves(this.board.board, XQ.BLACK).length === 0) {
        this.finish();
        return;
      }
      this.remaining = win - 1;
      this.say('好棋！黑方應將⋯⋯', 'good');
      await new Promise((r) => setTimeout(r, 420));
      // 黑方挑抵抗最久的應著
      const reply = this.bestDefense(this.board.board, this.remaining);
      this.pushMove(this.board.board, reply.from, reply.to);
      await this.board.move(reply.from, reply.to);
      this.board.locked = false;
      this.say('黑方應將了。還有 ' + this.remaining + ' 步，繼續！', '');
    }

    bestDefense(board, remaining) {
      const defenses = XQ.legalMoves(board, XQ.BLACK);
      let best = defenses[0], bestScore = -1;
      for (const d of defenses) {
        const nb = XQ.applyMove(board, d);
        let dist = 0;
        for (let n = 1; n <= remaining; n++) if (XQ.findMate(nb, XQ.RED, n)) { dist = n; break; }
        const score = (dist || 99) * 10 + (board[d.to] ? 1 : 0);
        if (score > bestScore) { bestScore = score; best = d; }
      }
      return best;
    }

    finish() {
      this.finished = true;
      this.board.locked = true;
      const clean = !this.usedHint && !this.revealed;
      this.say(clean ? '🎉 絕殺！黑方已經無路可走，完全靠自己解開，漂亮！'
        : '🎉 絕殺！黑方已經無路可走。', 'good');
      this.solved.add(this.cur.id);
      saveSolved(this.solved);
      this.refreshPicker();
      this.bHint.disabled = true;
    }

    hint() {
      if (this.finished) return;
      this.usedHint = true;
      const board = this.board.board;
      let line = null;
      for (let n = 1; n <= this.remaining && !line; n++) line = XQ.findMate(board, XQ.RED, n);
      if (!line) { this.say('這個局面已經殺不出來了，按「重來」再試一次。', 'bad'); return; }
      const m = line[0].move;
      this.board.showMovesOf(m.from);
      const name = XQ.NAMES[XQ.RED][XQ.typeOf(board[m.from])];
      this.say('提示：關鍵在這個「' + name + '」，它的可走點已標示出來。', '');
    }

    async showSolution() {
      this.revealed = true;
      this.board.locked = true;
      this.bSolve.disabled = true;
      this.bHint.disabled = true;
      const pos = XQ.parseFen(this.cur.fen);
      this.board.setPosition(pos.board, pos.side);
      this.listHost.innerHTML = '';
      this.history = [];
      this.say('正在演示標準解法⋯⋯', '');
      for (const s of this.cur.steps) {
        this.pushMove(this.board.board, s.from, s.to, s.note);
        await this.board.move(s.from, s.to);
        await new Promise((r) => setTimeout(r, 560));
      }
      this.finished = true;
      this.say('這就是標準解法。按「重來」可以自己再走一次。', 'good');
    }
  }

  /* ── 五、對弈 ─────────────────────────────────────── */
  class PlayView {
    constructor() {
      this.engine = new root.XQEngine.Engine();
      this.boardHost = $('#play-board');
      this.status = $('#play-status');
      this.listHost = $('#play-moves');
      this.capHost = $('#play-captured');
      this.reviewBar = $('#play-review');
      this.opponent = 'normal';      // easy / normal / hard / human
      this.humanSide = XQ.RED;
      this.buildOptions();
      this.buildControls();
      this.newGame();
    }

    /* ── 選項 ─────────────────────────────────────── */
    buildOptions() {
      const wrap = $('#play-options');
      const group = (label, items, get, set) => {
        const box = el('div', 'optgroup');
        box.appendChild(el('span', 'optlabel', label));
        const row = el('div', 'optrow');
        for (const [value, text] of items) {
          const b = el('button', 'chip', text);
          b.addEventListener('click', () => {
            set(value);
            sync();
            this.newGame();
          });
          b.dataset.value = value;
          row.appendChild(b);
        }
        box.appendChild(row);
        wrap.appendChild(box);
        const sync = () => $$('button', row).forEach((b) =>
          b.setAttribute('aria-pressed', String(b.dataset.value === String(get()))));
        sync();
        return sync;
      };

      const L = root.XQEngine.LEVELS;
      this.syncOpponent = group('對手', [
        ['easy', '電腦・' + L.easy.name],
        ['normal', '電腦・' + L.normal.name],
        ['hard', '電腦・' + L.hard.name],
        ['human', '兩人對下'],
      ], () => this.opponent, (v) => { this.opponent = v; });

      this.syncSide = group('你執', [
        [XQ.RED, '紅方（先走）'],
        [XQ.BLACK, '黑方（後走）'],
      ], () => this.humanSide, (v) => { this.humanSide = v; });
    }

    buildControls() {
      const bar = el('div', 'controls');
      const mk = (label, fn, cls) => {
        const b = el('button', 'btn' + (cls ? ' ' + cls : ''), label);
        b.addEventListener('click', fn);
        bar.appendChild(b);
        return b;
      };
      this.bNew = mk('↺ 新局', () => this.newGame(), 'primary');
      this.bUndo = mk('⟲ 悔棋', () => this.undo());
      this.bResign = mk('🏳 認輸', () => this.resign());
      $('#play-controls').replaceWith(bar);

      this.bBackToGame = el('button', 'btn', '回到對局');
      this.bBackToGame.addEventListener('click', () => this.exitReview());
      this.reviewBar.appendChild(this.bBackToGame);
      this.reviewBar.hidden = true;
    }

    get vsComputer() { return this.opponent !== 'human'; }

    setOptionsEnabled(on) {
      $$('#play-options button').forEach((b) => { b.disabled = !on; });
      if (this.bNew) this.bNew.disabled = !on;
    }

    /* ── 開新局 ───────────────────────────────────── */
    /** fen 可省略；給定時就從那個局面開始下（例如從「自己擺棋」帶過來的局面） */
    newGame(fen) {
      if (fen !== undefined) this.startFen = fen || D.START_FEN;
      if (!this.startFen) this.startFen = D.START_FEN;
      const start = XQ.parseFen(this.startFen);
      this.startBoard = start.board.slice();
      // 執黑時把棋盤轉過來，讓自己的棋子在下方
      const flipped = this.vsComputer && this.humanSide === XQ.BLACK;
      this.board = new Board(this.boardHost, {
        interactive: true,
        flipped,
        onMove: (f, t) => this.humanMove(f, t),
      });
      this.board.setPosition(start.board, start.side);

      // 每開一局就換一個世代編號。電腦的搜尋是非同步啟動的，
      // 使用者可能在它思考時就按了新局或換了選項，這時舊的結果必須丟掉，
      // 否則會把算好的著法套到新棋盤上。
      this.gen = (this.gen || 0) + 1;
      this.frames = [start.board.slice()];      // 每一步之後的局面，供回顧
      this.moves = [];                          // {from,to,text,captured}
      this.side = start.side;
      this.over = false;
      this.reviewAt = -1;
      this.thinking = false;
      this.seen = new Map();
      this.countSeen();
      this.listHost.innerHTML = '';
      this.capHost.innerHTML = '';
      this.reviewBar.hidden = true;
      this.refresh();
      this.maybeEngineMove();
    }

    countSeen() {
      const key = XQ.toFen(this.board.board, this.side);
      this.seen.set(key, (this.seen.get(key) || 0) + 1);
      return this.seen.get(key);
    }

    /* ── 狀態顯示 ─────────────────────────────────── */
    say(text, kind) {
      this.status.textContent = text;
      this.status.className = 'status' + (kind ? ' ' + kind : '');
    }

    sideName(s) { return s === XQ.RED ? '紅方' : '黑方'; }

    refresh() {
      const human = !this.vsComputer || this.side === this.humanSide;
      this.setOptionsEnabled(!this.thinking);
      this.board.locked = this.over || this.thinking || this.reviewAt >= 0 || !human;
      this.bUndo.disabled = this.over || this.thinking || this.reviewAt >= 0 ||
        this.moves.length === 0;
      this.bResign.disabled = this.over || this.reviewAt >= 0;
      this.renderCaptured();
      if (this.over || this.reviewAt >= 0) return;
      if (this.thinking) { this.say('電腦思考中⋯⋯', ''); return; }
      const checked = XQ.inCheck(this.board.board, this.side);
      const who = this.sideName(this.side);
      if (this.vsComputer) {
        this.say((checked ? '將軍！' : '') +
          (human ? '輪你走棋（' + who + '）。點自己的棋子再點目標位置。'
                 : '輪電腦走棋（' + who + '）。'), checked ? 'bad' : '');
      } else {
        this.say((checked ? '將軍！' : '') + '輪' + who + '走棋。', checked ? 'bad' : '');
      }
    }

    renderCaptured() {
      const start = this.startBoard;
      const now = this.board.board;
      const count = (b) => {
        const m = {};
        for (const p of b) if (p) m[p] = (m[p] || 0) + 1;
        return m;
      };
      const a = count(start), c = count(now);
      const lost = { r: [], b: [] };
      for (const p in a) {
        for (let i = 0; i < a[p] - (c[p] || 0); i++) {
          lost[XQ.colorOf(p)].push(XQ.NAMES[XQ.colorOf(p)][XQ.typeOf(p)]);
        }
      }
      this.capHost.innerHTML = '';
      for (const s of [XQ.BLACK, XQ.RED]) {
        if (!lost[s].length) continue;
        const row = el('div', 'caprow');
        row.appendChild(el('span', 'caplabel', '被吃的' + this.sideName(s) + '子'));
        for (const name of lost[s]) {
          row.appendChild(el('span', 'capchip ' + (s === XQ.RED ? 'red' : 'black'), name));
        }
        this.capHost.appendChild(row);
      }
    }

    /* ── 走一步 ───────────────────────────────────── */
    /**
     * 走一步並更新棋譜。gen 是開局世代：走子中間有一段等待動畫的時間，
     * 使用者可能剛好在這時開了新局，因此動畫前後都要確認世代還是同一個，
     * 否則就會把這一手記到新的一局上。
     */
    async applyMove(from, to, gen) {
      if (this.gen !== gen) return true;
      const bd = this.board;                  // 捕捉當下的棋盤，避免中途被換掉
      const board = bd.board;
      const text = XQ.moveToChinese(board, from, to);
      const captured = board[to];
      this.moves.push({ from, to, text, captured });
      this.addMoveRow(this.moves.length - 1);
      await bd.move(from, to);
      if (this.gen !== gen) return true;      // 動畫期間開了新局，這一手作廢
      this.frames.push(bd.board.slice());
      this.side = XQ.opposite(this.side);
      const repeats = this.countSeen();
      return this.checkEnd(repeats);
    }

    addMoveRow(i) {
      const m = this.moves[i];
      const redMove = XQ.colorOf(this.frames[i][m.from]) === XQ.RED;
      let ol = $('ol', this.listHost);
      if (!ol) { ol = el('ol'); this.listHost.appendChild(ol); }
      const li = el('li', redMove ? 'red' : 'black');
      li.append(
        el('span', 'n', redMove ? String(Math.floor(i / 2) + 1) + '.' : ''),
        el('span', 'mv', m.text),
        el('span', 'note', m.captured
          ? '吃' + XQ.NAMES[XQ.colorOf(m.captured)][XQ.typeOf(m.captured)] : '')
      );
      li.addEventListener('click', () => this.review(i + 1));
      ol.appendChild(li);
      li.scrollIntoView({ block: 'nearest' });
    }

    /** 回傳 true 表示棋局已結束 */
    checkEnd(repeats) {
      if (XQ.legalMoves(this.board.board, this.side).length === 0) {
        const winner = this.sideName(XQ.opposite(this.side));
        const how = XQ.inCheck(this.board.board, this.side) ? '被將死' : '無著可走（困斃）';
        this.finish(winner + '勝——' + this.sideName(this.side) + how + '。');
        return true;
      }
      if (repeats >= 3) {
        this.finish('同一局面出現三次，判和。');
        return true;
      }
      return false;
    }

    finish(text) {
      this.over = true;
      this.board.locked = true;
      const mine = this.vsComputer &&
        text.startsWith(this.sideName(this.humanSide)) && text.includes('勝');
      this.say((mine ? '🎉 ' : '') + text + '　按「新局」再來一盤，或點棋譜中的著法回顧。',
        mine ? 'good' : '');
      this.refresh();
    }

    async humanMove(from, to) {
      if (this.over || this.thinking || this.reviewAt >= 0) return;
      if (this.vsComputer && this.side !== this.humanSide) return;
      const ended = await this.applyMove(from, to, this.gen);
      this.refresh();
      if (!ended) this.maybeEngineMove();
    }

    /* ── 電腦走棋 ─────────────────────────────────── */
    maybeEngineMove() {
      if (this.over || !this.vsComputer || this.side === this.humanSide) return;
      this.thinking = true;
      this.refresh();
      const gen = this.gen;
      // 先讓瀏覽器把「思考中」畫出來，再開始算（搜尋是同步的，會擋住畫面）
      setTimeout(async () => {
        if (this.gen !== gen) return;          // 已經開了新局
        const cfg = Object.assign({}, root.XQEngine.LEVELS[this.opponent], {
          avoid: new Set(this.seen.keys()),
        });
        const res = this.engine.think(this.board.board, this.side, cfg);
        if (this.gen !== gen) return;          // 思考期間開了新局，結果作廢
        this.thinking = false;
        if (this.over) return;
        if (!res) { this.refresh(); return; }
        const ended = await this.applyMove(res.move.from, res.move.to, gen);
        if (this.gen !== gen) return;
        this.refresh();
        if (!ended && this.vsComputer && this.side !== this.humanSide) {
          this.maybeEngineMove();              // 兩台電腦互下的情況（理論上不會發生）
        }
      }, 40);
    }

    /* ── 悔棋 ─────────────────────────────────────── */
    undo() {
      if (!this.moves.length || this.thinking) return;
      // 對電腦時退兩手，讓回合回到自己
      const back = this.vsComputer && this.moves.length >= 2 ? 2 : 1;
      for (let i = 0; i < back; i++) {
        const m = this.moves.pop();
        if (!m) break;
        this.frames.pop();
        const key = XQ.toFen(this.frames[this.frames.length - 1],
          XQ.opposite(this.side));
        const n = (this.seen.get(key) || 1) - 1;
        if (n <= 0) this.seen.delete(key); else this.seen.set(key, n);
        this.side = XQ.opposite(this.side);
        const ol = $('ol', this.listHost);
        if (ol && ol.lastChild) ol.removeChild(ol.lastChild);
      }
      this.over = false;
      this.board.setPosition(this.frames[this.frames.length - 1], this.side);
      const last = this.moves[this.moves.length - 1];
      if (last) this.board.markMove(last.from, last.to);
      this.refresh();
    }

    resign() {
      if (this.over) return;
      const loser = this.vsComputer ? this.humanSide : this.side;
      this.finish(this.sideName(XQ.opposite(loser)) + '勝——' +
        this.sideName(loser) + '認輸。');
    }

    /* ── 回顧棋譜 ─────────────────────────────────── */
    review(n) {
      if (n < 0 || n >= this.frames.length) return;
      this.reviewAt = n;
      const first = XQ.parseFen(this.startFen).side;
      const side = n % 2 === 0 ? first : XQ.opposite(first);
      this.board.setPosition(this.frames[n], side);
      if (n > 0) this.board.markMove(this.moves[n - 1].from, this.moves[n - 1].to);
      this.board.locked = true;
      $$('li', this.listHost).forEach((li, i) => li.classList.toggle('on', i === n - 1));
      this.reviewBar.hidden = false;
      this.say('回顧第 ' + n + ' 手' + (this.moves[n - 1] ? '（' + this.moves[n - 1].text + '）' : '') +
        '。這是回顧模式，按「回到對局」繼續下棋。', '');
      this.bUndo.disabled = true;
      this.bResign.disabled = true;
    }

    /** 從指定局面開一局（供「自己擺棋」與分享連結使用） */
    startFrom(fen) {
      this.newGame(fen);
    }

    exitReview() {
      this.reviewAt = -1;
      this.reviewBar.hidden = true;
      $$('li', this.listHost).forEach((li) => li.classList.remove('on'));
      this.board.setPosition(this.frames[this.frames.length - 1], this.side);
      const last = this.moves[this.moves.length - 1];
      if (last) this.board.markMove(last.from, last.to);
      this.refresh();
      if (this.over) this.say('棋局已結束，按「新局」再來一盤。', '');
    }
  }

  /* ── 六、擺棋編輯器 ───────────────────────────────── */
  function initEditor(onPlay) {
    const PALETTE = [
      ['K', 'red'], ['A', 'red'], ['B', 'red'], ['N', 'red'], ['R', 'red'], ['C', 'red'], ['P', 'red'],
      ['k', 'black'], ['a', 'black'], ['b', 'black'], ['n', 'black'], ['r', 'black'], ['c', 'black'], ['p', 'black'],
    ];
    let brush = 'R';
    let board = new Array(90).fill('');
    let side = XQ.RED;

    const host = $('#ed-board');
    const view = new Board(host, { coords: true, onSquare: (i) => paint(i) });
    const paletteHost = $('#ed-palette');
    const msg = $('#ed-msg');
    const fenInput = $('#ed-fen');
    const solHost = $('#ed-solution');

    PALETTE.forEach(([code, colour]) => {
      const b = el('button', colour, XQ.NAMES[colour === 'red' ? 'r' : 'b'][XQ.typeOf(code)]);
      b.title = (colour === 'red' ? '紅' : '黑') + XQ.NAMES[colour === 'red' ? 'r' : 'b'][XQ.typeOf(code)];
      b.addEventListener('click', () => { brush = code; syncPalette(); });
      b.dataset.code = code;
      paletteHost.appendChild(b);
    });
    const eraser = el('button', 'erase', '清除');
    eraser.dataset.code = '';
    eraser.addEventListener('click', () => { brush = ''; syncPalette(); });
    paletteHost.appendChild(eraser);

    function syncPalette() {
      $$('button', paletteHost).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.code === brush)));
    }

    function paint(i) {
      if (!brush) board[i] = '';
      else {
        if (brush === 'K' || brush === 'k') {
          // 將帥只能有一個，且必須在九宮內
          const s = brush === 'K' ? XQ.RED : XQ.BLACK;
          if (!XQ.inPalace(s, XQ.rowOf(i), XQ.colOf(i))) {
            flash('將帥只能放在九宮（三乘三的方框）之內。', 'bad');
            return;
          }
          for (let j = 0; j < 90; j++) if (board[j] === brush) board[j] = '';
        }
        board[i] = brush;
      }
      render();
    }

    function render() {
      view.setPosition(board, side);
      fenInput.value = XQ.toFen(board, side);
      validate();
    }

    function flash(text, kind) {
      msg.textContent = text;
      msg.className = 'status' + (kind ? ' ' + kind : '');
    }

    function problems() {
      const out = [];
      if (XQ.findKing(board, XQ.RED) < 0) out.push('缺少紅帥');
      if (XQ.findKing(board, XQ.BLACK) < 0) out.push('缺少黑將');
      if (out.length) return out;
      if (XQ.inCheck(board, XQ.opposite(side)))
        out.push('未輪走的一方正被將軍，這個局面不可能出現在實戰中');
      return out;
    }

    function validate() {
      const p = problems();
      if (p.length) flash('⚠ ' + p.join('；'), 'bad');
      else flash('局面合法。可以按「找出殺法」讓電腦算算看，或複製連結分享給別人解。', '');
    }

    $('#ed-side').addEventListener('change', (e) => { side = e.target.value; render(); });
    $('#ed-clear').addEventListener('click', () => { board = new Array(90).fill(''); render(); solHost.innerHTML = ''; });
    $('#ed-start').addEventListener('click', () => {
      const p = XQ.parseFen(D.START_FEN);
      board = p.board; side = p.side; render(); solHost.innerHTML = '';
    });
    $('#ed-load').addEventListener('click', () => {
      try {
        const p = XQ.parseFen(fenInput.value);
        if (p.board.filter(Boolean).length === 0) throw new Error('空局面');
        board = p.board; side = p.side; render(); solHost.innerHTML = '';
      } catch (err) { flash('讀不懂這串 FEN，請檢查格式。', 'bad'); }
    });
    $('#ed-share').addEventListener('click', () => {
      const url = location.origin + location.pathname + '#fen=' + encodeURIComponent(XQ.toFen(board, side));
      fenInput.value = url;
      fenInput.select();
      let copied = false;
      try {
        if (navigator.clipboard) { navigator.clipboard.writeText(url); copied = true; }
        else copied = document.execCommand('copy');
      } catch (e) { copied = false; }
      flash(copied ? '連結已複製，貼給朋友就能直接看到這個局面。'
        : '連結已顯示在下方欄位，請手動複製。', copied ? '' : 'bad');
    });

    $('#ed-play').addEventListener('click', () => {
      const p = problems();
      if (p.length) { flash('⚠ ' + p.join('；'), 'bad'); return; }
      onPlay(XQ.toFen(board, side));
    });

    $('#ed-solve').addEventListener('click', () => {
      solHost.innerHTML = '';
      const p = problems();
      if (p.length) { flash('⚠ ' + p.join('；'), 'bad'); return; }
      flash('計算中⋯⋯', '');
      setTimeout(() => {
        const attacker = side;
        let found = null, n = 0;
        for (n = 1; n <= 3; n++) {
          found = XQ.findMate(board, attacker, n);
          if (found) break;
        }
        if (!found) {
          flash('在三步之內找不到「連續將軍」的殺法。' +
            '（本工具專門搜尋連將殺，需要先走閒著的殺法不在搜尋範圍內。）', 'bad');
          return;
        }
        const flat = XQ.flattenLine(found);
        const steps = flat.map((m) => ({ from: m.from, to: m.to }));
        flash('找到了：' + n + ' 步連將殺。下面可以一步一步看。', '');
        const wrap = el('div', 'card');
        wrap.style.marginTop = '16px';
        wrap.appendChild(el('h3', null, n + ' 步殺・演示'));
        const bWrap = el('div'); const lWrap = el('div', 'movelist');
        const grid = el('div', 'split');
        grid.append(bWrap, lWrap);
        wrap.appendChild(grid);
        solHost.appendChild(wrap);
        const player = new LinePlayer(bWrap, lWrap, {});
        wrap.insertBefore(makeControls(player), grid);
        player.load(XQ.toFen(board, side), steps);
      }, 30);
    });

    // 供外部（分享連結）載入局面
    root.__loadEditorFen = (fen) => {
      try {
        const p = XQ.parseFen(fen);
        board = p.board; side = p.side;
        $('#ed-side').value = side;
        render();
      } catch (e) { /* 忽略無效連結 */ }
    };

    syncPalette();
    const p = XQ.parseFen('3ak4/4r4/9/9/2C6/9/9/9/9/3K5 r');
    board = p.board; side = p.side;
    render();
  }

  /* ── 名詞小辭典 ───────────────────────────────────── */
  function initGlossary() {
    const host = $('#gloss');
    if (!host) return;
    for (const [term, desc] of D.GLOSSARY) {
      host.append(el('dt', null, term), el('dd', null, desc));
    }
  }

  /* ── 分頁切換 ─────────────────────────────────────── */
  function initTabs() {
    const tabs = $$('nav.tabs button');
    const views = $$('section.view');
    function go(id, push) {
      tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.view === id)));
      views.forEach((v) => v.classList.toggle('active', v.id === 'view-' + id));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (push !== false) history.replaceState(null, '', '#' + id);
    }
    tabs.forEach((t) => t.addEventListener('click', () => go(t.dataset.view)));
    $$('[data-goto]').forEach((b) => b.addEventListener('click', () => go(b.dataset.goto)));
    return go;
  }

  /* ── 啟動 ─────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    initGlossary();
    initRules();
    initNotation();
    initTactics();
    const puz = new PuzzleView();
    puz.load(D.PUZZLES[0]);
    const play = new PlayView();
    let go = null;
    initEditor((fen) => { play.startFrom(fen); if (go) go('play'); });
    go = initTabs();

    // 分享連結：#fen=... 直接開啟擺棋頁；#puzzle=p3 直接開某一題
    const hash = decodeURIComponent(location.hash.replace(/^#/, ''));
    const m = /^fen=(.+)$/.exec(hash);
    const mp = /^puzzle=(.+)$/.exec(hash);
    const mg = /^play=(.+)$/.exec(hash);
    if (mg) { play.startFrom(mg[1]); go('play'); }
    else if (m) { root.__loadEditorFen(m[1]); go('editor'); }
    else if (mp) {
      const p = D.PUZZLES.find((x) => x.id === mp[1]);
      if (p) { puz.load(p); go('puzzle'); }
    } else if (hash && $('#view-' + hash)) go(hash);
    else go('home', false);
  });
})(window);

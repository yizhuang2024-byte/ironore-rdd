/*
 * rules.js — 中國象棋規則引擎
 *
 * 棋盤座標：row 0 = 黑方底線（上方），row 9 = 紅方底線（下方）
 *           col 0 = 畫面最左，col 8 = 畫面最右
 *           index = row * 9 + col
 *
 * 棋子代號（沿用國際通用的象棋 FEN）：
 *   大寫 = 紅方，小寫 = 黑方
 *   K 將帥  A 士仕  B 象相  N 馬傌  R 車俥  C 炮砲  P 兵卒
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.XQ = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const W = 9, H = 10, SIZE = 90;
  const RED = 'r', BLACK = 'b';

  const rowOf = (i) => (i / W) | 0;
  const colOf = (i) => i % W;
  const at = (r, c) => r * W + c;
  const onBoard = (r, c) => r >= 0 && r < H && c >= 0 && c < W;

  function colorOf(p) {
    if (!p) return null;
    return p === p.toUpperCase() ? RED : BLACK;
  }
  const typeOf = (p) => (p ? p.toUpperCase() : null);
  const opposite = (s) => (s === RED ? BLACK : RED);

  /* ── 陣營相關的基本判斷 ───────────────────────────────── */

  // 己方半場（紅方 row 5-9，黑方 row 0-4）
  const ownHalf = (side, r) => (side === RED ? r >= 5 : r <= 4);
  // 九宮
  const inPalace = (side, r, c) =>
    c >= 3 && c <= 5 && (side === RED ? r >= 7 : r <= 2);

  /* ── FEN ─────────────────────────────────────────────── */

  function parseFen(fen) {
    const parts = String(fen).trim().split(/\s+/);
    const board = new Array(SIZE).fill('');
    const rows = parts[0].split('/');
    for (let r = 0; r < H && r < rows.length; r++) {
      let c = 0;
      for (const ch of rows[r]) {
        if (ch >= '0' && ch <= '9') c += Number(ch);
        else if (c < W) board[at(r, c++)] = ch;
      }
    }
    return { board, side: parts[1] === 'b' ? BLACK : RED };
  }

  function toFen(board, side) {
    const rows = [];
    for (let r = 0; r < H; r++) {
      let line = '', empty = 0;
      for (let c = 0; c < W; c++) {
        const p = board[at(r, c)];
        if (p) {
          if (empty) { line += empty; empty = 0; }
          line += p;
        } else empty++;
      }
      if (empty) line += empty;
      rows.push(line);
    }
    return rows.join('/') + ' ' + (side || RED);
  }

  const cloneBoard = (board) => board.slice();

  /* ── 走法產生（偽合法，尚未過濾送將） ─────────────────── */

  const ROOK_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const KNIGHT_STEPS = [
    // [dr, dc, 馬腿 dr, 馬腿 dc]
    [-2, -1, -1, 0], [-2, 1, -1, 0],
    [2, -1, 1, 0], [2, 1, 1, 0],
    [-1, -2, 0, -1], [1, -2, 0, -1],
    [-1, 2, 0, 1], [1, 2, 0, 1],
  ];
  const BISHOP_STEPS = [[-2, -2], [-2, 2], [2, -2], [2, 2]];
  const ADVISOR_STEPS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  // 反查馬的攻擊來源：[馬相對目標的 dr, dc, 馬腿相對目標的 dr, dc]
  const KNIGHT_ATTACK = [
    [-2, -1, -1, -1], [-2, 1, -1, 1], [2, -1, 1, -1], [2, 1, 1, 1],
    [-1, -2, -1, -1], [-1, 2, -1, 1], [1, -2, 1, -1], [1, 2, 1, 1],
  ];

  function genPieceMoves(board, from, out) {
    const p = board[from];
    if (!p) return out;
    const side = colorOf(p);
    const r = rowOf(from), c = colOf(from);
    const push = (tr, tc) => {
      if (!onBoard(tr, tc)) return;
      const t = board[at(tr, tc)];
      if (t && colorOf(t) === side) return;
      out.push({ from, to: at(tr, tc) });
    };

    switch (typeOf(p)) {
      case 'R':
        for (const [dr, dc] of ROOK_DIRS) {
          let tr = r + dr, tc = c + dc;
          while (onBoard(tr, tc)) {
            const t = board[at(tr, tc)];
            if (!t) out.push({ from, to: at(tr, tc) });
            else {
              if (colorOf(t) !== side) out.push({ from, to: at(tr, tc) });
              break;
            }
            tr += dr; tc += dc;
          }
        }
        break;

      case 'C':
        for (const [dr, dc] of ROOK_DIRS) {
          let tr = r + dr, tc = c + dc, screen = false;
          while (onBoard(tr, tc)) {
            const t = board[at(tr, tc)];
            if (!screen) {
              if (!t) out.push({ from, to: at(tr, tc) });
              else screen = true;               // 找到砲架
            } else if (t) {
              if (colorOf(t) !== side) out.push({ from, to: at(tr, tc) });
              break;                            // 砲架之後只能吃第一個子
            }
            tr += dr; tc += dc;
          }
        }
        break;

      case 'N':
        for (const [dr, dc, lr, lc] of KNIGHT_STEPS) {
          if (board[at(r + lr, c + lc)]) continue; // 蹩馬腿
          push(r + dr, c + dc);
        }
        break;

      case 'B':
        for (const [dr, dc] of BISHOP_STEPS) {
          const tr = r + dr, tc = c + dc;
          if (!onBoard(tr, tc)) continue;
          if (!ownHalf(side, tr)) continue;               // 象不過河
          if (board[at(r + dr / 2, c + dc / 2)]) continue; // 塞象眼
          push(tr, tc);
        }
        break;

      case 'A':
        for (const [dr, dc] of ADVISOR_STEPS) {
          const tr = r + dr, tc = c + dc;
          if (!onBoard(tr, tc) || !inPalace(side, tr, tc)) continue;
          push(tr, tc);
        }
        break;

      case 'K':
        for (const [dr, dc] of ROOK_DIRS) {
          const tr = r + dr, tc = c + dc;
          if (!onBoard(tr, tc) || !inPalace(side, tr, tc)) continue;
          push(tr, tc);
        }
        break;

      case 'P': {
        const fwd = side === RED ? -1 : 1;
        push(r + fwd, c);
        if (!ownHalf(side, r)) {   // 過河後可橫走
          push(r, c - 1);
          push(r, c + 1);
        }
        break;
      }
    }
    return out;
  }

  function genMoves(board, side) {
    const out = [];
    for (let i = 0; i < SIZE; i++) {
      if (board[i] && colorOf(board[i]) === side) genPieceMoves(board, i, out);
    }
    return out;
  }

  /* ── 將軍與合法性 ────────────────────────────────────── */

  function findKing(board, side) {
    const k = side === RED ? 'K' : 'k';
    for (let i = 0; i < SIZE; i++) if (board[i] === k) return i;
    return -1;
  }

  // 白臉將（雙方將帥在同一直線且中間無子）
  function kingsFacing(board) {
    const a = findKing(board, RED), b = findKing(board, BLACK);
    if (a < 0 || b < 0) return false;
    if (colOf(a) !== colOf(b)) return false;
    const c = colOf(a);
    for (let r = rowOf(b) + 1; r < rowOf(a); r++) if (board[at(r, c)]) return false;
    return true;
  }

  /**
   * 某一格是否被 by 方的棋子攻擊（不含白臉將，那是另一條規則）。
   *
   * 這裡刻意不產生對手的完整走法表，而是從目標格「反查」各種棋子可能的
   * 攻擊來源，成本從一次完整走法產生降到幾十次陣列讀取。
   * 對弈 AI 的搜尋幾乎每個節點都要判斷將軍，這個差別很關鍵。
   *
   * 「攻擊」的定義是「這一格若有 by 方的敵子，會不會被吃掉」。
   * 在空格上，這與「有沒有走法走到該格」並不等價：炮隔著砲架控制的空格
   * 不會產生走法，而炮的閒著目標也不算攻擊。將帥永遠是棋子，
   * 所以用於王安全判斷時兩者完全一致（已用亂數局面逐格比對驗證）。
   */
  function isAttacked(board, sq, by) {
    const r = rowOf(sq), c = colOf(sq);

    // 車、炮、以及貼身的將帥：沿四個方向往外掃
    for (const [dr, dc] of ROOK_DIRS) {
      let tr = r + dr, tc = c + dc, dist = 1, first = '';
      while (onBoard(tr, tc)) {
        first = board[at(tr, tc)];
        if (first) break;
        tr += dr; tc += dc; dist++;
      }
      if (!first) continue;
      if (colorOf(first) === by) {
        const t = typeOf(first);
        if (t === 'R') return true;
        // 將帥只能在九宮內走一格
        if (t === 'K' && dist === 1 && inPalace(by, r, c)) return true;
      }
      // 越過第一個子（砲架）之後的第一個子若是炮，就打得到
      let sr = tr + dr, sc = tc + dc, second = '';
      while (onBoard(sr, sc)) {
        second = board[at(sr, sc)];
        if (second) break;
        sr += dr; sc += dc;
      }
      if (second && colorOf(second) === by && typeOf(second) === 'C') return true;
    }

    // 馬：從八個可能的來源反查，馬腿是目標與馬之間的那個斜角
    const N_PIECE = by === RED ? 'N' : 'n';
    for (const [a, b, lr, lc] of KNIGHT_ATTACK) {
      const tr = r + a, tc = c + b;
      if (!onBoard(tr, tc)) continue;
      if (board[at(tr, tc)] !== N_PIECE) continue;
      if (board[at(r + lr, c + lc)]) continue;   // 蹩馬腿
      return true;
    }

    // 兵卒：紅兵往上走，黑卒往下走；過河後才能橫吃
    const P_PIECE = by === RED ? 'P' : 'p';
    const back = by === RED ? r + 1 : r - 1;
    if (onBoard(back, c) && board[at(back, c)] === P_PIECE) return true;
    for (const dc of [-1, 1]) {
      if (!onBoard(r, c + dc)) continue;
      // 橫吃的兵與目標同一列，因此用目標的列判斷它是否已過河
      if (board[at(r, c + dc)] === P_PIECE && !ownHalf(by, r)) return true;
    }

    // 士：九宮內斜走一格
    const A_PIECE = by === RED ? 'A' : 'a';
    if (inPalace(by, r, c)) {
      for (const [dr, dc] of ADVISOR_STEPS) {
        const tr = r + dr, tc = c + dc;
        if (onBoard(tr, tc) && board[at(tr, tc)] === A_PIECE) return true;
      }
    }

    // 象：田字，且不過河
    const B_PIECE = by === RED ? 'B' : 'b';
    if (ownHalf(by, r)) {
      for (const [dr, dc] of BISHOP_STEPS) {
        const tr = r + dr, tc = c + dc;
        if (!onBoard(tr, tc)) continue;
        if (board[at(tr, tc)] !== B_PIECE) continue;
        if (board[at(r + dr / 2, c + dc / 2)]) continue;  // 塞象眼
        return true;
      }
    }

    return false;
  }

  function inCheck(board, side) {
    const king = findKing(board, side);
    if (king < 0) return true;                 // 將帥被吃視為已負
    if (kingsFacing(board)) return true;
    return isAttacked(board, king, opposite(side));
  }

  function applyMove(board, move) {
    const nb = board.slice();
    nb[move.to] = nb[move.from];
    nb[move.from] = '';
    return nb;
  }

  function legalMoves(board, side) {
    const out = [];
    for (const m of genMoves(board, side)) {
      if (!inCheck(applyMove(board, m), side)) out.push(m);
    }
    return out;
  }

  function movesFrom(board, from) {
    const side = colorOf(board[from]);
    if (!side) return [];
    const out = [];
    for (const m of genPieceMoves(board, from, [])) {
      if (!inCheck(applyMove(board, m), side)) out.push(m);
    }
    return out;
  }

  const isLegalMove = (board, from, to) =>
    movesFrom(board, from).some((m) => m.to === to);

  // 對 side 而言：被將死或困斃（象棋中困斃同樣判負）
  function isMated(board, side) {
    return legalMoves(board, side).length === 0;
  }

  function gameOver(board, side) {
    if (findKing(board, side) < 0) return true;
    return isMated(board, side);
  }

  /* ── 中文記譜 ────────────────────────────────────────── */

  const NAMES = {
    r: { K: '帥', A: '仕', B: '相', N: '馬', R: '車', C: '炮', P: '兵' },
    b: { K: '將', A: '士', B: '象', N: '馬', R: '車', C: '砲', P: '卒' },
  };
  const CN_DIGITS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

  // 紅方由右至左為一~九；黑方由己方右邊（畫面左邊）起算 1~9
  const fileNum = (side, c) => (side === RED ? W - c : c + 1);
  const num = (side, n) => (side === RED ? CN_DIGITS[n - 1] : String(n));

  function moveToChinese(board, from, to) {
    const p = board[from];
    if (!p) return '';
    const side = colorOf(p);
    const type = typeOf(p);
    const name = NAMES[side][type];
    const fr = rowOf(from), fc = colOf(from);
    const tr = rowOf(to), tc = colOf(to);

    // 同一直線上是否有同名棋子 → 需用「前/後」等前綴
    const sameFile = [];
    for (let r = 0; r < H; r++) {
      const i = at(r, fc);
      if (board[i] === p) sameFile.push(r);
    }
    // 由「前」到「後」排序：紅方 row 小者在前，黑方 row 大者在前
    sameFile.sort((a, b) => (side === RED ? a - b : b - a));

    let subject;
    if (sameFile.length >= 2) {
      const pos = sameFile.indexOf(fr);
      let prefix;
      if (sameFile.length === 2) prefix = pos === 0 ? '前' : '後';
      else if (pos === 0) prefix = '前';
      else if (pos === sameFile.length - 1) prefix = '後';
      else prefix = num(side, pos + 1);
      subject = prefix + name;
    } else {
      subject = name + num(side, fileNum(side, fc));
    }

    if (fr === tr) return subject + '平' + num(side, fileNum(side, tc));

    const forward = side === RED ? tr < fr : tr > fr;
    const verb = forward ? '進' : '退';
    // 車炮兵將帥走直線 → 記步數；馬相象士仕走斜線 → 記目標路數
    const straight = type === 'R' || type === 'C' || type === 'P' || type === 'K';
    const amount = straight
      ? num(side, Math.abs(tr - fr))
      : num(side, fileNum(side, tc));
    return subject + verb + amount;
  }

  /* ── 殺法搜尋（連續將軍的 N 步殺） ────────────────────── */

  function checkingMoves(board, side) {
    const out = [];
    for (const m of legalMoves(board, side)) {
      const nb = applyMove(board, m);
      if (inCheck(nb, opposite(side))) out.push(m);
    }
    return out;
  }

  /**
   * 搜尋 side 是否能在 n 個回合內以「連續將軍」把對手將死。
   * 回傳主變著法陣列（長度 = 2n-1 的一半…），找不到回傳 null。
   * 由於教學用的排局殺法皆為連將殺，攻方僅搜尋將軍著法，速度足夠。
   */
  function findMate(board, side, n) {
    if (n <= 0) return null;
    const foe = opposite(side);
    let fallback = null;
    for (const m of checkingMoves(board, side)) {
      const nb = applyMove(board, m);
      const defenses = legalMoves(nb, foe);
      if (defenses.length === 0) return [{ move: m, reply: null, next: [] }];
      if (n === 1) continue;
      let ok = true;
      let worst = null;   // 取抵抗最久的應著當主變
      let worstLen = -1;
      for (const d of defenses) {
        const db = applyMove(nb, d);
        const sub = findMate(db, side, n - 1);
        if (!sub) { ok = false; break; }
        const len = subLength(sub);
        if (len > worstLen) { worstLen = len; worst = { d, sub }; }
      }
      if (ok) {
        const line = [{ move: m, reply: worst.d, next: worst.sub }];
        return line;
      }
    }
    return fallback;
  }

  function subLength(line) {
    let n = 0, cur = line;
    while (cur && cur.length) { n += cur[0].reply ? 2 : 1; cur = cur[0].next; }
    return n;
  }

  // 把 findMate 的巢狀結果攤平成 [{from,to}, ...] 的著法序列
  function flattenLine(line) {
    const out = [];
    let cur = line;
    while (cur && cur.length) {
      out.push(cur[0].move);
      if (cur[0].reply) out.push(cur[0].reply);
      cur = cur[0].next;
    }
    return out;
  }

  // 求出實際的最短連將殺步數（最多找到 maxN）
  function mateDistance(board, side, maxN) {
    for (let n = 1; n <= maxN; n++) {
      if (findMate(board, side, n)) return n;
    }
    return 0;
  }

  // 列出所有能在 n 回合內連將殺的著法（用來判斷解答是否唯一）
  function allMatingMoves(board, side, n) {
    const res = [];
    const foe = opposite(side);
    for (const m of checkingMoves(board, side)) {
      const nb = applyMove(board, m);
      const defenses = legalMoves(nb, foe);
      if (defenses.length === 0) { res.push(m); continue; }
      if (n === 1) continue;
      let ok = true;
      for (const d of defenses) {
        if (!findMate(applyMove(nb, d), side, n - 1)) { ok = false; break; }
      }
      if (ok) res.push(m);
    }
    return res;
  }

  return {
    W, H, SIZE, RED, BLACK,
    rowOf, colOf, at, onBoard,
    colorOf, typeOf, opposite, inPalace, ownHalf,
    parseFen, toFen, cloneBoard,
    genMoves, legalMoves, movesFrom, isLegalMove, applyMove,
    findKing, kingsFacing, isAttacked, inCheck, isMated, gameOver,
    moveToChinese, NAMES,
    checkingMoves, findMate, flattenLine, mateDistance, allMatingMoves,
  };
});

/*
 * verify.cjs — 規則引擎與題庫的驗算腳本
 *
 *   node chess/tools/verify.cjs
 *
 * 檢查項目：
 *   1. 規則引擎的基本正確性（開局著法數、蹩馬腿、砲架、白臉將⋯⋯）
 *   2. 每個教學示範局面合法，且示範的棋子確實有足夠的落點
 *   3. 開局棋譜每一著都合法
 *   4. 每一道戰術／殘局題：起始局面合法、標示步數確實成立、
 *      主變每一著合法、且最後對方確實無著可走
 *
 * 專案根目錄的 package.json 設了 "type": "module"，
 * 而 rules.js／data.js 是給瀏覽器用的傳統 script，因此這裡直接讀檔執行。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const JS = path.join(__dirname, '..', 'js');
const load = (f) => (0, eval)(fs.readFileSync(path.join(JS, f), 'utf8'));

load('rules.js');
const XQ = globalThis.XQ;
globalThis.window = globalThis;
load('data.js');
const D = globalThis.XQData;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; return; }
  fail++;
  console.log('✗ ' + name + (extra ? '  → ' + extra : ''));
}

/* ── 1. 規則引擎 ───────────────────────────────────── */
{
  const s = XQ.parseFen(D.START_FEN);
  ok('FEN 往返', XQ.toFen(s.board, s.side) === D.START_FEN);
  ok('開局紅方 44 種著法', XQ.legalMoves(s.board, 'r').length === 44);
  ok('開局黑方 44 種著法', XQ.legalMoves(s.board, 'b').length === 44);
  ok('炮二平五', XQ.moveToChinese(s.board, 70, 67) === '炮二平五');
  ok('馬二進三', XQ.moveToChinese(s.board, 88, 69) === '馬二進三');
  ok('車九平八', XQ.moveToChinese(s.board, 81, 82) === '車九平八');
  ok('兵七進一', XQ.moveToChinese(s.board, 56, 47) === '兵七進一');
  ok('黑砲8平5', XQ.moveToChinese(s.board, 25, 22) === '砲8平5');
  ok('黑馬8進7', XQ.moveToChinese(s.board, 7, 24) === '馬8進7');

  const b = new Array(90).fill('');
  b[4] = 'k'; b[85] = 'K';
  ok('白臉將偵測', XQ.kingsFacing(b));
  b[49] = 'P';
  ok('中間有子即非白臉將', !XQ.kingsFacing(b));

  const h = new Array(90).fill('');
  h[85] = 'K'; h[3] = 'k'; h[49] = 'N';
  ok('馬無阻礙有 8 個落點', XQ.movesFrom(h, 49).length === 8);
  h[40] = 'p';
  ok('蹩馬腿後剩 6 個落點', XQ.movesFrom(h, 49).length === 6);

  const c = new Array(90).fill('');
  c[85] = 'K'; c[3] = 'k'; c[45] = 'C'; c[49] = 'p';
  ok('炮無砲架不可吃子', !XQ.movesFrom(c, 45).some((m) => m.to === 49));
  c[47] = 'p';
  ok('炮有砲架可吃子', XQ.movesFrom(c, 45).some((m) => m.to === 49));
}

/* ── 2. 棋子走法示範 ───────────────────────────────── */
for (const p of D.PIECES) {
  const { board } = XQ.parseFen(p.fen);
  const n = XQ.movesFrom(board, p.focus).length;
  ok('示範局面「' + p.name + '」', board[p.focus] && !XQ.kingsFacing(board) && n >= 3,
    '落點 ' + n + '、對面笑 ' + XQ.kingsFacing(board));
}

/* ── 3. 開局棋譜 ───────────────────────────────────── */
{
  let b = XQ.parseFen(D.OPENING.fen).board, side = 'r', bad = null;
  for (const s of D.OPENING.steps) {
    if (XQ.colorOf(b[s.from]) !== side || !XQ.isLegalMove(b, s.from, s.to)) { bad = s; break; }
    b = XQ.applyMove(b, s);
    side = XQ.opposite(side);
  }
  ok('開局棋譜每一著合法', !bad, bad && JSON.stringify(bad));
}

/* ── 4. 戰術與題庫 ─────────────────────────────────── */
for (const t of [].concat(D.TACTICS, D.PUZZLES)) {
  const { board, side } = XQ.parseFen(t.fen);
  const label = t.id + ' ' + t.name;
  const probs = [];

  for (const s of ['r', 'b']) {
    const k = XQ.findKing(board, s);
    if (k < 0) probs.push(s + ' 方缺將帥');
    else if (!XQ.inPalace(s, XQ.rowOf(k), XQ.colOf(k))) probs.push(s + ' 方將帥不在九宮');
  }
  if (XQ.inCheck(board, XQ.opposite(side))) probs.push('未輪走方已被將軍');
  const dist = XQ.mateDistance(board, side, 4);
  if (dist !== t.mateIn) probs.push('實際 ' + (dist || '無') + ' 步殺，標示 ' + t.mateIn + ' 步');

  let b = board, s = side;
  for (const st of t.steps) {
    if (XQ.colorOf(b[st.from]) !== s || !XQ.isLegalMove(b, st.from, st.to)) {
      probs.push('主變有非法著法');
      break;
    }
    b = XQ.applyMove(b, st);
    s = XQ.opposite(s);
  }
  if (XQ.legalMoves(b, XQ.BLACK).length !== 0) probs.push('主變終局黑方仍有著可走');

  ok('題目 ' + label, probs.length === 0, probs.join('；'));
}

console.log(fail ? `\n${pass} 項通過，${fail} 項失敗` : `\n全部 ${pass} 項檢查通過`);
process.exit(fail ? 1 : 0);

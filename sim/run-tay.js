// Đoán lá tẩy: cho các máy chơi ván có cược thật (đúng kiểu chơi trong game) rồi đo xem
// lá tẩy của một nhà liên quan thế nào tới những gì người ngồi ghế "Bạn" nhìn thấy:
// lá ngửa, cách cược, và xấp bài ván trước. Ghi kết quả vào xito-tay-data.js.
//   Dùng: node sim/run-tay.js [số ván mỗi cấu hình = 200000] [số ván có máy đọc bài = 20000] [số ván đo xào bài = 400000]
// Ghế 0 là "Bạn", chơi theo đúng gợi ý của huấn luyện viên. Các ghế còn lại là máy như trong game.
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const X = require('../xito-engine.js');
const S = require('../xito-sim.js');

const BOTS = [{ name: 'Anh Ba', style: 'tight' }, { name: 'Chị Tư', style: 'loose' }, { name: 'Bác Sáu', style: 'sly' }];
const COACH = { label: 'Theo gợi ý', valueRel: 1.35, raiseRel: 1.6, margin: 0, bluff: 0 };
const BOT_ITERS = 1200;          // số lần thử trong botDecide (xito-engine.js)
const READ_ITERS = 500;          // số lần thử máy đọc bài dùng cho mỗi lá tẩy giả định
const ACTS = ['check', 'call', 'bet', 'raise', 'fold'];
const CLS = ['hit', 'sf', 'high', 'low'];

const zeros = (...dims) => (dims.length === 1 ? new Array(dims[0]).fill(0) : Array.from({ length: dims[0] }, () => zeros(...dims.slice(1))));
function addInto(a, b) { for (let i = 0; i < a.length; i++) { if (Array.isArray(a[i])) addInto(a[i], b[i]); else a[i] += b[i]; } return a; }
function Phi(z) {                // hàm phân phối chuẩn
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-z * z / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

/* Lá tẩy thuộc loại nào so với lá ngửa của chính nhà đó.
 * hit: trùng số một lá ngửa · sf: (đủ 5 lá) làm thành sảnh/thùng · high: A hoặc K lẻ · low: 9–Q lẻ */
function holeClass(cards) {
  const h = cards[0], r = X.rankOf(h);
  for (let k = 1; k < cards.length; k++) if (X.rankOf(cards[k]) === r) return 0;
  if (cards.length === 5 && X.classify(cards).cat >= 4) return 1;
  return r >= 4 ? 2 : 3;
}

/* Xác suất máy ghế i chọn từng hành động nếu lá tẩy của nó là `cand` — viết lại đúng botDecide().
 * Máy tự ước lượng tỉ lệ thắng bằng 1.200 lần thử nên có sai số; ở đây làm trơn bằng phân phối chuẩn. */
function actionLik(game, i, cand, rng) {
  const p = game.players[i], st = X.STYLES[p.style];
  const v = game.viewOf(i), L = game.legal(i);
  const e = X.equity([cand, ...game.ups(p)], v.oppUps, v.dead, game.strength, READ_ITERS, rng);
  const n = v.oppUps.length;
  const sd = Math.max(0.004, Math.sqrt(Math.max(e * (1 - e), 1e-4) * (1 / BOT_ITERS + 1 / READ_ITERS)));
  const ge = (thr) => Phi((e - thr) / sd);
  const last = game.street === 5;
  if (L.toCall === 0) {
    const val = L.canRaise ? ge(st.valueRel / (n + 1)) : 0;
    const bl = L.canRaise && !last ? st.bluff : 0;
    return { raise: val + (1 - val) * bl, check: (1 - val) * (1 - bl), call: 0, fold: 0 };
  }
  const pot = game.pot, potOdds = L.callAmt / (pot + L.callAmt);
  const pressure = 0.12 * Math.min(1, L.toCall / Math.max(1, pot - L.toCall));
  const a = L.canRaise ? ge(st.raiseRel / (n + 1)) : 0, c = ge(potOdds + st.margin + pressure);
  const bl = L.canRaise && !last ? st.bluff * 0.4 : 0;
  const R1 = Math.min(a, c), R2 = Math.max(0, a - c), R3 = Math.max(0, c - a), R4 = 1 - Math.max(a, c);
  return { raise: 0.85 * R1 + R2 * (0.85 + 0.15 * bl) + bl * R4, call: 0.15 * R1 + R3, fold: R2 * 0.15 * (1 - bl) + R4 * (1 - bl), check: 0 };
}

function newStats(n) {
  return {
    hands: 0, readerHands: 0,
    act: zeros(n, 4, 5, 2, 4),     // [ghế][lá 2..5][hành động][bài ngửa chưa có đôi / đã có đôi][loại tẩy]
    betSize: zeros(n, 4, 2, 2, 2), // tố mở: [ghế][lá][nhỏ (mức tối thiểu hoặc ≤ 0,58 hũ) / to][bài ngửa chưa đôi / có đôi][tổng, tẩy giúp bài]
    alive: zeros(n, 4, 2, 6),      // đầu mỗi vòng, nhà còn trong ván: [bài ngửa chưa đôi / có đôi][tổng, hit, sf, high, low, tổng xác suất theo đếm lá]
    aliveRank: zeros(n, 4, 6),     // đầu mỗi vòng: số của lá tẩy (9..A) ở nhà còn trong ván
    bet2: zeros(n, 6, 3),          // tố mở ở lá 2 theo số của lá ngửa: [tổng, tẩy trùng, tẩy A/K lẻ]
    rule: zeros(n, 4, 2, 2, 2),    // cuối vòng: [ghế][lá][đã từng tố][đã từng theo][tẩy giúp bài]
    rank: zeros(n, 4, 3),          // cuối vòng: [lượt, đoán số theo đếm lá đúng, đoán số theo mẹo đúng]
    reader: zeros(n, 4, 9),        // cuối vòng, ván có máy đọc: [lượt, đúng số, Σ P(số thật), đúng có/không, Σ Brier, đếm lá đúng số, mẹo đúng số, mẹo đúng có/không, số lần tẩy giúp bài]
    calib: zeros(10, 2),           // máy đọc nói p (theo 10 nấc) → [lượt, thật sự giúp bài]
  };
}

function runBetting({ n, hands, readerHands, seed }) {
  X.STYLES.coach = COACH;
  const rng = S.mulberry32(seed);
  const players = [{ name: 'Bạn', style: 'coach', stack: 1000 }].concat(BOTS.slice(BOTS.length - (n - 1)).map((b) => ({ ...b, stack: 1000 })));
  const game = new X.Game({ players, ante: 10, rng, shuffleMode: 'real3' });
  const st = newStats(n);
  const post = Array.from({ length: n }, () => new Float64Array(24));
  const aggr = new Uint8Array(n), called = new Uint8Array(n);
  const unseenOf = () => {                 // những lá ghế 0 chưa nhìn thấy
    const seen = new Uint8Array(24);
    for (const c of game.players[0].cards) seen[c] = 1;
    for (const p of game.players) if (p.id !== 0) for (const c of game.ups(p)) seen[c] = 1;
    const u = []; for (let c = 0; c < 24; c++) if (!seen[c]) u.push(c);
    return u;
  };
  const upsPaired = (p) => (X.classify(game.ups(p)).cat >= 1 ? 1 : 0);
  const helps = (p, h) => {                // lá h làm tẩy thì có giúp bài nhà p không
    const cls = holeClass([h, ...game.ups(p)]);
    return cls <= 1;
  };
  const roundStart = () => {
    const U = unseenOf(), si = game.street - 2;
    for (const p of game.players) {
      if (p.id === 0 || p.folded || p.out) continue;
      const a = st.alive[p.id][si][upsPaired(p)];
      a[0]++; a[1 + holeClass(p.cards)]++;
      st.aliveRank[p.id][si][X.rankOf(p.cards[0])]++;
      let k = 0; for (const h of U) if (helps(p, h)) k++;
      a[5] += k / U.length;
    }
  };
  const roundEnd = (reading) => {
    if (game.players[0].folded) return;
    const U = unseenOf(), si = game.street - 2;
    const cnt = [0, 0, 0, 0, 0, 0]; for (const h of U) cnt[X.rankOf(h)]++;
    const pickMax = (ok) => { let best = -1, ties = 0, pick = -1; for (let r = 0; r < 6; r++) { if (!ok(r)) continue; if (cnt[r] > best) { best = cnt[r]; ties = 1; pick = r; } else if (cnt[r] === best && rng() < 1 / ++ties) pick = r; } return pick; };
    const base = pickMax(() => true);
    for (const p of game.players) {
      if (p.id === 0 || p.folded || p.out) continue;
      const truth = X.rankOf(p.cards[0]), imp = holeClass(p.cards) <= 1 ? 1 : 0;
      st.rule[p.id][si][aggr[p.id]][called[p.id]][imp]++;
      const upR = new Set(game.ups(p).map(X.rankOf));
      let tip = base;                       // mẹo: ai đã tố thì đoán tẩy trùng lá ngửa còn nhiều lá chưa lộ nhất (bằng nhau thì lấy số to)
      if (aggr[p.id]) { let b = 0, t = -1; for (const r of upR) if (cnt[r] > b || (cnt[r] === b && b > 0 && r > t)) { b = cnt[r]; t = r; } if (b) tip = t; }
      const rk = st.rank[p.id][si];
      rk[0]++; if (base === truth) rk[1]++; if (tip === truth) rk[2]++;
      if (!reading) continue;
      const w = post[p.id];
      let sum = 0, pImp = 0; const pr = [0, 0, 0, 0, 0, 0];
      for (const h of U) { sum += w[h]; pr[X.rankOf(h)] += w[h]; if (helps(p, h)) pImp += w[h]; }
      if (!(sum > 0)) continue;
      pImp /= sum;
      let top = 0; for (let r = 1; r < 6; r++) if (pr[r] > pr[top]) top = r;
      const rd = st.reader[p.id][si];
      rd[0]++; if (top === truth) rd[1]++; rd[2] += pr[truth] / sum;
      if ((pImp >= 0.5 ? 1 : 0) === imp) rd[3]++;
      rd[4] += (pImp - imp) * (pImp - imp);
      if (base === truth) rd[5]++; if (tip === truth) rd[6]++;
      if (aggr[p.id] === imp) rd[7]++;
      rd[8] += imp;
      const cb = st.calib[Math.min(9, Math.floor(pImp * 10))]; cb[0]++; cb[1] += imp;
    }
  };

  for (let h = 0; h < hands; h++) {
    const reading = h < readerHands;
    for (const p of game.players) p.stack = 1000;
    game.startHand();
    aggr.fill(0); called.fill(0);
    if (reading) for (const w of post) w.fill(1);
    roundStart();
    while (game.phase !== 'done') {
      if (game.phase === 'between') {
        roundEnd(reading);
        game.proceed();
        if (game.phase !== 'done') roundStart();
        continue;
      }
      const i = game.toAct, p = game.players[i];
      const d = X.botDecide(game, i, rng);
      const L = game.legal(i);
      if (i !== 0) {
        const kind = d.type === 'raise' ? (L.toCall ? 'raise' : 'bet') : d.type;
        const si = game.street - 2, cls = holeClass(p.cards), pd = upsPaired(p);
        st.act[i][si][ACTS.indexOf(kind)][pd][cls]++;
        if (kind === 'bet') {
          const to = Math.max(L.minRaiseTo, Math.min(Math.round(d.raiseTo), L.maxRaiseTo));
          const small = to - game.currentBet <= Math.max(game.minBet, 0.58 * game.pot) ? 0 : 1;
          const b = st.betSize[i][si][small][pd]; b[0]++; if (cls <= 1) b[1]++;
          if (si === 0) { const b2 = st.bet2[i][X.rankOf(p.cards[1])]; b2[0]++; if (cls === 0) b2[1]++; else if (cls === 2) b2[2]++; }
        }
        if (reading) {
          const w = post[i];
          for (const c of unseenOf()) w[c] *= Math.max(1e-6, actionLik(game, i, c, rng)[d.type]);
        }
        if (d.type === 'raise') aggr[i] = 1; else if (d.type === 'call') called[i] = 1;
      }
      game.act(i, d.type, d.raiseTo);
    }
    st.hands++; if (reading) st.readerHands++;
  }
  return st;
}

/* Xào bài: lá tẩy ván này liên quan gì tới xấp bài gom lại của ván trước (ai cũng theo tới lá 5). */
function runShuffle({ n, hands, seed }) {
  const out = {};
  let s = seed;
  for (const key of Object.keys(X.SHUFFLES)) {
    const rng = S.mulberry32(s++);
    let prev = null, cases = 0, next = 0, either = 0, pairUp = 0;
    const idx = new Int8Array(24);
    for (let h = 0; h < hands; h++) {
      const deck = X.shuffleBy(prev, key, rng);
      if (prev) {
        for (let k = 0; k < 24; k++) idx[prev[k]] = k;
        for (let p = 0; p + 1 < n; p++) {       // tẩy của hai ghế liền nhau
          const a = idx[deck[p]], b = idx[deck[p + 1]];
          cases++;
          if (b === (a + 1) % 24) next++;
          if (b === (a + 1) % 24 || b === (a + 23) % 24) either++;
        }
        for (let p = 0; p < n; p++) if (X.rankOf(deck[p]) === X.rankOf(deck[n + p])) pairUp++;
      }
      const hs = Array.from({ length: n }, () => []);
      let top = 0;
      for (let r = 0; r < 5; r++) for (let p = 0; p < n; p++) hs[p].push(deck[top++]);
      prev = X.collect(hs, deck.slice(top));
    }
    out[key] = { next: next / cases, either: either / cases, pairUp: pairUp / ((hands - 1) * n) };
  }
  return out;
}

if (!isMainThread) {
  parentPort.postMessage(workerData.kind === 'shuffle' ? runShuffle(workerData) : runBetting(workerData));
} else if (require.main !== module) {
  module.exports = { holeClass, actionLik, runBetting, runShuffle };      // cho test
} else {
  const N = +(process.argv[2] || 200000), R = +(process.argv[3] || 20000), NS = +(process.argv[4] || 400000);
  const THREADS = Math.max(1, Math.min(8, require('os').cpus().length));
  const job = (data) => new Promise((res, rej) => { const w = new Worker(__filename, { workerData: data }); w.once('message', res); w.once('error', rej); });
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  (async () => {
    const out = { generated: new Date().toISOString().slice(0, 10), hands: N, readerHands: R, shuffleHands: NS, shuffleMode: 'real3',
      acts: ACTS, classes: CLS, runs: {}, shuffle: {} };
    let seed = 9100;
    for (const n of [4, 3, 2]) {
      const t = Date.now();
      const parts = await Promise.all(Array.from({ length: THREADS }, (_, k) => job({ kind: 'bet', n, seed: seed++,
        hands: Math.floor(N / THREADS) + (k < N % THREADS ? 1 : 0), readerHands: Math.floor(R / THREADS) + (k < R % THREADS ? 1 : 0) })));
      const st = parts.reduce((a, b) => { a.hands += b.hands; a.readerHands += b.readerHands; for (const f of ['act', 'betSize', 'alive', 'aliveRank', 'bet2', 'rule', 'rank', 'reader', 'calib']) addInto(a[f], b[f]); return a; });
      const bots = BOTS.slice(BOTS.length - (n - 1));
      out.runs[n] = {
        hands: st.hands, readerHands: st.readerHands,
        seats: bots.map((b, k) => ({ name: b.name, style: b.style,
          act: st.act[k + 1], betSize: st.betSize[k + 1], rule: st.rule[k + 1], rank: st.rank[k + 1],
          aliveRank: st.aliveRank[k + 1], bet2: st.bet2[k + 1],
          alive: st.alive[k + 1].map((row) => row.map((a) => a.slice(0, 5).concat(r4(a[0] ? a[5] / a[0] : 0)))),
          reader: st.reader[k + 1].map((a) => a.map((x, j) => (j === 2 || j === 4 ? r4(x) : x))) })),
        calib: st.calib,
      };
      console.log(`${n} người: ${st.hands} ván (${st.readerHands} ván có máy đọc) · ${((Date.now() - t) / 1000).toFixed(0)}s`);
    }
    const sh = await Promise.all([2, 3, 4].map((n) => job({ kind: 'shuffle', n, hands: NS, seed: 9900 + n * 10 })));
    [2, 3, 4].forEach((n, k) => { out.shuffle[n] = Object.fromEntries(Object.entries(sh[k]).map(([key, v]) => [key, { next: r4(v.next), either: r4(v.either), pairUp: r4(v.pairUp) }])); });
    const file = path.join(__dirname, '..', 'xito-tay-data.js');
    fs.writeFileSync(file, '/* Sinh tự động bởi sim/run-tay.js — đo lá tẩy trong ' + N.toLocaleString('vi-VN') + ' ván có cược cho mỗi số người. */\n' +
      '(function (r) { r.XitoTayData = ' + JSON.stringify(out) + '; })(typeof window !== "undefined" ? window : typeof self !== "undefined" ? self : globalThis);\n' +
      'if (typeof module !== "undefined") module.exports = (typeof window !== "undefined" ? window : globalThis).XitoTayData;\n');
    console.log('Đã ghi', file, (fs.statSync(file).size / 1024).toFixed(1) + ' KB');
  })();
}

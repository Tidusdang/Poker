// Đoán lá tẩy: cho các máy chơi ván có cược thật (đúng kiểu chơi trong game) rồi đo xem
// lá tẩy của một nhà liên quan thế nào tới những gì người ngồi ghế "Bạn" nhìn thấy:
// lá ngửa, cách cược, và xấp bài ván trước. Ghi kết quả vào xito-tay-data.js.
//   Dùng: node sim/run-tay.js [số ván mỗi cấu hình = 200000] [số phiên 200 ván ở bàn 4 người = 400] [số ván đo xào bài = 400000]
//   Chỉ chạy lại phần phiên chơi dài, giữ nguyên các số liệu khác: node sim/run-tay.js phien [số phiên = 400]
// Ghế 0 là "Bạn", chơi theo đúng gợi ý của huấn luyện viên (có tính cách cược). Các ghế còn lại là máy như trong game.
// "Máy đọc bài" là bộ đọc cách cược trong xito-engine.js (game.reads), nhìn từ ghế "Bạn".
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const X = require('../xito-engine.js');
const S = require('../xito-sim.js');

const BOTS = [{ name: 'Anh Ba', style: 'pro' }, { name: 'Chị Tư', style: 'loose' }, { name: 'Bác Sáu', style: 'sly' }];
const ACTS = ['check', 'call', 'bet', 'raise', 'fold'];
const CLS = ['hit', 'sf', 'high', 'low'];
const seatsFor = (n) => [{ name: 'Bạn', human: true, style: 'coach', stack: 1000 }].concat(BOTS.slice(BOTS.length - (n - 1)).map((b) => ({ ...b, stack: 1000 })));

const zeros = (...dims) => (dims.length === 1 ? new Array(dims[0]).fill(0) : Array.from({ length: dims[0] }, () => zeros(...dims.slice(1))));
function addInto(a, b) { for (let i = 0; i < a.length; i++) { if (Array.isArray(a[i])) addInto(a[i], b[i]); else a[i] += b[i]; } return a; }

/* Lá tẩy thuộc loại nào so với lá ngửa của chính nhà đó.
 * hit: trùng số một lá ngửa · sf: (đủ 5 lá) làm thành sảnh/thùng · high: A hoặc K lẻ · low: 9–Q lẻ */
function holeClass(cards) {
  const h = cards[0], r = X.rankOf(h);
  for (let k = 1; k < cards.length; k++) if (X.rankOf(cards[k]) === r) return 0;
  if (cards.length === 5 && X.classify(cards).cat >= 4) return 1;
  return r >= 4 ? 2 : 3;
}

function newStats(n) {
  return {
    hands: 0,
    act: zeros(n, 4, 5, 2, 4),     // [ghế][lá 2..5][hành động][bài ngửa chưa có đôi / đã có đôi][loại tẩy]
    betSize: zeros(n, 4, 2, 2, 2), // tố mở: [ghế][lá][nhỏ (mức tối thiểu hoặc ≤ 0,58 hũ) / to][bài ngửa chưa đôi / có đôi][tổng, tẩy giúp bài]
    alive: zeros(n, 4, 2, 6),      // đầu mỗi vòng, nhà còn trong ván: [bài ngửa chưa đôi / có đôi][tổng, hit, sf, high, low, tổng xác suất theo đếm lá]
    aliveRank: zeros(n, 4, 6),     // đầu mỗi vòng: số của lá tẩy (9..A) ở nhà còn trong ván
    bet2: zeros(n, 6, 3),          // tố mở ở lá 2 theo số của lá ngửa: [tổng, tẩy trùng, tẩy A/K lẻ]
    rule: zeros(n, 4, 2, 2, 2),    // cuối vòng: [ghế][lá][đã từng tố][đã từng theo][tẩy giúp bài]
    rank: zeros(n, 4, 3),          // cuối vòng: [lượt, đoán số theo đếm lá đúng, đoán số theo mẹo đúng]
    reader: zeros(n, 4, 9),        // cuối vòng, máy đọc từ ghế Bạn: [lượt, đúng số, Σ P(số thật), đúng có/không, Σ Brier, đếm lá đúng số, mẹo đúng số, mẹo đúng có/không, số lần tẩy giúp bài]
    calib: zeros(10, 2),           // máy đọc nói p (theo 10 nấc) → [lượt, thật sự giúp bài]
    net: zeros(n, 2),              // lời lỗ mỗi ván của từng ghế: [Σ chip, Σ chip²]
    end: zeros(n, 3),              // [ăn hũ không ai theo, tới lật bài, thắng khi lật bài]
    proRead: zeros(n, 4, 4),       // người lão luyện đoán tẩy của ghế kia, cuối mỗi vòng: [lượt, đúng số, đúng có/không giúp bài, đếm lá đúng số]
    faceRaise: zeros(n, 4, 2, 2),  // vừa tố xong thì bị tố lại: [lá][ghế Bạn tố lại / máy khác tố lại][lượt, bỏ]
  };
}

function runBetting({ n, hands, seed }) {
  const rng = S.mulberry32(seed);
  const game = new X.Game({ players: seatsFor(n), ante: 10, rng, shuffleMode: 'real3', reads: true });
  game.readAll = true;
  const st = newStats(n);
  const pro = game.players.findIndex((p) => !p.human && X.STYLES[p.style].pro);
  const aggr = new Uint8Array(n), called = new Uint8Array(n), lastAggr = new Int8Array(n);
  const unseenOf = (v) => {                // những lá ghế v chưa nhìn thấy
    const seen = new Uint8Array(24);
    for (const c of game.players[v].cards) seen[c] = 1;
    for (const p of game.players) if (p.id !== v) for (const c of game.ups(p)) seen[c] = 1;
    const u = []; for (let c = 0; c < 24; c++) if (!seen[c]) u.push(c);
    return u;
  };
  const upsPaired = (p) => (X.classify(game.ups(p)).cat >= 1 ? 1 : 0);
  const helps = (p, h) => holeClass([h, ...game.ups(p)]) <= 1;   // lá h làm tẩy thì có giúp bài nhà p không
  const roundStart = () => {
    const U = unseenOf(0), si = game.street - 2;
    for (const p of game.players) {
      if (p.id === 0 || p.folded || p.out) continue;
      const a = st.alive[p.id][si][upsPaired(p)];
      a[0]++; a[1 + holeClass(p.cards)]++;
      st.aliveRank[p.id][si][X.rankOf(p.cards[0])]++;
      let k = 0; for (const h of U) if (helps(p, h)) k++;
      a[5] += k / U.length;
    }
  };
  const countPick = (U) => {               // đoán số lá tẩy chỉ bằng đếm lá: số còn nhiều lá chưa lộ nhất
    const cnt = [0, 0, 0, 0, 0, 0]; for (const h of U) cnt[X.rankOf(h)]++;
    let best = -1, ties = 0, pick = -1;
    for (let r = 0; r < 6; r++) { if (cnt[r] > best) { best = cnt[r]; ties = 1; pick = r; } else if (cnt[r] === best && rng() < 1 / ++ties) pick = r; }
    return { cnt, pick };
  };
  const roundEnd = () => {
    const si = game.street - 2;
    if (pro >= 0 && !game.players[pro].folded) {          // người lão luyện đoán tẩy các nhà còn lại
      const base = countPick(unseenOf(pro)).pick;
      for (const q of game.players) {
        if (q.id === pro || q.folded || q.out) continue;
        const r = X.readOf(game, pro, q.id); if (!r) continue;
        const truth = X.rankOf(q.cards[0]), imp = holeClass(q.cards) <= 1;
        const a = st.proRead[q.id][si];
        a[0]++; if (r.top === truth) a[1]++; if ((r.helps >= 0.5) === imp) a[2]++; if (base === truth) a[3]++;
      }
    }
    if (game.players[0].folded) return;
    const { cnt, pick: base } = countPick(unseenOf(0));
    for (const p of game.players) {
      if (p.id === 0 || p.folded || p.out) continue;
      const truth = X.rankOf(p.cards[0]), imp = holeClass(p.cards) <= 1 ? 1 : 0;
      st.rule[p.id][si][aggr[p.id]][called[p.id]][imp]++;
      const upR = new Set(game.ups(p).map(X.rankOf));
      let tip = base;                       // mẹo: ai đã tố thì đoán tẩy trùng lá ngửa còn nhiều lá chưa lộ nhất (bằng nhau thì lấy số to)
      if (aggr[p.id]) { let b = 0, t = -1; for (const r of upR) if (cnt[r] > b || (cnt[r] === b && b > 0 && r > t)) { b = cnt[r]; t = r; } if (b) tip = t; }
      const rk = st.rank[p.id][si];
      rk[0]++; if (base === truth) rk[1]++; if (tip === truth) rk[2]++;
      const r = X.readOf(game, 0, p.id);
      if (!r) continue;
      const pImp = r.helps, rd = st.reader[p.id][si];
      rd[0]++; if (r.top === truth) rd[1]++; rd[2] += r.byRank[truth];
      if ((pImp >= 0.5 ? 1 : 0) === imp) rd[3]++;
      rd[4] += (pImp - imp) * (pImp - imp);
      if (base === truth) rd[5]++; if (tip === truth) rd[6]++;
      if (aggr[p.id] === imp) rd[7]++;
      rd[8] += imp;
      const cb = st.calib[Math.min(9, Math.floor(pImp * 10))]; cb[0]++; cb[1] += imp;
    }
  };

  for (let h = 0; h < hands; h++) {
    for (const p of game.players) p.stack = 1000;
    game.startHand();
    aggr.fill(0); called.fill(0); lastAggr.fill(0);
    let lastRaiser = -1;
    roundStart();
    while (game.phase !== 'done') {
      if (game.phase === 'between') {
        roundEnd();
        game.proceed();
        lastAggr.fill(0); lastRaiser = -1;
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
        if (lastAggr[i] && L.toCall > 0) { const f = st.faceRaise[i][si][lastRaiser === 0 ? 0 : 1]; f[0]++; if (d.type === 'fold') f[1]++; }
        if (d.type === 'raise') aggr[i] = 1; else if (d.type === 'call') called[i] = 1;
      }
      lastAggr[i] = d.type === 'raise' ? 1 : 0;
      if (d.type === 'raise') lastRaiser = i;
      game.act(i, d.type, d.raiseTo);
      if (game.readError) throw game.readError;
    }
    const res = game.results;
    for (const p of game.players) {
      const x = res.net[p.id] || 0;
      st.net[p.id][0] += x; st.net[p.id][1] += x * x;
      if (p.folded) continue;
      if (res.byFold) st.end[p.id][0]++;
      else { st.end[p.id][1]++; if (x > 0) st.end[p.id][2]++; }
    }
    st.hands++;
  }
  return st;
}

/* Phiên chơi như trong game: chip mang từ ván này sang ván khác, ai hết chip thì mang thêm 1.000.
 * Trả về lời lỗ cộng dồn của từng ghế sau 50, 100, 200 ván của mỗi phiên. */
function runSessions({ n, sessions, len = 200, marks = [50, 100, 200], seed }) {
  const rng = S.mulberry32(seed);
  const out = [];
  for (let s = 0; s < sessions; s++) {
    const game = new X.Game({ players: seatsFor(n), ante: 10, rng, shuffleMode: 'real3', reads: true });
    game.readAll = true;
    const buy = new Array(n).fill(1000), row = [];
    for (let h = 1; h <= len; h++) {
      for (const p of game.players) if (p.stack <= 0) { p.stack = 1000; buy[p.id] += 1000; }
      game.startHand();
      while (game.phase !== 'done') {
        if (game.phase === 'between') { game.proceed(); continue; }
        const d = X.botDecide(game, game.toAct, rng);
        game.act(game.toAct, d.type, d.raiseTo);
        if (game.readError) throw game.readError;
      }
      if (marks.includes(h)) row.push(game.players.map((p) => p.stack - buy[p.id]));
    }
    out.push(row);
  }
  return out;
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
  const k = workerData.kind;
  parentPort.postMessage(k === 'shuffle' ? runShuffle(workerData) : k === 'session' ? runSessions(workerData) : runBetting(workerData));
} else if (require.main !== module) {
  module.exports = { holeClass, runBetting, runShuffle, runSessions };      // cho test
} else {
  const ONLY_SES = process.argv[2] === 'phien';
  const N = ONLY_SES ? 0 : +(process.argv[2] || 200000), NSES = +(process.argv[3] || 400), NS = +(process.argv[4] || 400000);
  const THREADS = Math.max(1, Math.min(8, require('os').cpus().length));
  const job = (data) => new Promise((res, rej) => { const w = new Worker(__filename, { workerData: data }); w.once('message', res); w.once('error', rej); });
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  const MARKS = [50, 100, 200];
  (async () => {
    const file = path.join(__dirname, '..', 'xito-tay-data.js');
    const out = ONLY_SES ? require(file) : { generated: new Date().toISOString().slice(0, 10), hands: N, shuffleHands: NS, shuffleMode: 'real3',
      acts: ACTS, classes: CLS, runs: {}, shuffle: {} };
    let seed = 9100;
    for (const n of ONLY_SES ? [] : [4, 3, 2]) {
      const t = Date.now();
      const parts = await Promise.all(Array.from({ length: THREADS }, (_, k) => job({ kind: 'bet', n, seed: seed++,
        hands: Math.floor(N / THREADS) + (k < N % THREADS ? 1 : 0) })));
      const st = parts.reduce((a, b) => { a.hands += b.hands; for (const f of ['act', 'betSize', 'alive', 'aliveRank', 'bet2', 'rule', 'rank', 'reader', 'calib', 'net', 'end', 'proRead', 'faceRaise']) addInto(a[f], b[f]); return a; });
      const bots = BOTS.slice(BOTS.length - (n - 1));
      const netOf = (k) => { const m = st.net[k][0] / st.hands; return [r4(m), r4(Math.sqrt(Math.max(0, st.net[k][1] / st.hands - m * m) / st.hands))]; };   // [chip mỗi ván, sai số chuẩn]
      out.runs[n] = {
        hands: st.hands, readerHands: st.hands,
        you: { net: netOf(0), end: st.end[0], read: st.proRead[0] },
        seats: bots.map((b, k) => ({ name: b.name, style: b.style,
          act: st.act[k + 1], betSize: st.betSize[k + 1], rule: st.rule[k + 1], rank: st.rank[k + 1],
          aliveRank: st.aliveRank[k + 1], bet2: st.bet2[k + 1],
          alive: st.alive[k + 1].map((row) => row.map((a) => a.slice(0, 5).concat(r4(a[0] ? a[5] / a[0] : 0)))),
          reader: st.reader[k + 1].map((a) => a.map((x, j) => (j === 2 || j === 4 ? r4(x) : x))),
          net: netOf(k + 1), end: st.end[k + 1], faceRaise: st.faceRaise[k + 1], read: st.proRead[k + 1] })),
        calib: st.calib,
      };
      console.log(`${n} người: ${st.hands} ván · ${((Date.now() - t) / 1000).toFixed(0)}s · lời mỗi ván: Bạn ${netOf(0)[0]}, ` + bots.map((b, k) => `${b.name} ${netOf(k + 1)[0]}`).join(', '));
    }
    if (NSES > 0) {            // phiên chơi dài ở bàn 4 người (bàn có người lão luyện)
      const t = Date.now();
      const parts = await Promise.all(Array.from({ length: THREADS }, (_, k) => job({ kind: 'session', n: 4, seed: 9500 + k, marks: MARKS,
        sessions: Math.floor(NSES / THREADS) + (k < NSES % THREADS ? 1 : 0) })));
      const all = parts.flat();
      const names = ['Bạn'].concat(BOTS.map((b) => b.name));
      out.sessions = { players: 4, count: all.length, marks: MARKS, names,
        // mỗi mốc, mỗi ghế: [lời trung bình, tỉ lệ phiên có lời, mức của 10% phiên tệ nhất, phiên tệ nhất]
        stats: MARKS.map((_, mi) => names.map((_, s) => {
          const xs = all.map((row) => row[mi][s]).sort((a, b) => a - b);
          return [Math.round(xs.reduce((a, b) => a + b, 0) / xs.length), r4(xs.filter((x) => x > 0).length / xs.length), xs[Math.floor(xs.length * 0.1)], xs[0]];
        })) };
      console.log(`Phiên chơi: ${all.length} phiên × ${MARKS[MARKS.length - 1]} ván · ${((Date.now() - t) / 1000).toFixed(0)}s · ` +
        MARKS.map((m, mi) => `sau ${m} ván Anh Ba có lời ${(out.sessions.stats[mi][1][1] * 100).toFixed(0)}% số phiên`).join(', '));
    }
    if (!ONLY_SES) {
      const sh = await Promise.all([2, 3, 4].map((n) => job({ kind: 'shuffle', n, hands: NS, seed: 9900 + n * 10 })));
      [2, 3, 4].forEach((n, k) => { out.shuffle[n] = Object.fromEntries(Object.entries(sh[k]).map(([key, v]) => [key, { next: r4(v.next), either: r4(v.either), pairUp: r4(v.pairUp) }])); });
    }
    fs.writeFileSync(file, '/* Sinh tự động bởi sim/run-tay.js — đo lá tẩy trong ' + out.hands.toLocaleString('vi-VN') + ' ván có cược cho mỗi số người. */\n' +
      '(function (r) { r.XitoTayData = ' + JSON.stringify(out) + '; })(typeof window !== "undefined" ? window : typeof self !== "undefined" ? self : globalThis);\n' +
      'if (typeof module !== "undefined") module.exports = (typeof window !== "undefined" ? window : globalThis).XitoTayData;\n');
    console.log('Đã ghi', file, (fs.statSync(file).size / 1024).toFixed(1) + ' KB');
  })();
}

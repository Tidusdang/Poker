const X = require('../xito-engine.js');
const assert = require('assert');
const C = (s) => { const m = s.match(/^(9|10|J|Q|K|A)(.)$/); return X.RANKS.indexOf(m[1]) * 4 + X.SUITS.indexOf(m[2]); };
const H = (s) => s.split(' ').map(C);
const S = X.RULESETS.standard.strength;
const beats = (a, b, st = S) => X.scoreOf(H(a), st) > X.scoreOf(H(b), st);

// tần suất
assert.deepStrictEqual(X.handFrequencies(), [4080, 23040, 8640, 3840, 2040, 16, 720, 120, 8]);
// xếp hạng
assert(beats('9♣ 10♣ J♣ Q♣ K♣', 'A♠ A♥ A♦ A♣ K♠'));
assert(beats('A♠ A♥ A♦ A♣ 9♠', 'K♠ K♥ K♦ A♣ A♠'));
assert(beats('K♠ K♥ K♦ A♣ A♠', '9♥ 10♥ J♥ Q♥ A♥'));                  // cù lũ > thùng (luật gốc)
assert(!beats('K♠ K♥ K♦ A♣ A♠', '9♥ 10♥ J♥ Q♥ A♥', X.RULESETS.flushOverFull.strength));
assert(beats('9♥ 10♥ J♥ Q♥ A♥', 'A♠ A♥ A♦ A♣ 9♠', X.RULESETS.byOdds.strength));
assert(beats('10♣ J♦ Q♥ K♠ A♣', '9♠ 10♠ J♠ Q♠ K♥'));                   // sảnh lớn
assert(beats('9♣ 10♦ J♥ Q♠ K♣', 'A♠ A♥ A♦ K♣ Q♠'));                     // sảnh > sám
// so chất khi đồng số
assert(beats('A♠ A♣ K♥ Q♦ 9♣', 'A♥ A♦ K♠ Q♠ 9♠'));                     // đôi A: A♠ thắng
assert(beats('10♣ J♦ Q♥ K♠ A♠', '10♠ J♠ Q♦ K♥ A♥'));                   // sảnh tới A: A♠ > A♥
assert(beats('A♠ A♥ K♣ K♦ 9♣', 'A♦ A♣ K♠ K♥ 9♥'));                     // thú: cặp A chất cao hơn
assert.strictEqual(X.describe(H('K♠ K♥ K♦ A♣ A♠')), 'Cù lũ K – A');
// tổng xác suất về bài = 1
const d = X.drawOut(H('A♠ A♥'), H('K♠ 9♣'));
assert(Math.abs(d.reduce((a, b) => a + b) - 1) < 1e-9);

// giả lập nhiều ván, kiểm tra bảo toàn chip
let seed = 42; const rng = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
for (const n of [2, 3, 4]) {
  const g = new X.Game({ players: Array.from({ length: n }, (_, i) => ({ name: 'P' + i, stack: 300 + i * 150, style: ['tight', 'loose', 'sly'][i % 3] })), ante: 10, rng });
  const total = () => g.players.reduce((s, p) => s + p.stack, 0);
  const T = total(); let sidePots = 0, folds = 0;
  for (let h = 0; h < 400; h++) {
    for (const p of g.players) if (p.stack <= 0) p.stack = 300;          // nạp lại
    const T0 = total();
    g.startHand();
    let guard = 0;
    while (g.phase !== 'done') {
      if (++guard > 500) throw new Error('lặp vô hạn');
      if (g.phase === 'between') g.proceed();
      else { const a = X.botDecide(g, g.toAct, rng); g.act(g.toAct, a.type, a.raiseTo); }
      assert(g.players.every((p) => p.stack >= 0));
    }
    assert.strictEqual(total(), T0, 'mất chip ở ván ' + h);
    const net = Object.values(g.results.net).reduce((a, b) => a + b, 0);
    assert.strictEqual(net, 0);
    if (g.results.pots.length > 1) sidePots++;
    if (g.results.byFold) folds++;
  }
  console.log(`${n} người: OK, ${sidePots} ván có hũ phụ, ${folds} ván thắng do bỏ bài`);
}
console.log('Tất cả test đều qua');

// xào bài như ngoài đời: mọi kiểu xào đều cho ra đủ 24 lá, không mất/trùng lá; bài mang sang ván sau
{
  const rng = () => Math.random();
  for (const key of Object.keys(X.SHUFFLES)) {
    let d = X.newDeck();
    for (let i = 0; i < 50; i++) { d = X.shuffleBy(d, key, rng); assert.deepStrictEqual([...d].sort((a, b) => a - b), X.newDeck(), key); }
  }
  const g = new X.Game({ players: [{ name: 'A', stack: 500 }, { name: 'B', stack: 500 }, { name: 'C', stack: 500 }], ante: 10, shuffleMode: 'cutonly' });
  for (let h = 0; h < 30; h++) {
    for (const p of g.players) if (p.stack <= 0) p.stack = 500;
    g.startHand();
    while (g.phase !== 'done') { if (g.phase === 'between') g.proceed(); else { const a = X.botDecide(g, g.toAct); g.act(g.toAct, a.type, a.raiseTo); } }
    assert.deepStrictEqual([...g.prevOrder].sort((a, b) => a - b), X.newDeck(), 'gom bài đủ 24 lá');
  }
  console.log('Xào bài và gom bài: OK');
}

// đoán lá tẩy: phân loại lá tẩy, bộ đọc cách cược trong engine, người lão luyện, và một lượt đo nhỏ
{
  const T = require('../sim/run-tay.js');
  const S = require('../xito-sim.js');
  const c = (r, s) => r * 4 + s;                      // r: 0..5 = 9..A
  assert.strictEqual(T.holeClass([c(4, 0), c(4, 1)]), 0, 'tẩy K, ngửa K → trùng');
  assert.strictEqual(T.holeClass([c(5, 0), c(4, 1)]), 2, 'tẩy A lẻ');
  assert.strictEqual(T.holeClass([c(1, 0), c(4, 1)]), 3, 'tẩy 10 lẻ');
  assert.strictEqual(T.holeClass([c(0, 0), c(1, 1), c(2, 2), c(3, 3), c(4, 0)]), 1, 'tẩy 9 làm thành sảnh');
  assert.strictEqual(T.holeClass([c(0, 0), c(1, 1), c(2, 2), c(3, 3), c(5, 0)]), 3, 'tẩy 9, ngửa 10 J Q A: không thành sảnh, là lá nhỏ lẻ');
  assert(X.holeHelps([c(4, 0), c(4, 1)]) && !X.holeHelps([c(5, 0), c(4, 1)]), 'tẩy giúp bài khi trùng số lá ngửa');

  // hàm chấm điểm nhanh phải giống hệt cách tính gốc
  {
    const rng = S.mulberry32(11);
    for (const k of Object.keys(X.RULESETS)) {
      const str = X.RULESETS[k].strength;
      for (let it = 0; it < 20000; it++) {
        const h = X.shuffle(X.newDeck(), rng).slice(0, 1 + ((rng() * 5) | 0));
        assert.strictEqual(X.scoreOf(h, str), X.scoreOfSlow(h, str), 'điểm bài tính nhanh khác cách tính gốc');
      }
    }
  }

  // mô hình "máy thường sẽ cược gì": xác suất các hành động cộng lại bằng 1
  for (const key of ['tight', 'loose', 'sly', 'coach']) {
    const st = X.STYLES[key];
    for (const ctx of [{ toCall: 0, canRaise: true, n: 3, last: false, potOdds: 0, press: 0 },
      { toCall: 40, canRaise: true, n: 2, last: false, potOdds: 0.33, press: 1 },
      { toCall: 300, canRaise: false, n: 1, last: true, potOdds: 0.45, press: 0.8 }]) {
      for (const e of [0.05, 0.25, 0.4, 0.6, 0.9]) {
        const pr = X.simpleProbs(st, ctx, e, 0.03);
        const total = pr.value + pr.bluff + pr.call + pr.check + pr.fold;
        assert(Math.abs(total - 1) < 1e-9, 'xác suất các hành động phải cộng lại bằng 1');
        if (ctx.toCall === 0) assert(pr.call === 0 && pr.fold === 0); else assert(pr.check === 0);
        if (!ctx.canRaise) assert(pr.value === 0 && pr.bluff === 0, 'không tố được thì xác suất tố bằng 0');
      }
    }
  }

  // bàn 4 người như trong game: Anh Ba lão luyện, có theo dõi cách cược
  const rng = S.mulberry32(7);
  const g = new X.Game({ players: [{ name: 'Bạn', human: true, style: 'coach', stack: 1000 }, { name: 'Anh Ba', style: 'pro', stack: 1000 },
    { name: 'Chị Tư', style: 'loose', stack: 1000 }, { name: 'Bác Sáu', style: 'sly', stack: 1000 }], ante: 10, rng, shuffleMode: 'real3' });
  assert(g.useReads, 'bàn có người lão luyện thì tự bật đọc bài');
  g.readAll = true;
  let checked = 0, proActs = 0, proPot = 0;
  for (let h = 0; h < 25; h++) {
    for (const p of g.players) p.stack = 1000;
    g.startHand();
    while (g.phase !== 'done') {
      if (g.phase === 'between') {
        for (const v of g.players) for (const t of g.players) {       // ai đoán ai cũng phải ra phân phối hợp lệ
          if (v.id === t.id || v.folded || t.folded) continue;
          const r = X.readOf(g, v.id, t.id);
          assert(r && Math.abs(r.byRank.reduce((x, y) => x + y, 0) - 1) < 1e-9 && r.helps >= 0 && r.helps <= 1, 'đoán tẩy phải là phân phối xác suất');
        }
        g.proceed(); continue;
      }
      const i = g.toAct, L = g.legal(i), p = g.players[i];
      if (p.style === 'pro') {
        const pr = X.proProbs(g, i, p.cards[0]);
        assert(Math.abs(pr.raise + pr.call + pr.check + pr.fold - 1) < 1e-9, 'xác suất hành động của người lão luyện phải cộng lại bằng 1');
        if (L.toCall === 0) assert(pr.call === 0 && pr.fold === 0); else assert(pr.check === 0);
      }
      const a = X.botDecide(g, i, rng);
      if (p.style === 'pro') {
        proActs++;
        assert(['raise', 'call', 'check', 'fold'].includes(a.type));
        if (L.toCall === 0) assert(a.type !== 'fold', 'được xem miễn phí thì không úp');
        if (a.type === 'raise' && L.toCall === 0) {      // tố mở: đúng cỡ cả hũ (hoặc tất tay khi gần hết chip)
          const potBet = Math.max(g.minBet, Math.round(g.pot / 5) * 5);
          assert(a.raiseTo === Math.min(potBet, L.maxRaiseTo) || a.raiseTo === L.maxRaiseTo, 'người lão luyện tố cả hũ');
          proPot++;
        }
      }
      g.act(i, a.type, a.raiseTo);
      assert(!g.readError, 'đọc bài không được lỗi: ' + (g.readError && g.readError.stack));
      assert(g.reads, 'vẫn đang theo dõi cách cược');
      checked++;
    }
  }
  assert(proActs > 20 && proPot > 5, 'người lão luyện phải có tố mở trong 25 ván');

  // huấn luyện viên: có đọc cách cược thì trả thêm con số "chỉ nhìn lá ngửa" và dự đoán lá tẩy từng đối thủ
  {
    for (const p of g.players) p.stack = 1000;
    g.startHand();
    while (g.phase !== 'done' && g.toAct !== 0) { if (g.phase === 'between') { g.proceed(); continue; } const a = X.botDecide(g, g.toAct, rng); g.act(g.toAct, a.type, a.raiseTo); }
    if (g.phase === 'betting' && g.toAct === 0) {
      const a = X.analyze(g, 0, 800);
      assert(a.read === true && a.equity >= 0 && a.equity <= 1 && a.equityFlat >= 0 && a.equityFlat <= 1);
      assert(a.oppInfo.every((o) => o.guess && o.guess.byRank.length === 6));
    }
  }
  // không bật đọc bài thì huấn luyện viên tính như cũ
  {
    const g2 = new X.Game({ players: [{ name: 'Bạn', human: true, stack: 500 }, { name: 'B', style: 'sly', stack: 500 }], ante: 10 });
    assert(!g2.useReads);
    g2.startHand();
    while (g2.phase !== 'done' && g2.toAct !== 0) { if (g2.phase === 'between') { g2.proceed(); continue; } const a = X.botDecide(g2, g2.toAct); g2.act(g2.toAct, a.type, a.raiseTo); }
    if (g2.phase === 'betting') { const a = X.analyze(g2, 0, 500); assert(a.read === false && a.equityFlat === a.equity && a.oppInfo[0].guess === null); }
  }

  const st = T.runBetting({ n: 3, hands: 40, seed: 1 });
  assert.strictEqual(st.hands, 40);
  assert.strictEqual(st.alive[1][0][0][0] + st.alive[1][0][1][0], 40, 'đầu ván máy nào cũng còn trong ván');
  assert(Math.abs(st.net.reduce((x, y) => x + y[0], 0)) < 1e-6, 'tổng lời lỗ cả bàn bằng 0');
  const st4 = T.runBetting({ n: 4, hands: 30, seed: 2 });
  assert(st4.proRead[0][0][0] > 0, 'người lão luyện có đoán tẩy của ghế Bạn');
  assert(Math.abs(st4.net.reduce((x, y) => x + y[0], 0)) < 1e-6);
  const ses = T.runSessions({ n: 4, sessions: 2, len: 20, marks: [10, 20], seed: 5 });
  assert(ses.length === 2 && ses[0].length === 2 && ses[0][1].length === 4);
  assert(ses.every((row) => row.every((m) => m.reduce((x, y) => x + y, 0) === 0)), 'lời lỗ cộng dồn cả bàn bằng 0');
  const sh = T.runShuffle({ n: 4, hands: 400, seed: 3 });
  assert(sh.cutonly.next > 0.99 && sh.perfect.next < 0.15, 'chỉ kinh thì thứ tự giữ nguyên, trộn kỹ thì không');
  console.log(`Đoán lá tẩy và người lão luyện: OK (${checked} quyết định)`);
}

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

// đoán lá tẩy: phân loại lá tẩy, mô hình "máy sẽ cược gì nếu tẩy là lá này", và một lượt đo nhỏ
{
  const T = require('../sim/run-tay.js');
  const c = (r, s) => r * 4 + s;                      // r: 0..5 = 9..A
  assert.strictEqual(T.holeClass([c(4, 0), c(4, 1)]), 0, 'tẩy K, ngửa K → trùng');
  assert.strictEqual(T.holeClass([c(5, 0), c(4, 1)]), 2, 'tẩy A lẻ');
  assert.strictEqual(T.holeClass([c(1, 0), c(4, 1)]), 3, 'tẩy 10 lẻ');
  assert.strictEqual(T.holeClass([c(0, 0), c(1, 1), c(2, 2), c(3, 3), c(4, 0)]), 1, 'tẩy 9 làm thành sảnh');
  assert.strictEqual(T.holeClass([c(0, 0), c(1, 1), c(2, 2), c(3, 3), c(5, 0)]), 3, 'tẩy 9, ngửa 10 J Q A: không thành sảnh, là lá nhỏ lẻ');
  const g = new X.Game({ players: [{ name: 'Bạn', style: 'sly', stack: 1000 }, { name: 'Anh Ba', style: 'tight', stack: 1000 }, { name: 'Chị Tư', style: 'loose', stack: 1000 }], ante: 10 });
  let checked = 0;
  for (let h = 0; h < 6; h++) {
    for (const p of g.players) p.stack = 1000;
    g.startHand();
    while (g.phase !== 'done') {
      if (g.phase === 'between') { g.proceed(); continue; }
      const i = g.toAct, L = g.legal(i);
      const lik = T.actionLik(g, i, g.players[i].cards[0], Math.random);
      const total = lik.raise + lik.call + lik.check + lik.fold;
      assert(Math.abs(total - 1) < 1e-9, 'xác suất các hành động phải cộng lại bằng 1');
      assert(Object.values(lik).every((x) => x >= 0 && x <= 1));
      if (L.toCall === 0) assert(lik.call === 0 && lik.fold === 0); else assert(lik.check === 0);
      checked++;
      const a = X.botDecide(g, i); g.act(i, a.type, a.raiseTo);
    }
  }
  const st = T.runBetting({ n: 3, hands: 40, readerHands: 5, seed: 1 });
  assert.strictEqual(st.hands, 40);
  assert.strictEqual(st.alive[1][0][0][0] + st.alive[1][0][1][0], 40, 'đầu ván máy nào cũng còn trong ván');
  const sh = T.runShuffle({ n: 4, hands: 400, seed: 3 });
  assert(sh.cutonly.next > 0.99 && sh.perfect.next < 0.15, 'chỉ kinh thì thứ tự giữ nguyên, trộn kỹ thì không');
  console.log(`Đoán lá tẩy: OK (${checked} quyết định)`);
}

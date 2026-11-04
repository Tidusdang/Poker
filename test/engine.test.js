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

/* Xì tố 24 lá — engine luật chơi, đánh giá bài, xác suất và AI.
 * Bộ bài: 9, 10, J, Q, K, A × 4 chất. Lá bài = rank*4 + suit.
 * rank 0..5 = 9..A ; suit 0..3 = ♣ ♦ ♥ ♠ (chất lớn dần).
 * Chạy được cả trong trình duyệt (window.Xito) lẫn Node (module.exports).
 */
(function (root) {
  'use strict';

  const RANKS = ['9', '10', 'J', 'Q', 'K', 'A'];
  const SUITS = ['♣', '♦', '♥', '♠'];
  const CAT_NAMES = ['Mậu thầu', 'Đôi', 'Thú', 'Sám cô', 'Sảnh', 'Thùng', 'Cù lũ', 'Tứ quý', 'Thùng phá sảnh'];

  // strength[cat] = thứ hạng của loại bài trong từng bộ luật
  const RULESETS = {
    standard: {
      label: 'Luật gốc',
      desc: 'Thùng phá sảnh > Tứ quý > Cù lũ > Thùng > Sảnh > Sám cô > Thú > Đôi > Mậu thầu',
      strength: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    },
    flushOverFull: {
      label: 'Thùng ăn cù lũ',
      desc: 'Kiểu short-deck phổ biến: Thùng xếp trên Cù lũ',
      strength: [0, 1, 2, 3, 4, 6, 5, 7, 8],
    },
    byOdds: {
      label: 'Theo xác suất',
      desc: 'Thùng (16 tổ hợp) xếp trên cả Tứ quý (120 tổ hợp)',
      strength: [0, 1, 2, 3, 4, 7, 5, 6, 8],
    },
  };

  const rankOf = (c) => c >> 2;
  const suitOf = (c) => c & 3;
  const cardLabel = (c) => RANKS[rankOf(c)] + SUITS[suitOf(c)];
  const isRed = (c) => suitOf(c) === 1 || suitOf(c) === 2;
  const newDeck = () => Array.from({ length: 24 }, (_, i) => i);

  function shuffle(a, rng = Math.random) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0;
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* Phân loại 1..5 lá. Với < 5 lá chỉ tính đôi/thú/sám/tứ quý (bài ngửa). */
  function classify(cards) {
    const n = cards.length;
    const cnt = [0, 0, 0, 0, 0, 0];
    let flush = n === 5;
    const s0 = suitOf(cards[0]);
    for (const c of cards) {
      cnt[rankOf(c)]++;
      if (suitOf(c) !== s0) flush = false;
    }
    const sorted = cards.slice().sort((a, b) =>
      (cnt[rankOf(b)] - cnt[rankOf(a)]) || (rankOf(b) - rankOf(a)) || (suitOf(b) - suitOf(a)));
    let maxc = 0, pairs = 0, trips = 0;
    for (const k of cnt) {
      if (k > maxc) maxc = k;
      if (k === 2) pairs++;
      if (k === 3) trips++;
    }
    const straight = n === 5 && maxc === 1 && rankOf(sorted[0]) - rankOf(sorted[4]) === 4;
    let cat;
    if (straight && flush) cat = 8;
    else if (maxc === 4) cat = 7;
    else if (trips && pairs) cat = 6;
    else if (flush) cat = 5;
    else if (straight) cat = 4;
    else if (trips) cat = 3;
    else if (pairs === 2) cat = 2;
    else if (pairs === 1) cat = 1;
    else cat = 0;
    return { cat, sorted };
  }

  /* Điểm so bài: hạng loại bài → số (theo nhóm) → chất. Hai bộ khác nhau không bao giờ hòa. */
  function scoreOf(cards, strength) {
    const { cat, sorted } = classify(cards);
    let s = strength[cat];
    for (let i = 0; i < 5; i++) s = s * 7 + (i < sorted.length ? rankOf(sorted[i]) + 1 : 0);
    for (let i = 0; i < 5; i++) s = s * 5 + (i < sorted.length ? suitOf(sorted[i]) + 1 : 0);
    return s;
  }

  function describe(cards) {
    if (!cards.length) return '';
    const { cat, sorted } = classify(cards);
    const R = (i) => RANKS[rankOf(sorted[i])];
    switch (cat) {
      case 8: return 'Thùng phá sảnh tới ' + R(0);
      case 7: return 'Tứ quý ' + R(0);
      case 6: return 'Cù lũ ' + R(0) + ' – ' + R(3);
      case 5: return 'Thùng ' + SUITS[suitOf(sorted[0])] + ' tới ' + R(0);
      case 4: return 'Sảnh tới ' + R(0);
      case 3: return 'Sám cô ' + R(0);
      case 2: return 'Thú ' + R(0) + ' – ' + R(2);
      case 1: return 'Đôi ' + R(0);
      default: return (cards.length === 5 ? 'Mậu thầu ' : 'Cao ') + cardLabel(sorted[0]);
    }
  }

  /* Đếm chính xác số tổ hợp 5 lá của từng loại trong bộ 24 lá. */
  function handFrequencies() {
    const out = Array(9).fill(0);
    const h = [0, 0, 0, 0, 0];
    for (h[0] = 0; h[0] < 24; h[0]++)
      for (h[1] = h[0] + 1; h[1] < 24; h[1]++)
        for (h[2] = h[1] + 1; h[2] < 24; h[2]++)
          for (h[3] = h[2] + 1; h[3] < 24; h[3]++)
            for (h[4] = h[3] + 1; h[4] < 24; h[4]++) out[classify(h).cat]++;
    return out;
  }

  /* Phân phối chính xác loại bài cuối cùng của mình (đến lá thứ 5),
   * tính trên các lá mình chưa nhìn thấy. */
  function drawOut(myCards, seenCards) {
    const seen = new Set([...myCards, ...seenCards]);
    const pool = newDeck().filter((c) => !seen.has(c));
    const k = 5 - myCards.length;
    const out = Array(9).fill(0);
    let total = 0;
    const pick = [];
    (function rec(start) {
      if (pick.length === k) {
        out[classify(myCards.concat(pick)).cat]++;
        total++;
        return;
      }
      for (let i = start; i < pool.length; i++) {
        pick.push(pool[i]);
        rec(i + 1);
        pick.pop();
      }
    })(0);
    return out.map((x) => x / total);
  }

  /* Monte Carlo: xác suất thắng của mình trước các đối thủ còn trong ván.
   * oppUps: mảng các bộ lá ngửa của từng đối thủ (lá úp chưa biết).
   * dead: lá ngửa của người đã úp bỏ. */
  function equity(myCards, oppUps, dead, strength, iters = 2500, rng = Math.random) {
    const known = new Set([...myCards, ...dead]);
    oppUps.forEach((u) => u.forEach((c) => known.add(c)));
    const pool = newDeck().filter((c) => !known.has(c));
    const needMe = 5 - myCards.length;
    const needs = oppUps.map((u) => 5 - u.length);
    const totalNeed = needMe + needs.reduce((a, b) => a + b, 0);
    if (totalNeed > pool.length) return NaN;
    let wins = 0;
    const p = pool.slice();
    const mine = myCards.slice();
    for (let it = 0; it < iters; it++) {
      for (let i = 0; i < totalNeed; i++) {
        const j = i + ((rng() * (p.length - i)) | 0);
        const t = p[i]; p[i] = p[j]; p[j] = t;
      }
      let k = 0;
      mine.length = myCards.length;
      for (let i = 0; i < needMe; i++) mine.push(p[k++]);
      const my = scoreOf(mine, strength);
      let win = true;
      for (let o = 0; o < oppUps.length && win; o++) {
        const h = oppUps[o].slice();
        for (let i = 0; i < needs[o]; i++) h.push(p[k++]);
        if (scoreOf(h, strength) > my) win = false;
      }
      if (win) wins++;
    }
    return wins / iters;
  }

  /* ----------------------------- Ván chơi ----------------------------- */

  class Game {
    constructor({ players, ante = 10, rules = 'standard', rng = Math.random }) {
      this.players = players.map((p, i) => ({
        id: i, name: p.name, human: !!p.human, style: p.style || null,
        stack: p.stack, cards: [], folded: true, out: false, allIn: false,
        bet: 0, committed: 0, acted: false, lastAction: '', revealed: false,
      }));
      this.ante = ante;
      this.rules = rules;
      this.rng = rng;
      this.handNo = 0;
      this.phase = 'idle';
      this.street = 0;
      this.toAct = -1;
      this.results = null;
      this.events = [];
    }

    get strength() { return RULESETS[this.rules].strength; }
    get pot() { return this.players.reduce((s, p) => s + p.committed, 0); }
    get minBet() { return this.ante * 2; }
    live() { return this.players.filter((p) => !p.out && !p.folded); }
    ups(p) { return p.cards.slice(1); }
    emit(text, kind = 'info') { this.events.push({ hand: this.handNo, text, kind }); }

    startHand() {
      this.handNo++;
      this.deck = shuffle(newDeck(), this.rng);
      this.results = null;
      for (const p of this.players) {
        Object.assign(p, { cards: [], allIn: false, bet: 0, committed: 0, acted: false, lastAction: '', revealed: false });
        p.out = p.stack <= 0;
        p.folded = p.out;
      }
      const seated = this.players.filter((p) => !p.out);
      if (seated.length < 2) throw new Error('Cần ít nhất 2 người còn chip');
      this.emit(`Ván ${this.handNo}: mỗi người cược sàn ${this.ante}`, 'head');
      for (const p of seated) {
        const a = Math.min(this.ante, p.stack);
        p.stack -= a; p.committed += a;
        if (p.stack === 0) p.allIn = true;
      }
      for (const p of seated) p.cards.push(this.deck.pop());
      for (const p of seated) p.cards.push(this.deck.pop());
      this.street = 2;
      this.beginRound();
    }

    beginRound() {
      for (const p of this.players) { p.bet = 0; p.acted = false; if (!p.folded && !p.allIn) p.lastAction = ''; }
      this.currentBet = 0;
      this.minRaise = this.minBet;
      const canAct = this.live().filter((p) => !p.allIn);
      if (canAct.length < 2) { this.toAct = -1; this.phase = 'between'; return; }
      this.phase = 'betting';
      const first = this.bestShowing();
      this.toAct = this.nextFrom(first.id, true);
      this.emit(`— Vòng cược ${this.street - 1} (${this.street} lá). ${first.name} có bài ngửa lớn nhất, nói trước`, 'street');
    }

    bestShowing() {
      let best = null, bs = -1;
      for (const p of this.live()) {
        const s = scoreOf(this.ups(p), this.strength);
        if (s > bs) { bs = s; best = p; }
      }
      return best;
    }

    // tìm người phải hành động tiếp theo (theo chiều kim đồng hồ)
    nextFrom(i, inclusive) {
      const n = this.players.length;
      for (let k = inclusive ? 0 : 1; k <= n; k++) {
        const p = this.players[(i + k) % n];
        if (p.out || p.folded || p.allIn) continue;
        if (!p.acted || p.bet < this.currentBet) return p.id;
      }
      return -1;
    }

    legal(i) {
      const p = this.players[i];
      const toCall = Math.max(0, this.currentBet - p.bet);
      const others = this.live().filter((q) => q.id !== i && !q.allIn);
      const minRaiseTo = this.currentBet === 0 ? this.minBet : this.currentBet + this.minRaise;
      const maxRaiseTo = p.bet + p.stack;
      return {
        toCall,
        callAmt: Math.min(toCall, p.stack),
        canCheck: toCall === 0,
        canRaise: p.stack > toCall && others.length > 0,
        minRaiseTo: Math.min(minRaiseTo, maxRaiseTo),
        maxRaiseTo,
      };
    }

    pay(p, amt) {
      amt = Math.min(amt, p.stack);
      p.stack -= amt; p.bet += amt; p.committed += amt;
      if (p.stack === 0) p.allIn = true;
      return amt;
    }

    act(i, type, raiseTo = 0) {
      if (this.phase !== 'betting' || this.toAct !== i) throw new Error('Chưa tới lượt');
      const p = this.players[i];
      const L = this.legal(i);
      if (type === 'check' && !L.canCheck) type = 'call';
      if (type === 'raise' && !L.canRaise) type = L.canCheck ? 'check' : 'call';
      if (type === 'fold') {
        p.folded = true; p.lastAction = 'Úp bỏ';
        this.emit(`${p.name} úp bỏ`);
      } else if (type === 'check') {
        p.lastAction = 'Xem';
        this.emit(`${p.name} xem`);
      } else if (type === 'call') {
        const a = this.pay(p, L.toCall);
        p.lastAction = p.allIn ? 'Tất tay' : 'Theo';
        this.emit(`${p.name} theo ${a}${p.allIn ? ' (tất tay)' : ''}`);
      } else if (type === 'raise') {
        raiseTo = Math.max(L.minRaiseTo, Math.min(Math.round(raiseTo), L.maxRaiseTo));
        this.pay(p, raiseTo - p.bet);
        const inc = p.bet - this.currentBet;
        const opened = this.currentBet === 0;
        if (inc >= this.minRaise) this.minRaise = inc;
        this.currentBet = Math.max(this.currentBet, p.bet);
        for (const q of this.players) if (q !== p) q.acted = false;
        p.lastAction = p.allIn ? 'Tất tay' : 'Tố';
        this.emit(`${p.name} ${opened ? 'tố' : 'tố thêm lên'} ${p.bet}${p.allIn ? ' (tất tay)' : ''}`, 'bet');
      } else throw new Error('Hành động lạ: ' + type);
      p.acted = true;

      if (this.live().length === 1) return this.finishByFold();
      const nxt = this.nextFrom(i, false);
      if (nxt === -1) { this.toAct = -1; this.phase = 'between'; }
      else this.toAct = nxt;
    }

    /* Gọi sau khi một vòng cược kết thúc (phase === 'between'): chia lá tiếp hoặc so bài. */
    proceed() {
      if (this.phase !== 'between') return;
      if (this.street >= 5) return this.showdown();
      for (const p of this.live()) p.cards.push(this.deck.pop());
      this.street++;
      this.beginRound();
    }

    finishByFold() {
      const w = this.live()[0];
      const amount = this.pot;
      w.stack += amount;
      this.phase = 'done'; this.toAct = -1;
      this.results = { byFold: true, pots: [{ amount, winners: [w.id] }], net: this.netOf({ [w.id]: amount }) };
      this.emit(`${w.name} ăn ${amount} — không ai theo`, 'win');
    }

    showdown() {
      const live = this.live();
      const S = this.strength;
      const scores = {};
      for (const p of live) { p.revealed = true; scores[p.id] = scoreOf(p.cards, S); }
      const c = this.players.map((p) => p.committed);
      const levels = [...new Set(live.map((p) => p.committed))].sort((a, b) => a - b);
      const pots = [];
      const won = {};
      let prev = 0;
      levels.forEach((L, idx) => {
        let amount = 0;
        for (const x of c) amount += Math.min(x, L) - Math.min(x, prev);
        if (idx === levels.length - 1) for (const x of c) amount += Math.max(0, x - L); // tiền người đã úp bỏ vượt mức
        const elig = live.filter((p) => p.committed >= L);
        let w = elig[0];
        for (const p of elig) if (scores[p.id] > scores[w.id]) w = p;
        if (amount > 0) { pots.push({ amount, winners: [w.id], eligible: elig.map((p) => p.id) }); won[w.id] = (won[w.id] || 0) + amount; }
        prev = L;
      });
      for (const id in won) this.players[id].stack += won[id];
      this.phase = 'done'; this.toAct = -1;
      this.results = { byFold: false, pots, net: this.netOf(won), hands: Object.fromEntries(live.map((p) => [p.id, describe(p.cards)])) };
      this.emit('Lật bài: ' + live.map((p) => `${p.name} ${describe(p.cards)}`).join(' · '), 'street');
      pots.forEach((pt, k) => {
        const w = this.players[pt.winners[0]];
        this.emit(`${w.name} ăn ${pots.length > 1 ? (k === 0 ? 'hũ chính' : 'hũ phụ') + ' ' : ''}${pt.amount} với ${describe(w.cards)}`, 'win');
      });
    }

    netOf(won) {
      const net = {};
      for (const p of this.players) if (!p.out) net[p.id] = (won[p.id] || 0) - p.committed;
      return net;
    }

    /* Thông tin mà người chơi i nhìn thấy được. */
    viewOf(i) {
      const me = this.players[i];
      const opps = this.live().filter((p) => p.id !== i);
      const dead = this.players.filter((p) => p.folded && !p.out).flatMap((p) => this.ups(p));
      return { mine: me.cards.slice(), oppUps: opps.map((p) => this.ups(p)), dead };
    }
  }

  /* ----------------------------- Huấn luyện / AI ----------------------------- */

  function analyze(game, i, iters = 2500) {
    const v = game.viewOf(i);
    const L = game.legal(i);
    const e = equity(v.mine, v.oppUps, v.dead, game.strength, iters);
    const n = v.oppUps.length;
    const pot = game.pot;
    const potOdds = L.toCall > 0 ? L.callAmt / (pot + L.callAmt) : 0;
    const rel = e * (n + 1); // >1: mạnh hơn mức trung bình của bàn
    const evCall = e * (pot + L.callAmt) - L.callAmt;
    let advice, why;
    if (L.toCall === 0) {
      if (rel >= 1.35 && L.canRaise) { advice = 'raise'; why = `Bạn đang dẫn (${pct(e)} so với mức chia đều ${pct(1 / (n + 1))}). Tố để lấy giá trị.`; }
      else { advice = 'check'; why = `Chưa đủ mạnh để tố lấy giá trị (${pct(e)}). Xem miễn phí lá tiếp theo.`; }
    } else if (e >= potOdds) {
      if (rel >= 1.6 && L.canRaise) { advice = 'raise'; why = `Thắng ${pct(e)}, vượt xa ngưỡng ${pct(potOdds)}. Tố thêm.`; }
      else { advice = 'call'; why = `Thắng ${pct(e)} ≥ ngưỡng hòa vốn ${pct(potOdds)} → theo có lãi.`; }
    } else {
      advice = 'fold';
      why = `Thắng ${pct(e)} < ngưỡng hòa vốn ${pct(potOdds)} → theo là lỗ về lâu dài.`;
    }
    return { equity: e, potOdds, rel, evCall, opponents: n, toCall: L.toCall, callAmt: L.callAmt, pot, advice, why,
      drawOut: drawOut(v.mine, [...v.oppUps.flat(), ...v.dead]) };
  }

  /* Chấm điểm quyết định của người chơi so với khuyến nghị. */
  function grade(a, type) {
    const margin = 0.04;
    if (a.toCall === 0) {
      if (type === 'fold') return { ok: false, text: 'Úp bỏ khi được xem miễn phí là mất bài vô ích.' };
      if (a.advice === 'raise' && type === 'check') return { ok: null, text: 'Chấp nhận được, nhưng bài mạnh nên tố để lấy giá trị.' };
      if (a.advice === 'check' && type === 'raise') return a.rel >= 1.0 ? { ok: null, text: 'Tố hơi mỏng, nhưng có thể dùng để gây sức ép.' } : { ok: false, text: 'Tố với bài yếu hơn trung bình là tố lừa. Đừng lạm dụng.' };
      return { ok: true, text: 'Hợp lý.' };
    }
    const diff = a.equity - a.potOdds;
    if (type === 'fold') {
      if (diff < -margin) return { ok: true, text: 'Úp bỏ đúng: không đủ tỉ lệ để theo.' };
      if (diff < margin) return { ok: null, text: 'Sát ngưỡng. Úp bỏ vẫn chấp nhận được.' };
      return { ok: false, text: `Úp bỏ quá sớm: bạn thắng ${pct(a.equity)}, chỉ cần ${pct(a.potOdds)}.` };
    }
    if (diff >= 0) {
      if (type === 'call' && a.advice === 'raise') return { ok: null, text: 'Theo được, nhưng bài đủ mạnh để tố thêm.' };
      return { ok: true, text: 'Đúng: tỉ lệ thắng vượt ngưỡng hòa vốn.' };
    }
    if (diff > -margin) return { ok: null, text: 'Sát ngưỡng, theo cũng không sai nhiều.' };
    return { ok: false, text: `Theo lỗ: thắng ${pct(a.equity)} nhưng cần ${pct(a.potOdds)}.` };
  }

  const STYLES = {
    tight: { label: 'Chắc tay', valueRel: 1.45, raiseRel: 1.8, margin: 0.05, bluff: 0.03 },
    loose: { label: 'Máu chiến', valueRel: 1.15, raiseRel: 1.4, margin: -0.04, bluff: 0.16 },
    sly: { label: 'Cáo già', valueRel: 1.3, raiseRel: 1.6, margin: 0.0, bluff: 0.09 },
  };

  function botDecide(game, i, rng = Math.random) {
    const p = game.players[i];
    const st = STYLES[p.style] || STYLES.sly;
    const v = game.viewOf(i);
    const L = game.legal(i);
    const e = equity(v.mine, v.oppUps, v.dead, game.strength, 1200, rng);
    const n = v.oppUps.length;
    const rel = e * (n + 1);
    const pot = game.pot;
    const size = (f) => {
      const base = game.currentBet + Math.max(game.minRaise, Math.round((pot + L.toCall) * f / 5) * 5);
      const to = Math.max(L.minRaiseTo, Math.min(base, L.maxRaiseTo));
      return to >= L.maxRaiseTo * 0.75 ? L.maxRaiseTo : to; // gần hết chip thì tất tay
    };
    const lastStreet = game.street === 5;
    if (L.toCall === 0) {
      if (L.canRaise && rel >= st.valueRel) return { type: 'raise', raiseTo: size(0.45 + rng() * 0.5) };
      if (L.canRaise && !lastStreet && rng() < st.bluff) return { type: 'raise', raiseTo: size(0.5) };
      return { type: 'check' };
    }
    const potOdds = L.callAmt / (pot + L.callAmt);
    const pressure = 0.12 * Math.min(1, L.toCall / Math.max(1, pot - L.toCall)); // cược càng lớn càng thận trọng
    const need = potOdds + st.margin + pressure;
    if (L.canRaise && rel >= st.raiseRel && rng() < 0.85) return { type: 'raise', raiseTo: size(0.6 + rng() * 0.4) };
    if (e >= need) return { type: 'call' };
    if (L.canRaise && !lastStreet && rng() < st.bluff * 0.4) return { type: 'raise', raiseTo: size(0.6) };
    return { type: 'fold' };
  }

  function pct(x) { return (x * 100).toFixed(x < 0.1 && x > 0 ? 1 : 0) + '%'; }

  const api = { RANKS, SUITS, CAT_NAMES, RULESETS, STYLES, rankOf, suitOf, cardLabel, isRed, newDeck, shuffle,
    classify, scoreOf, describe, handFrequencies, drawOut, equity, Game, analyze, grade, botDecide, pct };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Xito = api;
})(typeof window !== 'undefined' ? window : globalThis);

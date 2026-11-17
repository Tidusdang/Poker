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

  /* ----------------------------- Xào bài như ngoài đời -----------------------------
   * Mảng bộ bài: phần tử 0 là lá trên cùng (lá được chia trước).
   * SHUFFLES: các kiểu xào; mỗi kiểu là dãy thao tác riffle / overhand / cut.
   */
  const SHUFFLES = {
    perfect: { label: 'Trộn kỹ (ngẫu nhiên hoàn toàn)', short: 'trộn kỹ', perfect: true },
    real3: { label: 'Xào 3 lần + kinh', short: 'xào 3 lần, kinh', riffles: 3, cut: true },
    lazy1: { label: 'Xào 1 lần + kinh', short: 'xào 1 lần, kinh', riffles: 1, cut: true },
    overhand: { label: 'Xốc tay 4 lần + kinh', short: 'xốc tay 4 lần, kinh', overhands: 4, cut: true },
    cutonly: { label: 'Không xào, chỉ kinh', short: 'chỉ kinh', cut: true },
  };

  function binomialHalf(n, rng) { let k = 0; for (let i = 0; i < n; i++) if (rng() < 0.5) k++; return k; }

  // Xào riffle (mô hình Gilbert–Shannon–Reeds): chia đôi theo phân phối nhị thức rồi đan xen,
  // lá rơi từ mỗi nửa với xác suất tỉ lệ số lá còn lại của nửa đó.
  function riffle(deck, rng = Math.random) {
    const k = binomialHalf(deck.length, rng);
    let a = 0, b = k;
    const out = [];
    while (a < k || b < deck.length) {
      const la = k - a, lb = deck.length - b;
      if (rng() * (la + lb) < la) out.push(deck[a++]); else out.push(deck[b++]);
    }
    return out;
  }
  // Xốc tay: rút từng nắm 1–5 lá từ trên xuống, xếp chồng sang tay kia (thứ tự các nắm bị đảo).
  function overhand(deck, rng = Math.random) {
    const packets = [];
    let i = 0;
    while (i < deck.length) { const sz = 1 + ((rng() * 5) | 0); packets.push(deck.slice(i, i + sz)); i += sz; }
    return packets.reverse().flat();
  }
  // Kinh (cắt bài): nhấc một phần phía trên đặt xuống dưới.
  function cut(deck, rng = Math.random) {
    const n = deck.length;
    const c = 4 + ((rng() * (n - 7)) | 0);
    return deck.slice(c).concat(deck.slice(0, c));
  }
  function shuffleBy(prevOrder, key, rng = Math.random) {
    const spec = SHUFFLES[key] || SHUFFLES.perfect;
    if (spec.perfect || !prevOrder || prevOrder.length !== 24) return shuffle(newDeck(), rng);
    let d = prevOrder.slice();
    for (let i = 0; i < (spec.riffles || 0); i++) d = riffle(d, rng);
    for (let i = 0; i < (spec.overhands || 0); i++) d = overhand(d, rng);
    if (spec.cut) d = cut(d, rng);
    return d;
  }
  /* Gom bài sau ván: các nhà úp bỏ trước (theo thứ tự úp) nằm dưới cùng, rồi bài các nhà còn lại
   * theo thứ tự ghế; mỗi nhà giữ nguyên thứ tự lá như lúc chia. Chồng bài gom đặt lên trên phần bài thừa. */
  function collect(blocksBottomFirst, stub) {
    const pile = [];
    for (let i = blocksBottomFirst.length - 1; i >= 0; i--) pile.push(...blocksBottomFirst[i]);
    return pile.concat(stub);
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

  /* Điểm so bài: hạng loại bài → số (theo nhóm) → chất. Hai bộ khác nhau không bao giờ hòa.
   * Viết không cấp phát bộ nhớ vì đây là hàm được gọi nhiều nhất (hàng triệu lần khi thử Monte Carlo);
   * kết quả giống hệt cách tính qua classify(). */
  const _cnt = new Int8Array(6), _key = new Int32Array(5);
  function scoreOf(cards, strength) {
    const n = cards.length;
    _cnt[0] = _cnt[1] = _cnt[2] = _cnt[3] = _cnt[4] = _cnt[5] = 0;
    let flush = n === 5;
    const s0 = cards[0] & 3;
    for (let i = 0; i < n; i++) { const c = cards[i]; _cnt[c >> 2]++; if ((c & 3) !== s0) flush = false; }
    // xếp giảm dần theo: số lá cùng số → số → chất (khóa = đếm*32 + lá)
    for (let i = 0; i < n; i++) {
      const k = _cnt[cards[i] >> 2] * 32 + cards[i];
      let j = i;
      while (j > 0 && _key[j - 1] < k) { _key[j] = _key[j - 1]; j--; }
      _key[j] = k;
    }
    let maxc = 0, pairs = 0, trips = 0;
    for (let r = 0; r < 6; r++) { const k = _cnt[r]; if (k > maxc) maxc = k; if (k === 2) pairs++; else if (k === 3) trips++; }
    let cat;
    if (n === 5 && maxc === 1 && (((_key[0] & 31) >> 2) - ((_key[4] & 31) >> 2)) === 4) cat = flush ? 8 : 4;
    else if (maxc === 4) cat = 7;
    else if (trips && pairs) cat = 6;
    else if (flush) cat = 5;
    else if (trips) cat = 3;
    else if (pairs === 2) cat = 2;
    else if (pairs === 1) cat = 1;
    else cat = 0;
    let s = strength[cat];
    for (let i = 0; i < 5; i++) s = s * 7 + (i < n ? ((_key[i] & 31) >> 2) + 1 : 0);
    for (let i = 0; i < 5; i++) s = s * 5 + (i < n ? (_key[i] & 3) + 1 : 0);
    return s;
  }
  function scoreOfSlow(cards, strength) {           // cách tính gốc, giữ để kiểm tra chéo
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
    const hs = oppUps.map((u) => u.slice());
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
        const h = hs[o];
        h.length = oppUps[o].length;
        for (let i = 0; i < needs[o]; i++) h.push(p[k++]);
        if (scoreOf(h, strength) > my) win = false;
      }
      if (win) wins++;
    }
    return wins / iters;
  }

  /* Bốc lá tẩy cho từng đối thủ theo độ tin (ranges[o] = { cards, cum }), không trùng nhau.
   * Ghi vị trí đã bốc vào hidx, trả về mặt nạ bit các lá đã dùng, hoặc -1 nếu không bốc được. */
  function sampleHoles(ranges, hidx, rng) {
    let used = 0;
    for (let o = 0; o < ranges.length; o++) {
      const cards = ranges[o].cards, cum = ranges[o].cum, m = cards.length, tot = cum[m - 1];
      let k = -1;
      for (let tr = 0; tr < 6 && k < 0; tr++) {
        const x = rng() * tot;
        let j = 0; while (j < m - 1 && cum[j] <= x) j++;
        if (!((used >> cards[j]) & 1)) k = j;
      }
      if (k < 0) for (let j = 0; j < m && k < 0; j++) if (!((used >> cards[j]) & 1)) k = j;
      if (k < 0) return -1;
      used |= 1 << cards[k]; hidx[o] = k;
    }
    return used;
  }

  /* Giống equity() nhưng trả thêm chi tiết để giải thích: mỗi đối thủ hơn mình bao nhiêu lần
   * và thường hơn bằng loại bài gì; mình thắng bằng loại bài gì.
   * ranges (tùy chọn): độ tin về lá tẩy của từng đối thủ (đọc từ cách cược). Có thì lá tẩy được bốc theo
   * độ tin đó thay vì ngẫu nhiên đều; các lá còn thiếu khác vẫn chia ngẫu nhiên. */
  function equityDetail(myCards, oppUps, dead, strength, iters = 3000, rng = Math.random, ranges = null) {
    const known = new Set([...myCards, ...dead]);
    oppUps.forEach((u) => u.forEach((c) => known.add(c)));
    const pool = newDeck().filter((c) => !known.has(c));
    const needMe = 5 - myCards.length;
    const needs = oppUps.map((u) => 5 - u.length);
    const totalNeed = needMe + needs.reduce((a, b) => a + b, 0);
    const perOpp = oppUps.map(() => ({ beat: 0, cats: Array(9).fill(0) }));
    const myWinCats = Array(9).fill(0);
    let wins = 0, done = 0;
    const p = pool.slice();
    const hidx = ranges ? new Int32Array(oppUps.length) : null;
    for (let it = 0; it < iters; it++) {
      let used = 0, pos = 0;
      if (ranges) { used = sampleHoles(ranges, hidx, rng); if (used < 0) continue; }
      const draw = () => {
        for (;;) {
          const j = pos + ((rng() * (p.length - pos)) | 0);
          const t = p[pos]; p[pos] = p[j]; p[j] = t;
          const c = p[pos++];
          if (!((used >> c) & 1)) return c;
        }
      };
      const mine = myCards.slice();
      for (let i = 0; i < needMe; i++) mine.push(draw());
      const my = scoreOf(mine, strength);
      let win = true;
      for (let o = 0; o < oppUps.length; o++) {
        const h = oppUps[o].slice();
        if (ranges) { h.push(ranges[o].cards[hidx[o]]); for (let i = 1; i < needs[o]; i++) h.push(draw()); }
        else for (let i = 0; i < needs[o]; i++) h.push(draw());
        if (scoreOf(h, strength) > my) { win = false; perOpp[o].beat++; perOpp[o].cats[classify(h).cat]++; }
      }
      done++;
      if (win) { wins++; myWinCats[classify(mine).cat]++; }
    }
    const N = Math.max(1, done);
    return { win: wins / N, wins, iters: done, poolSize: pool.length, unknownCards: totalNeed, read: !!ranges,
      perOpp: perOpp.map((o) => ({ beat: o.beat / N, topCat: o.cats.indexOf(Math.max(...o.cats)), cats: o.cats })),
      myWinCats };
  }

  /* Nhóm bộ khởi đầu 2 lá: 6 đôi + 15 cặp khác số × (đồng chất / khác chất) = 36 nhóm. */
  function startClass(a, b) {
    let ra = rankOf(a), rb = rankOf(b);
    if (ra < rb) { const t = ra; ra = rb; rb = t; }
    if (ra === rb) return ra;
    const idx = 6 + ((ra * (ra - 1)) / 2 + rb) * 2 + (suitOf(a) === suitOf(b) ? 0 : 1);
    return idx;
  }
  function startClassLabel(i) {
    if (i < 6) return 'Đôi ' + RANKS[i];
    const j = (i - 6) >> 1, suited = ((i - 6) & 1) === 0;
    let ra = 1; while ((ra * (ra + 1)) / 2 <= j) ra++;
    const rb = j - (ra * (ra - 1)) / 2;
    return RANKS[ra] + '-' + RANKS[rb] + (suited ? ' đồng chất' : ' khác chất');
  }

  /* ----------------------------- Ván chơi ----------------------------- */

  class Game {
    constructor({ players, ante = 10, rules = 'standard', rng = Math.random, shuffleMode = 'perfect', reads }) {
      this.players = players.map((p, i) => ({
        id: i, name: p.name, human: !!p.human, style: p.style || null,
        stack: p.stack, cards: [], folded: true, out: false, allIn: false,
        bet: 0, committed: 0, acted: false, lastAction: '', revealed: false,
      }));
      this.ante = ante;
      this.rules = rules;
      this.shuffleMode = shuffleMode;
      this.prevOrder = null;      // thứ tự bộ bài gom lại sau ván trước (lá trên cùng trước)
      this.prevGather = null;     // các khối bài theo nhà của ván trước, để huấn luyện viên nhắc
      this.foldOrder = [];
      this.rng = rng;
      this.handNo = 0;
      this.phase = 'idle';
      this.street = 0;
      this.toAct = -1;
      this.results = null;
      this.events = [];
      // Theo dõi "đọc bài" (đoán lá tẩy qua cách cược): tự bật khi bàn có người chơi kiểu lão luyện
      this.useReads = reads === undefined ? this.players.some((p) => !p.human && STYLES[p.style] && STYLES[p.style].pro) : !!reads;
      this.readAll = false;       // true: đọc cả người lão luyện (tốn tính toán hơn, chỉ cần khi mô phỏng)
      this.reads = null;
      this.habit = null;          // thói quen cược của người chưa rõ kiểu, cộng dồn qua các ván (xem habitModel)
    }

    get strength() { return RULESETS[this.rules].strength; }
    get pot() { return this.players.reduce((s, p) => s + p.committed, 0); }
    get minBet() { return this.ante * 2; }
    live() { return this.players.filter((p) => !p.out && !p.folded); }
    ups(p) { return p.cards.slice(1); }
    emit(text, kind = 'info') { this.events.push({ hand: this.handNo, text, kind }); }

    startHand() {
      this.handNo++;
      const realistic = this.shuffleMode !== 'perfect' && this.prevOrder;
      this.deck = shuffleBy(this.prevOrder, this.shuffleMode, this.rng);
      this.dealtFrom = this.deck.slice();
      this.foldOrder = [];
      this.results = null;
      this.reads = this.useReads ? newReads(this.players.length, this.readAll) : null;
      for (const p of this.players) {
        Object.assign(p, { cards: [], allIn: false, bet: 0, committed: 0, acted: false, lastAction: '', revealed: false });
        p.out = p.stack <= 0;
        p.folded = p.out;
      }
      const seated = this.players.filter((p) => !p.out);
      if (seated.length < 2) throw new Error('Cần ít nhất 2 người còn chip');
      this.emit(`Ván ${this.handNo}: mỗi người cược sàn ${this.ante}` + (realistic ? ` · bộ bài ván trước được ${SHUFFLES[this.shuffleMode].short}` : ''), 'head');
      for (const p of seated) {
        const a = Math.min(this.ante, p.stack);
        p.stack -= a; p.committed += a;
        if (p.stack === 0) p.allIn = true;
      }
      for (const p of seated) p.cards.push(this.deck.shift());
      for (const p of seated) p.cards.push(this.deck.shift());
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
      if (type === 'raise') raiseTo = Math.max(L.minRaiseTo, Math.min(Math.round(raiseTo), L.maxRaiseTo));
      if (this.reads) { try { observe(this, i, type, raiseTo); } catch (err) { this.reads = null; this.readError = err; } }
      if (type === 'fold') {
        p.folded = true; p.lastAction = 'Úp bỏ'; this.foldOrder.push(p.id);
        this.emit(`${p.name} úp bỏ`);
      } else if (type === 'check') {
        p.lastAction = 'Xem';
        this.emit(`${p.name} xem`);
      } else if (type === 'call') {
        const a = this.pay(p, L.toCall);
        p.lastAction = p.allIn ? 'Tất tay' : 'Theo';
        this.emit(`${p.name} theo ${a}${p.allIn ? ' (tất tay)' : ''}`);
      } else if (type === 'raise') {
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
      for (const p of this.live()) p.cards.push(this.deck.shift());
      this.street++;
      this.beginRound();
    }

    finishByFold() {
      const w = this.live()[0];
      const amount = this.pot;
      w.stack += amount;
      this.phase = 'done'; this.toAct = -1;
      this.results = { byFold: true, pots: [{ amount, winners: [w.id] }], net: this.netOf({ [w.id]: amount }) };
      this.gather();
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
      this.gather();
      this.emit('Lật bài: ' + live.map((p) => `${p.name} ${describe(p.cards)}`).join(' · '), 'street');
      pots.forEach((pt, k) => {
        const w = this.players[pt.winners[0]];
        this.emit(`${w.name} ăn ${pots.length > 1 ? (k === 0 ? 'hũ chính' : 'hũ phụ') + ' ' : ''}${pt.amount} với ${describe(w.cards)}`, 'win');
      });
    }

    gather() {
      const folded = this.foldOrder.map((id) => this.players[id]);
      const rest = this.players.filter((p) => !p.out && !p.folded);
      const blocks = [...folded, ...rest].map((p) => ({ id: p.id, name: p.name, cards: p.cards.slice() }));
      this.prevGather = blocks;
      this.prevOrder = collect(blocks.map((b) => b.cards), this.deck.slice());
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

  /* Phân tích cho huấn luyện viên. Nếu ván đang theo dõi cách cược (game.reads) thì tỉ lệ thắng được tính với
   * lá tẩy của đối thủ bốc theo độ tin đọc từ cách cược; equityFlat là con số nếu chỉ nhìn lá ngửa. */
  function analyze(game, i, iters = 2500) {
    const v = game.viewOf(i);
    const L = game.legal(i);
    const ranges = game.reads ? rangesFor(game, i, v.mine[0]) : null;
    const det = equityDetail(v.mine, v.oppUps, v.dead, game.strength, iters, Math.random, ranges);
    const e = det.win;
    const flat = ranges ? equity(v.mine, v.oppUps, v.dead, game.strength, 1500) : e;
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
    const opps = game.live().filter((p) => p.id !== i);
    return { equity: e, equityFlat: flat, read: !!ranges, potOdds, rel, evCall, opponents: n, toCall: L.toCall, callAmt: L.callAmt, pot, advice, why, detail: det,
      oppInfo: opps.map((p, k) => ({ id: p.id, name: p.name, ups: game.ups(p), beat: det.perOpp[k].beat, topCat: det.perOpp[k].topCat,
        guess: ranges ? readOf(game, i, p.id) : null })),
      street: game.street, myCards: v.mine.slice(),
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

  /* Kiểu chơi của máy.
   * valueRel / raiseRel: tố (tố lại) khi tỉ lệ thắng tự tính ≥ ngần ấy lần mức chia đều.
   * margin: cộng vào ngưỡng hòa vốn khi theo · bluff: tần suất tố láo khi được xem miễn phí.
   * pressure: thận trọng thêm khi bị tố to (mặc định 0,12) · raiseProb: đủ bài thì tố lại bao nhiêu phần (mặc định 0,85). */
  const STYLES = {
    tight: { label: 'Chắc tay', valueRel: 1.45, raiseRel: 1.8, margin: 0.05, bluff: 0.03 },
    loose: { label: 'Máu chiến', valueRel: 1.15, raiseRel: 1.4, margin: -0.04, bluff: 0.16 },
    sly: { label: 'Cáo già', valueRel: 1.3, raiseRel: 1.6, margin: 0.0, bluff: 0.09 },
    // Chơi đúng theo gợi ý của huấn luyện viên (analyze): dùng cho ghế "Bạn" khi mô phỏng
    coach: { label: 'Theo gợi ý', valueRel: 1.35, raiseRel: 1.6, margin: 0, bluff: 0, pressure: 0, raiseProb: 1, strict: true, fixed: 0.5, reads: true },
    // Lão luyện: đoán lá tẩy qua cách cược, tố cả hũ khi tính ra có lời, bỏ khi thấy bất lợi (xem proDecide)
    // size: cỡ tố tính theo hũ (1 = cả hũ) · betEdge / raiseEdge: tố phải lời hơn đứng yên ngần ấy lần hũ
    // callEdge: theo phải lời ít nhất ngần ấy lần tiền theo · weakRel + pressFreq: bài xấu (dưới weakRel lần mức chia đều) thì chỉ hù pressFreq số lần
    // bank: mức chịu rủi ro, tính bằng số sàn (100 = đúng mức mang vào bàn). Cố định, không tăng theo chip đang có,
    //       nên khi đã thắng nhiều anh ấy không lao vào ván to hơn: giữ tiền thắng
    pro: { label: 'Lão luyện', pro: true, size: 1, betEdge: 0.05, raiseEdge: 0.15, callEdge: 0.1, weakRel: 1, pressFreq: 0.6, bank: 100 },
  };
  /* Người đọc bài hình dung một người chơi chưa rõ kiểu (ghế "Bạn") như sau:
   *  - điểm xuất phát: họ chơi theo gợi ý của huấn luyện viên (HUMAN_RULE);
   *  - rồi chỉnh theo THÓI QUEN đếm được trong phiên: so với quy tắc đó, họ thật sự tố / tố lại / ở lại nhiều hay ít hơn
   *    bao nhiêu (tỉ số odds), với giả định ai cũng ưu tiên làm thế bằng những bộ bài mạnh nhất của mình,
   *    kèm một phần nhỏ làm bừa (HABIT_NOISE). HABIT_K: quy tắc gốc nặng bằng ngần ấy lần quan sát. */
  const HUMAN_RULE = { valueRel: 1.35, raiseRel: 1.6, margin: 0, bluff: 0, pressure: 0, raiseProb: 1, strict: true };
  const HABIT_K = 4, HABIT_NOISE = 0.06, HABIT_SD = 0.035;
  // mỗi mục: [số lần gặp tình huống, số lần họ làm, số lần quy tắc gốc dự tính họ làm]; tách lá 2 và các lá sau
  const newHabit = () => [0, 1].map(() => ({ bet: [0, 0, 0], raise: [0, 0, 0], stay: [0, 0, 0] }));
  const BOT_ITERS = 1200, READ_ITERS = 300;

  function Phi(z) {                // hàm phân phối chuẩn
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989422804014327 * Math.exp(-z * z / 2);
    const q = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return z >= 0 ? 1 - q : q;
  }
  // Máy tự ước lượng tỉ lệ thắng bằng số lần thử hữu hạn nên có sai số; người đọc làm trơn bằng phân phối chuẩn.
  const sdOf = (e) => Math.max(0.004, Math.sqrt(Math.max(e * (1 - e), 1e-4) * (1 / BOT_ITERS + 1 / READ_ITERS)));
  const isPro = (p) => !p.human && !!(STYLES[p.style] && STYLES[p.style].pro);
  // kiểu chơi cố định của máy thường; null = không biết trước (người thật, hoặc người lão luyện khác) → đọc theo thói quen
  const readStyle = (p) => (p.human || !STYLES[p.style] || STYLES[p.style].pro ? null : STYLES[p.style]);

  // Mức tố của máy thường: f lần hũ, làm tròn 5, gần hết chip thì tất tay
  function botSize(game, L, pot, f) {
    const base = game.currentBet + Math.max(game.minRaise, Math.round((pot + L.toCall) * f / 5) * 5);
    const to = Math.max(L.minRaiseTo, Math.min(base, L.maxRaiseTo));
    return to >= L.maxRaiseTo * 0.75 ? L.maxRaiseTo : to;
  }

  function botDecide(game, i, rng = Math.random) {
    const p = game.players[i];
    const st = STYLES[p.style] || STYLES.sly;
    if (st.pro) return proDecide(game, i, rng);
    const v = game.viewOf(i);
    const L = game.legal(i);
    const e = st.reads && game.reads
      ? readEval(v.mine, rangesFor(game, i, v.mine[0]), v.dead, game.strength, BOT_ITERS, rng, { pot: 1, t: 0, myCost: 0, bet: false }).win
      : equity(v.mine, v.oppUps, v.dead, game.strength, BOT_ITERS, rng);
    const n = v.oppUps.length;
    const rel = e * (n + 1);
    const pot = game.pot;
    const size = (f) => botSize(game, L, pot, f);
    const lastStreet = game.street === 5;
    if (L.toCall === 0) {
      if (L.canRaise && rel >= st.valueRel) return { type: 'raise', raiseTo: size(st.fixed || 0.45 + rng() * 0.5) };
      if (L.canRaise && !lastStreet && rng() < st.bluff) return { type: 'raise', raiseTo: size(st.fixed || 0.5) };
      return { type: 'check' };
    }
    const potOdds = L.callAmt / (pot + L.callAmt);
    const pc = st.pressure === undefined ? 0.12 : st.pressure, rp = st.raiseProb === undefined ? 0.85 : st.raiseProb;
    const pressure = pc * Math.min(1, L.toCall / Math.max(1, pot - L.toCall)); // cược càng lớn càng thận trọng
    const need = potOdds + st.margin + pressure;
    if (L.canRaise && rel >= st.raiseRel && (!st.strict || e >= need) && rng() < rp) return { type: 'raise', raiseTo: size(st.fixed || 0.6 + rng() * 0.4) };
    if (e >= need) return { type: 'call' };
    if (L.canRaise && !lastStreet && rng() < st.bluff * 0.4) return { type: 'raise', raiseTo: size(st.fixed || 0.6) };
    return { type: 'fold' };
  }

  /* ----------------------------- Đọc bài: đoán lá tẩy qua cách cược -----------------------------
   * game.reads.w[ghế][lá] = độ tin (chưa chuẩn hóa) rằng lá đó là tẩy của ghế ấy, chỉ dựa vào thứ cả bàn
   * cùng thấy: lá ngửa và cách cược. Mỗi lần một nhà hành động, độ tin của từng lá được nhân với xác suất
   * nhà đó hành động như vậy NẾU lá ấy là tẩy (theo kiểu chơi của họ). Ai dùng thì tự loại thêm lá mình cầm. */
  function newReads(n, all) {
    return { all: !!all, w: Array.from({ length: n }, () => new Float64Array(24).fill(1)),
      eq: Array.from({ length: n }, () => ({ key: '', e: new Float64Array(24) })) };
  }
  function publicMask(game) {
    let m = 0;
    for (const p of game.players) if (!p.out) for (let k = 1; k < p.cards.length; k++) m |= 1 << p.cards[k];
    return m;
  }
  // Gom các lá chưa lộ thành nhóm cho cùng kết quả khi làm tẩy của ghế i: theo số; từ lá 4, tách riêng lá cùng chất với cả dãy ngửa
  function holeClasses(game, i) {
    const ups = game.ups(game.players[i]), seen = publicMask(game);
    let fs = -1;
    if (ups.length >= 3) { fs = suitOf(ups[0]); for (const c of ups) if (suitOf(c) !== fs) { fs = -1; break; } }
    const by = {};
    for (let c = 0; c < 24; c++) {
      if ((seen >> c) & 1) continue;
      const k = rankOf(c) * 2 + (fs >= 0 && suitOf(c) === fs ? 1 : 0);
      (by[k] || (by[k] = [])).push(c);
    }
    return Object.values(by);
  }
  // Tỉ lệ thắng mà ghế i tự tính được (so với lá ngửa các nhà khác) nếu tẩy của nó là từng lá. Nhớ lại trong cùng một thế bàn.
  function classEq(game, i) {
    const slot = game.reads.eq[i];
    let live = 0; for (const p of game.players) if (!p.out && !p.folded) live |= 1 << p.id;
    const key = game.street + ':' + live;
    if (slot.key === key) return slot.e;
    const me = game.players[i], ups = game.ups(me);
    const others = game.live().filter((q) => q.id !== i).map((q) => game.ups(q));
    const dead = game.players.filter((q) => q.folded && !q.out).flatMap((q) => game.ups(q));
    slot.e.fill(NaN);
    for (const cards of holeClasses(game, i)) {
      const e = equity([cards[0], ...ups], others, dead, game.strength, READ_ITERS, game.rng);
      for (const c of cards) slot.e[c] = e;
    }
    slot.key = key;
    return slot.e;
  }
  // Thế cược mà một nhà đang đối mặt (đủ để áp quy tắc của máy thường)
  function ctxOf(game, i) {
    const L = game.legal(i), pot = game.pot;
    return { toCall: L.toCall, canRaise: L.canRaise, n: game.live().length - 1, last: game.street === 5,
      potOdds: L.toCall > 0 ? L.callAmt / (pot + L.callAmt) : 0,
      press: L.toCall > 0 ? Math.min(1, L.toCall / Math.max(1, pot - L.toCall)) : 0 };
  }
  // Thế cược của nhà o NẾU có người vừa tố lên betTo (hũ tăng thêm addPot)
  function ctxAfter(game, o, betTo, addPot) {
    const toCall = Math.max(0, betTo - o.bet), callAmt = Math.min(toCall, o.stack), pot = game.pot + addPot;
    return { toCall, canRaise: o.stack > toCall, n: game.live().length - 1, last: game.street === 5,
      potOdds: callAmt / (pot + callAmt), press: Math.min(1, toCall / Math.max(1, pot - toCall)) };
  }
  /* Xác suất máy thường (kiểu st) chọn từng hành động khi tỉ lệ thắng nó tự tính là e ± sd. Viết lại đúng botDecide().
   * value: tố vì bài mạnh · bluff: tố láo. */
  function simpleProbs(st, c, e, sd) {
    const ge = (thr) => Phi((e - thr) / sd);
    if (c.toCall === 0) {
      const val = c.canRaise ? ge(st.valueRel / (c.n + 1)) : 0;
      const bl = c.canRaise && !c.last ? st.bluff : 0;
      return { value: val, bluff: (1 - val) * bl, call: 0, check: (1 - val) * (1 - bl), fold: 0 };
    }
    const pc = st.pressure === undefined ? 0.12 : st.pressure, rp = st.raiseProb === undefined ? 0.85 : st.raiseProb;
    const a = c.canRaise ? ge(st.raiseRel / (c.n + 1)) : 0, k = ge(c.potOdds + st.margin + pc * c.press);
    const bl = c.canRaise && !c.last ? st.bluff * 0.4 : 0;
    const R1 = Math.min(a, k), R2 = Math.max(0, a - k), R3 = Math.max(0, k - a), R4 = 1 - Math.max(a, k);
    const vr = st.strict ? rp * R1 : rp * (R1 + R2);
    const rest = st.strict ? R2 + R4 : (1 - rp) * R2 + R4;
    return { value: vr, bluff: bl * rest, call: (1 - rp) * R1 + R3, check: 0, fold: (1 - bl) * rest };
  }
  /* Mô hình cho người chưa rõ kiểu (ghế i) trong thế cược c. Trả về:
   *   probs(e): xác suất từng hành động nếu tỉ lệ thắng họ tự thấy là e;
   *   rule: quy tắc gốc dự tính họ tố / tố lại / ở lại bao nhiêu phần trong đúng tình huống này (để ghi vào thói quen). */
  function habitModel(game, i, c) {
    const H = game.habit || (game.habit = newHabit()), hb = H[game.street === 2 ? 0 : 1];
    const eq = classEq(game, i), w = game.reads.w[i], seen = publicMask(game);
    const arr = [];
    let tot = 0, fB = 0, fR = 0, fS = 0;
    for (let cd = 0; cd < 24; cd++) {
      if ((seen >> cd) & 1 || !(w[cd] > 0)) continue;
      const e = eq[cd], pr = simpleProbs(HUMAN_RULE, c, e, sdOf(e));
      arr.push([e, w[cd]]); tot += w[cd];
      if (c.toCall === 0) fB += w[cd] * (pr.value + pr.bluff);
      else { fR += w[cd] * (pr.value + pr.bluff); fS += w[cd] * (1 - pr.fold); }
    }
    if (tot > 0) { fB /= tot; fR /= tot; fS /= tot; }
    arr.sort((x, y) => y[0] - x[0]);
    const thr = (f) => {                    // ngưỡng e sao cho phần bài mạnh hơn ngưỡng chiếm khoảng f
      if (!(tot > 0)) return 0.5;
      let acc = 0;
      for (const [e, ww] of arr) { acc += ww / tot; if (acc >= f) return e; }
      return arr[arr.length - 1][0];
    };
    const odds = (x) => { const y = Math.min(0.998, Math.max(0.002, x)); return y / (1 - y); };
    const adj = (f, h) => {                 // chỉnh tần suất của quy tắc gốc theo thói quen đã thấy
      if (!h[0]) return f;
      const pE = Math.min(0.99, Math.max(0.01, h[2] / h[0])), pO = (h[1] + HABIT_K * pE) / (h[0] + HABIT_K);
      const o = odds(f) * odds(pO) / odds(pE);
      return o / (1 + o);
    };
    const aB = adj(fB, hb.bet), aR = adj(fR, hb.raise), aS = Math.max(aR, adj(fS, hb.stay));
    const tB = thr(aB), tR = thr(aR), tS = thr(aS), N = HABIT_NOISE, sd = HABIT_SD;
    const probs = (e) => {
      if (c.toCall === 0) {
        const v = c.canRaise ? (1 - N) * Phi((e - tB) / sd) : 0, bl = c.canRaise ? N * aB : 0;
        return { value: v, bluff: bl, call: 0, check: 1 - v - bl, fold: 0 };
      }
      const r = c.canRaise ? (1 - N) * Phi((e - tR) / sd) : 0, rb = c.canRaise ? N * aR : 0;
      const stay = Math.max(r + rb, (1 - N) * Phi((e - tS) / sd) + N * aS);
      return { value: r, bluff: rb, call: stay - r - rb, check: 0, fold: 1 - stay };
    };
    return { probs, rule: { bet: fB, raise: fR, stay: fS } };
  }
  // Ghi nhận thêm một lần quan sát vào thói quen của người chưa rõ kiểu
  function learnHabit(game, c, type, rule) {
    const H = game.habit || (game.habit = newHabit()), hb = H[game.street === 2 ? 0 : 1];
    const add = (h, did, exp) => { h[0]++; if (did) h[1]++; h[2] += exp; };
    if (c.toCall === 0) { if (c.canRaise) add(hb.bet, type === 'raise', rule.bet); return; }
    add(hb.stay, type !== 'fold', rule.stay);
    if (c.canRaise) add(hb.raise, type === 'raise', rule.raise);
  }
  // Cỡ tố nói gì: máy thường tố láo luôn đúng một cỡ, tố thật thì cỡ thay đổi. Trả về xác suất ra đúng cỡ này của mỗi loại.
  function sizeLik(game, L, raiseTo) {
    const pot = game.pot, open = L.toCall === 0, K = 40;
    let hit = 0;
    for (let k = 0; k < K; k++) {
      const u = (k + 0.5) / K;
      if (botSize(game, L, pot, open ? 0.45 + u * 0.5 : 0.6 + u * 0.4) === raiseTo) hit++;
    }
    const pb = botSize(game, L, pot, open ? 0.5 : 0.6) === raiseTo ? 1 : 0;
    return hit || pb ? { pv: hit / K, pb } : { pv: 1, pb: 1 };
  }
  // Gọi ngay TRƯỚC khi hành động được áp vào ván: cập nhật độ tin về lá tẩy của người vừa hành động.
  function observe(game, i, type, raiseTo) {
    const R = game.reads, p = game.players[i], w = R.w[i];
    const L = game.legal(i);
    if (type === 'call' && L.canCheck) type = 'check';
    if (isPro(p)) {
      if (!R.all) return;
      for (const cards of holeClasses(game, i)) {
        const l = Math.max(1e-6, proProbs(game, i, cards[0])[type] || 0);
        for (const c of cards) w[c] *= l;
      }
    } else {
      const st = readStyle(p), c = ctxOf(game, i), eq = classEq(game, i);
      const hm = st ? null : habitModel(game, i, c);
      const model = st ? (e) => simpleProbs(st, c, e, sdOf(e)) : hm.probs;
      let pv = 1, pb = 1;
      if (st && type === 'raise' && !st.fixed) ({ pv, pb } = sizeLik(game, L, raiseTo));
      for (const cards of holeClasses(game, i)) {
        const pr = model(eq[cards[0]]);
        const l = Math.max(1e-6, type === 'raise' ? pr.value * pv + pr.bluff * pb : pr[type] || 0);
        for (const cd of cards) w[cd] *= l;
      }
      if (!st) learnHabit(game, c, type, hm.rule);
    }
    let mx = 0; for (let c = 0; c < 24; c++) if (w[c] > mx) mx = w[c];
    if (mx > 0) for (let c = 0; c < 24; c++) w[c] /= mx;
  }
  // Lá tẩy có "giúp bài" không: trùng số một lá ngửa, hoặc (đủ 5 lá) làm thành sảnh / thùng
  function holeHelps(cards) {
    const r = rankOf(cards[0]);
    for (let k = 1; k < cards.length; k++) if (rankOf(cards[k]) === r) return true;
    return cards.length === 5 && classify(cards).cat >= 4;
  }
  /* Người ngồi ghế viewer (-1: người ngoài) đoán lá tẩy của ghế target: xác suất theo từng số, số dễ nhất, và
   * xác suất lá tẩy giúp bài. Loại các lá cả bàn đã thấy và lá viewer đang cầm.
   * base / helpsBase: cùng các con số đó nếu chỉ đếm lá (chưa xét cách cược), để biết cách cược đã nói thêm được gì. */
  function readOf(game, viewer, target) {
    const R = game.reads; if (!R) return null;
    let seen = publicMask(game);
    if (viewer >= 0) for (const c of game.players[viewer].cards) seen |= 1 << c;
    const w = R.w[target], ups = game.ups(game.players[target]);
    const byRank = [0, 0, 0, 0, 0, 0], base = [0, 0, 0, 0, 0, 0];
    let sum = 0, helps = 0, n = 0, helpsBase = 0;
    for (let c = 0; c < 24; c++) {
      if ((seen >> c) & 1) continue;
      const h = holeHelps([c, ...ups]);
      n++; base[rankOf(c)]++; if (h) helpsBase++;
      sum += w[c]; byRank[rankOf(c)] += w[c]; if (h) helps += w[c];
    }
    if (!(sum > 0)) return null;
    let top = 0, shift = 0;
    for (let r = 0; r < 6; r++) {
      byRank[r] /= sum; base[r] /= n;
      if (byRank[r] > byRank[top]) top = r;
      shift = Math.max(shift, Math.abs(byRank[r] - base[r]));
    }
    return { byRank, top, helps: helps / sum, base, helpsBase: helpsBase / n, shift };
  }

  // Độ tin về lá tẩy của từng đối thủ còn trong ván, theo mắt ghế i (đang cầm lá tẩy `hole`): bỏ các lá đã lộ và lá của chính mình.
  function rangesFor(game, i, hole) {
    const seen = publicMask(game) | (1 << hole);
    return game.live().filter((q) => q.id !== i).map((o) => {
      const w = game.reads.w[o.id], cards = [], cum = [];
      let s = 0;
      for (let c = 0; c < 24; c++) { if ((seen >> c) & 1 || !(w[c] > 0)) continue; s += w[c]; cards.push(c); cum.push(s); }
      return { id: o.id, ups: game.ups(o), cards, cum };
    });
  }

  /* Thử nhiều lần cho người đọc bài: mỗi lần bốc lá tẩy của từng đối thủ theo độ tin, chia nốt các lá còn thiếu, rồi ghi:
   *  - đứng yên (xem / theo): thắng cả bàn thì +hũ, thua thì mất tiền theo;
   *  - tố: ai có bài đủ để ở lại (theo cont) thì ở lại; không ai ở lại thì ăn hũ ngay,
   *    còn không thì so bài với những nhà ở lại: thắng +hũ +tiền họ theo, thua mất tiền tố. */
  function readEval(my, O, dead, S, iters, rng, B) {
    let known = 0;
    for (const c of my) known |= 1 << c;
    for (const c of dead) known |= 1 << c;
    for (const o of O) for (const c of o.ups) known |= 1 << c;
    const p = [];
    for (let c = 0; c < 24; c++) if (!((known >> c) & 1)) p.push(c);
    const len = p.length, nO = O.length, needMe = 5 - my.length;
    const mine = my.slice();
    const hands = O.map((o) => [0, ...o.ups]);
    const hidx = new Int32Array(nO);
    let n = 0, wins = 0, sPass = 0, sBet = 0, sP2 = 0, sB2 = 0, sD2 = 0, foldAll = 0;
    for (let it = 0; it < iters; it++) {
      const used = sampleHoles(O, hidx, rng);
      if (used < 0) continue;
      let pos = 0;
      const draw = () => {
        for (;;) {
          const j = pos + ((rng() * (len - pos)) | 0);
          const t = p[pos]; p[pos] = p[j]; p[j] = t;
          const c = p[pos++];
          if (!((used >> c) & 1)) return c;
        }
      };
      mine.length = my.length;
      for (let k = 0; k < needMe; k++) mine.push(draw());
      const sc = scoreOf(mine, S);
      let win = true, stay = 0, extra = 0, beat = true;
      for (let o = 0; o < nO; o++) {
        const h = hands[o], need = 4 - O[o].ups.length;
        h.length = 5 - need;
        h[0] = O[o].cards[hidx[o]];
        for (let k = 0; k < need; k++) h.push(draw());
        const lose = scoreOf(h, S) > sc;
        if (lose) win = false;
        if (B.bet && rng() < O[o].cont[hidx[o]]) { stay++; extra += O[o].cost; if (lose) beat = false; }
      }
      const gP = win ? B.pot : -B.t;
      const gB = !B.bet ? 0 : stay === 0 ? B.pot : beat ? B.pot + extra : -B.myCost;
      n++; if (win) wins++; if (B.bet && stay === 0) foldAll++;
      sPass += gP; sBet += gB; sP2 += gP * gP; sB2 += gB * gB; sD2 += (gB - gP) * (gB - gP);
    }
    if (!n) return { n: 0, win: 0, evPass: -B.t, evBet: -B.myCost, varPass: 0, varBet: 0, sdPass: B.pot, sdBet: B.pot, sdDiff: B.pot, foldAll: 0 };
    const mP = sPass / n, mB = sBet / n, vr = (s2, m) => Math.max(0, s2 / n - m * m), se = (s2, m) => Math.sqrt(vr(s2, m) / n);
    return { n, win: wins / n, evPass: mP, evBet: mB, varPass: vr(sP2, mP), varBet: vr(sB2, mB),
      sdPass: se(sP2, mP), sdBet: se(sB2, mB), sdDiff: se(sD2, mB - mP), foldAll: foldAll / n };
  }

  /* Người lão luyện (ghế i) tính toán với lá tẩy `hole`: đọc lá tẩy từng đối thủ, đoán ai sẽ bỏ nếu mình tố cả hũ,
   * rồi so lời lỗ của ba đường: đứng yên (xem / theo), tố, và bỏ. */
  function proPlan(game, i, hole, iters, rng) {
    if (!game.reads) game.reads = newReads(game.players.length, false);
    const me = game.players[i], st = STYLES[me.style], L = game.legal(i), pot = game.pot;
    let betTo = 0;
    if (L.canRaise) {
      betTo = game.currentBet + Math.max(game.minRaise, Math.round((pot + L.toCall) * st.size / 5) * 5);
      betTo = Math.max(L.minRaiseTo, Math.min(betTo, L.maxRaiseTo));
      if (betTo >= L.maxRaiseTo * 0.75) betTo = L.maxRaiseTo;
    }
    const myCost = betTo ? betTo - me.bet : 0;
    const O = rangesFor(game, i, hole);
    for (const r of O) {
      const o = game.players[r.id], facing = betTo && !o.allIn;
      const eq = facing ? classEq(game, o.id) : null, so = facing ? readStyle(o) : null, cx = facing ? ctxAfter(game, o, betTo, myCost) : null;
      const model = !facing ? null : so ? (e) => simpleProbs(so, cx, e, sdOf(e)) : habitModel(game, o.id, cx).probs;
      r.cont = r.cards.map((c) => (!betTo ? 0 : o.allIn ? 1 : 1 - model(eq[c]).fold));
      r.cost = facing ? Math.min(Math.max(0, betTo - o.bet), o.stack) : 0;
    }
    const dead = game.players.filter((q) => q.folded && !q.out).flatMap((q) => game.ups(q));
    const r = readEval([hole, ...game.ups(me)], O, dead, game.strength, iters, rng,
      { pot, t: L.callAmt, myCost, bet: betTo > 0 });
    r.betTo = betTo; r.pot = pot; r.toCall = L.toCall; r.callAmt = L.callAmt; r.canRaise = L.canRaise;
    // Ngại rủi ro: trừ bớt phần lời theo độ may rủi so với mức mang vào bàn (ván to mà chỉ hơn kém chút ít thì tránh)
    const bank = Math.max(1, st.bank * game.ante);
    r.cePass = r.evPass - r.varPass / (2 * bank);
    r.ceBet = r.evBet - r.varBet / (2 * bank);
    // "Bài xấu": chỉ nhìn lá ngửa (chưa đọc ai) thì dưới weakRel lần mức chia đều
    r.flat = classEq(game, i)[hole];
    r.weakAt = st.weakRel / (O.length + 1);
    return r;
  }
  /* Quyết định của người lão luyện (so "lời đã trừ rủi ro" của từng đường):
   *  - chưa ai tố: tố cả hũ nếu tố lời hơn xem; bài xấu thì chỉ hù pressFreq số lần;
   *  - bị tố: tố lại nếu lời hơn hẳn, theo nếu theo có lời, còn lại bỏ. */
  function proDecide(game, i, rng = Math.random) {
    const p = game.players[i], st = STYLES[p.style];
    const pl = proPlan(game, i, p.cards[0], st.iters || BOT_ITERS, rng);
    const go = !(pl.flat < pl.weakAt) || rng() < st.pressFreq;
    let type;
    if (pl.toCall === 0) type = pl.canRaise && go && pl.ceBet - pl.cePass >= st.betEdge * pl.pot ? 'raise' : 'check';
    else if (pl.canRaise && go && pl.ceBet >= Math.max(pl.cePass, 0) + st.raiseEdge * pl.pot) type = 'raise';
    else type = pl.cePass >= st.callEdge * pl.callAmt ? 'call' : 'fold';
    return { type, raiseTo: pl.betTo, plan: pl };
  }
  // Người ngoài đoán: nếu tẩy của người lão luyện là `cand` thì họ chọn từng hành động với xác suất bao nhiêu
  function proProbs(game, i, cand) {
    const st = STYLES[game.players[i].style];
    const pl = proPlan(game, i, cand, READ_ITERS, game.rng);
    const soft = 0.04 * pl.pot, sm = (sd) => Math.max(sd * 1.15, soft);
    const pWeak = 1 - Phi((pl.flat - pl.weakAt) / 0.012);        // bài xấu hay không: làm trơn quanh ngưỡng
    const go = 1 - pWeak * (1 - st.pressFreq);
    if (pl.toCall === 0) {
      const b = pl.canRaise ? go * Phi((pl.ceBet - pl.cePass - st.betEdge * pl.pot) / sm(pl.sdDiff)) : 0;
      return { raise: b, check: 1 - b, call: 0, fold: 0 };
    }
    const b = !pl.canRaise ? 0 : go * (pl.cePass > 0
      ? Phi((pl.ceBet - pl.cePass - st.raiseEdge * pl.pot) / sm(pl.sdDiff))
      : Phi((pl.ceBet - st.raiseEdge * pl.pot) / sm(pl.sdBet)));
    const k = Phi((pl.cePass - st.callEdge * pl.callAmt) / sm(pl.sdPass));
    return { raise: b, call: (1 - b) * k, fold: (1 - b) * (1 - k), check: 0 };
  }

  function pct(x) { return (x * 100).toFixed(x < 0.1 && x > 0 ? 1 : 0) + '%'; }

  const api = { RANKS, SUITS, CAT_NAMES, RULESETS, STYLES, rankOf, suitOf, cardLabel, isRed, newDeck, shuffle,
    classify, scoreOf, describe, handFrequencies, drawOut, equity, equityDetail, Game, analyze, grade, botDecide, pct,
    SHUFFLES, riffle, overhand, cut, shuffleBy, collect, startClass, startClassLabel,
    readOf, holeHelps, holeClasses, simpleProbs, proPlan, proProbs, rangesFor, HUMAN_RULE, scoreOfSlow };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Xito = api;
})(typeof window !== 'undefined' ? window : globalThis);

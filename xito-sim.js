/* Xì tố 24 — phòng thí nghiệm: chạy hàng triệu ván để rút kinh nghiệm.
 * Mỗi ván: n người, ai cũng theo tới lá thứ 5 rồi lật bài (đo sức mạnh thuần của lá bài).
 * Bộ bài mang sang ván sau: gom theo từng nhà → xào theo kiểu đã chọn → chia vòng mỗi nhà 1 lá.
 * Dùng được trong Node (require) và trong Web Worker (importScripts sau xito-engine.js).
 */
(function (root) {
  'use strict';
  const X = root.Xito || (typeof require !== 'undefined' ? require('./xito-engine.js') : null);
  const RULE_KEYS = Object.keys(X.RULESETS);

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function newStats(players) {
    return {
      players, hands: 0,
      catFreq: Array(9).fill(0),                         // loại bài cuối (5 lá) của từng nhà
      start: RULE_KEYS.map(() => Array.from({ length: 36 }, () => [0, 0])),   // [số lần, số lần thắng] theo bộ khởi đầu
      street: RULE_KEYS.map(() => [3, 4].map(() => Array.from({ length: 9 }, () => [0, 0]))), // loại bài ở lá 3 / lá 4 → thắng
      // Hiệu ứng ván trước: ván trước có nhà cầm ≥3 lá cùng số (sám, cù lũ, tứ quý) → ván này CHÍNH các lá đó rơi thế nào
      carry: { cases: 0, split: 0, someonePair: 0, someoneTrips: 0, samePlayerKeeps: 0 },
      // Hiệu ứng với đôi ván trước
      carryPair: { cases: 0, split: 0, someonePair: 0 },
      pairPlusRate: 0,                                    // tỉ lệ nhà có từ đôi trở lên ở 5 lá
    };
  }

  /* Chạy `count` ván, cộng dồn vào stats. state giữ bộ bài giữa các lần gọi (để chạy theo từng đợt). */
  function run(stats, state, count, shuffleKey, rng) {
    const n = stats.players;
    const strengths = RULE_KEYS.map((k) => X.RULESETS[k].strength);
    for (let h = 0; h < count; h++) {
      const deck = X.shuffleBy(state.prevOrder, shuffleKey, rng);
      // chia vòng: lá 1 cho cả bàn, rồi lá 2, ...
      const hands = Array.from({ length: n }, () => []);
      let top = 0;
      for (let r = 0; r < 5; r++) for (let p = 0; p < n; p++) hands[p].push(deck[top++]);

      // hiệu ứng ván trước: theo dõi đúng các lá đã nằm chung một nhà ván trước
      if (state.clumps && state.clumps.length) {
        const seatOf = state.seatOf || (state.seatOf = new Int8Array(24));
        seatOf.fill(-1);
        for (let k = 0; k < top; k++) seatOf[deck[k]] = k % n;
        for (const g of state.clumps) {
          const per = new Int8Array(n);
          for (const c of g.cards) { const s = seatOf[c]; if (s >= 0) per[s]++; }
          let mx = 0; for (let p = 0; p < n; p++) if (per[p] > mx) mx = per[p];
          if (g.cards.length >= 3) {
            stats.carry.cases++;
            if (mx <= 1) stats.carry.split++;
            if (mx >= 2) stats.carry.someonePair++;
            if (mx >= 3) stats.carry.someoneTrips++;
            if (per[g.holder] >= 2) stats.carry.samePlayerKeeps++;
          } else {
            stats.carryPair.cases++;
            if (mx <= 1) stats.carryPair.split++; else stats.carryPair.someonePair++;
          }
        }
      }

      // điểm và người thắng theo từng bộ luật
      const finalCats = hands.map((hd) => X.classify(hd).cat);
      for (let p = 0; p < n; p++) { stats.catFreq[finalCats[p]]++; if (finalCats[p] >= 1) stats.pairPlusRate++; }
      for (let ri = 0; ri < RULE_KEYS.length; ri++) {
        let best = -1, w = -1;
        for (let p = 0; p < n; p++) { const s = X.scoreOf(hands[p], strengths[ri]); if (s > best) { best = s; w = p; } }
        const st = stats.start[ri];
        for (let p = 0; p < n; p++) {
          const sc = X.startClass(hands[p][0], hands[p][1]);
          st[sc][0]++; if (p === w) st[sc][1]++;
          for (let si = 0; si < 2; si++) {
            const c = X.classify(hands[p].slice(0, 3 + si)).cat;
            const cell = stats.street[ri][si][c];
            cell[0]++; if (p === w) cell[1]++;
          }
        }
      }

      // ghi nhận cụm của ván này (các lá cùng số trong tay một nhà) để đo ở ván sau
      state.clumps = [];
      for (let p = 0; p < n; p++) {
        const by = [[], [], [], [], [], []];
        for (const card of hands[p]) by[X.rankOf(card)].push(card);
        for (let r = 0; r < 6; r++) if (by[r].length >= 2) state.clumps.push({ cards: by[r], holder: p });
      }
      // gom bài: các nhà theo thứ tự ghế, phần bài thừa ở dưới
      state.prevOrder = X.collect(hands, deck.slice(top));
      stats.hands++;
    }
    return stats;
  }

  /* Gộp thống kê để hiển thị (tỉ lệ %). */
  function summarize(stats) {
    const n = stats.players, H = stats.hands;
    const pct = (a, b) => (b ? a / b : 0);
    return {
      players: n, hands: H,
      catFreq: stats.catFreq.map((c) => pct(c, H * n)),
      pairPlusRate: pct(stats.pairPlusRate, H * n),
      start: Object.fromEntries(RULE_KEYS.map((k, ri) => [k, stats.start[ri].map(([c, w]) => [c, pct(w, c)])])),
      street: Object.fromEntries(RULE_KEYS.map((k, ri) => [k, stats.street[ri].map((row) => row.map(([c, w]) => [c, pct(w, c)]))])),
      carry: { cases: stats.carry.cases, split: pct(stats.carry.split, stats.carry.cases), someonePair: pct(stats.carry.someonePair, stats.carry.cases),
        someoneTrips: pct(stats.carry.someoneTrips, stats.carry.cases), samePlayerKeeps: pct(stats.carry.samePlayerKeeps, stats.carry.cases) },
      carryPair: { cases: stats.carryPair.cases, split: pct(stats.carryPair.split, stats.carryPair.cases), someonePair: pct(stats.carryPair.someonePair, stats.carryPair.cases) },
    };
  }

  /* Dự báo cho ván sắp chia, CHỈ dựa vào những lá người chơi đã thấy ván trước (visible):
   * các lá cùng số nằm chung một nhà (một khối khi gom) sẽ rơi thế nào sau khi xào + chia vòng.
   * So sánh với trộn kỹ. Trả về mỗi nhóm: rải mỗi nhà ≤1 lá / có nhà nhận ≥2 lá / mình (ghế 0) nhận ≥2 lá. */
  function forecast(prevOrder, prevBlocks, shuffleKey, n, visible, iters = 4000, rng = Math.random) {
    const groups = [];
    for (const b of prevBlocks) {
      const byRank = {};
      for (const c of b.cards) if (!visible || visible.has(c)) (byRank[X.rankOf(c)] = byRank[X.rankOf(c)] || []).push(c);
      for (const r in byRank) if (byRank[r].length >= 2) groups.push({ rank: +r, cards: byRank[r], from: b.name, fromId: b.id });
    }
    if (!groups.length) return [];
    const measure = (key) => {
      const res = groups.map(() => ({ split: 0, pairPlus: 0, mine2: 0 }));
      const seatOf = new Int8Array(24);
      for (let it = 0; it < iters; it++) {
        const deck = X.shuffleBy(prevOrder, key, rng);
        seatOf.fill(-1);
        for (let k = 0; k < 5 * n && k < 24; k++) seatOf[deck[k]] = k % n;
        groups.forEach((g, gi) => {
          const per = new Int8Array(n);
          for (const c of g.cards) { const s = seatOf[c]; if (s >= 0) per[s]++; }
          let mx = 0; for (let p = 0; p < n; p++) mx = Math.max(mx, per[p]);
          if (mx <= 1) res[gi].split++; else res[gi].pairPlus++;
          if (per[0] >= 2) res[gi].mine2++;
        });
      }
      return res.map((r) => ({ split: r.split / iters, pairPlus: r.pairPlus / iters, mine2: r.mine2 / iters }));
    };
    const real = measure(shuffleKey), base = measure('perfect');
    return groups.map((g, i) => ({ ...g, real: real[i], base: base[i] }));
  }

  const api = { run, summarize, newStats, forecast, mulberry32, RULE_KEYS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.XitoSim = api;
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : globalThis);

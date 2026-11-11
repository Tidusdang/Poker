// Chạy phòng thí nghiệm: với mỗi số người (2–4) và mỗi kiểu xào, chạy N ván liên tiếp (bộ bài mang sang ván sau).
// Ghi kết quả vào xito-lab-data.js để game hiển thị.  Dùng: node sim/run-1m.js [số ván, mặc định 1000000]
const fs = require('fs');
const path = require('path');
const X = require('../xito-engine.js');
const S = require('../xito-sim.js');
const N = +(process.argv[2] || 1000000);
const out = { generated: new Date().toISOString().slice(0, 10), handsPerRun: N, shuffles: {}, runs: {} };
for (const [k, v] of Object.entries(X.SHUFFLES)) out.shuffles[k] = v.label;
let seed = 2026;
for (const n of [2, 3, 4]) {
  out.runs[n] = {};
  for (const key of Object.keys(X.SHUFFLES)) {
    const t = Date.now();
    const st = S.newStats(n);
    S.run(st, {}, N, key, S.mulberry32(seed++));
    const r = S.summarize(st);
    // làm gọn số liệu
    const r4 = (x) => Math.round(x * 1e4) / 1e4;
    r.catFreq = r.catFreq.map(r4);
    r.pairPlusRate = r4(r.pairPlusRate);
    for (const rk of Object.keys(r.start)) {
      r.start[rk] = r.start[rk].map(([c, w]) => [c, r4(w)]);
      r.street[rk] = r.street[rk].map((row) => row.map(([c, w]) => [c, r4(w)]));
    }
    for (const g of ['carry', 'carryPair']) for (const f in r[g]) if (f !== 'cases') r[g][f] = r4(r[g][f]);
    // bảng khởi đầu/lá 3/lá 4 chỉ cần lưu cho trộn kỹ (kiểu xào không đổi sức mạnh lá bài nhiều)
    if (key !== 'perfect') { delete r.start; delete r.street; }
    out.runs[n][key] = r;
    console.log(`${n} người · ${key}: ${((Date.now() - t) / 1000).toFixed(1)}s · rải đều ${r.carry.split} · có nhà ≥2 ${r.carry.someonePair} · đôi+ ${r.pairPlusRate}`);
  }
}
const file = path.join(__dirname, '..', 'xito-lab-data.js');
fs.writeFileSync(file, '/* Sinh tự động bởi sim/run-1m.js — kết quả ' + N.toLocaleString('vi-VN') + ' ván cho mỗi cấu hình. */\n' +
  '(function (r) { r.XitoLabData = ' + JSON.stringify(out) + '; })(typeof window !== "undefined" ? window : typeof self !== "undefined" ? self : globalThis);\n' +
  'if (typeof module !== "undefined") module.exports = (typeof window !== "undefined" ? window : globalThis).XitoLabData;\n');
console.log('Đã ghi', file, (fs.statSync(file).size / 1024).toFixed(1) + ' KB');

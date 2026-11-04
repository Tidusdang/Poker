// Vẽ icon app + màn hình khởi động (splash) bằng canvas trong Chromium headless.
// Chạy một lần sau khi đổi thiết kế: node scripts/make-icons.mjs
// Ghi ra: assets/icons/* (PWA) và android/app/src/main/res/{mipmap-*,drawable*}/*.png
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const res = path.join(root, 'android/app/src/main/res');
const fontDir = path.join(root, 'node_modules/@fontsource');

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

const jobs = [
  { out: 'assets/icons/icon-192.png', w: 192, h: 192, mode: 'full' },
  { out: 'assets/icons/icon-512.png', w: 512, h: 512, mode: 'full' },
  { out: 'assets/icons/maskable-512.png', w: 512, h: 512, mode: 'maskable' },
  { out: 'assets/icons/apple-touch-icon.png', w: 180, h: 180, mode: 'maskable' },
];
for (const dir of fs.readdirSync(res)) {
  for (const [file, mode] of [['ic_launcher.png', 'legacy'], ['ic_launcher_round.png', 'round'], ['ic_launcher_foreground.png', 'fg'], ['splash.png', 'splash']]) {
    const p = path.join(res, dir, file);
    if (fs.existsSync(p)) { const { w, h } = pngSize(p); jobs.push({ out: path.relative(root, p), w, h, mode }); }
  }
}

const html = `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: 'Cormorant'; font-weight: 700; src: url(file://${fontDir}/cormorant/files/cormorant-latin-700-normal.woff2); }
@font-face { font-family: 'Cormorant'; font-weight: 700; unicode-range: U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB; src: url(file://${fontDir}/cormorant/files/cormorant-vietnamese-700-normal.woff2); }
@font-face { font-family: 'BVP'; font-weight: 600; src: url(file://${fontDir}/be-vietnam-pro/files/be-vietnam-pro-latin-600-normal.woff2); }
body { margin: 0; background: transparent; }
</style><canvas id="c"></canvas><span style="font-family:Cormorant;font-weight:700">Xì Tố 24</span><span style="font-family:BVP;font-weight:600">♠♥</span>`;

const draw = `
window.drawIcon = function (W, H, mode) {
  const c = document.getElementById('c');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  const S = Math.min(W, H);
  const cx = W / 2, cy = H / 2;
  const COL = { bg: '#170c0a', bg2: '#3a1a13', gold: '#d2aa55', goldDim: '#8e7240', cin: '#b3321f', cinDeep: '#7a1d12', egg: '#f1e7d0', egg2: '#e3d5b6', ink: '#1b1310', red: '#a8231a' };
  const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
  function background(shape) {
    ctx.save();
    if (shape === 'round') { ctx.beginPath(); ctx.arc(cx, cy, S * 0.46, 0, Math.PI * 2); ctx.clip(); }
    else if (shape === 'legacy') { rr(W * 0.06, H * 0.06, W * 0.88, H * 0.88, S * 0.18); ctx.clip(); }
    const g = ctx.createRadialGradient(cx, cy * 0.85, 0, cx, cy, Math.max(W, H) * 0.75);
    g.addColorStop(0, COL.bg2); g.addColorStop(1, COL.bg);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.restore();
    if (shape === 'round' || shape === 'legacy') {
      ctx.save(); ctx.strokeStyle = COL.goldDim; ctx.lineWidth = S * 0.012;
      if (shape === 'round') { ctx.beginPath(); ctx.arc(cx, cy, S * 0.44, 0, Math.PI * 2); ctx.stroke(); }
      else { rr(W * 0.085, H * 0.085, W * 0.83, H * 0.83, S * 0.15); ctx.stroke(); }
      ctx.restore();
    }
  }
  // hai lá bài xòe; scale = chiều rộng vùng vẽ an toàn
  function cards(scale, ox, oy) {
    const cw = scale * 0.5, ch = cw * 1.42, r = cw * 0.1;
    ctx.save(); ctx.translate(ox - scale * 0.1, oy + scale * 0.02); ctx.rotate(-0.24);
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = scale * 0.05; ctx.shadowOffsetY = scale * 0.015;
    rr(-cw / 2, -ch / 2, cw, ch, r);
    const g = ctx.createLinearGradient(-cw / 2, -ch / 2, cw / 2, ch / 2); g.addColorStop(0, COL.cin); g.addColorStop(1, COL.cinDeep);
    ctx.fillStyle = g; ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.strokeStyle = COL.goldDim; ctx.lineWidth = cw * 0.025; rr(-cw / 2 + cw * 0.08, -ch / 2 + cw * 0.08, cw * 0.84, ch - cw * 0.16, r * 0.6); ctx.stroke();
    const d = cw * 0.17; ctx.beginPath(); ctx.moveTo(0, -d * 1.3); ctx.lineTo(d, 0); ctx.lineTo(0, d * 1.3); ctx.lineTo(-d, 0); ctx.closePath();
    ctx.fillStyle = COL.cinDeep; ctx.fill(); ctx.strokeStyle = COL.gold; ctx.lineWidth = cw * 0.025; ctx.stroke();
    ctx.restore();
    ctx.save(); ctx.translate(ox + scale * 0.12, oy - scale * 0.01); ctx.rotate(0.14);
    ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = scale * 0.06; ctx.shadowOffsetY = scale * 0.02;
    rr(-cw / 2, -ch / 2, cw, ch, r);
    const e = ctx.createLinearGradient(-cw / 2, -ch / 2, cw / 2, ch / 2); e.addColorStop(0, COL.egg); e.addColorStop(1, COL.egg2);
    ctx.fillStyle = e; ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.strokeStyle = COL.gold; ctx.lineWidth = cw * 0.02; rr(-cw / 2, -ch / 2, cw, ch, r); ctx.stroke();
    ctx.fillStyle = COL.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 ' + (cw * 0.62) + 'px Cormorant'; ctx.fillText('24', 0, -ch * 0.06);
    ctx.font = '600 ' + (cw * 0.2) + 'px BVP';
    ctx.fillStyle = COL.ink; ctx.fillText('♠', -cw * 0.13, ch * 0.24);
    ctx.fillStyle = COL.red; ctx.fillText('♥', cw * 0.13, ch * 0.24);
    ctx.restore();
  }
  if (mode === 'fg') { cards(S * 0.6, cx, cy); }
  else if (mode === 'maskable') { background('full'); cards(S * 0.72, cx, cy); }
  else if (mode === 'full') { background('full'); cards(S * 0.82, cx, cy); }
  else if (mode === 'legacy') { background('legacy'); cards(S * 0.7, cx, cy); }
  else if (mode === 'round') { background('round'); cards(S * 0.66, cx, cy); }
  else if (mode === 'splash') {
    background('full');
    const s = Math.min(S * 0.42, 360);
    cards(s, cx, cy - s * 0.18);
    ctx.fillStyle = COL.egg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 ' + (s * 0.2) + 'px Cormorant';
    ctx.fillText('Xì Tố ', cx - s * 0.12, cy + s * 0.62);
    ctx.fillStyle = COL.gold; ctx.textAlign = 'left';
    ctx.fillText('24', cx - s * 0.12 + ctx.measureText('Xì Tố ').width / 2, cy + s * 0.62);
  }
  return c.toDataURL('image/png');
};`;

const browser = await chromium.launch();
const page = await browser.newPage();
const tmp = path.join(root, 'node_modules', '.cache', 'xito-icons.html');
fs.mkdirSync(path.dirname(tmp), { recursive: true });
fs.writeFileSync(tmp, html);
await page.goto('file://' + tmp);
await page.addScriptTag({ content: draw });
await page.evaluate(async () => { await document.fonts.load('700 40px Cormorant'); await document.fonts.load('600 40px BVP', '♠♥'); await document.fonts.ready; });
const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family));
if (!loaded.includes('Cormorant') || !loaded.includes('BVP')) throw new Error('Font chưa nạp: ' + loaded.join(','));
fs.mkdirSync(path.join(root, 'assets/icons'), { recursive: true });
for (const j of jobs) {
  const url = await page.evaluate(([w, h, m]) => window.drawIcon(w, h, m), [j.w, j.h, j.mode]);
  fs.writeFileSync(path.join(root, j.out), Buffer.from(url.split(',')[1], 'base64'));
}
await browser.close();
console.log(`Đã vẽ ${jobs.length} ảnh`);

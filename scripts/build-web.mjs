// Đóng gói trang game thành web app độc lập trong www/ (dùng cho app Android qua Capacitor và PWA).
// - bọc index.html bằng khung <html><head> đầy đủ (viewport-fit=cover, chặn zoom, manifest, icon)
// - thay Google Fonts bằng font cài sẵn (chạy offline): chỉ giữ bảng mã latin, latin-ext, vietnamese
// - thêm service worker để cài như app trên điện thoại (PWA) khi phục vụ qua https
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'www');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'fonts'), { recursive: true });

/* ---------- font ---------- */
const FONTS = [
  ['cormorant', [500, 600, 700]],
  ['be-vietnam-pro', [400, 500, 600, 700]],
  ['ibm-plex-mono', [400, 500, 600]],
];
const SUBSETS = ['vietnamese', 'latin-ext', 'latin'];
let fontCss = '';
for (const [fam, weights] of FONTS) {
  const dir = path.join(root, 'node_modules', '@fontsource', fam);
  for (const w of weights) {
    const css = fs.readFileSync(path.join(dir, `${w}.css`), 'utf8');
    const blocks = css.split(/(?=\/\* )/);
    for (const b of blocks) {
      const m = b.match(/\/\* ([\w-]+) \*\//);
      if (!m) continue;
      const subset = m[1].replace(`${fam}-`, '').replace(`-${w}-normal`, '');
      if (!SUBSETS.includes(subset)) continue;
      let block = b;
      for (const u of b.matchAll(/url\(\.\/files\/([^)]+\.woff2)\)/g)) {
        fs.copyFileSync(path.join(dir, 'files', u[1]), path.join(out, 'fonts', u[1]));
      }
      block = block.replace(/url\(\.\/files\/([^)]+\.woff2)\) format\('woff2'\),\s*url\([^)]+\) format\('woff'\)/g, "url($1) format('woff2')");
      block = block.replace(/url\(\.\/files\//g, 'url(');
      fontCss += block.trim() + '\n';
    }
  }
}
fs.writeFileSync(path.join(out, 'fonts', 'fonts.css'), fontCss);

/* ---------- trang ---------- */
let page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
page = page.replace(/<link rel="preconnect"[^>]*>\n/g, '');
page = page.replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/, '<link rel="stylesheet" href="fonts/fonts.css">');
const titleMatch = page.match(/<title>[^<]*<\/title>\n?/);
const title = titleMatch ? titleMatch[0] : '<title>Xì Tố 24</title>\n';
page = page.replace(title, '').replace(/<meta name="claude:viewport-fit-sides"[^>]*>\n?/, '');

const head = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
${title.trim()}
<meta name="theme-color" content="#170c0a">
<meta name="color-scheme" content="dark">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Xì Tố 24">
<meta name="format-detection" content="telephone=no">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<style>
html { -webkit-text-size-adjust: 100%; -webkit-tap-highlight-color: transparent; }
:root { padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); }
body { margin: 0; overscroll-behavior: none; }
img { max-width: 100%; }
</style>
<script>
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !window.Capacitor && location.hostname !== 'localhost') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
</script>
</head>
<body>
`;
fs.writeFileSync(path.join(out, 'index.html'), head + page + '\n</body>\n</html>\n');

for (const f of ['xito-engine.js', 'xito-fx.js', 'xito-sim.js', 'xito-sim-worker.js', 'xito-lab-data.js']) fs.copyFileSync(path.join(root, f), path.join(out, f));

/* ---------- icon + manifest + service worker ---------- */
fs.cpSync(path.join(root, 'assets', 'icons'), path.join(out, 'icons'), { recursive: true });
fs.writeFileSync(path.join(out, 'manifest.webmanifest'), JSON.stringify({
  name: 'Xì Tố 24',
  short_name: 'Xì Tố 24',
  description: pkg.description,
  lang: 'vi',
  start_url: './',
  scope: './',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#170c0a',
  theme_color: '#170c0a',
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2));

const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p); else files.push(path.relative(out, p).split(path.sep).join('/'));
  }
})(out);
const hash = crypto.createHash('sha1');
for (const f of files.sort()) hash.update(f).update(fs.readFileSync(path.join(out, f)));
const version = hash.digest('hex').slice(0, 10);
fs.writeFileSync(path.join(out, 'sw.js'), `// Bộ nhớ đệm offline cho Xì Tố 24 (phiên bản ${version})
const CACHE = 'xito24-${version}';
const FILES = ${JSON.stringify(['./', ...files.filter((f) => f !== 'sw.js')])};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)));
});
`);

console.log(`www/ đã sẵn sàng: ${files.length + 1} file, phiên bản ${version}`);

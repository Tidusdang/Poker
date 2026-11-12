/* Xì tố 24 — bàn chơi 3D (three.js r128).
 * Cảnh: sòng bài tối, đèn rọi xuống bàn nỉ hình thuôn NẰM NGANG. Dealer đứng giữa cạnh xa, người chơi ngồi quanh bàn,
 * bạn ngồi giữa cạnh gần (góc nhìn của máy quay). Phía xa có thêm vài bàn khác.
 * Trục: x sang phải, y lên trên, z về phía người chơi. Mặt nỉ ở y = 0.
 * Trang gọi các hàm trả Promise (deal, flip, bet, collect…) và tự đặt nhãn DOM qua attach().
 */
(function (root) {
  'use strict';
  const THREE = root.THREE, X = root.Xito, F = root.XitoFx;
  const COL = { gold: '#d2aa55', goldDim: '#8e7240', egg: '#f1e7d0', egg2: '#e3d5b6', ink: '#1b1310', red: '#a8231a', cin: '#b3321f', cinDeep: '#7a1d12' };
  const DISPLAY = '"Cormorant", Georgia, serif';

  /* ---------- vẽ chất bằng đường cong (không phụ thuộc font của máy) ---------- */
  function suitPath(ctx, s, cx, cy, z) {
    ctx.beginPath();
    if (s === 1) { ctx.moveTo(cx, cy - 0.56 * z); ctx.lineTo(cx + 0.4 * z, cy); ctx.lineTo(cx, cy + 0.56 * z); ctx.lineTo(cx - 0.4 * z, cy); ctx.closePath(); }
    else if (s === 2) {
      ctx.moveTo(cx, cy + 0.5 * z);
      ctx.bezierCurveTo(cx - 0.72 * z, cy - 0.02 * z, cx - 0.44 * z, cy - 0.66 * z, cx, cy - 0.22 * z);
      ctx.bezierCurveTo(cx + 0.44 * z, cy - 0.66 * z, cx + 0.72 * z, cy - 0.02 * z, cx, cy + 0.5 * z);
    } else if (s === 3) {
      ctx.moveTo(cx, cy - 0.54 * z);
      ctx.bezierCurveTo(cx + 0.72 * z, cy, cx + 0.46 * z, cy + 0.58 * z, cx + 0.04 * z, cy + 0.2 * z);
      ctx.lineTo(cx + 0.18 * z, cy + 0.54 * z); ctx.lineTo(cx - 0.18 * z, cy + 0.54 * z); ctx.lineTo(cx - 0.04 * z, cy + 0.2 * z);
      ctx.bezierCurveTo(cx - 0.46 * z, cy + 0.58 * z, cx - 0.72 * z, cy, cx, cy - 0.54 * z);
    } else {
      const r = 0.24 * z;
      ctx.arc(cx, cy - 0.26 * z, r, 0, 7); ctx.moveTo(cx - 0.26 * z + r, cy + 0.1 * z);
      ctx.arc(cx - 0.26 * z, cy + 0.1 * z, r, 0, 7); ctx.moveTo(cx + 0.26 * z + r, cy + 0.1 * z);
      ctx.arc(cx + 0.26 * z, cy + 0.1 * z, r, 0, 7);
      ctx.moveTo(cx - 0.05 * z, cy); ctx.lineTo(cx + 0.05 * z, cy); ctx.lineTo(cx + 0.18 * z, cy + 0.54 * z); ctx.lineTo(cx - 0.18 * z, cy + 0.54 * z); ctx.closePath();
    }
    ctx.fill();
  }
  // Mặt lá kiểu chỉ số lớn để đọc được từ xa. Vẽ tại gốc (0,0), kích thước W×H, không bo góc.
  function paintFace(ctx, W, H, card) {
    const g = ctx.createLinearGradient(0, 0, W * 0.7, H);
    g.addColorStop(0, COL.egg); g.addColorStop(1, COL.egg2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const r = X.rankOf(card), s = X.suitOf(card), rank = X.RANKS[r];
    ctx.fillStyle = (s === 1 || s === 2) ? COL.red : COL.ink;
    const corner = () => {
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.font = `700 ${W * (rank === '10' ? 0.36 : 0.44)}px ${DISPLAY}`;
      ctx.fillText(rank, W * 0.215, W * 0.4);
      suitPath(ctx, s, W * 0.215, W * 0.62, W * 0.27);
    };
    corner();
    ctx.save(); ctx.translate(W, H); ctx.rotate(Math.PI); corner(); ctx.restore();
    ctx.globalAlpha = 0.92; suitPath(ctx, s, W * 0.56, H * 0.52, W * 0.5); ctx.globalAlpha = 1;
  }

  if (!THREE) { root.XitoStage = { create: () => null, paintFace }; return; }
  const V3 = THREE.Vector3;
  const CW = 0.63, CH = 0.88;                          // lá bài
  const TL = 3.9, TW = 2.3, RL = 4.3, RW = 2.7;         // nửa dài (x) / nửa rộng (z): mặt nỉ, mép ngoài vành
  const FELTS = { jade: ['#2f7d5d', '#0e3325'], son: ['#a32e1e', '#47100a'], huyen: ['#3c3431', '#0b0807'] };
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = (t) => Math.max(0, Math.min(1, t));
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const UP = new V3(0, 1, 0), AX = new V3(1, 0, 0);

  function stadium(L, W) {       // thuôn dài theo trục x
    const s = new THREE.Shape(), r = W, xx = L - r;
    s.moveTo(-xx, -W); s.lineTo(xx, -W); s.absarc(xx, 0, r, -Math.PI / 2, Math.PI / 2, false);
    s.lineTo(-xx, W); s.absarc(-xx, 0, r, Math.PI / 2, Math.PI * 1.5, false);
    return s;
  }
  function rrShape(w, h, r) {
    const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }
  function fitUV(geo, hx, hy) {
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + hx) / (2 * hx), (p.getY(i) + hy) / (2 * hy));
    uv.needsUpdate = true;
  }
  const flat = (m) => { m.rotation.x = -Math.PI / 2; return m; };

  function create(container, opts) {
    opts = opts || {};
    const motion = opts.motion || (() => 1);
    const sfx = opts.sound || (() => {});
    const canvas = document.createElement('canvas');
    canvas.className = 'stage-canvas';
    container.insertBefore(canvas, container.firstChild);
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }
    catch (e) { canvas.remove(); return null; }
    renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0605);
    scene.fog = new THREE.FogExp2(0x0b0605, 0.026);
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 90);

    /* ---------- texture từ canvas, vẽ lại khi font đã nạp ---------- */
    const redraws = [];
    function canvasTex(w, h, draw) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const tex = new THREE.CanvasTexture(c);
      tex.encoding = THREE.sRGBEncoding;
      tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      const redraw = () => { const ctx = c.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h); draw(ctx, w, h); tex.needsUpdate = true; };
      redraw(); redraws.push(redraw);
      return tex;
    }
    if (document.fonts && document.fonts.load) {
      Promise.all([document.fonts.load(`700 64px ${DISPLAY}`), document.fonts.ready]).then(() => redraws.forEach((f) => f())).catch(() => {});
    }
    const M = (color, rough, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough }, extra || {}));

    /* ---------- tween ---------- */
    const tweens = [];
    function tw(ms, fn, ease) {
      return new Promise((res) => {
        const dur = ms * motion();
        if (dur <= 0) { fn(1); res(); return; }
        tweens.push({ t0: performance.now(), dur, fn, ease: ease || easeIO, res });
      });
    }
    const delay = (ms) => new Promise((r) => setTimeout(r, ms * motion()));

    /* ---------- ánh sáng ---------- */
    scene.add(new THREE.HemisphereLight(0xffe6c8, 0x120705, 0.3));
    const spot = new THREE.SpotLight(0xfff1dc, 0.95, 34, 0.66, 0.7, 1.0);
    spot.position.set(0, 10.5, 1.2); spot.target.position.set(0, 0, -0.3);
    spot.castShadow = true; spot.shadow.mapSize.set(2048, 2048); spot.shadow.bias = -0.0005; spot.shadow.radius = 5;
    spot.shadow.camera.near = 3; spot.shadow.camera.far = 20;
    scene.add(spot, spot.target);
    const key = new THREE.PointLight(0xffdcb4, 0.5, 13, 1.3); key.position.set(0, 4.4, -0.6); scene.add(key);
    const rim = new THREE.PointLight(0xc23a22, 0.55, 16, 1.2); rim.position.set(0, 4.5, -8); scene.add(rim);

    /* ---------- sàn, nền ---------- */
    const carpet = canvasTex(128, 128, (ctx, w, h) => {
      ctx.fillStyle = '#150807'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(210,170,85,0.07)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w, h / 2); ctx.lineTo(w / 2, h); ctx.lineTo(0, h / 2); ctx.closePath(); ctx.stroke();
      ctx.fillStyle = 'rgba(179,50,31,0.1)'; ctx.fillRect(w / 2 - 3, h / 2 - 3, 6, 6);
    });
    carpet.wrapS = carpet.wrapT = THREE.RepeatWrapping; carpet.repeat.set(40, 40);
    const floor = flat(new THREE.Mesh(new THREE.PlaneGeometry(90, 90), M(0xffffff, 0.95, { map: carpet })));
    floor.position.y = -2.6; floor.receiveShadow = true; scene.add(floor);

    const bokehTex = canvasTex(64, 64, (ctx) => {
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.55, 'rgba(255,255,255,0.75)'); g.addColorStop(0.8, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    });
    const bokeh = [];
    const tints = [0xd2aa55, 0xffe2b0, 0xb3321f, 0xf1e7d0, 0xe07a3a];
    for (let i = 0; i < 44; i++) {
      const m = new THREE.SpriteMaterial({ map: bokehTex, color: tints[i % tints.length], blending: THREE.AdditiveBlending, transparent: true, opacity: 0.1 + Math.random() * 0.28, depthWrite: false, fog: false });
      const sp = new THREE.Sprite(m);
      const a = (Math.random() - 0.5) * 2.6, rr = 22 + Math.random() * 16;
      sp.position.set(Math.sin(a) * rr, 1.5 + Math.random() * 9, -Math.cos(a) * rr - 2);
      const sc = 0.7 + Math.random() * 1.9; sp.scale.set(sc, sc, 1);
      sp.userData = { base: m.opacity, ph: Math.random() * 6, sp: 0.4 + Math.random() };
      scene.add(sp); bokeh.push(sp);
    }

    /* ---------- bàn chính ---------- */
    let feltKey = 'son';
    const feltTex = canvasTex(2048, 1024, (ctx, w, h) => {
      const LW = h * TL / TW;                 // chiều rộng logic để chữ, vòng tròn không bị méo
      ctx.scale(w / LW, 1);
      const c = FELTS[feltKey] || FELTS.son;
      const g = ctx.createRadialGradient(LW / 2, h * 0.5, 40, LW / 2, h * 0.5, LW * 0.56);
      g.addColorStop(0, c[0]); g.addColorStop(1, c[1]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, LW, h);
      for (let i = 0; i < 12000; i++) { ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.05)'; ctx.fillRect(Math.random() * LW, Math.random() * h, 2, 2); }
      const px = h / (2 * TW), cx = LW / 2, cy = h / 2;
      const line = (inset, lw, alpha) => {
        const hl = (TL - inset) * px, hw = (TW - inset) * px, xx = hl - hw;
        ctx.beginPath(); ctx.moveTo(cx - xx, cy - hw); ctx.lineTo(cx + xx, cy - hw); ctx.arc(cx + xx, cy, hw, -Math.PI / 2, Math.PI / 2); ctx.lineTo(cx - xx, cy + hw); ctx.arc(cx - xx, cy, hw, Math.PI / 2, Math.PI * 1.5); ctx.closePath();
        ctx.strokeStyle = `rgba(210,170,85,${alpha})`; ctx.lineWidth = lw; ctx.stroke();
      };
      line(0.36, 4, 0.6); line(0.44, 1.5, 0.35);
      ctx.fillStyle = 'rgba(210,170,85,0.26)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `700 ${px * 0.7}px ${DISPLAY}`; ctx.fillText('XÌ TỐ', cx, cy + 0.02 * px);
      ctx.font = `700 ${px * 0.3}px ${DISPLAY}`; ctx.fillText('· 24 ·', cx, cy + 0.52 * px);
    });
    const feltRedraw = redraws[redraws.length - 1];
    const feltGeo = new THREE.ShapeGeometry(stadium(TL, TW), 48); fitUV(feltGeo, TL, TW);
    const felt = flat(new THREE.Mesh(feltGeo, M(0xffffff, 0.96, { map: feltTex })));
    felt.receiveShadow = true; scene.add(felt);
    const railShape = stadium(RL, RW); railShape.holes.push(new THREE.Path(stadium(TL, TW).getPoints(48)));
    const railGeo = new THREE.ExtrudeGeometry(railShape, { depth: 0.13, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.07, bevelSegments: 5, curveSegments: 48 });
    const railMat = M(0x1d0e0b, 0.42, { metalness: 0.05 });
    const rail = flat(new THREE.Mesh(railGeo, railMat)); rail.position.y = -0.03; rail.castShadow = true; rail.receiveShadow = true; scene.add(rail);
    const trimShape = stadium(TL + 0.035, TW + 0.035); trimShape.holes.push(new THREE.Path(stadium(TL - 0.02, TW - 0.02).getPoints(48)));
    const trim = flat(new THREE.Mesh(new THREE.ShapeGeometry(trimShape, 48), M(0xd2aa55, 0.35, { metalness: 0.6, emissive: 0x4a3510 })));
    trim.position.y = 0.004; scene.add(trim);
    const skirtGeo = new THREE.ExtrudeGeometry(stadium(RL - 0.06, RW - 0.06), { depth: 0.42, bevelEnabled: false, curveSegments: 40 });
    const woodMat = M(0x2b130c, 0.55);
    const skirt = flat(new THREE.Mesh(skirtGeo, woodMat)); skirt.position.y = -0.5; skirt.castShadow = true; scene.add(skirt);
    const baseGeo = new THREE.CylinderGeometry(1.3, 2.0, 2.1, 32);
    const base = new THREE.Mesh(baseGeo, M(0x1c0c08, 0.6)); base.scale.x = 1.7; base.position.y = -1.55; base.castShadow = true; scene.add(base);
    // chụp đèn treo trên bàn
    function lampAt(x, y, z, s) {
      const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s);
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.5, 0.75, 28, 1, true), M(0x1a0c09, 0.5, { side: THREE.DoubleSide, emissive: 0x3a1a08 }));
      const glow = new THREE.Mesh(new THREE.CircleGeometry(1.42, 28), new THREE.MeshBasicMaterial({ color: 0xffe2b0 })); glow.rotation.x = Math.PI / 2; glow.position.y = -0.36;
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 6, 6), M(0x8e7240, 0.4)); rod.position.y = 3.3;
      g.add(shade, glow, rod); scene.add(g); return g;
    }
    const mainLamp = lampAt(0, 7.6, -0.2, 1.25);

    // khay chip của dealer
    const tray = new THREE.Group(); tray.position.set(0, 0, -1.84);
    const trayBox = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.07, 0.56), M(0x120908, 0.4));
    trayBox.position.y = 0.035; trayBox.castShadow = true; tray.add(trayBox);
    scene.add(tray);

    /* ---------- chip ---------- */
    const chipGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.05, 24);
    function chipMats(color, accent) {
      const top = canvasTex(128, 128, (ctx) => {
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(64, 64, 64, 0, 7); ctx.fill();
        ctx.fillStyle = accent;
        for (let i = 0; i < 8; i++) { ctx.save(); ctx.translate(64, 64); ctx.rotate(i * Math.PI / 4); ctx.fillRect(-9, -64, 18, 15); ctx.restore(); }
        ctx.strokeStyle = accent; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(64, 64, 38, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.arc(64, 64, 12, 0, 7); ctx.fill();
      });
      const side = canvasTex(128, 8, (ctx) => { for (let i = 0; i < 16; i++) { ctx.fillStyle = i % 2 ? accent : color; ctx.fillRect(i * 8, 0, 8, 8); } });
      return [M(0xffffff, 0.42, { map: side }), M(0xffffff, 0.42, { map: top }), M(0xffffff, 0.42, { map: top })];
    }
    const CHIP = { 500: chipMats('#d2aa55', '#f6eeda'), 100: chipMats('#16100e', '#d2aa55'), 50: chipMats('#1f5a44', '#f1e7d0'), 10: chipMats('#b3321f', '#f1e7d0'), 5: chipMats('#efe6d2', '#b3321f') };
    const DENOMS = [500, 100, 50, 10, 5];
    DENOMS.forEach((d, i) => {
      const row = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.46, 20), [CHIP[d][0], CHIP[d][1], CHIP[d][1]]);
      row.rotation.x = Math.PI / 2; row.position.set(-0.48 + i * 0.24, 0.125, 0); row.castShadow = true; tray.add(row);
    });
    function decompose(amount) {
      const out = []; let a = Math.round(amount);
      for (const d of DENOMS) while (a >= d && out.length < 16) { out.push(d); a -= d; }
      if (!out.length && amount > 0) out.push(5);
      return out;
    }
    const OFF_ROW = [[0, 0], [0.44, 0.04], [-0.44, 0.04], [0.88, 0], [-0.88, 0], [0.22, 0.38]];
    const OFF_CLUSTER = [[0, 0], [0.43, 0.03], [0.21, 0.38], [-0.22, 0.37], [-0.43, 0.02], [0.64, 0.38]];
    function fillPile(g, amount) {
      while (g.children.length) g.remove(g.children[0]);
      const by = {}; decompose(amount).forEach((d) => (by[d] = by[d] || []).push(d));
      const stacks = [];
      Object.keys(by).sort((a, b) => b - a).forEach((d) => { const arr = by[d]; while (arr.length) stacks.push(arr.splice(0, 6)); });
      const OFF = g.userData.row ? OFF_ROW : OFF_CLUSTER;
      stacks.forEach((st, i) => {
        const o = OFF[i % OFF.length];
        st.forEach((d, k) => {
          const m = new THREE.Mesh(chipGeo, CHIP[d]);
          m.position.set(o[0] + (Math.random() - 0.5) * 0.014, 0.025 + k * 0.051, o[1] + (Math.random() - 0.5) * 0.014);
          m.rotation.y = Math.random() * 6; m.castShadow = true; m.receiveShadow = true; g.add(m);
        });
      });
    }
    function newPile(amount, at, row) { const g = new THREE.Group(); g.userData.row = !!row; fillPile(g, amount); g.position.copy(at); scene.add(g); return g; }
    function slide(g, to, ms) {
      const from = g.position.clone();
      return tw(ms, (u) => { g.position.lerpVectors(from, to, u); g.position.y = Math.sin(u * Math.PI) * 0.12; }, easeIO);
    }

    /* ---------- lá bài ---------- */
    const cardGeo = new THREE.ShapeGeometry(rrShape(CW, CH, 0.05), 6); fitUV(cardGeo, CW / 2, CH / 2);
    const faceTex = {};
    function faceOf(card) {
      if (!faceTex[card]) faceTex[card] = canvasTex(256, 512, (ctx, w, h) => { const LH = w * CH / CW; ctx.scale(1, h / LH); paintFace(ctx, w, LH, card); });
      return faceTex[card];
    }
    const backTex = canvasTex(256, 512, (ctx, w, h) => {
      const LH = w * CH / CW; ctx.scale(1, h / LH);
      ctx.fillStyle = COL.cinDeep; ctx.fillRect(0, 0, w, LH);
      if (F && F.drawBack) F.drawBack(ctx, 0, 0, w, LH);
    });
    const cards = [];     // { card, seat, idx, g, front, back, pos, yaw, flip, pitch }
    const qA = new THREE.Quaternion(), qB = new THREE.Quaternion();
    function applyPose(c) {
      c.g.position.copy(c.pos);
      qA.setFromAxisAngle(UP, c.yaw);
      qB.setFromAxisAngle(AX, c.pitch - Math.PI / 2); qA.multiply(qB);
      qB.setFromAxisAngle(UP, (1 - c.flip) * Math.PI); qA.multiply(qB);
      c.g.quaternion.copy(qA);
    }
    let seats = [];
    function makeCard(card, seat, idx) {
      const g = new THREE.Group();
      const front = new THREE.Mesh(cardGeo, M(0xffffff, 0.5, { map: faceOf(card), emissive: 0x000000 })); front.position.z = 0.003; front.castShadow = true; front.receiveShadow = true;
      const back = new THREE.Mesh(cardGeo, M(0xffffff, 0.5, { map: backTex })); back.rotation.y = Math.PI; back.position.z = -0.003; back.receiveShadow = true;
      g.add(front, back);
      const c = { card, seat, idx, g, front, back, pos: new V3(), yaw: 0, flip: 0, pitch: 0 };
      g.scale.setScalar(seats[seat] ? seats[seat].s.k : 1);
      front.userData.c = c; back.userData.c = c;
      scene.add(g); cards.push(c);
      return c;
    }
    const cardAt = (seat, idx) => cards.find((c) => c.seat === seat && c.idx === idx && !c.gone);

    // cỗ bài trên bàn, chồng bài bỏ
    const deckPos = new V3(-1.1, 0, -1.74);
    const deckMats = [0, 1, 2, 3, 4, 5].map((i) => (i === 2 ? M(0xffffff, 0.5, { map: backTex }) : M(0xe6dcc6, 0.7)));
    const mkDeck = () => { const m = new THREE.Mesh(new THREE.BoxGeometry(CW, 1, CH), deckMats); m.castShadow = true; scene.add(m); return m; };
    const deck = mkDeck(), deck2 = mkDeck(); deck2.visible = false;
    const DECK_T = 0.0115;
    let deckN = 24;
    function setDeck(n) { deckN = n; deck.visible = n > 0; deck.scale.y = Math.max(0.001, n * DECK_T); deck.position.set(deckPos.x, n * DECK_T / 2, deckPos.z); }
    setDeck(24);
    const muck = new V3(1.3, 0.01, -1.7);

    /* ---------- nhân vật: dealer và người chơi ---------- */
    const torsoGeo = new THREE.LatheGeometry([[0.5, -1.4], [0.55, 0.1], [0.64, 0.95], [0.73, 1.5], [0.71, 1.82], [0.5, 2.02], [0.2, 2.11], [0.0, 2.12]].map((p) => new THREE.Vector2(p[0], p[1])), 26);
    const torsoSeatGeo = new THREE.LatheGeometry([[0.0, -0.5], [0.56, -0.5], [0.57, 0.1], [0.64, 0.95], [0.73, 1.5], [0.71, 1.82], [0.5, 2.02], [0.2, 2.11], [0.0, 2.12]].map((p) => new THREE.Vector2(p[0], p[1])), 26);
    const chairBackGeo = new THREE.BoxGeometry(1.5, 2.2, 0.2), chairSeatGeo = new THREE.BoxGeometry(1.45, 0.2, 1.3), chairPostGeo = new THREE.CylinderGeometry(0.13, 0.2, 1.3, 10);
    const chairMat = M(0x2a1410, 0.5), chairTrim = M(0x8e7240, 0.4, { metalness: 0.5 });
    function addChair(g) {
      const back = new THREE.Mesh(chairBackGeo, chairMat); back.position.set(0, 0.62, -0.5); back.castShadow = true;
      const seat = new THREE.Mesh(chairSeatGeo, chairMat); seat.position.set(0, -0.6, 0.05);
      const post = new THREE.Mesh(chairPostGeo, chairTrim); post.position.set(0, -1.32, 0);
      g.add(back, seat, post);
    }
    const skullGeo = new THREE.SphereGeometry(0.27, 22, 18), hairGeo = new THREE.SphereGeometry(0.288, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.56);
    const figures = [];
    function buildFigure(o) {
      const g = new THREE.Group(); g.position.set(o.x, o.y || 0, o.z); g.rotation.y = o.rot || 0; g.scale.setScalar(o.k);
      const coat = M(o.coat, 0.6, { side: THREE.DoubleSide }), shirt = M(o.shirt, 0.85, { side: THREE.DoubleSide }), skin = M(o.skin || 0xc99872, 0.72), sleeve = M(o.sleeve, 0.8), handM = M(o.glove ? 0xf8f3ea : (o.skin || 0xc99872), 0.68), hairM = M(o.hair, 0.5), dark = M(0x1a100d, 0.6);
      const body = new THREE.Group(); g.add(body);
      const torso = new THREE.Mesh(o.seated ? torsoSeatGeo : torsoGeo, coat); torso.scale.z = 0.6; torso.castShadow = true; body.add(torso);
      if (o.seated) {
        addChair(g);
        const legM = M(0x1a1412, 0.7);
        [-1, 1].forEach((sd) => {
          const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.95, 10), legM); thigh.rotation.x = Math.PI / 2; thigh.position.set(sd * 0.24, -0.4, 0.5);
          const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 1.15, 10), legM); shin.position.set(sd * 0.24, -0.98, 0.95);
          g.add(thigh, shin);
        });
      }
      const vg = new THREE.BufferGeometry();
      vg.setAttribute('position', new THREE.Float32BufferAttribute([-0.21, 2.06, 0.295, 0, 1.18, 0.455, 0.21, 2.06, 0.295], 3)); vg.computeVertexNormals();
      body.add(new THREE.Mesh(vg, shirt));
      if (o.dealer) {
        const gold = M(0xd2aa55, 0.35, { metalness: 0.6, emissive: 0x3a2a0c }), tie = M(0xb3321f, 0.5);
        for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), gold); b.position.set(0, 1.08 - i * 0.2, 0.47 - i * 0.012); body.add(b); }
        [-1, 1].forEach((s) => { const c = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.17, 12), tie); c.rotation.z = s * Math.PI / 2; c.position.set(s * 0.085, 2.07, 0.325); body.add(c); });
        const knot = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 10), tie); knot.position.set(0, 2.07, 0.33); body.add(knot);
      }
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.125, 0.24, 14), skin); neck.position.y = 2.2; body.add(neck);
      const head = new THREE.Group(); head.position.y = 2.56; body.add(head);
      const skull = new THREE.Mesh(skullGeo, skin); skull.scale.set(0.92, 1.1, 0.98); skull.castShadow = true; head.add(skull);
      const hair = new THREE.Mesh(hairGeo, hairM); hair.scale.set(0.94, 1.1, 1.02); hair.rotation.x = -0.42; hair.position.y = 0.02; head.add(hair);
      if (o.longHair) { const hb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 14), hairM); hb.scale.set(1.0, 1.5, 0.62); hb.position.set(0, -0.2, -0.13); head.add(hb); }
      [-1, 1].forEach((s) => {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), dark); eye.scale.set(1.3, 0.8, 0.6); eye.position.set(s * 0.095, 0.03, 0.245); head.add(eye);
        const brow = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.014, 0.02), dark); brow.position.set(s * 0.098, 0.095, 0.25); brow.rotation.z = -s * 0.12; head.add(brow);
        const ear = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), skin); ear.scale.set(0.5, 1, 0.8); ear.position.set(s * 0.25, 0, 0); head.add(ear);
      });
      const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), skin); nose.scale.set(0.8, 1.2, 1); nose.position.set(0, -0.03, 0.27); head.add(nose);
      const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.012, 0.02), M(0x8a3a30, 0.6)); mouth.position.set(0, -0.125, 0.245); head.add(mouth);
      // tay: hai khúc + bàn tay, giải bằng IK trong hệ tọa độ của nhân vật
      const L1 = 1.08, L2 = 1.08;
      const restY = (0.17 - (o.y || 0)) / o.k, restZ = o.reach / o.k;
      const arms = [-1, 1].map((s) => {
        const sh = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 12), sleeve); sh.position.set(s * 0.66, 1.9, 0.02); sh.castShadow = true; g.add(sh);
        const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.11, 1, 14), sleeve); upper.castShadow = true;
        const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.085, 1, 14), sleeve); fore.castShadow = true;
        const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.112, 12, 10), sleeve);
        const hand = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 12), handM); hand.scale.set(1.2, 0.55, 1.6); hand.castShadow = true;
        g.add(upper, fore, elbow, hand);
        const rest = new V3(s * (o.handX || 0.4), restY, restZ);
        return { s, S: new V3(s * 0.66, 1.9, 0.02), rest, target: rest.clone(), upper, fore, elbow, hand };
      });
      const dir = new V3(), pole = new V3(), E = new V3(), Hc = new V3(), t1 = new V3();
      const place = (m, A, B) => { m.position.copy(A).add(B).multiplyScalar(0.5); m.scale.y = A.distanceTo(B); m.quaternion.setFromUnitVectors(UP, t1.copy(B).sub(A).normalize()); };
      function solve(a) {
        const d = Math.min(a.S.distanceTo(a.target), L1 + L2 - 0.004);
        dir.copy(a.target).sub(a.S).normalize();
        const aa = (L1 * L1 - L2 * L2 + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, L1 * L1 - aa * aa));
        pole.set(a.s * 0.42, -0.5, -0.75); pole.addScaledVector(dir, -pole.dot(dir)).normalize();
        E.copy(a.S).addScaledVector(dir, aa).addScaledVector(pole, hh);
        Hc.copy(a.S).addScaledVector(dir, d);
        place(a.upper, a.S, E); place(a.fore, E, Hc);
        a.elbow.position.copy(E); a.hand.position.copy(Hc);
        a.hand.rotation.set(0, Math.atan2(dir.x, dir.z), 0);
      }
      scene.add(g); g.updateMatrixWorld(true);
      const toLocal = (v) => g.worldToLocal(v.clone());
      const st = { throwT0: -1, a1: new V3(), a2: new V3(), throwDur: 300, sweepT0: -1, sweepTo: new V3(), sweepDur: 500, look: 0, lookTo: 0, ph: Math.random() * 6 };
      const pR = new V3();
      const fig = {
        g,
        update(now) {
          const t = now / 1000 + st.ph, R = arms[1];
          body.scale.y = 1 + Math.sin(t * 1.3) * 0.006;
          body.rotation.z = Math.sin(t * 0.6) * 0.008;
          st.look = lerp(st.look, st.lookTo, 0.06);
          head.rotation.y = st.look; body.rotation.y = st.look * 0.25;
          head.rotation.x = (o.dealer ? 0.2 : 0.3) + Math.sin(t * 0.8) * 0.012;
          pR.copy(R.rest);
          if (st.throwT0 >= 0) {
            const u = (now - st.throwT0) / st.throwDur;
            if (u < 0.3) pR.lerpVectors(R.rest, st.a1, easeIO(u / 0.3));
            else if (u < 0.6) pR.lerpVectors(st.a1, st.a2, easeOut((u - 0.3) / 0.3));
            else if (u < 1.3) pR.lerpVectors(st.a2, R.rest, easeIO(clamp01((u - 0.6) / 0.7)));
            else st.throwT0 = -1;
          } else if (st.sweepT0 >= 0) {
            const u = (now - st.sweepT0) / st.sweepDur;
            if (u < 0.5) pR.lerpVectors(R.rest, st.sweepTo, easeIO(u / 0.5));
            else if (u < 1) pR.lerpVectors(st.sweepTo, R.rest, easeIO((u - 0.5) / 0.5));
            else st.sweepT0 = -1;
          }
          pR.y += Math.sin(t * 1.3) * 0.004;
          R.target.copy(pR);
          arms[0].target.copy(arms[0].rest); arms[0].target.y += Math.sin(t * 1.3 + 1) * 0.004;
          solve(arms[0]); solve(arms[1]);
        },
        // vẩy lá: tay tới cỗ bài rồi vung về phía đích
        throwTo(from, to, dur) {
          st.a1.copy(toLocal(from));
          const w2 = to.clone().sub(from).setY(0).normalize().multiplyScalar(0.75).add(from).setY(0.42);
          st.a2.copy(toLocal(w2)); st.throwDur = dur; st.throwT0 = performance.now();
        },
        reach(target, dur) { const w = target.clone(); w.y = Math.max(0.3, w.y + 0.25); st.sweepTo.copy(toLocal(w)); st.sweepDur = dur; st.sweepT0 = performance.now(); },
        look(a) { st.lookTo = Math.max(-0.7, Math.min(0.7, a)); },
        dispose() { scene.remove(g); },
      };
      figures.push(fig);
      return fig;
    }
    const dealer = buildFigure({ x: 0, z: -(RW + 0.42), k: 1.35, reach: 0.62, handX: 0.62, coat: 0x17110f, shirt: 0xefe6d6, sleeve: 0xefe6d6, hair: 0x130c0a, glove: true, dealer: true });
    /* Dealer ảnh người thật: hai tấm cắt nền luôn quay mặt về máy quay.
     * Tấm chụp từ trên dùng cho góc nhìn bàn chơi, tấm chính diện dùng cho góc nhìn sảnh; đổi góc thì hòa dần sang nhau. */
    const photo = { on: false, top: null, front: null, kick: -1e9 };
    const PH_TOP = 3.55, PH_FRONT = 3.85, photoAnchor = new V3(0, 0.2, -(TW + 0.16));
    if (opts.dealerPhotos) {
      const loader = new THREE.TextureLoader();
      ['top', 'front'].forEach((k) => loader.load(opts.dealerPhotos[k], (tex) => {
        tex.encoding = THREE.sRGBEncoding; tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.05, color: 0xe9ddcf }));
        m.userData.asp = tex.image.width / tex.image.height; m.visible = false; m.renderOrder = 2;
        scene.add(m); photo[k] = m; lastW = 0;
      }, undefined, () => {}));
    }
    // bóng đổ mờ dưới hai bàn tay để dealer "chạm" vào bàn
    const contact = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
      gr.addColorStop(0, 'rgba(0,0,0,.62)'); gr.addColorStop(0.55, 'rgba(0,0,0,.28)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.75), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(0, 0.215, photoAnchor.z + 0.05); m.renderOrder = 1; m.visible = false; scene.add(m);
      return m;
    })();
    /* Người chơi ảnh thật: mỗi ghế một tấm cắt nền chụp đúng hướng ngồi (ghế góc bàn: nghiêng 3/4; ghế đầu bàn: nhìn ngang).
     * h = chiều cao tấm ảnh trong cảnh; (px, py) = điểm "bàn tay" trong ảnh, tính từ góc dưới trái — điểm này được đặt lên mép bàn. */
    const PEOPLE = {
      A: { h: 2.5, px: 0.88, py: 0.05 },
      B: { h: 2.6, px: 0.37, py: 0.09 },
      C: { h: 2.6, px: 0.9, py: 0.22 },
    };
    const pTex = {};
    if (opts.playerPhotos) {
      const loader = new THREE.TextureLoader();
      Object.keys(opts.playerPhotos).forEach((k) => loader.load(opts.playerPhotos[k], (tex) => {
        tex.encoding = THREE.sRGBEncoding; tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        pTex[k] = tex;
        for (const st of seats) if (st.key === k && !st.ph) st.ph = makePhoto(k);
      }, undefined, () => {}));
    }
    function makePhoto(k) {
      if (!pTex[k] || !PEOPLE[k]) return null;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: pTex[k], transparent: true, alphaTest: 0.05, color: 0xe9ddcf }));
      m.userData.asp = pTex[k].image.width / pTex[k].image.height; m.userData.cfg = PEOPLE[k]; m.userData.ph = Math.random() * 6.28;
      m.visible = false; m.renderOrder = 2; scene.add(m);
      return m;
    }
    // ghế bành lưng cong: che phần dưới của tấm ảnh và cho người chơi một chỗ ngồi thật
    const tubMat = M(0x2a1410, 0.55, { side: THREE.DoubleSide }), tubSeatMat = M(0x3a1d15, 0.7);
    const arcBand = (r0, r1, half, y0, y1) => {
      const sh = new THREE.Shape();
      sh.absarc(0, 0, r1, Math.PI / 2 - half, Math.PI / 2 + half, false);
      sh.absarc(0, 0, r0, Math.PI / 2 + half, Math.PI / 2 - half, true);
      const g = new THREE.ExtrudeGeometry(sh, { depth: y1 - y0, bevelEnabled: false, curveSegments: 20 });
      g.rotateX(-Math.PI / 2); g.translate(0, y0, 0);     // dựng đứng lên; lưng ghế nằm phía −z (sau lưng người ngồi, người ngồi nhìn về +z)
      return g;
    };
    const tubArmGeo = arcBand(0.78, 0.95, 2.2, -1.75, -0.12), tubBackGeo = arcBand(0.78, 0.95, 1.05, -0.12, 0.95);
    const tubSeatGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.34, 28), tubPostGeo = new THREE.CylinderGeometry(0.12, 0.16, 0.9, 12), tubFootGeo = new THREE.CylinderGeometry(0.62, 0.7, 0.08, 24);
    function buildTub(x, z, rot) {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot;
      const arm = new THREE.Mesh(tubArmGeo, tubMat), back = new THREE.Mesh(tubBackGeo, tubMat);
      const seat = new THREE.Mesh(tubSeatGeo, tubSeatMat); seat.position.y = -1.17;
      const post = new THREE.Mesh(tubPostGeo, chairTrim); post.position.y = -2.15;
      const foot = new THREE.Mesh(tubFootGeo, chairTrim); foot.position.y = -2.56;
      for (const m of [arm, back, seat]) { m.castShadow = true; m.receiveShadow = true; }
      g.add(arm, back, seat, post, foot); g.visible = false; scene.add(g);
      return g;
    }
    const camUp = new V3(), camRt = new V3(), camFwd = new V3(), swayQ = new THREE.Quaternion(), Z1 = new V3(0, 0, 1), dimC = new THREE.Color();
    function updatePlayers(now) {
      const t = now / 1000, mv = Math.min(1, Math.max(motion(), 0));
      for (const st of seats) {
        if (!st.fig) continue;
        const show = photo.on && !!st.ph;
        st.fig.g.visible = !show;
        if (st.tub) st.tub.visible = show;
        if (!st.ph) continue;
        st.ph.visible = show;
        if (!show) continue;
        const m = st.ph, c = m.userData.cfg, ph = m.userData.ph;
        const H = c.h * (1 + Math.sin(t * 1.1 + ph) * 0.004), W = c.h * m.userData.asp;
        swayQ.setFromAxisAngle(Z1, (Math.sin(t * 0.41 + ph) * 0.007 + Math.sin(t * 0.77 + ph * 2) * 0.003) * mv);
        camUp.set(0, 1, 0).applyQuaternion(swayQ).applyQuaternion(camera.quaternion);
        camRt.set(1, 0, 0).applyQuaternion(swayQ).applyQuaternion(camera.quaternion);
        m.quaternion.copy(camera.quaternion).multiply(swayQ);
        m.scale.set(W, H, 1);
        m.position.copy(st.hand).addScaledVector(camRt, (0.5 - c.px) * W).addScaledVector(camUp, (0.5 - c.py) * H);
        // bỏ bài thì tối đi; đến lượt thì sáng lên một chút
        st.dim = lerp(st.dim || 0, st.out ? 1 : 0, 0.1);
        m.material.color.setHex(0xe9ddcf).lerp(dimC.setHex(0x4a423c), st.dim * 0.8);
      }
    }
    function updatePhoto(now) {
      updatePlayers(now);
      const show = photo.on && photo.top && photo.front;
      dealer.g.visible = !show; contact.visible = !!show;
      if (photo.top) photo.top.visible = false;
      if (photo.front) photo.front.visible = false;
      if (!show) return;
      const t = now / 1000, breath = 1 + Math.sin(t * 1.3) * 0.004;
      // đung đưa rất nhẹ quanh điểm tựa ở bàn tay, để ảnh tĩnh không bị "đơ"
      const sway = (Math.sin(t * 0.47) * 0.006 + Math.sin(t * 0.83 + 1.3) * 0.003) * Math.min(1, Math.max(motion(), 0));
      swayQ.setFromAxisAngle(Z1, sway);
      camUp.set(0, 1, 0).applyQuaternion(swayQ).applyQuaternion(camera.quaternion);
      camFwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
      const elev = Math.asin(Math.max(-1, Math.min(1, -camFwd.y)));
      const w = clamp01((elev - 0.4) / 0.22), ws = w * w * (3 - 2 * w);       // 1 = nhìn từ trên (bàn chơi)
      const kick = Math.sin(clamp01((now - photo.kick) / 280) * Math.PI) * 0.05;
      [[photo.top, ws, PH_TOP], [photo.front, 1 - ws, PH_FRONT]].forEach(([m, op, h]) => {
        if (op < 0.02) return;
        const H = h * breath;
        m.visible = true; m.material.opacity = op;
        m.quaternion.copy(camera.quaternion).multiply(swayQ);
        m.scale.set(H * m.userData.asp, H, 1);
        m.position.copy(photoAnchor).addScaledVector(camUp, H / 2 - kick);
      });
    }

    // mỗi ghế một nhân vật cố định: C = Anh Ba, A = Chị Tư, B = Bác Sáu
    const LOOKS = {
      C: { coat: 0x1c2740, shirt: 0xe9e2d4, sleeve: 0x1c2740, hair: 0x120c0a },
      A: { coat: 0x9c2a1c, shirt: 0xc99872, sleeve: 0x9c2a1c, hair: 0x1a0f0c, longHair: true },
      B: { coat: 0x3d3833, shirt: 0xe3d5b6, sleeve: 0x3d3833, hair: 0xa39c92 },
      D: { coat: 0x234536, shirt: 0xe9e2d4, sleeve: 0x234536, hair: 0x2a1a12 },
    };

    // các bàn khác phía xa: bàn đơn giản, người ngồi không cử động
    (function buildHall() {
      const simple = (x, z, rot, coat, hairC) => {
        const g = new THREE.Group(); g.position.set(x, -0.75, z); g.rotation.y = rot; g.scale.setScalar(1.2);
        const dl = coat === 0x17110f;
        const t = new THREE.Mesh(dl ? torsoGeo : torsoSeatGeo, M(coat, 0.7, { side: THREE.DoubleSide })); t.scale.z = 0.6;
        if (!dl) addChair(g);
        const h = new THREE.Mesh(skullGeo, M(0xc99872, 0.75)); h.scale.set(0.92, 1.1, 0.98); h.position.y = 2.56;
        const hr = new THREE.Mesh(hairGeo, M(hairC, 0.5)); hr.scale.set(0.94, 1.1, 1.02); hr.rotation.x = -0.42; hr.position.y = 2.58;
        g.add(t, h, hr); return g;
      };
      const spotsAround = [[-2.3, -(RW + 0.55), 0], [2.3, -(RW + 0.55), 0], [-(RL + 0.55), 0.2, Math.PI / 2], [RL + 0.55, 0.2, -Math.PI / 2], [-1.8, RW + 0.55, Math.PI], [1.8, RW + 0.55, Math.PI]];
      const coats = [0x1c2740, 0x9c2a1c, 0x3d3833, 0x234536, 0x5a3a1a, 0x2a2238], hairs = [0x120c0a, 0x1a0f0c, 0xa39c92, 0x2a1a12];
      [[-12.5, -9.5, 0.45, 0x174433], [12, -11, -0.4, 0x5a160e], [0.5, -19, 0.08, 0x16110f]].forEach(([x, z, rot, feltC], ti) => {
        const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot;
        const f = flat(new THREE.Mesh(feltGeo, M(feltC, 0.95, { emissive: feltC, emissiveIntensity: 0.55 })));
        const r = flat(new THREE.Mesh(railGeo, railMat)); r.position.y = -0.03;
        const sk = flat(new THREE.Mesh(skirtGeo, woodMat)); sk.position.y = -0.5;
        const b = new THREE.Mesh(baseGeo, woodMat); b.scale.x = 1.7; b.position.y = -1.55;
        g.add(f, r, sk, b);
        spotsAround.forEach((s, i) => { if ((i + ti) % 5 !== 0) g.add(simple(s[0], s[1], s[2], coats[(i + ti * 2) % coats.length], hairs[(i + ti) % hairs.length])); });
        const d = simple(0, -(RW + 0.42), 0, 0x17110f, 0x130c0a); d.position.y = 0; d.scale.setScalar(1.35); g.add(d);
        scene.add(g);
        lampAt(x, 7.6, z, 1.25);
      });
    })();

    /* ---------- chỗ ngồi ---------- */
    /* Dealer đứng giữa cạnh xa, khay chip ngay trước mặt. Người chơi ngồi quanh hai đầu cong của bàn như bàn thật:
     * A, B ở hai góc phía xa (cách dealer một khoảng), C, D ở hai đầu bàn, "mình" ở giữa cạnh gần. */
    const ARC_X = RL - RW, PHI = 54 * Math.PI / 180;
    const arc = (side, r, phi) => [side * (ARC_X + r * Math.cos(phi)), -r * Math.sin(phi)];   // điểm trên cung tròn đầu bàn
    const corner = (side) => {
      const hand = arc(side, RW - 0.2, PHI);
      return { cx: side * 2.4, cz: -1.05, sp: 0.3, k: 1.2, bet: [side * 1.15, -0.15], lab: [0, 0.74], edge: hand, plate: arc(side, RW - 0.62, PHI - 0.16), plateY: 0.02, hand,
        fig: [...arc(side, RW + 0.55, PHI), -side * (Math.PI / 2 - PHI)], tub: [...arc(side, RW + 0.92, PHI), -side * (Math.PI / 2 - PHI)] };
    };
    const end = (side) => ({ cx: side * 2.65, cz: 0.4, sp: 0.3, k: 1.2, bet: [side * 2.3, 1.25], lab: [-side * 0.1, 0.72], edge: [side * 4.05, 0.35], plate: [side * 4.05, 0.35], hand: [side * (RL - 0.2), 0.35],
      fig: [side * (RL + 0.55), 0.35, -side * Math.PI / 2], tub: [side * (RL + 0.78), 0.35, -side * Math.PI / 2] });
    const SLOT = {
      me: { cx: 0, cz: 1.5, sp: 0.66, k: 1.2, bet: [0, 0.38], lab: [0.78, 0.15], edge: [0, 2.9] },
      C: end(-1), A: corner(-1), B: corner(1), D: end(1),
    };
    const ORDER = { 2: ['me', 'B'], 3: ['me', 'A', 'B'], 4: ['me', 'C', 'A', 'B'], 5: ['me', 'C', 'A', 'B', 'D'] };
    const potPos = new V3(0, 0, -1.0);
    let lastW = 0, lastH = 0;
    function setSeats(n) {
      for (const s of seats) {
        if (s.fig) { s.fig.dispose(); figures.splice(figures.indexOf(s.fig), 1); }
        if (s.ph) { scene.remove(s.ph); s.ph.material.dispose(); }
        if (s.tub) scene.remove(s.tub);
      }
      seats = (ORDER[n] || ORDER[4]).map((k) => {
        const s = SLOT[k];
        const fig = s.fig ? buildFigure(Object.assign({ x: s.fig[0], y: -0.75, z: s.fig[1], rot: s.fig[2], k: 1.2, reach: 0.72, handX: 0.36, seated: true }, LOOKS[k] || LOOKS.C)) : null;
        return { s, key: k, fig, ph: fig ? makePhoto(k) : null, tub: s.tub && PEOPLE[k] ? buildTub(s.tub[0], s.tub[1], s.tub[2]) : null, hand: s.hand ? new V3(s.hand[0], 0.2, s.hand[1]) : null, out: false, dim: 0, betPos: new V3(s.bet[0], 0, s.bet[1]), platePos: s.plate ? new V3(s.plate[0], s.plateY == null ? 0.5 : s.plateY, s.plate[1]) : new V3(0, 0, 2.6), betLab: new V3(s.bet[0] + s.lab[0], 0.2, s.bet[1] + s.lab[1]), edge: new V3(s.edge[0], 0, s.edge[1]), pile: null };
      });
      lastW = 0;
    }
    const slotPos = (seat, idx, count) => { const s = seats[seat].s; return new V3(s.cx + (idx - ((count || 5) - 1) / 2) * s.sp, 0.006 + idx * 0.003, s.cz); };
    const countOf = (seat) => cards.filter((c) => c.seat === seat && !c.gone && !c.mucked).length;

    // vòng sáng báo lượt
    const ringTex = canvasTex(128, 128, (ctx) => { const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 64); g.addColorStop(0, 'rgba(255,214,130,0.55)'); g.addColorStop(0.6, 'rgba(255,200,100,0.2)'); g.addColorStop(1, 'rgba(255,200,100,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128); });
    const ring = flat(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })));
    ring.position.y = 0.004; scene.add(ring);
    let turnSeat = -1, ringOp = 0;

    /* ---------- máy quay ---------- */
    const cam = { mode: 'lobby', from: null, t0: 0, dur: 0, pos: new V3(), tgt: new V3(), playPos: new V3(0, 8, 9), playTgt: new V3(0, 0.3, -0.3) };
    const probe = new THREE.PerspectiveCamera(36, 1, 0.1, 90), pv = new V3();
    function fitPlay() {
      const w = container.clientWidth || 1, h = container.clientHeight || 1, aspect = w / h;
      const el = aspect < 1.5 ? 0.86 : 0.76;
      const topRes = 2 * (opts.topInset || 0) / h;   // dải trên cùng dành cho lời dealer, không che mặt dealer
      const pts = [[RL, 0.15, 0.7], [-RL, 0.15, 0.7], [RL, 0.15, -0.7], [-RL, 0.15, -0.7], [0, 0.1, RW + 0.1], [2.1, 0.1, RW - 0.05], [-2.1, 0.1, RW - 0.05]];
      // đỉnh đầu dealer: nhân vật 3D, hoặc mép trên tấm ảnh (tấm ảnh vuông góc với hướng nhìn)
      if (photo.on && photo.top) pts.push([0, photoAnchor.y + PH_TOP * Math.cos(el), photoAnchor.z - PH_TOP * Math.sin(el)]); else pts.push([0, 3.95, -(RW + 0.42)]);
      for (const s of seats) if (s.fig) { const p = s.fig.g.position; if (Math.abs(p.x) < RL) pts.push([p.x, 2.7, p.z]); else pts.push([Math.sign(p.x) * (RL + 1.35), 0.6, p.z]); }
      probe.aspect = aspect; probe.fov = camera.fov; probe.updateProjectionMatrix();
      const measure = (d, tz) => {
        probe.position.set(0, 0.3 + Math.sin(el) * d, tz + Math.cos(el) * d); probe.lookAt(0, 0.3, tz); probe.updateMatrixWorld(); probe.matrixWorldInverse.copy(probe.matrixWorld).invert();
        let mx = 0, top = -9, bot = 9;
        for (const p of pts) { pv.set(p[0], p[1], p[2]).project(probe); mx = Math.max(mx, Math.abs(pv.x)); top = Math.max(top, pv.y); bot = Math.min(bot, pv.y); }
        return { mx, top, bot };
      };
      // đặt nội dung cân giữa theo chiều dọc, rồi tìm khoảng cách gần nhất mà vẫn vừa khung
      const panFor = (d) => { let a = -8, b = 8; for (let i = 0; i < 20; i++) { const m = (a + b) / 2, r = measure(d, m); if (r.top + r.bot + topRes - 0.04 > 0) b = m; else a = m; } return (a + b) / 2; };
      let lo = 5, hi = 50;
      for (let i = 0; i < 20; i++) { const d = (lo + hi) / 2, r = measure(d, panFor(d)); if (r.mx <= 0.97 && r.top <= 0.98 - topRes) hi = d; else lo = d; }
      const tz = panFor(hi);
      cam.playTgt.set(0, 0.3, tz);
      cam.playPos.set(0, 0.3 + Math.sin(el) * hi, tz + Math.cos(el) * hi);
    }
    function poseOf(mode, now, pos, tgt) {
      if (mode === 'lobby') {
        const aspect = (container.clientWidth || 1) / (container.clientHeight || 1);
        const a = Math.sin(now / 1000 * 0.1) * 0.55, r = aspect < 1 ? 19 : aspect < 1.8 ? 15 : 12.5;
        tgt.set(0, 1.0, -1.6); pos.set(Math.sin(a) * r, 4.4 + Math.sin(now / 1000 * 0.07) * 0.35, Math.cos(a) * r - 1.6);
      } else if (mode === 'showdown') { tgt.copy(cam.playTgt); pos.copy(cam.playPos).lerp(tgt, 0.035); }
      else { tgt.copy(cam.playTgt); pos.copy(cam.playPos); }
    }
    const cp = new V3(), ct = new V3();
    function updateCamera(now) {
      poseOf(cam.mode, now, cp, ct);
      if (cam.from) {
        const u = cam.dur <= 0 ? 1 : clamp01((now - cam.t0) / cam.dur);
        if (u >= 1) cam.from = null;
        else { const e = easeIO(u); cam.pos.lerpVectors(cam.from.pos, cp, e); cam.tgt.lerpVectors(cam.from.tgt, ct, e); }
      }
      if (!cam.from) { cam.pos.copy(cp); cam.tgt.copy(ct); }
      camera.position.copy(cam.pos); camera.lookAt(cam.tgt);
      mainLamp.visible = cam.mode === 'lobby';
    }
    // Chuyển cảnh máy quay chạy theo đồng hồ riêng, không nằm trong danh sách tween (reset() không hủy được nó)
    function cameraTo(mode, ms) {
      if (mode === cam.mode) return Promise.resolve();
      cam.from = { pos: cam.pos.clone(), tgt: cam.tgt.clone() }; cam.mode = mode;
      cam.t0 = performance.now(); cam.dur = (ms || 1100) * motion();
      return new Promise((r) => setTimeout(r, cam.dur));
    }

    /* ---------- nhãn DOM bám theo vật thể ---------- */
    const labels = [];
    const lv = new V3();
    function positionLabels(w, h) {
      for (const L of labels) {
        lv.copy(L.pos).project(camera);
        const x = (lv.x * 0.5 + 0.5) * w, y = (-lv.y * 0.5 + 0.5) * h;
        const cx = L.clamp ? Math.max(L.clamp, Math.min(w - L.clamp, x)) : x;
        L.el.style.transform = `translate(-50%, ${L.align === 'bottom' ? '-100%' : '-50%'}) translate(${cx.toFixed(1)}px, ${y.toFixed(1)}px)`;
      }
    }

    /* ---------- vòng lặp vẽ ---------- */
    let glow = null, raf = 0;
    setSeats(4);
    function tick() {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      for (let i = tweens.length - 1; i >= 0; i--) {
        const T = tweens[i], u = clamp01((now - T.t0) / T.dur);
        T.fn(T.ease(u));
        if (u >= 1) { tweens.splice(i, 1); T.res(); }
      }
      const w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;
      if (w !== lastW || h !== lastH) { lastW = w; lastH = h; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); fitPlay(); }
      for (const f of figures) f.update(now);
      updateCamera(now);
      updatePhoto(now);
      const t = now / 1000;
      for (const sp of bokeh) sp.material.opacity = sp.userData.base * (0.75 + 0.25 * Math.sin(t * sp.userData.sp + sp.userData.ph));
      ringOp = lerp(ringOp, turnSeat >= 0 ? 0.75 + 0.25 * Math.sin(t * 3.2) : 0, 0.12);
      ring.material.opacity = ringOp;
      if (glow) for (const c of cards) if (glow.has(c.seat) && !c.gone) c.front.material.emissiveIntensity = 0.2 + 0.14 * Math.sin(t * 4);
      renderer.render(scene, camera);
      positionLabels(w, h);
    }
    updateCamera(performance.now());
    raf = requestAnimationFrame(tick);

    /* ---------- thao tác ---------- */
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    let peeking = false, peekTok = 0;
    const lookAtSeat = (seat) => { const s = seats[seat]; dealer.look(s ? Math.atan2(s.s.cx, 3.2) * 0.9 : 0); };

    const api = {
      el: canvas,
      setFelt(k) { feltKey = FELTS[k] ? k : 'son'; feltRedraw(); },
      setPeople(style) { photo.on = style === 'photo'; lastW = 0; },
      setSeats,
      anchor(kind, seat) {
        if (kind === 'pot') return new V3(potPos.x, 0.2, potPos.z + 0.5);
        if (kind === 'dealer') return new V3(0, 1.75, -(RW + 0.1));
        if (kind === 'bet') return seats[seat].betLab;
        return seats[seat].platePos;
      },
      attach(el, pos, clamp, align) { labels.push({ el, pos, clamp: clamp || 0, align: align || '' }); },
      detachAll() { labels.length = 0; },

      reset() {
        tweens.length = 0;
        for (const c of cards) scene.remove(c.g);
        cards.length = 0;
        for (const s of seats) if (s.pile) { scene.remove(s.pile); s.pile = null; }
        if (api._pot) { scene.remove(api._pot); api._pot = null; }
        glow = null; turnSeat = -1; deck2.visible = false; setDeck(24); peeking = false;
        for (const s of seats) s.out = false;
      },

      async newHand(mode) {
        glow = null; peeking = false;
        const live = cards.filter((c) => !c.gone);
        if (live.length) {
          dealer.reach(potPos, 700 * motion());
          await Promise.all(live.map((c, i) => {
            const from = c.pos.clone(), y0 = c.yaw, f0 = c.flip, p0 = c.pitch;
            const to = new V3(deckPos.x, 24 * DECK_T * 0.6 + 0.02, deckPos.z);
            return delay(i * 18).then(() => tw(380, (u) => {
              c.pos.lerpVectors(from, to, u); c.pos.y += Math.sin(u * Math.PI) * 0.35;
              c.yaw = lerp(y0, 0, u); c.flip = lerp(f0, 0, u); c.pitch = lerp(p0, 0, u); applyPose(c);
            }, easeIO)).then(() => { scene.remove(c.g); c.gone = true; });
          }));
          sfx('deal');
        }
        cards.length = 0;
        setDeck(24);
        await api.shuffle(mode);
      },

      async shuffle(mode) {
        const spec = (X.SHUFFLES && X.SHUFFLES[mode]) || { perfect: true };
        const full = 24 * DECK_T, half = full / 2;
        const riffles = spec.perfect ? 2 : (spec.riffles || 0);
        const setHalves = (dx, lift) => {
          deck.scale.y = half; deck2.scale.y = half; deck2.visible = true;
          deck.position.set(deckPos.x - dx, half / 2, deckPos.z);
          deck2.position.set(deckPos.x + dx, half / 2 + lift, deckPos.z);
        };
        for (let i = 0; i < riffles; i++) {
          await tw(150, (u) => setHalves(0.42 * u, half * (1 - u)));
          sfx('riffle');
          await tw(190, (u) => setHalves(0.42 * (1 - u), half * u), easeOut);
        }
        for (let i = 0; i < (spec.overhands || 0); i++) {
          await tw(110, (u) => setHalves(0, half + 0.5 * Math.sin(u * Math.PI)));
          if (i % 2 === 0) sfx('deal');
        }
        if (spec.cut && !spec.perfect) {
          await tw(170, (u) => { setHalves(0.4 * u, half * (1 - u)); });
          await tw(170, (u) => { deck.position.set(deckPos.x - 0.4 * (1 - u) + 0.4 * u, half / 2 + half * u + 0.25 * Math.sin(u * Math.PI), deckPos.z); }, easeIO);
          await tw(130, (u) => { deck.position.x = deckPos.x + 0.4 * (1 - u); deck2.position.x = deckPos.x + 0.4 * (1 - u); });
        }
        deck2.visible = false; setDeck(24);
      },

      deal(seat, card, idx, faceUp) {
        const c = makeCard(card, seat, idx);
        const count = Math.max(idx + 1, countOf(seat));
        const to = slotPos(seat, idx, count);
        // các lá đã có dịch sang để cả hàng luôn nằm giữa
        for (const o of cards) {
          if (o === c || o.seat !== seat || o.gone || o.mucked) continue;
          const a = o.pos.clone(), b = slotPos(seat, o.idx, count);
          tw(220, (u) => { if (o.gone || o.mucked || o.lifted) return; o.pos.x = lerp(a.x, b.x, u); applyPose(o); }, easeIO);
        }
        const from = new V3(deckPos.x + 0.2, deckN * DECK_T + 0.18, deckPos.z);
        const dir = to.clone().sub(from).setY(0);
        const dist = dir.length(); dir.normalize();
        const start = from.clone().addScaledVector(dir, 0.72).setY(0.42);
        c.pos.copy(from); c.flip = 0; c.yaw = Math.atan2(dir.x, dir.z) + Math.PI; applyPose(c); c.g.visible = false;
        dealer.throwTo(from, to, 300 * Math.max(motion(), 0.2)); photo.kick = performance.now();
        const spin = (Math.random() < 0.5 ? -1 : 1) * Math.PI * 2, yEnd = (Math.random() - 0.5) * 0.07, y0 = c.yaw;
        const apex = 0.55 + dist * 0.09;
        return delay(170).then(() => {
          c.g.visible = true; setDeck(Math.max(0, deckN - 1)); sfx('deal');
          return tw(430 + dist * 28, (u) => {
            c.pos.lerpVectors(start, to, u); c.pos.y = lerp(start.y, to.y, u) + Math.sin(u * Math.PI) * apex * (1 - u * 0.35);
            c.yaw = lerp(y0 + spin, yEnd, u);
            c.flip = faceUp ? easeIO(clamp01((u - 0.25) / 0.6)) : 0;
            applyPose(c);
          }, easeOut);
        });
      },

      flip(seat, idx, faceUp, hop) {
        const c = cardAt(seat, idx); if (!c) return Promise.resolve();
        const f0 = c.flip, f1 = faceUp ? 1 : 0, y = c.pos.y;
        if (f0 === f1) return Promise.resolve();
        sfx('flip');
        return tw(hop ? 520 : 380, (u) => { c.flip = lerp(f0, f1, u); c.pos.y = y + Math.sin(u * Math.PI) * (hop ? 0.55 : 0.32); applyPose(c); }, easeIO);
      },

      fold(seat) {
        const mine = cards.filter((c) => c.seat === seat && !c.gone && !c.mucked);
        const s = seats[seat]; if (s && s.fig) s.fig.reach(new V3(s.s.cx, 0, s.s.cz), 520 * motion());
        if (s) s.out = true;
        return Promise.all(mine.map((c, i) => {
          const from = c.pos.clone(), y0 = c.yaw, f0 = c.flip, y1 = (Math.random() - 0.5) * 0.9, k0 = c.g.scale.x;
          const to = muck.clone(); to.x += (Math.random() - 0.5) * 0.16; to.z += (Math.random() - 0.5) * 0.12; to.y = 0.008 + cards.filter((k) => k.mucked).length * 0.003 + i * 0.003;
          c.mucked = true;
          return delay(i * 40).then(() => tw(440, (u) => { c.pos.lerpVectors(from, to, u); c.pos.y += Math.sin(u * Math.PI) * 0.22; c.yaw = lerp(y0, y1, u); c.flip = lerp(f0, 0, Math.min(1, u * 1.6)); c.g.scale.setScalar(lerp(k0, 0.85, u)); applyPose(c); }, easeIO));
        }));
      },

      // nhấc lá úp của mình lên xem
      peek(on) {
        const c = cardAt(0, 0); if (!c || c.mucked || peeking === on) return;
        peeking = on; c.lifted = on; const tok = ++peekTok;
        const base = slotPos(0, 0, countOf(0)), f0 = c.flip, p0 = c.pitch, y0 = c.pos.y, z0 = c.pos.z, f1 = on ? 1 : 0, p1 = on ? 0.74 : 0;
        if (on) sfx('flip');
        tw(on ? 200 : 160, (u) => { if (tok !== peekTok) return; c.flip = lerp(f0, f1, u); c.pitch = lerp(p0, p1, u); c.pos.x = base.x; c.pos.y = lerp(y0, base.y + (on ? 0.62 : 0), u); c.pos.z = lerp(z0, base.z + (on ? 0.12 : 0), u); applyPose(c); }, easeOut);
      },
      endPeek() { if (peeking) api.peek(false); },

      turn(seat) {
        turnSeat = seat;
        if (seat >= 0 && seats[seat]) { const s = seats[seat].s; ring.position.set(s.cx, 0.004, s.cz); ring.scale.set(seat === 0 ? 5.0 : 3.2, 2.0, 1); lookAtSeat(seat); }
        else dealer.look(0);
      },

      highlight(ids) {
        glow = ids && ids.length ? new Set(ids) : null;
        for (const c of cards) {
          if (c.gone) continue;
          const win = glow && glow.has(c.seat);
          c.front.material.emissive.set(win ? 0xd2aa55 : 0x000000);
          c.front.material.emissiveIntensity = win ? 0.25 : 0;
          const k = glow && !win ? 0.62 : 1;
          c.front.material.color.setScalar(k); c.back.material.color.setScalar(k);
          if (win && !c.mucked) { const y = c.pos.y; tw(260, (u) => { c.pos.y = y + 0.07 * u; applyPose(c); }, easeOut); }
        }
      },

      ante(ids, pot) {
        sfx('chip');
        return Promise.all(ids.map((id, i) => { const p = newPile(Math.max(5, Math.round(pot / ids.length)), seats[id].edge); if (seats[id].fig) seats[id].fig.reach(seats[id].betPos, 520 * motion()); return delay(i * 60).then(() => slide(p, potPos, 440)).then(() => scene.remove(p)); }))
          .then(() => api.setPot(pot));
      },
      bet(seat, total, delta) {
        const s = seats[seat]; if (!s) return Promise.resolve();
        const p = newPile(delta, s.edge); sfx('chip');
        if (s.fig) s.fig.reach(s.betPos, 560 * motion());
        return slide(p, s.betPos, 380).then(() => {
          scene.remove(p);
          if (!s.pile) s.pile = newPile(total, s.betPos); else fillPile(s.pile, total);
          sfx('chip');
        });
      },
      collect(pot) {
        const moving = seats.filter((s) => s.pile);
        if (!moving.length) { api.setPot(pot); return Promise.resolve(); }
        dealer.reach(potPos, 620 * motion()); sfx('chip');
        return Promise.all(moving.map((s) => { const p = s.pile; s.pile = null; return slide(p, potPos, 440).then(() => scene.remove(p)); })).then(() => { api.setPot(pot); sfx('chip'); });
      },
      setPot(amount) {
        if (amount <= 0) { if (api._pot) { scene.remove(api._pot); api._pot = null; } return; }
        if (!api._pot) api._pot = newPile(amount, potPos, true); else fillPile(api._pot, amount);
      },
      pay(seat, amount, left) {
        const s = seats[seat]; if (!s) return Promise.resolve();
        api.setPot(left);
        const p = newPile(amount, potPos, true); dealer.reach(potPos, 700 * motion()); sfx('chip');
        return slide(p, s.edge.clone().lerp(s.betPos, 0.5), 620).then(() => delay(260)).then(() => { scene.remove(p); sfx('chip'); });
      },

      camera: cameraTo,
      look: lookAtSeat,

      pick(clientX, clientY) {
        const r = canvas.getBoundingClientRect();
        ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        const hit = ray.intersectObjects(cards.filter((c) => c.seat === 0 && !c.gone && !c.mucked).map((c) => c.g), true)[0];
        return hit ? { seat: 0, idx: hit.object.userData.c.idx } : null;
      },
      resize() { lastW = 0; },
      dispose() { cancelAnimationFrame(raf); renderer.dispose(); canvas.remove(); },
    };
    return api;
  }

  root.XitoStage = { create, paintFace };
})(typeof window !== 'undefined' ? window : globalThis);

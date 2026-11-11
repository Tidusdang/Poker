/* Xì tố 24 — bàn chơi 3D (three.js r128).
 * Cảnh: phòng tối, một ngọn đèn rọi xuống bàn nỉ hình thuôn; dealer đứng đầu bàn, tay cử động theo từng lá chia.
 * Trục: x sang phải, y lên trên, z về phía người chơi. Mặt nỉ ở y = 0. Người chơi ngồi đầu z dương, dealer đầu z âm.
 * Trang gọi các hàm trả Promise (deal, flip, bet, collect…) và tự đặt nhãn DOM qua attach().
 */
(function (root) {
  'use strict';
  const THREE = root.THREE, X = root.Xito, F = root.XitoFx;
  if (!THREE) { root.XitoStage = { create: () => null }; return; }
  const V3 = THREE.Vector3;
  const CW = 0.63, CH = 0.88;                    // lá bài
  const FW = 2.55, FL = 3.6, HW = 2.95, HL = 4.0; // nửa rộng / nửa dài: mặt nỉ, mép ngoài vành
  const DEALER_Z = -(HL + 0.45), DEALER_K = 1.6;
  const COL = { gold: '#d2aa55', goldDim: '#8e7240', egg: '#f1e7d0', egg2: '#e3d5b6', ink: '#1b1310', red: '#a8231a', cin: '#b3321f', cinDeep: '#7a1d12' };
  const FELTS = { jade: ['#2f7d5d', '#0e3325'], son: ['#a32e1e', '#47100a'], huyen: ['#3c3431', '#0b0807'] };
  const DISPLAY = '"Cormorant", Georgia, serif';
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = (t) => Math.max(0, Math.min(1, t));
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const UP = new V3(0, 1, 0), AX = new V3(1, 0, 0);

  function stadium(hw, hl) {
    const s = new THREE.Shape(), r = hw, yy = hl - r;
    s.moveTo(-hw, -yy); s.lineTo(-hw, yy); s.absarc(0, yy, r, Math.PI, 0, true);
    s.lineTo(hw, -yy); s.absarc(0, -yy, r, 0, -Math.PI, true);
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
  function fitUV(geo, hw, hl) {
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + hw) / (2 * hw), (p.getY(i) + hl) / (2 * hl));
    uv.needsUpdate = true;
  }

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
      ctx.bezierCurveTo(cx + 0.72 * z, cy + 0.0 * z, cx + 0.46 * z, cy + 0.58 * z, cx + 0.04 * z, cy + 0.2 * z);
      ctx.lineTo(cx + 0.18 * z, cy + 0.54 * z); ctx.lineTo(cx - 0.18 * z, cy + 0.54 * z); ctx.lineTo(cx - 0.04 * z, cy + 0.2 * z);
      ctx.bezierCurveTo(cx - 0.46 * z, cy + 0.58 * z, cx - 0.72 * z, cy + 0.0 * z, cx, cy - 0.54 * z);
    } else {
      const r = 0.24 * z;
      ctx.arc(cx, cy - 0.26 * z, r, 0, 7); ctx.moveTo(cx - 0.26 * z + r, cy + 0.1 * z);
      ctx.arc(cx - 0.26 * z, cy + 0.1 * z, r, 0, 7); ctx.moveTo(cx + 0.26 * z + r, cy + 0.1 * z);
      ctx.arc(cx + 0.26 * z, cy + 0.1 * z, r, 0, 7);
      ctx.moveTo(cx - 0.05 * z, cy); ctx.lineTo(cx + 0.05 * z, cy); ctx.lineTo(cx + 0.18 * z, cy + 0.54 * z); ctx.lineTo(cx - 0.18 * z, cy + 0.54 * z); ctx.closePath();
    }
    ctx.fill();
  }
  // Mặt lá kiểu chỉ số lớn để đọc được từ xa. W×H là kích thước logic của lá.
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
    scene.fog = new THREE.FogExp2(0x0b0605, 0.028);
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
    const spot = new THREE.SpotLight(0xfff1dc, 0.92, 34, 0.62, 0.7, 1.0);
    spot.position.set(0, 10.5, 1.0); spot.target.position.set(0, 0, -0.4);
    spot.castShadow = true; spot.shadow.mapSize.set(2048, 2048); spot.shadow.bias = -0.0005; spot.shadow.radius = 5;
    spot.shadow.camera.near = 3; spot.shadow.camera.far = 20;
    scene.add(spot, spot.target);
    const key = new THREE.PointLight(0xffdcb4, 0.42, 13, 1.3); key.position.set(0, 4.6, -1.6); scene.add(key);
    const rim = new THREE.PointLight(0xc23a22, 0.55, 14, 1.2); rim.position.set(0, 4.5, -8.5); scene.add(rim);

    /* ---------- sàn, nền ---------- */
    const carpet = canvasTex(128, 128, (ctx, w, h) => {
      ctx.fillStyle = '#150807'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(210,170,85,0.07)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w, h / 2); ctx.lineTo(w / 2, h); ctx.lineTo(0, h / 2); ctx.closePath(); ctx.stroke();
      ctx.fillStyle = 'rgba(179,50,31,0.1)'; ctx.fillRect(w / 2 - 3, h / 2 - 3, 6, 6);
    });
    carpet.wrapS = carpet.wrapT = THREE.RepeatWrapping; carpet.repeat.set(40, 40);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ map: carpet, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -2.6; floor.receiveShadow = true; scene.add(floor);

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
      const a = (Math.random() - 0.5) * 2.4;
      const rr = 16 + Math.random() * 16;
      sp.position.set(Math.sin(a) * rr, 1 + Math.random() * 9, -Math.cos(a) * rr - 2);
      const sc = 0.7 + Math.random() * 1.9; sp.scale.set(sc, sc, 1);
      sp.userData = { base: m.opacity, ph: Math.random() * 6, sp: 0.4 + Math.random() };
      scene.add(sp); bokeh.push(sp);
    }

    /* ---------- bàn ---------- */
    let feltKey = 'son';
    const feltTex = canvasTex(1024, 1024, (ctx, w, h) => {
      const LH = w * FL / FW;                 // chiều cao logic để chữ, vòng tròn không bị méo
      ctx.scale(1, h / LH);
      const c = FELTS[feltKey] || FELTS.son;
      const g = ctx.createRadialGradient(w / 2, LH * 0.48, 40, w / 2, LH * 0.5, LH * 0.62);
      g.addColorStop(0, c[0]); g.addColorStop(1, c[1]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, LH);
      for (let i = 0; i < 9000; i++) { ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.05)'; ctx.fillRect(Math.random() * w, Math.random() * LH, 2, 2); }
      const px = w / (2 * FW);
      const line = (inset, lw, alpha) => {
        const hw = (FW - inset) * px, hl = (FL - inset) * px, cy = LH / 2, yy = hl - hw;
        ctx.beginPath(); ctx.moveTo(w / 2 - hw, cy + yy); ctx.lineTo(w / 2 - hw, cy - yy); ctx.arc(w / 2, cy - yy, hw, Math.PI, 0); ctx.lineTo(w / 2 + hw, cy + yy); ctx.arc(w / 2, cy + yy, hw, 0, Math.PI); ctx.closePath();
        ctx.strokeStyle = `rgba(210,170,85,${alpha})`; ctx.lineWidth = lw; ctx.stroke();
      };
      line(0.42, 4, 0.6); line(0.5, 1.5, 0.35);
      ctx.fillStyle = 'rgba(210,170,85,0.3)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `700 ${px * 0.5}px ${DISPLAY}`; ctx.fillText('XÌ TỐ', w / 2, LH / 2 + 0.62 * px);
      ctx.font = `700 ${px * 0.26}px ${DISPLAY}`; ctx.fillText('· 24 ·', w / 2, LH / 2 + 0.98 * px);
    });
    const feltRedraw = redraws[redraws.length - 1];
    const feltGeo = new THREE.ShapeGeometry(stadium(FW, FL), 48); fitUV(feltGeo, FW, FL);
    const felt = new THREE.Mesh(feltGeo, new THREE.MeshStandardMaterial({ map: feltTex, roughness: 0.96 }));
    felt.rotation.x = -Math.PI / 2; felt.receiveShadow = true; scene.add(felt);

    const railShape = stadium(HW, HL); railShape.holes.push(new THREE.Path(stadium(FW, FL).getPoints(48)));
    const rail = new THREE.Mesh(new THREE.ExtrudeGeometry(railShape, { depth: 0.13, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.07, bevelSegments: 5, curveSegments: 48 }),
      new THREE.MeshStandardMaterial({ color: 0x1d0e0b, roughness: 0.42, metalness: 0.05 }));
    rail.rotation.x = -Math.PI / 2; rail.position.y = -0.03; rail.castShadow = true; rail.receiveShadow = true; scene.add(rail);
    const trimShape = stadium(FW + 0.035, FL + 0.035); trimShape.holes.push(new THREE.Path(stadium(FW - 0.02, FL - 0.02).getPoints(48)));
    const trim = new THREE.Mesh(new THREE.ShapeGeometry(trimShape, 48), new THREE.MeshStandardMaterial({ color: 0xd2aa55, roughness: 0.35, metalness: 0.6, emissive: 0x4a3510 }));
    trim.rotation.x = -Math.PI / 2; trim.position.y = 0.004; scene.add(trim);
    const skirt = new THREE.Mesh(new THREE.ExtrudeGeometry(stadium(HW - 0.06, HL - 0.06), { depth: 0.42, bevelEnabled: false, curveSegments: 40 }), new THREE.MeshStandardMaterial({ color: 0x2b130c, roughness: 0.55 }));
    skirt.rotation.x = -Math.PI / 2; skirt.position.y = -0.5; skirt.castShadow = true; scene.add(skirt);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 2.0, 2.1, 32), new THREE.MeshStandardMaterial({ color: 0x1c0c08, roughness: 0.6 }));
    base.scale.z = 1.6; base.position.y = -1.55; base.castShadow = true; scene.add(base);

    // khay chip của dealer
    const tray = new THREE.Group(); tray.position.set(0.25, 0, -3.02);
    const trayBox = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.07, 0.62), new THREE.MeshStandardMaterial({ color: 0x120908, roughness: 0.4 }));
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
      const mk = (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.42 });
      return [mk(side), mk(top), mk(top)];
    }
    const CHIP = { 500: chipMats('#d2aa55', '#f6eeda'), 100: chipMats('#16100e', '#d2aa55'), 50: chipMats('#1f5a44', '#f1e7d0'), 10: chipMats('#b3321f', '#f1e7d0'), 5: chipMats('#efe6d2', '#b3321f') };
    const DENOMS = [500, 100, 50, 10, 5];
    // khay: 5 hàng chip nằm ngang
    DENOMS.forEach((d, i) => {
      const row = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.5, 20), [CHIP[d][0], CHIP[d][1], CHIP[d][1]]);
      row.rotation.x = Math.PI / 2; row.position.set(-0.56 + i * 0.28, 0.13, 0); row.castShadow = true; tray.add(row);
    });
    function decompose(amount) {
      const out = []; let a = Math.round(amount);
      for (const d of DENOMS) while (a >= d && out.length < 16) { out.push(d); a -= d; }
      if (!out.length && amount > 0) out.push(5);
      return out;
    }
    const PILE_OFF = [[0, 0], [0.44, 0.08], [-0.44, 0.08], [0.2, 0.44], [-0.24, 0.42], [0.64, 0.5]];
    function fillPile(g, amount) {
      while (g.children.length) g.remove(g.children[0]);
      const by = {}; decompose(amount).forEach((d) => (by[d] = by[d] || []).push(d));
      const stacks = [];
      Object.keys(by).sort((a, b) => b - a).forEach((d) => { const arr = by[d]; while (arr.length) stacks.push(arr.splice(0, 6)); });
      stacks.forEach((st, i) => {
        const o = PILE_OFF[i % PILE_OFF.length];
        st.forEach((d, k) => {
          const m = new THREE.Mesh(chipGeo, CHIP[d]);
          m.position.set(o[0] + (Math.random() - 0.5) * 0.014, 0.025 + k * 0.051, o[1] + (Math.random() - 0.5) * 0.014);
          m.rotation.y = Math.random() * 6; m.castShadow = true; m.receiveShadow = true; g.add(m);
        });
      });
      g.userData.amount = amount;
    }
    function newPile(amount, at) { const g = new THREE.Group(); fillPile(g, amount); g.position.copy(at); scene.add(g); return g; }
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
    function makeCard(card, seat, idx) {
      const g = new THREE.Group();
      const fm = new THREE.MeshStandardMaterial({ map: faceOf(card), roughness: 0.5, emissive: 0x000000 });
      const bm = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.5 });
      const front = new THREE.Mesh(cardGeo, fm); front.position.z = 0.003; front.castShadow = true; front.receiveShadow = true;
      const back = new THREE.Mesh(cardGeo, bm); back.rotation.y = Math.PI; back.position.z = -0.003; back.receiveShadow = true;
      g.add(front, back);
      const c = { card, seat, idx, g, front, back, pos: new V3(), yaw: 0, flip: 0, pitch: 0 };
      g.scale.setScalar(seats[seat] ? seats[seat].s.k : 1);
      front.userData.c = c; back.userData.c = c;
      scene.add(g); cards.push(c);
      return c;
    }
    const cardAt = (seat, idx) => cards.find((c) => c.seat === seat && c.idx === idx && !c.gone);

    // cỗ bài trên bàn
    const deckPos = new V3(-0.62, 0, -2.98);
    const deckMats = [0, 1, 2, 3, 4, 5].map((i) => new THREE.MeshStandardMaterial(i === 2 ? { map: backTex, roughness: 0.5 } : { color: 0xe6dcc6, roughness: 0.7 }));
    const mkDeck = () => { const m = new THREE.Mesh(new THREE.BoxGeometry(CW, 1, CH), deckMats); m.castShadow = true; scene.add(m); return m; };
    const deck = mkDeck(), deck2 = mkDeck(); deck2.visible = false;
    const DECK_T = 0.0115;
    let deckN = 24;
    function setDeck(n) { deckN = n; deck.visible = n > 0; deck.scale.y = Math.max(0.001, n * DECK_T); deck.position.set(deckPos.x, n * DECK_T / 2, deckPos.z); }
    setDeck(24);
    const muck = new V3(1.5, 0.01, -2.35);

    /* ---------- dealer ---------- */
    const dealer = (function buildDealer() {
      const g = new THREE.Group(); g.position.set(0, 0, DEALER_Z); g.scale.setScalar(DEALER_K);
      const M = (color, rough, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough }, extra || {}));
      const vest = M(0x17110f, 0.6, { side: THREE.DoubleSide }), shirt = M(0xefe6d6, 0.85, { side: THREE.DoubleSide }), skin = M(0xc99872, 0.72), glove = M(0xf8f3ea, 0.66), tie = M(0xb3321f, 0.5), hairM = M(0x130c0a, 0.5), gold = M(0xd2aa55, 0.35, { metalness: 0.6, emissive: 0x3a2a0c });
      const body = new THREE.Group(); g.add(body);
      const prof = [[0.5, -1.4], [0.55, 0.1], [0.64, 0.95], [0.73, 1.5], [0.71, 1.82], [0.5, 2.02], [0.2, 2.11], [0.0, 2.12]].map((p) => new THREE.Vector2(p[0], p[1]));
      const torso = new THREE.Mesh(new THREE.LatheGeometry(prof, 30), vest); torso.scale.z = 0.6; torso.castShadow = true; body.add(torso);
      const vg = new THREE.BufferGeometry();
      vg.setAttribute('position', new THREE.Float32BufferAttribute([-0.21, 2.06, 0.295, 0, 1.18, 0.455, 0.21, 2.06, 0.295], 3)); vg.computeVertexNormals();
      body.add(new THREE.Mesh(vg, shirt));
      for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), gold); b.position.set(0, 1.08 - i * 0.2, 0.47 - i * 0.012); body.add(b); }
      [-1, 1].forEach((s) => { const c = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.17, 12), tie); c.rotation.z = s * Math.PI / 2; c.position.set(s * 0.085, 2.07, 0.325); body.add(c); });
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 10), tie); knot.position.set(0, 2.07, 0.33); body.add(knot);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.125, 0.24, 14), skin); neck.position.y = 2.2; body.add(neck);
      const head = new THREE.Group(); head.position.y = 2.56; body.add(head);
      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.27, 24, 20), skin); skull.scale.set(0.92, 1.1, 0.98); skull.castShadow = true; head.add(skull);
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.288, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.56), hairM); hair.scale.set(0.94, 1.1, 1.02); hair.rotation.x = -0.42; hair.position.y = 0.02; head.add(hair);
      const dark = M(0x1a100d, 0.6);
      [-1, 1].forEach((s) => {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), dark); eye.scale.set(1.3, 0.8, 0.6); eye.position.set(s * 0.095, 0.03, 0.245); head.add(eye);
        const brow = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.014, 0.02), dark); brow.position.set(s * 0.098, 0.095, 0.25); brow.rotation.z = -s * 0.12; head.add(brow);
        const ear = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), skin); ear.scale.set(0.5, 1, 0.8); ear.position.set(s * 0.25, 0.0, 0.0); head.add(ear);
      });
      const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), skin); nose.scale.set(0.8, 1.2, 1); nose.position.set(0, -0.03, 0.27); head.add(nose);
      const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.012, 0.02), M(0x8a3a30, 0.6)); mouth.position.set(0, -0.125, 0.245); head.add(mouth);
      const arms = [-1, 1].map((s) => {
        const sh = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 12), shirt); sh.position.set(s * 0.66, 1.9, 0.02); sh.castShadow = true; g.add(sh);
        const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.11, 1, 14), shirt); upper.castShadow = true;
        const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.085, 1, 14), shirt); fore.castShadow = true;
        const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.112, 12, 10), shirt);
        const hand = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 12), glove); hand.scale.set(1.2, 0.55, 1.6); hand.castShadow = true;
        const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.08, 12), vest);
        g.add(upper, fore, elbow, hand, cuff);
        return { s, S: new V3(s * 0.66, 1.9, 0.02), target: new V3(), upper, fore, elbow, hand, cuff };
      });
      const L1 = 1.08, L2 = 1.08;
      const H = new V3(), dir = new V3(), pole = new V3(), E = new V3(), Hc = new V3(), t1 = new V3();
      const place = (m, A, B) => { m.position.copy(A).add(B).multiplyScalar(0.5); m.scale.y = A.distanceTo(B); m.quaternion.setFromUnitVectors(UP, t1.copy(B).sub(A).normalize()); };
      function solve(a) {
        H.copy(a.target).sub(g.position).divideScalar(DEALER_K);
        const d = Math.min(a.S.distanceTo(H), L1 + L2 - 0.004);
        dir.copy(H).sub(a.S).normalize();
        const aa = (L1 * L1 - L2 * L2 + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, L1 * L1 - aa * aa));
        pole.set(a.s * 0.42, -0.5, -0.75); pole.addScaledVector(dir, -pole.dot(dir)).normalize();
        E.copy(a.S).addScaledVector(dir, aa).addScaledVector(pole, hh);
        Hc.copy(a.S).addScaledVector(dir, d);
        place(a.upper, a.S, E); place(a.fore, E, Hc);
        a.elbow.position.copy(E); a.hand.position.copy(Hc);
        a.cuff.position.copy(Hc).addScaledVector(t1.copy(E).sub(Hc).normalize(), 0.13); a.cuff.quaternion.copy(a.fore.quaternion);
        a.hand.rotation.set(0, Math.atan2(dir.x, dir.z), 0);
      }
      const restR = new V3(0.98, 0.17, -3.5), restL = new V3(-1.05, 0.17, -3.42);
      const st = { throwT0: -1, throwTo: new V3(), throwDur: 300, lookYaw: 0, lookTarget: 0, sweepT0: -1, sweepTo: new V3() };
      const pR = new V3(), a1 = new V3(), a2 = new V3();
      function update(now) {
        const t = now / 1000;
        body.scale.y = 1 + Math.sin(t * 1.3) * 0.006;
        body.rotation.z = Math.sin(t * 0.6) * 0.008;
        st.lookYaw = lerp(st.lookYaw, st.lookTarget, 0.06);
        head.rotation.y = st.lookYaw; body.rotation.y = st.lookYaw * 0.25;
        head.rotation.x = 0.22 + Math.sin(t * 0.8) * 0.01;
        pR.copy(restR);
        if (st.throwT0 >= 0) {
          const u = (now - st.throwT0) / st.throwDur;
          a1.set(deckPos.x + 0.2, deckN * DECK_T + 0.16, deckPos.z - 0.05);
          a2.copy(st.throwTo).sub(a1).setY(0).normalize().multiplyScalar(0.75).add(a1).setY(0.42);
          if (u < 0.3) pR.lerpVectors(restR, a1, easeIO(u / 0.3));
          else if (u < 0.6) pR.lerpVectors(a1, a2, easeOut((u - 0.3) / 0.3));
          else if (u < 1.3) pR.lerpVectors(a2, restR, easeIO(clamp01((u - 0.6) / 0.7)));
          else st.throwT0 = -1;
        } else if (st.sweepT0 >= 0) {
          const u = (now - st.sweepT0) / st.sweepDur;
          if (u < 0.5) pR.lerpVectors(restR, st.sweepTo, easeIO(u / 0.5));
          else if (u < 1) pR.lerpVectors(st.sweepTo, restR, easeIO((u - 0.5) / 0.5));
          else st.sweepT0 = -1;
        }
        pR.y += Math.sin(t * 1.3) * 0.004;
        arms[1].target.copy(pR);
        arms[0].target.copy(restL); arms[0].target.y += Math.sin(t * 1.3 + 1) * 0.004;
        solve(arms[0]); solve(arms[1]);
      }
      scene.add(g);
      return {
        update,
        throwTo(target, dur) { st.throwTo.copy(target); st.throwDur = dur; st.throwT0 = performance.now(); },
        reach(target, dur) { st.sweepTo.copy(target).setY(Math.max(0.3, target.y + 0.25)); st.sweepDur = dur; st.sweepT0 = performance.now(); },
        look(x) { st.lookTarget = Math.max(-0.6, Math.min(0.6, x * 0.2)); },
      };
    })();

    /* ---------- chỗ ngồi ---------- */
    const SLOT = {
      me: { cx: 0, cz: 2.35, sp: 0.66, k: 1.2, bet: [0, 1.35], plate: [0, 3.05], chips: [0, 3.6], lab: [0.75, 0] },
      C: { cx: -1.42, cz: 0.5, sp: 0.3, k: 1.2, bet: [-1.6, 1.5], plate: [-1.42, -0.16], chips: [-3.2, 0.9], lab: [0.72, 0] },
      A: { cx: -1.4, cz: -1.8, sp: 0.3, k: 1.2, bet: [-1.5, -0.9], plate: [-1.4, -2.46], chips: [-3.0, -1.6], lab: [0.72, 0] },
      B: { cx: 1.4, cz: -1.8, sp: 0.3, k: 1.2, bet: [1.5, -0.9], plate: [1.4, -2.46], chips: [3.0, -1.6], lab: [-0.72, 0] },
      D: { cx: 1.42, cz: 0.5, sp: 0.3, k: 1.2, bet: [1.6, 1.5], plate: [1.42, -0.16], chips: [3.2, 0.9], lab: [-0.72, 0] },
    };
    const ORDER = { 2: ['me', 'B'], 3: ['me', 'A', 'B'], 4: ['me', 'C', 'A', 'B'], 5: ['me', 'C', 'A', 'B', 'D'] };
    let seats = [];
    const potPos = new V3(0, 0, -0.75);
    function setSeats(n) {
      seats = (ORDER[n] || ORDER[4]).map((k) => {
        const s = SLOT[k];
        return { s, betPos: new V3(s.bet[0], 0, s.bet[1]), platePos: new V3(s.plate[0], 0.05, s.plate[1]), betLab: new V3(s.bet[0] + s.lab[0], 0.2, s.bet[1] + s.lab[1]), edge: new V3(s.chips[0], 0, s.chips[1]), pile: null };
      });
    }
    setSeats(4);
    const slotPos = (seat, idx, count) => { const s = seats[seat].s; return new V3(s.cx + (idx - ((count || 5) - 1) / 2) * s.sp, 0.006 + idx * 0.003, s.cz); };
    const countOf = (seat) => cards.filter((c) => c.seat === seat && !c.gone && !c.mucked).length;

    // vòng sáng báo lượt
    const ringTex = canvasTex(128, 128, (ctx) => { const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 64); g.addColorStop(0, 'rgba(255,214,130,0.55)'); g.addColorStop(0.6, 'rgba(255,200,100,0.2)'); g.addColorStop(1, 'rgba(255,200,100,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128); });
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.004; scene.add(ring);
    let turnSeat = -1, ringOp = 0;

    /* ---------- máy quay ---------- */
    const cam = { mode: 'lobby', from: null, t0: 0, dur: 0, pos: new V3(), tgt: new V3(), playPos: new V3(), playTgt: new V3(0, 0.3, -0.5) };
    const probe = new THREE.PerspectiveCamera(36, 1, 0.1, 90), pv = new V3();
    function fitPlay() {
      const w = container.clientWidth || 1, h = container.clientHeight || 1, aspect = w / h;
      const el = aspect < 0.85 ? 0.98 : aspect < 1.25 ? 0.9 : 0.82;
      const pts = [[HW, 0.15, -1.6], [-HW, 0.15, -1.6], [HW, 0.15, 1.6], [-HW, 0.15, 1.6], [0, 0.1, 3.3], [1.95, 0.1, 3.0], [-1.95, 0.1, 3.0]];
      const NECK = 3.35;                      // mép trên khung hình cắt ngang cổ dealer
      probe.aspect = aspect; probe.fov = camera.fov; probe.updateProjectionMatrix();
      const place = (d, tz) => { probe.position.set(0, 0.3 + Math.sin(el) * d, tz + Math.cos(el) * d); probe.lookAt(0, 0.3, tz); probe.updateMatrixWorld(); probe.matrixWorldInverse.copy(probe.matrixWorld).invert(); };
      const panFor = (d) => { let a = -6, b = 6; for (let i = 0; i < 20; i++) { const m = (a + b) / 2; place(d, m); pv.set(0, NECK, DEALER_Z).project(probe); if (pv.y > 1.0) b = m; else a = m; } return (a + b) / 2; };
      let lo = 5, hi = 45, tz = 0;
      for (let i = 0; i < 20; i++) {
        const d = (lo + hi) / 2, t = panFor(d);
        place(d, t);
        let ok = true;
        for (const p of pts) { pv.set(p[0], p[1], p[2]).project(probe); if (Math.abs(pv.x) > 0.975 || pv.y < -0.95) { ok = false; break; } }
        if (ok) { hi = d; tz = t; } else lo = d;
      }
      tz = panFor(hi);
      cam.playTgt.set(0, 0.3, tz);
      cam.playPos.set(0, 0.3 + Math.sin(el) * hi, tz + Math.cos(el) * hi);
    }
    function poseOf(mode, now, pos, tgt) {
      if (mode === 'lobby') {
        const aspect = (container.clientWidth || 1) / (container.clientHeight || 1);
        const a = Math.sin(now / 1000 * 0.11) * 0.62, r = aspect < 1 ? 15.5 : aspect < 1.8 ? 12.5 : 10.5;
        tgt.set(0, 0.9, -1.0); pos.set(Math.sin(a) * r, 4.6 + Math.sin(now / 1000 * 0.07) * 0.4, Math.cos(a) * r - 1.0);
      } else if (mode === 'showdown') {
        tgt.copy(cam.playTgt); pos.copy(cam.playPos).lerp(tgt, 0.035);
      } else { tgt.copy(cam.playTgt); pos.copy(cam.playPos); }
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
    let lastW = 0, lastH = 0, glow = null, raf = 0;
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
      dealer.update(now);
      updateCamera(now);
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

    const api = {
      el: canvas,
      setFelt(k) { feltKey = FELTS[k] ? k : 'son'; feltRedraw(); },
      setSeats,
      seatCount: () => seats.length,
      anchor(kind, seat) {
        if (kind === 'pot') return new V3(potPos.x, 0.1, potPos.z + 0.72);
        if (kind === 'dealer') return new V3(0, 1.55, -3.55);
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
        glow = null; turnSeat = -1; deck2.visible = false; setDeck(24);
      },

      async newHand(mode) {
        glow = null;
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
        const m = motion();
        dealer.throwTo(to, 300 * Math.max(m, 0.2));
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
        return Promise.all(mine.map((c, i) => {
          const from = c.pos.clone(), y0 = c.yaw, f0 = c.flip, y1 = (Math.random() - 0.5) * 1.2;
          const to = muck.clone(); to.x += (Math.random() - 0.5) * 0.3; to.z += (Math.random() - 0.5) * 0.2; to.y = 0.008 + cards.filter((k) => k.mucked).length * 0.003 + i * 0.003;
          c.mucked = true;
          return delay(i * 40).then(() => tw(420, (u) => { c.pos.lerpVectors(from, to, u); c.pos.y += Math.sin(u * Math.PI) * 0.22; c.yaw = lerp(y0, y1, u); c.flip = lerp(f0, 0, Math.min(1, u * 1.6)); applyPose(c); }, easeIO));
        }));
      },

      // nhấc lá úp của mình lên xem
      peek(on) {
        const c = cardAt(0, 0); if (!c || c.mucked || peeking === on) return;
        peeking = on; c.lifted = on; const tok = ++peekTok;
        const base = slotPos(0, 0, countOf(0)), f0 = c.flip, p0 = c.pitch, y0 = c.pos.y, z0 = c.pos.z, f1 = on ? 1 : 0, p1 = on ? 0.78 : 0;
        if (on) sfx('flip');
        tw(on ? 200 : 160, (u) => { if (tok !== peekTok) return; c.flip = lerp(f0, f1, u); c.pitch = lerp(p0, p1, u); c.pos.y = lerp(y0, base.y + (on ? 0.62 : 0), u); c.pos.x = base.x; c.pos.z = lerp(z0, base.z + (on ? 0.12 : 0), u); applyPose(c); }, easeOut);
      },
      endPeek() { if (peeking) api.peek(false); },

      turn(seat) {
        turnSeat = seat;
        if (seat >= 0 && seats[seat]) { const s = seats[seat].s; ring.position.set(s.cx, 0.004, s.cz); ring.scale.set(seat === 0 ? 5.2 : 3.4, 2.2, 1); dealer.look(s.cx); }
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
        return Promise.all(ids.map((id, i) => { const p = newPile(Math.max(5, Math.round(pot / ids.length)), seats[id].edge); return delay(i * 60).then(() => slide(p, potPos, 420)).then(() => scene.remove(p)); }))
          .then(() => api.setPot(pot));
      },
      bet(seat, total, delta) {
        const s = seats[seat]; if (!s) return Promise.resolve();
        const p = newPile(delta, s.edge); sfx('chip');
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
        if (!api._pot) api._pot = newPile(amount, potPos); else fillPile(api._pot, amount);
      },
      pay(seat, amount, left) {
        const s = seats[seat]; if (!s) return Promise.resolve();
        api.setPot(left);
        const p = newPile(amount, potPos); dealer.reach(potPos, 700 * motion()); sfx('chip');
        return slide(p, s.edge.clone().lerp(s.betPos, 0.55), 620).then(() => delay(260)).then(() => { scene.remove(p); sfx('chip'); });
      },

      camera: cameraTo,
      look(seat) { dealer.look(seat >= 0 && seats[seat] ? seats[seat].s.cx : 0); },

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

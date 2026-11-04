/* Xì tố 24 — hiệu ứng: vẽ lá bài lên canvas, nặn bài (kéo mép/góc), hé lá úp, âm thanh.
 * Mô hình nặn: lá nằm úp, phần bị kéo lên gập theo đường trung trực của (điểm nắm → ngón tay),
 * mặt bài lộ ra ở chỗ vừa nhấc, mép gập hiện mặt lưng phản chiếu kèm bóng đổ.
 */
(function (root) {
  'use strict';
  const X = root.Xito;

  const COL = {
    egg: '#f1e7d0', egg2: '#e3d5b6', ink: '#1b1310', red: '#a8231a',
    cin: '#b3321f', cinDeep: '#7a1d12', gold: '#d2aa55', goldDim: '#8e7240',
  };
  const DISPLAY = '"Cormorant", "Iowan Old Style", Georgia, serif';
  const BODY = '"Be Vietnam Pro", "Segoe UI", system-ui, sans-serif';

  /* ---------------- hình học ---------------- */
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const dot = (a, b) => a.x * b.x + a.y * b.y;
  const len = (a) => Math.hypot(a.x, a.y);

  function rrPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function polyPath(ctx, pts) {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
  }
  // nửa mặt phẳng side*((q-M)·n) > 0
  function halfPlanePath(ctx, M, n, side, L) {
    const t = { x: -n.y, y: n.x };
    const a = { x: M.x + t.x * L, y: M.y + t.y * L };
    const b = { x: M.x - t.x * L, y: M.y - t.y * L };
    const o = { x: n.x * side * L, y: n.y * side * L };
    polyPath(ctx, [a, b, { x: b.x + o.x, y: b.y + o.y }, { x: a.x + o.x, y: a.y + o.y }]);
  }
  // Sutherland–Hodgman: giữ phần đa giác có (q-M)·n <= 0 (phần bị nhấc)
  function clipLifted(pts, M, n) {
    const out = [];
    const f = (q) => dot(sub(q, M), n);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const fa = f(a), fb = f(b);
      if (fa <= 0) out.push(a);
      if ((fa <= 0) !== (fb <= 0)) {
        const t = fa / (fa - fb);
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
    return out;
  }
  function area(pts) {
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      s += a.x * b.y - b.x * a.y;
    }
    return Math.abs(s) / 2;
  }

  /* ---------------- vẽ mặt bài / lưng bài ---------------- */
  function drawFace(ctx, x, y, W, H, card) {
    const r = W * 0.1;
    rrPath(ctx, x, y, W, H, r);
    const g = ctx.createLinearGradient(x, y, x + W * 0.6, y + H);
    g.addColorStop(0, COL.egg); g.addColorStop(1, COL.egg2);
    ctx.fillStyle = g; ctx.fill();
    const col = X.isRed(card) ? COL.red : COL.ink;
    const rank = X.RANKS[X.rankOf(card)], suit = X.SUITS[X.suitOf(card)];
    const corner = () => {
      ctx.fillStyle = col;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const cx = x + W * 0.16;
      ctx.font = `700 ${W * 0.27}px ${DISPLAY}`;
      ctx.fillText(rank, cx, y + W * 0.05);
      ctx.font = `${W * 0.2}px ${BODY}`;
      ctx.fillText(suit, cx, y + W * 0.31);
    };
    corner();
    ctx.save();
    ctx.translate(x + W, y + H); ctx.rotate(Math.PI); ctx.translate(-x, -y);
    corner();
    ctx.restore();
    ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 ${W * 0.42}px ${DISPLAY}`;
    ctx.fillText(rank, x + W / 2, y + H * 0.42);
    ctx.font = `${W * 0.3}px ${BODY}`;
    ctx.fillText(suit, x + W / 2, y + H * 0.66);
  }

  function drawBack(ctx, x, y, W, H) {
    const r = W * 0.1;
    ctx.save();
    rrPath(ctx, x, y, W, H, r);
    const g = ctx.createLinearGradient(x, y, x + W * 0.6, y + H);
    g.addColorStop(0, COL.cin); g.addColorStop(1, COL.cinDeep);
    ctx.fillStyle = g; ctx.fill();
    ctx.clip();
    const inset = W * 0.07;
    ctx.strokeStyle = 'rgba(210,170,85,0.2)'; ctx.lineWidth = Math.max(1, W * 0.012);
    const step = W * 0.085;
    ctx.beginPath();
    for (let k = -H; k < W + H; k += step) {
      ctx.moveTo(x + k, y); ctx.lineTo(x + k + H, y + H);
      ctx.moveTo(x + k + H, y); ctx.lineTo(x + k, y + H);
    }
    ctx.stroke();
    ctx.strokeStyle = COL.goldDim; ctx.lineWidth = Math.max(1, W * 0.014);
    rrPath(ctx, x + inset, y + inset, W - inset * 2, H - inset * 2, r * 0.6); ctx.stroke();
    // hình thoi vàng ở giữa (đối xứng nên phản chiếu vẫn đẹp)
    const cx = x + W / 2, cy = y + H / 2, d = W * 0.17;
    ctx.beginPath(); ctx.moveTo(cx, cy - d); ctx.lineTo(cx + d * 0.75, cy); ctx.lineTo(cx, cy + d); ctx.lineTo(cx - d * 0.75, cy); ctx.closePath();
    ctx.fillStyle = COL.cinDeep; ctx.fill();
    ctx.strokeStyle = COL.gold; ctx.stroke();
    ctx.restore();
  }

  /* Vẽ trạng thái nặn. o = góc trên trái lá bài trên canvas. S = điểm nắm (trên mép), P = vị trí ngón tay.
   * Trả về tỉ lệ diện tích đã lộ (0..1). */
  function drawSqueeze(ctx, o, W, H, card, S, P) {
    if (!S || !P || len(sub(P, S)) < 0.5) { drawBack(ctx, o.x, o.y, W, H); return 0; }
    const d = sub(P, S), l = len(d);
    const n = { x: d.x / l, y: d.y / l };
    const M = { x: (S.x + P.x) / 2, y: (S.y + P.y) / 2 };
    const L = (W + H) * 4;
    const r = W * 0.1;

    // phần lưng còn nằm trên bàn
    ctx.save();
    rrPath(ctx, o.x, o.y, W, H, r); ctx.clip();
    halfPlanePath(ctx, M, n, 1, L); ctx.clip();
    drawBack(ctx, o.x, o.y, W, H);
    ctx.restore();

    // mặt bài lộ ra chỗ vừa nhấc + bóng nếp gập
    ctx.save();
    rrPath(ctx, o.x, o.y, W, H, r); ctx.clip();
    halfPlanePath(ctx, M, n, -1, L); ctx.clip();
    drawFace(ctx, o.x, o.y, W, H, card);
    const sg = ctx.createLinearGradient(M.x, M.y, M.x - n.x * W * 0.2, M.y - n.y * W * 0.2);
    sg.addColorStop(0, 'rgba(40,15,8,0.38)'); sg.addColorStop(1, 'rgba(40,15,8,0)');
    ctx.fillStyle = sg; ctx.fillRect(o.x - W, o.y - H, W * 3, H * 3);
    ctx.restore();

    // mép gập: phản chiếu phần bị nhấc qua đường gập
    const rect = [{ x: o.x, y: o.y }, { x: o.x + W, y: o.y }, { x: o.x + W, y: o.y + H }, { x: o.x, y: o.y + H }];
    const lifted = clipLifted(rect, M, n);
    const k = dot(M, n);
    const refl = (q) => { const s = 2 * (dot(q, n) - k); return { x: q.x - s * n.x, y: q.y - s * n.y }; };
    if (lifted.length >= 3) {
      const flap = lifted.map(refl);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = W * 0.09;
      ctx.shadowOffsetX = n.x * W * 0.04;
      ctx.shadowOffsetY = n.y * W * 0.04 + 2;
      polyPath(ctx, flap); ctx.fillStyle = COL.cinDeep; ctx.fill();
      ctx.restore();
      ctx.save();
      polyPath(ctx, flap); ctx.clip();
      ctx.transform(1 - 2 * n.x * n.x, -2 * n.x * n.y, -2 * n.x * n.y, 1 - 2 * n.y * n.y, 2 * k * n.x, 2 * k * n.y);
      drawBack(ctx, o.x, o.y, W, H);
      ctx.restore();
      ctx.save();
      polyPath(ctx, flap); ctx.clip();
      const hg = ctx.createLinearGradient(M.x, M.y, M.x + n.x * W * 0.6, M.y + n.y * W * 0.6);
      hg.addColorStop(0, 'rgba(255,236,200,0.38)');
      hg.addColorStop(0.3, 'rgba(255,236,200,0.08)');
      hg.addColorStop(1, 'rgba(0,0,0,0.18)');
      ctx.fillStyle = hg; ctx.fillRect(o.x - W * 2, o.y - H * 2, W * 5, H * 5);
      ctx.restore();
    }
    return Math.min(1, area(lifted) / (W * H));
  }

  // khoảng cách cần kéo để lật hết lá theo hướng n
  function fullRevealTarget(o, W, H, S, n) {
    const corners = [{ x: o.x, y: o.y }, { x: o.x + W, y: o.y }, { x: o.x + W, y: o.y + H }, { x: o.x, y: o.y + H }];
    const m = Math.max(...corners.map((c) => dot(sub(c, S), n)));
    const t = 2 * m + 14;
    return { x: S.x + n.x * t, y: S.y + n.y * t };
  }

  function setupCanvas(cv, cw, ch) {
    const dpr = Math.min(3, root.devicePixelRatio || 1);
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
    const ctx = cv.getContext('2d');
    return () => { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, cw, ch); return ctx; };
  }

  function tween(ms, step) {
    return new Promise((res) => {
      if (ms <= 0) { step(1); return res(); }
      const t0 = performance.now();
      const f = (t) => {
        const u = Math.min(1, (t - t0) / ms);
        step(1 - Math.pow(1 - u, 3));
        if (u < 1) requestAnimationFrame(f); else res();
      };
      requestAnimationFrame(f);
    });
  }

  /* ---------------- Nặn bài (overlay lớn) ---------------- */
  /* opts: { overlay, canvas, title, titleEl, timerEl, revealBtn, motion(), autoMs, onSound } */
  function squeeze(card, opts) {
    return new Promise((resolve) => {
      const { overlay, canvas: cv } = opts;
      opts.titleEl.textContent = opts.title;
      overlay.hidden = false;
      const vw = root.innerWidth, vh = root.innerHeight;
      const W = Math.round(Math.max(150, Math.min(240, vw * 0.55, (vh - 220) / 1.42)));
      const H = Math.round(W * 1.42);
      const cw = Math.min(W * 2.1, vw - 32), ch = Math.min(H * 1.75, vh - 150);
      const o = { x: (cw - W) / 2, y: (ch - H) / 2 };
      const begin = setupCanvas(cv, cw, ch);
      let S = null, P = null, frac = 0, finished = false, dragging = false, timer = 0;
      const draw = () => { frac = drawSqueeze(begin(), o, W, H, card, S, P); };
      draw();

      const resetTimer = () => {
        clearTimeout(timer);
        const ms = opts.autoMs();
        timer = setTimeout(complete, ms);
        const bar = opts.timerEl;
        bar.style.animation = 'none'; void bar.offsetWidth;
        bar.style.animation = `sqT ${ms}ms linear forwards`;
      };
      resetTimer();

      const local = (e) => {
        const r = cv.getBoundingClientRect();
        return { x: (e.clientX - r.left) * (cw / r.width), y: (e.clientY - r.top) * (ch / r.height) };
      };
      const snapEdge = (pt) => {
        const q = { x: Math.max(0, Math.min(W, pt.x - o.x)), y: Math.max(0, Math.min(H, pt.y - o.y)) };
        const dl = q.x, dr = W - q.x, dt = q.y, db = H - q.y;
        const c = W * 0.24;
        if (Math.min(dl, dr) < c && Math.min(dt, db) < c) {
          q.x = dl < dr ? 0 : W; q.y = dt < db ? 0 : H;
        } else {
          const m = Math.min(dl, dr, dt, db);
          if (m === dl) q.x = 0; else if (m === dr) q.x = W; else if (m === dt) q.y = 0; else q.y = H;
        }
        return { x: q.x + o.x, y: q.y + o.y };
      };
      const onDown = (e) => {
        if (finished) return;
        const p = local(e);
        const pad = 28;
        if (p.x < o.x - pad || p.x > o.x + W + pad || p.y < o.y - pad || p.y > o.y + H + pad) return;
        e.preventDefault();
        cv.setPointerCapture(e.pointerId);
        dragging = true;
        S = snapEdge(p); P = { ...S };
        resetTimer(); draw();
      };
      const onMove = (e) => {
        if (!dragging || finished) return;
        const p = local(e);
        P = p;
        if (opts.onSound && Math.random() < 0.06) opts.onSound('rub');
        resetTimer(); draw();
      };
      const onUp = () => {
        if (!dragging || finished) return;
        dragging = false;
        if (frac > 0.42) complete();
        else springBack();
      };
      const springBack = async () => {
        const P0 = { ...P }, S0 = S;
        if (!S0) return;
        await tween(200 * opts.motion(), (u) => { if (!dragging && S === S0) { P = { x: P0.x + (S0.x - P0.x) * u, y: P0.y + (S0.y - P0.y) * u }; draw(); } });
        if (!dragging && S === S0) { S = null; P = null; draw(); }
      };
      async function complete() {
        if (finished) return;
        finished = true; dragging = false;
        clearTimeout(timer);
        opts.timerEl.style.animation = 'none';
        if (!S) { S = { x: o.x + W / 2, y: o.y + H }; P = { ...S }; }
        let d = sub(P, S);
        if (len(d) < 4) d = sub({ x: o.x + W / 2, y: o.y + H / 2 }, S);
        const n = { x: d.x / len(d), y: d.y / len(d) };
        const P0 = { ...P }, T = fullRevealTarget(o, W, H, S, n);
        if (opts.onSound) opts.onSound('flip');
        await tween(320 * opts.motion(), (u) => { P = { x: P0.x + (T.x - P0.x) * u, y: P0.y + (T.y - P0.y) * u }; draw(); });
        const ctx = begin();
        drawFace(ctx, o.x, o.y, W, H, card);
        await new Promise((r) => setTimeout(r, 520));
        cleanup();
        resolve();
      }
      const onDbl = (e) => { e.preventDefault(); complete(); };
      const onKey = (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); complete(); }
      };
      function cleanup() {
        cv.removeEventListener('pointerdown', onDown);
        cv.removeEventListener('pointermove', onMove);
        cv.removeEventListener('pointerup', onUp);
        cv.removeEventListener('pointercancel', onUp);
        cv.removeEventListener('dblclick', onDbl);
        root.removeEventListener('keydown', onKey, true);
        opts.revealBtn.onclick = null;
        overlay.hidden = true;
        squeeze.cancel = null;
      }
      cv.addEventListener('pointerdown', onDown);
      cv.addEventListener('pointermove', onMove);
      cv.addEventListener('pointerup', onUp);
      cv.addEventListener('pointercancel', onUp);
      cv.addEventListener('dblclick', onDbl);
      root.addEventListener('keydown', onKey, true);
      opts.revealBtn.onclick = complete;
      squeeze.cancel = () => { finished = true; clearTimeout(timer); cleanup(); };
      setTimeout(() => opts.revealBtn.focus({ preventScroll: true }), 30);
    });
  }

  /* ---------------- Hé lá úp tại chỗ (giữ để xem) ---------------- */
  function attachPeek(el, card, hooks) {
    let cv = null, state = 0, P = null; // state: 0 nằm, 1 đang hé
    const start = async () => {
      if (state === 1 || hooks.disabled()) return;
      state = 1;
      hooks.onPeek();
      const W = el.offsetWidth, H = el.offsetHeight, m = Math.round(W * 0.4);
      cv = document.createElement('canvas');
      cv.className = 'peekcv';
      cv.style.left = cv.style.top = -m + 'px';
      el.appendChild(cv);
      el.classList.add('peeking');
      const begin = setupCanvas(cv, W + 2 * m, H + 2 * m);
      const o = { x: m, y: m }, S = { x: m, y: m }, T = { x: m + W * 0.64, y: m + H * 0.52 };
      const myCv = cv;
      await tween(170 * hooks.motion(), (u) => {
        if (cv !== myCv) return;
        P = { x: S.x + (T.x - S.x) * u, y: S.y + (T.y - S.y) * u };
        drawSqueeze(begin(), o, W, H, card, S, P);
      });
      el._peekRedraw = () => drawSqueeze(begin(), o, W, H, card, S, P);
    };
    const end = () => {
      if (state !== 1) return;
      state = 0;
      const c = cv; cv = null;
      if (c) c.remove();
      el.classList.remove('peeking');
    };
    el.addEventListener('pointerdown', (e) => { if (e.button > 0) return; e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (_) {} start(); });
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); state ? end() : start(); }
    });
    el.addEventListener('blur', end);
    el._peekEnd = end;
  }

  /* ---------------- Âm thanh tổng hợp (WebAudio) ---------------- */
  const Sound = {
    ctx: null,
    enabled: false,
    ensure() {
      if (!this.enabled) return null;
      try {
        if (!this.ctx) this.ctx = new (root.AudioContext || root.webkitAudioContext)();
        if (this.ctx.state === 'suspended') this.ctx.resume();
      } catch (e) { return null; }
      return this.ctx;
    },
    noise(dur, freq, q, gain, at = 0) {
      const c = this.ensure(); if (!c) return;
      const n = Math.floor(c.sampleRate * dur);
      const buf = c.createBuffer(1, n, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
      const src = c.createBufferSource(); src.buffer = buf;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain(); g.gain.value = gain;
      src.connect(f); f.connect(g); g.connect(c.destination);
      src.start(c.currentTime + at);
    },
    tone(freq, dur, gain, type = 'triangle', at = 0) {
      const c = this.ensure(); if (!c) return;
      const t = c.currentTime + at;
      const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
      const g = c.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + dur + 0.02);
    },
    play(kind) {
      if (!this.enabled) return;
      switch (kind) {
        case 'deal': this.noise(0.09, 2400, 0.7, 0.55); break;
        case 'flip': this.noise(0.06, 3800, 1.1, 0.45); this.noise(0.05, 1800, 0.9, 0.25, 0.04); break;
        case 'rub': this.noise(0.05, 1500, 0.6, 0.12); break;
        case 'chip': this.tone(2500, 0.06, 0.09); this.tone(3400, 0.05, 0.06, 'triangle', 0.035); break;
        case 'win': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.3, 0.06, 'sine', i * 0.08)); break;
        case 'turn': this.tone(880, 0.12, 0.05, 'sine'); break;
      }
    },
  };

  root.XitoFx = { drawFace, drawBack, drawSqueeze, squeeze, attachPeek, Sound, tween };
})(typeof window !== 'undefined' ? window : globalThis);

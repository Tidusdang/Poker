/* Chạy phòng thí nghiệm trong luồng nền để giao diện không bị đứng. */
importScripts('xito-engine.js', 'xito-sim.js');
let stopFlag = false;
self.onmessage = (e) => {
  const m = e.data;
  if (m.cmd === 'stop') { stopFlag = true; return; }
  stopFlag = false;
  const st = self.XitoSim.newStats(m.players);
  const state = {};
  const rng = self.XitoSim.mulberry32(m.seed >>> 0);
  let done = 0;
  const chunk = 5000;
  const t0 = Date.now();
  (function step() {
    if (stopFlag) { self.postMessage({ type: 'done', stopped: true, summary: self.XitoSim.summarize(st), ms: Date.now() - t0 }); return; }
    const c = Math.min(chunk, m.hands - done);
    self.XitoSim.run(st, state, c, m.shuffle, rng);
    done += c;
    self.postMessage({ type: 'progress', done, hands: m.hands });
    if (done < m.hands) setTimeout(step, 0);
    else self.postMessage({ type: 'done', summary: self.XitoSim.summarize(st), ms: Date.now() - t0 });
  })();
};

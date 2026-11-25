// Logica di gioco: mondo, fisica, intelligenza del computer, rete, disegno.
const Game = (() => {
  const W = 1800, H = 1200, CELL = 30, COLS = W / CELL, ROWS = H / CELL, N = COLS * ROWS;
  const INFL = 28, BORDER = 20;
  const ROUND_TIME = 90, CIG_GOAL = 12, CIGS_ON_MAP = 5, SNACKS_ON_MAP = 3;
  const C_R = 34, T_R = 24;
  const C_SPEED = 165, C_SPRINT = 285, T_SPEED = 200;
  const SMOKE_CD = 8, STUN_TIME = 1.8, CLOUD_LIFE = 3.5, CLOUD_R = 105;
  const HIDE_SEE_DIST = 110;
  // difficoltà del computer, diversa per ciascun personaggio
  const DIFF = {
    facile:    { ciccio: { mul: 0.8,  repath: 0.5,  react: 0.25 }, tuki: { mul: 0.9,  repath: 0.45, react: 0.3 } },
    normale:   { ciccio: { mul: 0.9,  repath: 0.3,  react: 0.6 },  tuki: { mul: 0.98, repath: 0.28, react: 0.65 } },
    difficile: { ciccio: { mul: 1.0,  repath: 0.16, react: 0.95 }, tuki: { mul: 1.06, repath: 0.16, react: 0.95 } },
  };

  // ---------- utilità ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  function norm(x, y) { const l = Math.hypot(x, y); return l > 1e-6 ? { x: x / l, y: y / l } : { x: 0, y: 0 }; }

  // ---------- mondo ----------
  function genWorld(seed) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const w = tryWorld(seed + attempt * 7919);
      if (w) return w;
    }
    return tryWorld(seed, true);
  }

  function tryWorld(seed, force) {
    const rand = mulberry32(seed);
    const circles = [], rects = [], bushes = [];
    const spawnC = { x: 220, y: H / 2 }, spawnT = { x: W - 220, y: H / 2 };
    const solids = () => circles.map(c => ({ x: c.x, y: c.y, r: c.r }))
      .concat(rects.map(r => ({ x: r.x + r.w / 2, y: r.y + r.h / 2, r: Math.hypot(r.w, r.h) / 2 })));
    function place(r, gap, list, spawnGap) {
      for (let i = 0; i < 60; i++) {
        const x = 90 + r + rand() * (W - 180 - 2 * r), y = 90 + r + rand() * (H - 180 - 2 * r);
        if (Math.hypot(x - spawnC.x, y - spawnC.y) < spawnGap + r) continue;
        if (Math.hypot(x - spawnT.x, y - spawnT.y) < spawnGap + r) continue;
        let ok = true;
        for (const o of list) if (Math.hypot(x - o.x, y - o.y) < r + o.r + gap) { ok = false; break; }
        if (ok) return { x, y };
      }
      return null;
    }
    for (let i = 0; i < 4; i++) {
      const horiz = rand() < 0.5, w = horiz ? 150 : 70, h = horiz ? 70 : 150;
      const p = place(Math.hypot(w, h) / 2, 90, solids(), 170);
      if (p) rects.push({ x: p.x - w / 2, y: p.y - h / 2, w, h });
    }
    for (let i = 0; i < 14; i++) {
      const kind = rand() < 0.55 ? 'palm' : 'tree';
      const r = kind === 'palm' ? 34 + rand() * 12 : 42 + rand() * 18;
      const p = place(r, 85, solids(), 170);
      if (p) circles.push({ x: p.x, y: p.y, r, kind, s: rand() * 6 });
    }
    for (let i = 0; i < 8; i++) {
      const r = 22 + rand() * 14;
      const p = place(r, 85, solids(), 170);
      if (p) circles.push({ x: p.x, y: p.y, r, kind: 'rock' });
    }
    for (let i = 0; i < 8; i++) {
      const r = 55 + rand() * 15;
      const p = place(r, 15, solids().concat(bushes), 140);
      if (p) bushes.push({ x: p.x, y: p.y, r });
    }

    const blocked = new Uint8Array(N);
    for (let cy = 0; cy < ROWS; cy++) for (let cx = 0; cx < COLS; cx++) {
      const x = cx * CELL + CELL / 2, y = cy * CELL + CELL / 2, i = cy * COLS + cx;
      if (x < BORDER + INFL || y < BORDER + INFL || x > W - BORDER - INFL || y > H - BORDER - INFL) { blocked[i] = 1; continue; }
      for (const c of circles) if (Math.hypot(x - c.x, y - c.y) < c.r + INFL) { blocked[i] = 1; break; }
      if (blocked[i]) continue;
      for (const r of rects) {
        const px = clamp(x, r.x, r.x + r.w), py = clamp(y, r.y, r.y + r.h);
        if (Math.hypot(x - px, y - py) < INFL) { blocked[i] = 1; break; }
      }
    }
    const world = { seed, circles, rects, bushes, blocked, spawnC, spawnT, rand };
    const d = bfsRaw(blocked, cellOf(spawnC.x, spawnC.y));
    if (!force && d[cellOf(spawnT.x, spawnT.y)] < 0) return null;
    const reach = [];
    let free = 0;
    for (let i = 0; i < N; i++) { if (!blocked[i]) free++; if (d[i] >= 0) reach.push(i); }
    if (!force && reach.length < free * 0.97) return null;
    world.reach = reach;
    world.reachField = d;
    world.reachSet = new Uint8Array(N); for (const i of reach) world.reachSet[i] = 1;
    // celle candidate per la fuga del tucano
    world.cand = reach.filter(i => (i % COLS) % 3 === 1 && Math.floor(i / COLS) % 3 === 1);
    for (const b of bushes) { const c = cellOf(b.x, b.y); if (world.reachSet[c]) world.cand.push(c); }
    return world;
  }

  function cellOf(x, y) {
    const cx = clamp(Math.floor(x / CELL), 0, COLS - 1), cy = clamp(Math.floor(y / CELL), 0, ROWS - 1);
    return cy * COLS + cx;
  }
  const cellX = i => (i % COLS) * CELL + CELL / 2;
  const cellY = i => Math.floor(i / COLS) * CELL + CELL / 2;

  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const queue = new Int32Array(N);
  function bfsRaw(blocked, start) {
    const d = new Int16Array(N).fill(-1);
    if (start < 0 || blocked[start]) return d;
    let h = 0, t = 0; queue[t++] = start; d[start] = 0;
    while (h < t) {
      const i = queue[h++], cx = i % COLS, cy = (i / COLS) | 0;
      for (let k = 0; k < 8; k++) {
        const nx = cx + NB[k][0], ny = cy + NB[k][1];
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        const j = ny * COLS + nx;
        if (blocked[j] || d[j] >= 0) continue;
        if (k >= 4 && (blocked[cy * COLS + nx] || blocked[ny * COLS + cx])) continue;
        d[j] = d[i] + 1; queue[t++] = j;
      }
    }
    return d;
  }

  // ---------- stato ----------
  let S = null;           // stato partita
  let cfg = null;         // configurazione partita
  let canvas, ctx, dpr = 1, vw = 0, vh = 0, scale = 1;
  let staticLayer = null, staticK = 0, miniLayer = null;
  let running = false, lastT = 0, rafId = 0;
  let input = { x: 0, y: 0, action: false, actionPressed: false };
  let keys = {};
  let joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
  let safe = { t: 0, r: 0, b: 0, l: 0 };
  let netTimers = { p: 0, w: 0 };
  let callbacks = {};
  let actionBtn = null;

  function dOf(c) { return (cfg.diffBy && cfg.diffBy[c.role]) || cfg.diff[c.role]; }
  function own(c) { return c.ctrl === 'local' || c.ctrl === 'cpu'; }
  function isAuth() { return cfg.mode !== 'online' || cfg.isHost; }
  function me() { return cfg.myRole ? S.chars[cfg.myRole] : S.chars.ciccio; }
  function other(role) { return role === 'ciccio' ? 'tuki' : 'ciccio'; }

  function makeChar(role, ctrl, spawn) {
    return {
      role, ctrl, x: spawn.x, y: spawn.y, vx: 0, vy: 0, r: role === 'ciccio' ? C_R : T_R,
      dir: role === 'ciccio' ? 1 : -1, moving: false, t: Math.random() * 10,
      energy: 100, exhausted: false, sprint: false, stunT: 0, eatT: 0,
      cigs: 0, smokeCd: 2, inBush: false,
      // rete
      nx: spawn.x, ny: spawn.y, nvx: 0, nvy: 0, nAt: 0,
      // IA
      ai: { t: 0, field: null, target: null, lastSeen: null, stuckT: 0, lastPos: { x: spawn.x, y: spawn.y }, jitter: null, jitterT: 0, tgtCell: -1 },
    };
  }

  function newState(seed) {
    const world = genWorld(seed);
    const ctrlOf = role => {
      if (cfg.mode === 'demo') return 'cpu';
      if (role === cfg.myRole) return 'local';
      return cfg.mode === 'online' ? 'remote' : 'cpu';
    };
    S = {
      world, phase: 'count', countT: 3.2, time: ROUND_TIME, nextId: 1,
      chars: { ciccio: makeChar('ciccio', ctrlOf('ciccio'), world.spawnC), tuki: makeChar('tuki', ctrlOf('tuki'), world.spawnT) },
      cigs: [], snacks: [], snackTimers: [], clouds: [], particles: [], popups: [],
      result: null, endT: 0, cam: { x: W / 2, y: H / 2 }, shake: 0, smokeT: 0, lastCount: 4,
      pendingAct: false,
    };
    S.cam.x = me().x; S.cam.y = me().y;
    if (isAuth()) {
      for (let i = 0; i < CIGS_ON_MAP; i++) spawnCig(true);
      for (let i = 0; i < SNACKS_ON_MAP; i++) spawnSnack();
    }
  }

  function randomFreeSpot(minFrom, minDist) {
    const w = S.world;
    for (let i = 0; i < 80; i++) {
      const c = w.reach[Math.floor(Math.random() * w.reach.length)];
      const p = { x: cellX(c), y: cellY(c) };
      let ok = true;
      for (const f of minFrom) if (dist(p, f) < minDist) { ok = false; break; }
      for (const o of S.cigs) if (dist(p, o) < 120) { ok = false; break; }
      for (const o of S.snacks) if (dist(p, o) < 120) { ok = false; break; }
      if (ok) return p;
    }
    const c = w.reach[Math.floor(Math.random() * w.reach.length)];
    return { x: cellX(c), y: cellY(c) };
  }

  function spawnCig(initial) {
    const avoid = [S.chars.tuki];
    if (initial) avoid.push(S.world.spawnC);
    const p = randomFreeSpot(avoid, initial ? 250 : 350);
    S.cigs.push({ id: S.nextId++, x: p.x, y: p.y });
  }
  function spawnSnack() {
    const p = randomFreeSpot([S.chars.ciccio], 300);
    S.snacks.push({ id: S.nextId++, x: p.x, y: p.y, k: Math.floor(Math.random() * 3) });
  }

  // ---------- fisica ----------
  function collide(c) {
    const w = S.world;
    for (const o of w.circles) {
      const dx = c.x - o.x, dy = c.y - o.y, d = Math.hypot(dx, dy), m = o.r + c.r * 0.85;
      if (d < m && d > 1e-4) { c.x = o.x + dx / d * m; c.y = o.y + dy / d * m; }
    }
    for (const r of w.rects) {
      const px = clamp(c.x, r.x, r.x + r.w), py = clamp(c.y, r.y, r.y + r.h);
      const dx = c.x - px, dy = c.y - py, d = Math.hypot(dx, dy), m = c.r * 0.85;
      if (d < m) {
        if (d > 1e-4) { c.x = px + dx / d * m; c.y = py + dy / d * m; }
        else { c.y = r.y - m; }
      }
    }
    const m = BORDER + c.r * 0.8;
    c.x = clamp(c.x, m, W - m); c.y = clamp(c.y, m, H - m);
  }

  function moveChar(c, ix, iy, dt) {
    let speed;
    const mul = c.ctrl === 'cpu' ? dOf(c).mul : 1;
    if (c.role === 'ciccio') {
      if (c.stunT > 0) speed = 0;
      else {
        const wantSprint = c.sprintReq && (ix || iy);
        if (c.energy <= 0) c.exhausted = true;
        if (c.exhausted && c.energy > 25) c.exhausted = false;
        c.sprint = wantSprint && !c.exhausted;
        speed = (c.sprint ? C_SPRINT : C_SPEED) * mul;
      }
      if (c.sprint && c.stunT <= 0) c.energy = Math.max(0, c.energy - 34 * dt);
      else c.energy = Math.min(100, c.energy + 6 * dt);
    } else speed = T_SPEED * mul;
    const k = Math.min(1, dt * 10);
    c.vx += (ix * speed - c.vx) * k;
    c.vy += (iy * speed - c.vy) * k;
    c.x += c.vx * dt; c.y += c.vy * dt;
    collide(c);
    c.moving = Math.hypot(c.vx, c.vy) > 25;
    if (Math.abs(c.vx) > 20) c.dir = c.vx > 0 ? 1 : -1;
  }

  function inBush(c) {
    for (const b of S.world.bushes) if (Math.hypot(c.x - b.x, c.y - b.y) < b.r * 0.75) return b;
    return null;
  }

  function los(ax, ay, bx, by) {
    const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d / 14);
    for (let i = 1; i < n; i++) {
      const x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n;
      if (S.world.blocked[cellOf(x, y)]) return false;
    }
    return true;
  }

  // ---------- IA ----------
  function nearestReachable(c, field) {
    if (field[c] >= 0) return c;
    const cx = c % COLS, cy = (c / COLS) | 0;
    let best = -1, bd = 1e9;
    for (let r = 1; r <= 4 && best < 0; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        const j = ny * COLS + nx;
        if (field[j] >= 0 && field[j] < bd) { bd = field[j]; best = j; }
      }
    }
    return best;
  }

  function followField(c, field, tx, ty) {
    let cell = nearestReachable(cellOf(c.x, c.y), field);
    if (cell < 0) return norm(tx - c.x, ty - c.y);
    if (field[cell] <= 1 || (Math.hypot(tx - c.x, ty - c.y) < 220 && los(c.x, c.y, tx, ty))) return norm(tx - c.x, ty - c.y);
    let cur = cell;
    for (let s = 0; s < 3; s++) {
      const cx = cur % COLS, cy = (cur / COLS) | 0;
      let best = cur;
      for (let k = 0; k < 8; k++) {
        const nx = cx + NB[k][0], ny = cy + NB[k][1];
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        const j = ny * COLS + nx;
        if (field[j] >= 0 && field[j] < field[best]) best = j;
      }
      if (best === cur) break;
      if (s > 0 && !los(c.x, c.y, cellX(best), cellY(best))) break;
      cur = best;
    }
    if (cur === cell) return norm(tx - c.x, ty - c.y);
    return norm(cellX(cur) - c.x, cellY(cur) - c.y);
  }

  function unstick(c, v, dt) {
    const ai = c.ai;
    if (ai.jitterT > 0) { ai.jitterT -= dt; return ai.jitter; }
    ai.stuckT += dt;
    if (ai.stuckT > 0.6) {
      const moved = Math.hypot(c.x - ai.lastPos.x, c.y - ai.lastPos.y);
      ai.lastPos = { x: c.x, y: c.y }; ai.stuckT = 0;
      if (moved < 12 && (v.x || v.y)) {
        const a = Math.random() * Math.PI * 2;
        ai.jitter = { x: Math.cos(a), y: Math.sin(a) }; ai.jitterT = 0.35;
        return ai.jitter;
      }
    }
    return v;
  }

  function aiCiccio(c, dt) {
    const t = S.chars.tuki, ai = c.ai, w = S.world;
    const d = dist(c, t);
    const hidden = t.inBush && d > HIDE_SEE_DIST;
    if (!hidden) ai.lastSeen = { x: t.x, y: t.y };
    ai.t -= dt;
    if (ai.t <= 0 || !ai.field) {
      ai.t = dOf(c).repath;
      let target;
      if (!hidden) {
        const look = Math.min(0.5, d / 500);
        target = { x: t.x + t.vx * look, y: t.y + t.vy * look };
      } else if (ai.lastSeen && dist(c, ai.lastSeen) > 60) {
        target = ai.lastSeen;
      } else {
        // aspetta vicino alla sigaretta più vicina all'ultimo avvistamento
        const ref = ai.lastSeen || c;
        let best = null, bd = 1e9;
        for (const g of S.cigs) { const dd = dist(ref, g); if (dd < bd) { bd = dd; best = g; } }
        target = best || { x: W / 2, y: H / 2 };
        if (best && dist(c, best) < 50) ai.lastSeen = null;
      }
      // fame: va a mangiare se è scarico e il tucano è lontano
      if (c.energy < 30 && (d > 380 || hidden)) {
        let best = null, bd = 1e9;
        for (const s of S.snacks) { const dd = dist(c, s); if (dd < bd) { bd = dd; best = s; } }
        if (best && bd < 500) target = best;
      }
      target = { x: clamp(target.x, 40, W - 40), y: clamp(target.y, 40, H - 40) };
      const tc = nearestReachable(cellOf(target.x, target.y), w.reachField);
      ai.field = bfsRaw(w.blocked, tc >= 0 ? tc : cellOf(target.x, target.y));
      ai.target = target;
    }
    let v = followField(c, ai.field, ai.target.x, ai.target.y);
    v = unstick(c, v, dt);
    c.sprintReq = !hidden && d < 300 && c.energy > 10;
    return v;
  }

  function aiTuki(c, dt) {
    const ci = S.chars.ciccio, ai = c.ai, w = S.world;
    ai.t -= dt;
    const d = dist(c, ci);
    if (ai.t <= 0 || !ai.field) {
      ai.t = dOf(c).repath;
      const dC = bfsRaw(w.blocked, nearestReachable(cellOf(ci.x, ci.y), w.reachField));
      const myCell = nearestReachable(cellOf(c.x, c.y), w.reachField);
      const dT = bfsRaw(w.blocked, myCell);
      const stunned = ci.stunT > 0;
      let best = -1, bestScore = -1e9;
      // sigarette sicure
      for (const g of S.cigs) {
        const gc = nearestReachable(cellOf(g.x, g.y), w.reachField);
        if (gc < 0 || dT[gc] < 0) continue;
        const margin = (dC[gc] < 0 ? 99 : dC[gc]) - dT[gc];
        if (margin >= (stunned ? 1 : 4)) {
          const score = 100 - dT[gc] + margin * 0.5;
          if (score > bestScore) { bestScore = score; best = gc; }
        }
      }
      if (best < 0) {
        for (const cc of w.cand) {
          if (dT[cc] < 0) continue;
          const dc = dC[cc] < 0 ? 99 : dC[cc];
          let score = Math.min(dc, 30) * 1.0 - dT[cc] * 0.35;
          if (dT[cc] >= dc) score -= 40;
          for (const b of w.bushes) if (Math.hypot(cellX(cc) - b.x, cellY(cc) - b.y) < 30 && dc > 8) score += 6;
          if (score > bestScore) { bestScore = score; best = cc; }
        }
        // isteresi per non tremolare
        if (ai.tgtCell >= 0 && dT[ai.tgtCell] >= 0 && best !== ai.tgtCell) {
          const dc = dC[ai.tgtCell] < 0 ? 99 : dC[ai.tgtCell];
          let prev = Math.min(dc, 30) - dT[ai.tgtCell] * 0.35;
          if (dT[ai.tgtCell] >= dc) prev -= 40;
          if (prev > bestScore - 3 && dist({ x: cellX(ai.tgtCell), y: cellY(ai.tgtCell) }, c) > 40) best = ai.tgtCell;
        }
      }
      if (best < 0) best = myCell;
      ai.tgtCell = best;
      ai.target = { x: cellX(best), y: cellY(best) };
      ai.field = bfsRaw(w.blocked, best);
    }
    let v = followField(c, ai.field, ai.target.x, ai.target.y);
    if (d < 150 && ci.stunT <= 0) {
      const away = norm(c.x - ci.x, c.y - ci.y);
      v = norm(v.x * 0.6 + away.x * 0.4, v.y * 0.6 + away.y * 0.4);
    }
    v = unstick(c, v, dt);
    // nuvola di fumo quando il ciccione è vicino
    c.actReq = d < 130 && c.smokeCd <= 0 && ci.stunT <= 0 && Math.random() < dOf(c).react * dt * 8;
    return v;
  }

  // ---------- eventi ----------
  function emit(ev) {
    applyEvent(ev);
    if (cfg.mode === 'online' && cfg.isHost) Net.send({ t: 'ev', e: ev });
  }

  function popup(x, y, text, col) { S.popups.push({ x, y, text, col: col || '#fff', t: 0 }); }

  function applyEvent(ev) {
    const C = S.chars.ciccio, T = S.chars.tuki;
    switch (ev.k) {
      case 'pickup':
        popup(ev.x, ev.y - 20, '+1 🚬', '#ffe27a');
        if (cfg.myRole === 'tuki' || cfg.myRole == null) Sound.sfx.pickup(); else Sound.sfx.tick();
        break;
      case 'eat':
        popup(ev.x, ev.y - 30, 'GNAM!', '#ffb36b');
        Sound.sfx.eat();
        if (own(C)) { C.energy = Math.min(100, C.energy + 45); C.exhausted = false; }
        C.eatT = 0.7;
        break;
      case 'smoke':
        Sound.sfx.smoke();
        break;
      case 'stun':
        if (own(C)) C.stunT = STUN_TIME;
        Sound.sfx.cough();
        popup(C.x, C.y - 60, 'COF COF!', '#ddd');
        if (cfg.myRole === 'ciccio' && navigator.vibrate) navigator.vibrate(120);
        break;
      case 'end':
        if (S.phase === 'end') return;
        S.phase = 'end'; S.result = ev.r; S.endT = 0;
        if (ev.r.reason === 'caught') {
          S.shake = 0.5; T.caught = true;
          if (navigator.vibrate) navigator.vibrate([80, 60, 160]);
        }
        const iWin = cfg.myRole ? ev.r.winner === cfg.myRole : true;
        if (ev.r.reason === 'caught') Sound.sfx.caught();
        setTimeout(() => iWin ? Sound.sfx.win() : Sound.sfx.lose(), ev.r.reason === 'caught' ? 900 : 100);
        break;
    }
  }

  // ---------- aggiornamento ----------
  function update(dt) {
    const C = S.chars.ciccio, T = S.chars.tuki;
    for (const c of [C, T]) c.t += dt;
    C.eatT = Math.max(0, C.eatT - dt);
    if (own(C)) C.stunT = Math.max(0, C.stunT - dt);

    if (S.phase === 'count') {
      S.countT -= dt;
      const n = Math.ceil(S.countT);
      if (n < S.lastCount && n > 0) { S.lastCount = n; Sound.sfx.count(); }
      if (S.countT <= 0) { S.phase = 'play'; Sound.sfx.go(); }
    }
    if (S.phase === 'end') S.endT += dt;

    // movimento personaggi
    for (const c of [C, T]) {
      if (c.ctrl === 'remote') { smoothRemote(c, dt); continue; }
      let v = { x: 0, y: 0 };
      if (S.phase === 'play') {
        if (c.ctrl === 'local') {
          v = { x: input.x, y: input.y };
          c.sprintReq = input.action;
          if (input.actionPressed) c.actReq = true;
        } else v = c.role === 'ciccio' ? aiCiccio(c, dt) : aiTuki(c, dt);
      } else { c.sprintReq = false; c.actReq = false; }
      if (c.caught) v = { x: 0, y: 0 };
      moveChar(c, v.x, v.y, dt);
    }
    input.actionPressed = false;
    T.inBush = !!inBush(T);
    if (T.inBush && !T.wasInBush && cfg.myRole === 'tuki') Sound.sfx.hide();
    T.wasInBush = T.inBush;

    // azione del tucano
    if (T.actReq) {
      T.actReq = false;
      if (S.phase === 'play' && T.smokeCd <= 0) {
        if (isAuth()) doSmoke();
        else Net.send({ t: 'act' });
      }
    }
    if (S.pendingAct) { S.pendingAct = false; if (T.smokeCd <= 0 && S.phase === 'play') doSmoke(); }

    // nuvole
    for (const cl of S.clouds) cl.age += dt;
    S.clouds = S.clouds.filter(cl => cl.age < CLOUD_LIFE);

    if (isAuth()) authUpdate(dt);
    else T.smokeCd = Math.max(0, T.smokeCd - dt);

    // particelle di fumo dalla sigaretta del tucano
    S.smokeT -= dt;
    if (S.smokeT <= 0 && !T.caught) {
      S.smokeT = 0.07;
      const tip = Art.tukiCigTip(T.x, T.y, T.r * 1.2, T.dir);
      S.particles.push({ x: tip.x, y: tip.y - 18, vx: (Math.random() - 0.5) * 12, vy: -18 - Math.random() * 10, r: 3, life: 1.6, t: 0 });
    }
    for (const p of S.particles) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += dt * 6; }
    S.particles = S.particles.filter(p => p.t < p.life);
    for (const p of S.popups) p.t += dt;
    S.popups = S.popups.filter(p => p.t < 1.2);
    S.shake = Math.max(0, S.shake - dt);

    // rete
    if (cfg.mode === 'online') netTick(dt);

    if (S.phase === 'end' && S.endT > 1.8 && !S.endNotified) {
      S.endNotified = true;
      callbacks.onEnd && callbacks.onEnd(S.result, cfg);
    }
  }

  function doSmoke() {
    const T = S.chars.tuki;
    T.smokeCd = SMOKE_CD;
    S.clouds.push({ id: S.nextId++, x: T.x, y: T.y, age: 0, hit: false });
    emit({ k: 'smoke' });
  }

  function authUpdate(dt) {
    const C = S.chars.ciccio, T = S.chars.tuki;
    T.smokeCd = Math.max(0, T.smokeCd - dt);
    if (S.phase !== 'play') return;
    S.time -= dt;
    // sigarette
    for (let i = S.cigs.length - 1; i >= 0; i--) {
      const g = S.cigs[i];
      if (Math.hypot(T.x - g.x, T.y - g.y) < T.r + 18) {
        S.cigs.splice(i, 1); T.cigs++;
        emit({ k: 'pickup', x: g.x, y: g.y });
        if (T.cigs >= CIG_GOAL) { emit({ k: 'end', r: { winner: 'tuki', reason: 'cigs' } }); return; }
        spawnCig(false);
      }
    }
    // cibo
    for (let i = S.snacks.length - 1; i >= 0; i--) {
      const s = S.snacks[i];
      if (Math.hypot(C.x - s.x, C.y - s.y) < C.r + 16) {
        S.snacks.splice(i, 1);
        emit({ k: 'eat', x: s.x, y: s.y });
        S.snackTimers.push(5);
      }
    }
    for (let i = S.snackTimers.length - 1; i >= 0; i--) {
      S.snackTimers[i] -= dt;
      if (S.snackTimers[i] <= 0) { S.snackTimers.splice(i, 1); spawnSnack(); }
    }
    // nuvole che stordiscono
    for (const cl of S.clouds) {
      const r = cloudRadius(cl);
      if (!cl.hit && cl.age < CLOUD_LIFE - 0.5 && C.stunT <= 0 && Math.hypot(C.x - cl.x, C.y - cl.y) < r + C.r * 0.3) {
        cl.hit = true; emit({ k: 'stun' });
      }
    }
    // presa!
    const cStun = C.ctrl === 'remote' ? C.netStun : C.stunT > 0;
    if (!cStun && Math.hypot(C.x - T.x, C.y - T.y) < C.r + T.r - 8) {
      emit({ k: 'end', r: { winner: 'ciccio', reason: 'caught' } });
      return;
    }
    if (S.time <= 0) { S.time = 0; emit({ k: 'end', r: { winner: 'tuki', reason: 'time' } }); }
  }

  function cloudRadius(cl) { return CLOUD_R * Math.min(1, 0.35 + cl.age * 1.6); }

  // ---------- rete ----------
  function smoothRemote(c, dt) {
    const age = Math.min(0.25, (performance.now() - c.nAt) / 1000);
    const tx = c.nx + c.nvx * age, ty = c.ny + c.nvy * age;
    const k = Math.min(1, dt * 14);
    if (Math.hypot(tx - c.x, ty - c.y) > 250) { c.x = tx; c.y = ty; }
    c.x += (tx - c.x) * k; c.y += (ty - c.y) * k;
    c.vx = c.nvx; c.vy = c.nvy;
    c.moving = Math.hypot(c.vx, c.vy) > 25;
  }

  function netTick(dt) {
    const mine = me();
    netTimers.p -= dt; netTimers.w -= dt;
    if (netTimers.p <= 0) {
      netTimers.p = 0.05;
      Net.send({ t: 'p', x: Math.round(mine.x), y: Math.round(mine.y), vx: Math.round(mine.vx), vy: Math.round(mine.vy), d: mine.dir, st: mine.stunT > 0 ? 1 : 0, sp: mine.sprint ? 1 : 0, en: Math.round(mine.energy) });
    }
    if (cfg.isHost && netTimers.w <= 0) {
      netTimers.w = 0.1;
      Net.send({
        t: 'w', tm: +S.time.toFixed(2), ph: S.phase, tc: S.chars.tuki.cigs, cd: +S.chars.tuki.smokeCd.toFixed(2),
        cg: S.cigs.map(g => [g.id, Math.round(g.x), Math.round(g.y)]),
        sn: S.snacks.map(s => [s.id, Math.round(s.x), Math.round(s.y), s.k]),
        cl: S.clouds.map(c => [c.id, Math.round(c.x), Math.round(c.y), +c.age.toFixed(2)]),
      });
    }
  }

  function onNetData(d) {
    if (!S || !d) return;
    const opp = S.chars[other(cfg.myRole)];
    switch (d.t) {
      case 'p':
        opp.nx = d.x; opp.ny = d.y; opp.nvx = d.vx; opp.nvy = d.vy; opp.dir = d.d; opp.nAt = performance.now();
        opp.netStun = !!d.st; opp.sprint = !!d.sp;
        if (opp.role === 'ciccio') { opp.energy = d.en; opp.stunT = d.st ? 1 : 0; }
        break;
      case 'w':
        if (cfg.isHost) break;
        S.time = d.tm; S.chars.tuki.cigs = d.tc; S.chars.tuki.smokeCd = d.cd;
        if (d.ph === 'play' && S.phase === 'count') { S.phase = 'play'; S.countT = 0; }
        S.cigs = d.cg.map(a => ({ id: a[0], x: a[1], y: a[2] }));
        S.snacks = d.sn.map(a => ({ id: a[0], x: a[1], y: a[2], k: a[3] }));
        S.clouds = d.cl.map(a => ({ id: a[0], x: a[1], y: a[2], age: a[3] }));
        break;
      case 'ev':
        if (!cfg.isHost) {
          if (d.e.k === 'smoke') { /* le nuvole arrivano con lo stato */ }
          applyEvent(d.e);
        }
        break;
      case 'act':
        if (cfg.isHost) S.pendingAct = true;
        break;
    }
  }

  // ---------- disegno ----------
  function resize() {
    const vv = window.visualViewport;
    vw = Math.round(vv ? vv.width : window.innerWidth);
    vh = Math.round(vv ? vv.height : window.innerHeight);
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
    canvas.style.width = vw + 'px'; canvas.style.height = vh + 'px';
    scale = clamp(Math.min(vw, vh) / 470, 0.7, 1.6);
    const el = document.getElementById('safe');
    if (el) {
      const cs = getComputedStyle(el);
      safe = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
    }
    if (S) buildStatic();
  }

  function buildStatic() {
    const k = Math.min(2, Math.max(1, scale * dpr), 4096 / W);
    if (staticLayer && Math.abs(k - staticK) < 0.05 && staticLayer.seed === S.world.seed) return;
    staticK = k;
    const w = S.world;
    const base = Art.ground(W, H, mulberry32(w.seed + 1));
    const c = document.createElement('canvas');
    c.width = Math.round(W * k); c.height = Math.round(H * k);
    const g = c.getContext('2d');
    g.scale(k, k);
    g.drawImage(base, 0, 0);
    for (const o of w.circles) {
      g.fillStyle = 'rgba(0,0,0,0.2)'; Art.ell(g, o.x + 8, o.y + 10, o.r * 1.05, o.r * 0.95); g.fill();
    }
    for (const r of w.rects) Art.table(g, r.x, r.y, r.w, r.h);
    for (const o of w.circles) {
      if (o.kind === 'palm') Art.palm(g, o.x, o.y, o.r * 1.15, o.s);
      else if (o.kind === 'tree') Art.tree(g, o.x, o.y, o.r);
      else Art.rock(g, o.x, o.y, o.r);
    }
    staticLayer = c; staticLayer.seed = w.seed;
    // minimappa
    const ms = 0.075;
    const m = document.createElement('canvas');
    m.width = Math.round(W * ms * 2); m.height = Math.round(H * ms * 2);
    const mg = m.getContext('2d');
    mg.scale(ms * 2, ms * 2);
    mg.fillStyle = 'rgba(60,120,50,0.85)'; mg.fillRect(0, 0, W, H);
    mg.fillStyle = 'rgba(30,90,40,0.95)';
    for (const b of w.bushes) { Art.circ(mg, b.x, b.y, b.r * 0.8); mg.fill(); }
    mg.fillStyle = 'rgba(20,50,20,1)';
    for (const o of w.circles) { Art.circ(mg, o.x, o.y, o.r); mg.fill(); }
    mg.fillStyle = '#7a4a24';
    for (const r of w.rects) mg.fillRect(r.x, r.y, r.w, r.h);
    miniLayer = m; miniLayer.ms = ms;
  }

  function opponentVisible() {
    if (!cfg.myRole) return true;
    const T = S.chars.tuki;
    if (cfg.myRole === 'tuki') return true;
    if (S.phase === 'end') return true;
    return !(T.inBush && dist(S.chars.ciccio, T) > HIDE_SEE_DIST);
  }

  function render() {
    const C = S.chars.ciccio, T = S.chars.tuki, m = me();
    // camera
    const k = Math.min(1, 0.15);
    S.cam.x += (m.x - S.cam.x) * k; S.cam.y += (m.y - S.cam.y) * k;
    const halfW = vw / 2 / scale, halfH = vh / 2 / scale;
    let cx = halfW * 2 >= W ? W / 2 : clamp(S.cam.x, halfW, W - halfW);
    let cy = halfH * 2 >= H ? H / 2 : clamp(S.cam.y, halfH, H - halfH);
    if (S.shake > 0) { cx += (Math.random() - 0.5) * 20 * S.shake; cy += (Math.random() - 0.5) * 20 * S.shake; }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#2f5d2a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const sx = dpr * scale;
    ctx.setTransform(sx, 0, 0, sx, dpr * (vw / 2 - cx * scale), dpr * (vh / 2 - cy * scale));

    // livello statico (solo la parte visibile)
    const vx0 = Math.max(0, cx - halfW), vy0 = Math.max(0, cy - halfH);
    const vx1 = Math.min(W, cx + halfW), vy1 = Math.min(H, cy + halfH);
    if (vx1 > vx0 && vy1 > vy0)
      ctx.drawImage(staticLayer, vx0 * staticK, vy0 * staticK, (vx1 - vx0) * staticK, (vy1 - vy0) * staticK, vx0, vy0, vx1 - vx0, vy1 - vy0);

    const tt = performance.now() / 1000;
    for (const s of S.snacks) Art.snack(ctx, s.x, s.y, s.k, tt);
    for (const g of S.cigs) Art.cigarette(ctx, g.x, g.y, tt);

    // personaggi ordinati per y
    const tVis = opponentVisible();
    T.rx = T.x; T.ry = T.y;
    const drawT = () => {
      if (T.caught && S.phase === 'end') {
        // il tucano sparisce nella bocca
        const p = Math.min(1, S.endT * 1.5);
        if (p >= 1) return;
        ctx.save(); ctx.translate(T.x + (C.x - T.x) * p, T.y + (C.y - 10 - T.y) * p); ctx.scale(1 - p, 1 - p);
        Art.tuki(ctx, 0, 0, T.r, { dir: T.dir, t: T.t * 3, moving: true });
        ctx.restore(); return;
      }
      if (!tVis) return;
      let a = 1;
      if (T.inBush) a = cfg.myRole === 'tuki' ? 0.7 : 0.55;
      Art.tuki(ctx, T.x, T.y, T.r * 1.2, { dir: T.dir, t: T.t, moving: T.moving, alpha: a });
    };
    const drawC = () => Art.ciccio(ctx, C.x, C.y, C.r, {
      dir: C.dir, t: C.t, moving: C.moving, sprint: C.sprint && C.moving,
      stun: C.stunT > 0 || C.netStun, eat: C.eatT > 0 || (T.caught && S.phase === 'end' && S.endT < 1.5),
      look: norm(C.vx, C.vy),
    });
    if (C.y < T.y) { drawC(); drawT(); } else { drawT(); drawC(); }

    // cespugli sopra ai personaggi
    const myBush = inBush(m);
    for (const b of S.world.bushes) {
      let a = 1;
      if (b === myBush) a = 0.5;
      else if (cfg.myRole === 'ciccio' && T.inBush && tVis && Math.hypot(T.x - b.x, T.y - b.y) < b.r) a = 0.65;
      Art.bush(ctx, b.x, b.y, b.r, a, tt);
    }
    if (T.inBush && tVis && cfg.myRole === 'ciccio' && S.phase !== 'end') {
      Art.tuki(ctx, T.x, T.y, T.r * 1.2, { dir: T.dir, t: T.t, moving: T.moving, alpha: 0.35 });
    }

    // fumo
    for (const p of S.particles) {
      const a = (1 - p.t / p.life) * 0.5;
      ctx.fillStyle = `rgba(215,215,220,${a})`; Art.circ(ctx, p.x, p.y, p.r); ctx.fill();
    }
    for (const cl of S.clouds) drawCloud(cl, tt);

    // scritte
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const p of S.popups) {
      const a = 1 - p.t / 1.2;
      ctx.font = 'bold 26px system-ui, sans-serif';
      ctx.lineWidth = 5; ctx.strokeStyle = `rgba(43,26,16,${a})`;
      ctx.fillStyle = p.col; ctx.globalAlpha = a;
      ctx.strokeText(p.text, p.x, p.y - p.t * 40); ctx.fillText(p.text, p.x, p.y - p.t * 40);
      ctx.globalAlpha = 1;
    }
    // indicatore "sei tu"
    if (cfg.myRole && S.phase === 'count') {
      const bob = Math.sin(tt * 6) * 5;
      ctx.fillStyle = '#ffe27a'; ctx.strokeStyle = '#2b1a10'; ctx.lineWidth = 3;
      ctx.beginPath(); const y0 = m.y - m.r * 2.3 + bob;
      ctx.moveTo(m.x - 12, y0 - 14); ctx.lineTo(m.x + 12, y0 - 14); ctx.lineTo(m.x, y0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.strokeText('TU', m.x, y0 - 30); ctx.fillStyle = '#fff'; ctx.fillText('TU', m.x, y0 - 30);
    }

    drawHUD(cx, cy, halfW, halfH, tVis, tt);
  }

  function drawCloud(cl, tt) {
    const r = cloudRadius(cl);
    const fade = cl.age > CLOUD_LIFE - 0.8 ? (CLOUD_LIFE - cl.age) / 0.8 : 1;
    ctx.save(); ctx.globalAlpha = 0.85 * fade;
    for (let i = 0; i < 9; i++) {
      const a = i * 0.7 + cl.id + tt * 0.3;
      const rr = r * (0.45 + (i % 3) * 0.12);
      const ox = Math.cos(a) * r * 0.5, oy = Math.sin(a) * r * 0.45;
      ctx.fillStyle = i % 2 ? '#c9c9cf' : '#b3b3bb';
      Art.circ(ctx, cl.x + ox, cl.y + oy, rr); ctx.fill();
    }
    ctx.fillStyle = '#d8d8de'; Art.circ(ctx, cl.x, cl.y, r * 0.55); ctx.fill();
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawHUD(cx, cy, halfW, halfH, tVis, tt) {
    const C = S.chars.ciccio, T = S.chars.tuki;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const top = safe.t + 10, left = safe.l + 10, right = vw - safe.r - 10;
    const small = vw < 430;
    const miniW = miniLayer ? miniLayer.width / 2 * (small ? 0.8 : 1) : 0;
    ctx.textBaseline = 'middle';

    // tempo
    const secs = Math.ceil(S.time);
    const tw = 92;
    roundRect(vw / 2 - tw / 2, top, tw, 40, 12); ctx.fillStyle = 'rgba(43,26,16,0.75)'; ctx.fill();
    ctx.font = 'bold 24px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = secs <= 10 && S.phase === 'play' && Math.floor(tt * 4) % 2 ? '#ff6b5b' : '#fff';
    ctx.fillText(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, vw / 2, top + 21);

    // sigarette
    roundRect(left, top, small ? 104 : 120, 40, 12); ctx.fillStyle = 'rgba(43,26,16,0.75)'; ctx.fill();
    ctx.save(); ctx.translate(left + 22, top + 20); ctx.scale(0.6, 0.6);
    ctx.rotate(-0.5); ctx.fillStyle = '#f7f7f7'; ctx.fillRect(-16, -4, 32, 8); ctx.fillStyle = '#e09a4a'; ctx.fillRect(-16, -4, 10, 8); ctx.fillStyle = '#ff6a1a'; ctx.fillRect(13, -4, 3, 8);
    ctx.restore();
    ctx.textAlign = 'left'; ctx.fillStyle = '#ffe27a'; ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText(`${T.cigs}/${CIG_GOAL}`, left + 42, top + 21);

    // energia ciccio
    if (cfg.myRole === 'ciccio' || cfg.myRole == null) {
      const bw = Math.max(70, Math.min(160, 2 * (right - miniW - 10 - vw / 2))), bx = vw / 2 - bw / 2, by = top + 48;
      roundRect(bx, by, bw, 16, 8); ctx.fillStyle = 'rgba(43,26,16,0.75)'; ctx.fill();
      const e = C.energy / 100;
      roundRect(bx + 3, by + 3, Math.max(0, (bw - 6) * e), 10, 5);
      ctx.fillStyle = C.exhausted ? '#ff6b5b' : e > 0.4 ? '#ffb347' : '#ff8a3d'; ctx.fill();
      ctx.font = 'bold 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
      ctx.fillText(C.exhausted ? 'HO FAME!' : 'ENERGIA', vw / 2, by + 9);
    }

    // minimappa
    if (miniLayer) {
      const mw = miniLayer.width / 2 * (small ? 0.8 : 1), mh = miniLayer.height / 2 * (small ? 0.8 : 1);
      const mx = right - mw, my = top;
      const ms = mw / W;
      ctx.globalAlpha = 0.9;
      ctx.drawImage(miniLayer, mx, my, mw, mh);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(43,26,16,0.9)'; ctx.lineWidth = 2; ctx.strokeRect(mx, my, mw, mh);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1;
      ctx.strokeRect(mx + (cx - halfW) * ms, my + (cy - halfH) * ms, halfW * 2 * ms, halfH * 2 * ms);
      if (cfg.myRole !== 'ciccio') {
        ctx.fillStyle = '#ffe27a';
        for (const g of S.cigs) { ctx.fillRect(mx + g.x * ms - 2, my + g.y * ms - 2, 4, 4); }
      }
      if (cfg.myRole !== 'tuki') {
        ctx.fillStyle = '#ff7fb5';
        for (const s of S.snacks) { ctx.beginPath(); ctx.arc(mx + s.x * ms, my + s.y * ms, 2.5, 0, 7); ctx.fill(); }
      }
      const dot = (c, col, r) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(mx + c.x * ms, my + c.y * ms, r, 0, 7); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke(); };
      if (tVis) dot(T, '#ff9a1a', 4);
      dot(C, '#f5bf98', 5);
    }

    // freccia verso l'avversario fuori schermo
    if (cfg.myRole && tVis && S.phase === 'play') {
      const o = S.chars[other(cfg.myRole)];
      const sxp = (o.x - cx) * scale + vw / 2, syp = (o.y - cy) * scale + vh / 2;
      const mg = 40;
      if (sxp < 0 || syp < 0 || sxp > vw || syp > vh) {
        const ax = clamp(sxp, mg + safe.l, vw - mg - safe.r), ay = clamp(syp, mg + 70 + safe.t, vh - mg - safe.b);
        const ang = Math.atan2(syp - vh / 2, sxp - vw / 2);
        ctx.save(); ctx.translate(ax, ay); ctx.rotate(ang);
        ctx.fillStyle = cfg.myRole === 'ciccio' ? '#ff9a1a' : '#ff5b4b';
        ctx.strokeStyle = '#2b1a10'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-10, -13); ctx.lineTo(-4, 0); ctx.lineTo(-10, 13); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
    }

    // stato nascosto
    if (cfg.myRole === 'tuki' && T.inBush && S.phase === 'play') banner('Sei nascosto! 🌿', vh - safe.b - 150, '#b7f5a0');
    if (cfg.myRole === 'ciccio' && C.stunT > 0) banner('Stordito dal fumo!', vh - safe.b - 150, '#ddd');
    if (cfg.myRole === 'ciccio' && C.exhausted && C.stunT <= 0 && S.phase === 'play') banner('Senza energia: mangia qualcosa!', vh - safe.b - 150, '#ffb36b');

    // conto alla rovescia
    if (S.phase === 'count') {
      const n = Math.ceil(S.countT);
      const txt = n > 0 ? String(n) : 'VIA!';
      const p = 1 - (S.countT - Math.floor(S.countT));
      ctx.textAlign = 'center';
      ctx.font = `900 ${Math.round(90 + p * 30)}px system-ui, sans-serif`;
      ctx.lineWidth = 10; ctx.strokeStyle = '#2b1a10'; ctx.fillStyle = '#ffe27a';
      ctx.strokeText(txt, vw / 2, vh * 0.3); ctx.fillText(txt, vw / 2, vh * 0.3);
      if (cfg.myRole) {
        const msg = cfg.myRole === 'ciccio' ? 'Sei CICCIO: acchiappa il tucano!' : 'Sei TUK: raccogli 12 sigarette e scappa!';
        ctx.font = 'bold 20px system-ui, sans-serif'; ctx.lineWidth = 6;
        ctx.strokeText(msg, vw / 2, vh / 2 + 90); ctx.fillStyle = '#fff'; ctx.fillText(msg, vw / 2, vh / 2 + 90);
      }
    }
    if (S.phase === 'end' && S.result) {
      const iWin = cfg.myRole ? S.result.winner === cfg.myRole : true;
      const txt = S.result.reason === 'caught' ? 'GNAM!!!' : (S.result.reason === 'cigs' ? 'PACCHETTO COMPLETO!' : 'TEMPO SCADUTO!');
      ctx.textAlign = 'center';
      ctx.font = `900 ${vw < 420 ? 38 : 56}px system-ui, sans-serif`;
      ctx.lineWidth = 10; ctx.strokeStyle = '#2b1a10'; ctx.fillStyle = iWin ? '#ffe27a' : '#ff8a7a';
      ctx.strokeText(txt, vw / 2, vh / 2); ctx.fillText(txt, vw / 2, vh / 2);
    }

    // joystick
    if (joy.id !== null) {
      ctx.globalAlpha = 0.35; ctx.fillStyle = '#fff';
      Art.circ(ctx, joy.ox, joy.oy, 60); ctx.fill();
      ctx.globalAlpha = 0.7; ctx.fillStyle = '#fff';
      Art.circ(ctx, joy.ox + input.x * 50, joy.oy + input.y * 50, 26); ctx.fill();
      ctx.globalAlpha = 1;
    } else if (S.phase !== 'end' && cfg.myRole && 'ontouchstart' in window && S.time > ROUND_TIME - 6) {
      ctx.textAlign = 'center'; ctx.font = 'bold 15px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText('Trascina il dito per muoverti', vw * 0.32, vh - safe.b - 60);
    }

    // pulsante azione (aggiorna stile)
    updateActionBtn();
  }

  function banner(text, y, col) {
    ctx.textAlign = 'center'; ctx.font = 'bold 18px system-ui, sans-serif';
    const w = ctx.measureText(text).width + 28;
    roundRect(vw / 2 - w / 2, y - 17, w, 34, 17); ctx.fillStyle = 'rgba(43,26,16,0.75)'; ctx.fill();
    ctx.fillStyle = col; ctx.fillText(text, vw / 2, y + 1);
  }

  function updateActionBtn() {
    if (!actionBtn) return;
    if (!cfg.myRole || S.phase === 'end') { actionBtn.style.display = 'none'; return; }
    actionBtn.style.display = 'flex';
    if (cfg.myRole === 'tuki') {
      const cd = S.chars.tuki.smokeCd;
      const p = 1 - cd / SMOKE_CD;
      actionBtn.dataset.ready = cd <= 0 ? '1' : '0';
      actionBtn.style.setProperty('--p', (p * 100).toFixed(1) + '%');
      actionBtn.querySelector('.lbl').textContent = cd <= 0 ? 'FUMO' : Math.ceil(cd) + 's';
      actionBtn.querySelector('.ico').textContent = '💨';
    } else {
      const C = S.chars.ciccio;
      actionBtn.dataset.ready = C.exhausted ? '0' : '1';
      actionBtn.style.setProperty('--p', C.energy.toFixed(1) + '%');
      actionBtn.querySelector('.lbl').textContent = 'SCATTO';
      actionBtn.querySelector('.ico').textContent = '⚡';
    }
  }

  // ---------- input ----------
  function setupInput() {
    canvas.addEventListener('pointerdown', e => {
      Sound.init();
      if (joy.id !== null) return;
      joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY;
      input.x = 0; input.y = 0;
      try { canvas.setPointerCapture(e.pointerId); } catch (er) {}
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', e => {
      if (e.pointerId !== joy.id) return;
      let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy;
      const l = Math.hypot(dx, dy), R = 50;
      if (l > R * 1.6) { joy.ox = e.clientX - dx / l * R * 1.6; joy.oy = e.clientY - dy / l * R * 1.6; dx = e.clientX - joy.ox; dy = e.clientY - joy.oy; }
      const m = Math.min(1, Math.hypot(dx, dy) / R);
      const n = norm(dx, dy);
      const dead = Math.hypot(dx, dy) < 6;
      input.x = dead ? 0 : n.x * m; input.y = dead ? 0 : n.y * m;
      if (m > 0.35) { const k = 1 / Math.max(m, 1e-3); input.x *= k; input.y *= k; } // velocità piena quasi subito
      e.preventDefault();
    });
    const end = e => { if (e.pointerId === joy.id) { joy.id = null; input.x = 0; input.y = 0; } };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    actionBtn = document.getElementById('action');
    actionBtn.addEventListener('pointerdown', e => {
      Sound.init(); input.action = true; input.actionPressed = true;
      if (cfg && cfg.myRole === 'ciccio') Sound.sfx.sprint();
      e.preventDefault(); e.stopPropagation();
    });
    const aEnd = e => { input.action = false; e.preventDefault(); };
    actionBtn.addEventListener('pointerup', aEnd);
    actionBtn.addEventListener('pointercancel', aEnd);
    actionBtn.addEventListener('pointerleave', aEnd);

    window.addEventListener('keydown', e => {
      keys[e.code] = true;
      if (e.code === 'Space') { if (!input.action) input.actionPressed = true; input.action = true; e.preventDefault(); }
      keyInput();
    });
    window.addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'Space') input.action = false; keyInput(); });
  }
  function keyInput() {
    if (joy.id !== null) return;
    const x = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
    const y = (keys.ArrowDown || keys.KeyS ? 1 : 0) - (keys.ArrowUp || keys.KeyW ? 1 : 0);
    const n = norm(x, y); input.x = n.x; input.y = n.y;
  }

  // ---------- ciclo ----------
  function frame(t) {
    if (!running) return;
    rafId = requestAnimationFrame(frame);
    let dt = (t - lastT) / 1000; lastT = t;
    if (!(dt > 0)) dt = 0.016;
    dt = Math.min(dt, 0.05);
    update(dt);
    if (S) render();
  }

  let inited = false;
  function init(cbs) {
    callbacks = cbs || {};
    canvas = document.getElementById('game');
    ctx = canvas.getContext('2d');
    setupInput();
    window.addEventListener('resize', resize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(resize, 200));
    resize();
    inited = true;
  }

  function start(opts) {
    cfg = Object.assign({ mode: 'cpu', myRole: 'ciccio', difficulty: 'normale', seed: Math.floor(Math.random() * 1e9), isHost: true }, opts);
    cfg.diff = DIFF[cfg.difficulty] || DIFF.normale;
    input = { x: 0, y: 0, action: false, actionPressed: false };
    joy.id = null; netTimers = { p: 0, w: 0 };
    newState(cfg.seed);
    resize();
    buildStatic();
    canvas.style.display = 'block';
    running = true; lastT = performance.now();
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false; cancelAnimationFrame(rafId);
    if (actionBtn) actionBtn.style.display = 'none';
    S = null;
  }

  // simulazione veloce senza grafica (per bilanciare il gioco)
  function simulate(seed, dC, dT, maxT = ROUND_TIME + 5) {
    const human = { mul: 1, repath: 0.2, react: 0.9 };
    const pick = (d, r) => d === 'human' ? human : DIFF[d][r];
    cfg = { mode: 'demo', myRole: null, difficulty: dC, seed, isHost: true, diff: DIFF.normale, diffBy: { ciccio: pick(dC, 'ciccio'), tuki: pick(dT || dC, 'tuki') } };
    newState(seed);
    S.phase = 'play';
    const savedSfx = Sound.enabled; if (savedSfx) Sound.toggle();
    let t = 0;
    while (S.phase === 'play' && t < maxT) { update(1 / 60); t += 1 / 60; }
    if (savedSfx) Sound.toggle();
    const r = { result: S.result, cigs: S.chars.tuki.cigs, t };
    S = null;
    return r;
  }

  return { init, start, stop, onNetData, simulate, get state() { return S; }, CIG_GOAL, ROUND_TIME };
})();

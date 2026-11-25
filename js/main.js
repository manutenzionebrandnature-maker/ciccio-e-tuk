// Menu, schermate, partita online e installazione.
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const other = r => r === 'ciccio' ? 'tuki' : 'ciccio';

  let current = 'menu';
  let lastCfg = null;          // ultima partita
  let online = null;           // { isHost, hostRole, round }
  let wakeLock = null;

  // ---------- schermate ----------
  function show(id) {
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
    current = id;
    document.body.classList.toggle('playing', id === null);
    if (id === 'menu') { Sound.startMusic(); }
  }
  function toast(msg, ms = 2600) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms);
  }

  $$('[data-go]').forEach(b => b.addEventListener('click', () => {
    Sound.init(); Sound.sfx.click();
    const go = b.dataset.go;
    if (go === 'host') resetHost();
    if (go === 'join') { $('#joinStatus').textContent = ''; $('#joinStatus').className = 'status'; $('#joinGo').disabled = false; }
    show(go);
    if (go === 'join') setTimeout(() => $('#joinCode').focus(), 50);
  }));

  // gruppi di scelta
  function group(name) {
    const g = document.querySelector(`[data-group="${name}"]`);
    g.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      Sound.init(); Sound.sfx.click();
      g.querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b));
    });
    return () => { const s = g.querySelector('.sel'); return s.dataset.role || s.dataset.v; };
  }
  const cpuRole = group('cpuRole'), diff = group('diff'), hostRole = group('hostRole');

  // suoni
  function refreshToggles() {
    $('#tgSound').classList.toggle('off', !Sound.enabled);
    $('#tgMusic').classList.toggle('off', !Sound.musicOn);
  }
  $('#tgSound').addEventListener('click', () => { Sound.init(); Sound.toggle(); refreshToggles(); Sound.sfx.click(); });
  $('#tgMusic').addEventListener('click', () => { Sound.init(); if (Sound.toggleMusic()) Sound.startMusic(); refreshToggles(); });
  refreshToggles();
  // sblocca l'audio al primo tocco (necessario su iPhone)
  const unlock = () => { Sound.init(); if (current === 'menu') Sound.startMusic(); window.removeEventListener('pointerdown', unlock); };
  window.addEventListener('pointerdown', unlock);

  // ---------- partita ----------
  async function keepAwake() {
    try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => wakeLock = null); } } catch (e) {}
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && current === null) keepAwake(); });

  function play(cfg) {
    lastCfg = cfg;
    Sound.stopMusic();
    show(null);
    keepAwake();
    Game.start(cfg);
  }

  $('#cpuGo').addEventListener('click', () => {
    Sound.init(); Sound.sfx.click();
    play({ mode: 'cpu', myRole: cpuRole(), difficulty: diff() });
  });

  $('#pause').addEventListener('click', () => {
    if (!confirm('Vuoi uscire dalla partita?')) return;
    Game.stop();
    if (lastCfg && lastCfg.mode === 'online') { Net.close(); online = null; }
    show('menu');
  });

  // ---------- fine partita ----------
  const endArt = $('#endArt');
  let endAnim = null;
  function onEnd(result, cfg) {
    const iWin = result.winner === cfg.myRole;
    $('#endTitle').textContent = iWin ? 'HAI VINTO! 🎉' : 'HAI PERSO! 😩';
    const why = {
      caught: cfg.myRole === 'ciccio' ? 'Gnam! Ti sei mangiato il tucano, sigaretta compresa.' : 'Ciccio ti ha mangiato in un boccone!',
      cigs: cfg.myRole === 'tuki' ? 'Hai raccolto tutte e 12 le sigarette. Pacchetto completo!' : 'Il tucano ha raccolto tutte le sigarette.',
      time: cfg.myRole === 'tuki' ? 'Sei sopravvissuto fino alla fine. Ciccio resta a bocca asciutta!' : 'Tempo scaduto: il tucano è scappato.',
    }[result.reason];
    const T = Game.state && Game.state.chars.tuki;
    $('#endText').textContent = why + (T ? ` Sigarette raccolte: ${T.cigs}/${Game.CIG_GOAL}.` : '');
    $('#endStatus').textContent = ''; $('#endStatus').className = 'status';
    $('#again').disabled = false; $('#swap').disabled = false;
    document.getElementById('end').classList.add('over');
    show('end');
    drawEndArt(result, cfg);
  }
  function drawEndArt(result, cfg) {
    cancelAnimationFrame(endAnim);
    const ctx = fitCanvas(endArt);
    const loop = t => {
      if (current !== 'end') return;
      const w = endArt.clientWidth, h = endArt.clientHeight, tt = t / 1000;
      ctx.clearRect(0, 0, w, h);
      if (result.winner === 'ciccio') {
        Art.ciccio(ctx, w / 2, h * 0.6, h * 0.29, { dir: 1, t: tt, eat: true, look: { x: 1, y: 0 } });
        ctx.font = `${h * 0.2}px system-ui`; ctx.textAlign = 'center';
        ctx.fillText('🪶', w / 2 + h * 0.5 + Math.sin(tt * 2) * 10, h * 0.3 + (tt * 20 % 40));
      } else {
        Art.tuki(ctx, w / 2 + Math.sin(tt * 2) * 30, h * 0.55, h * 0.3, { dir: 1, t: tt, moving: true });
      }
      endAnim = requestAnimationFrame(loop);
    };
    endAnim = requestAnimationFrame(loop);
  }

  function rematch(swap) {
    Sound.init(); Sound.sfx.click();
    if (!lastCfg) return show('menu');
    if (lastCfg.mode === 'online') {
      if (!Net.connected) { toast('Il tuo amico non è più collegato.'); Game.stop(); show('menu'); return; }
      if (online.isHost) startOnlineRound(swap ? other(online.hostRole) : online.hostRole);
      else { Net.send({ t: 'rematch', swap }); $('#endStatus').textContent = 'Richiesta inviata…'; $('#again').disabled = true; $('#swap').disabled = true; }
      return;
    }
    Game.stop();
    play(Object.assign({}, lastCfg, { myRole: swap ? other(lastCfg.myRole) : lastCfg.myRole, seed: undefined }));
  }
  $('#again').addEventListener('click', () => rematch(false));
  $('#swap').addEventListener('click', () => rematch(true));
  $('#toMenu').addEventListener('click', () => {
    Sound.sfx.click(); Game.stop();
    if (online) { Net.close(); online = null; }
    show('menu');
  });

  // ---------- online ----------
  function netHandlers(extra) {
    return Object.assign({
      onData: onNetData,
      onClose: () => {
        if (!online) return;
        online = null;
        if (current === null || current === 'end') { Game.stop(); show('menu'); toast('Il tuo amico si è disconnesso.'); }
      },
      onError: msg => toast(msg),
    }, extra);
  }

  function onNetData(d) {
    if (!d || !d.t) return;
    if (d.t === 'start') {
      if (!online || online.isHost) return;
      online.hostRole = d.hostRole;
      Game.stop();
      play({ mode: 'online', isHost: false, myRole: other(d.hostRole), seed: d.seed, difficulty: 'normale' });
      return;
    }
    if (d.t === 'rematch') {
      if (online && online.isHost && current === 'end') startOnlineRound(d.swap ? other(online.hostRole) : online.hostRole);
      return;
    }
    if (d.t === 'bye') { Net.close(); netHandlers().onClose.call(null); return; }
    if (d.t === 'full') { toast('Questa partita è già piena.'); return; }
    Game.onNetData(d);
  }

  function startOnlineRound(hostRoleNow) {
    online.hostRole = hostRoleNow; online.round++;
    const seed = Math.floor(Math.random() * 1e9);
    Net.send({ t: 'start', seed, hostRole: hostRoleNow, round: online.round });
    Game.stop();
    play({ mode: 'online', isHost: true, myRole: hostRoleNow, seed, difficulty: 'normale' });
  }

  function resetHost() {
    $('#hostSetup').hidden = false; $('#hostWait').hidden = true;
    $('#hostCode').textContent = '····';
    $('#hostStatus').innerHTML = '<span class="spin"></span> In attesa dell\'amico…';
  }

  $('#hostGo').addEventListener('click', () => {
    Sound.init(); Sound.sfx.click();
    if (typeof Peer === 'undefined') { toast('Libreria di rete non caricata.'); return; }
    const role = hostRole();
    online = { isHost: true, hostRole: role, round: 0 };
    $('#hostSetup').hidden = true; $('#hostWait').hidden = false;
    $('#hostStatus').innerHTML = '<span class="spin"></span> Preparo la partita…';
    Net.host(netHandlers({
      onCode: code => {
        $('#hostCode').textContent = code;
        $('#hostStatus').innerHTML = '<span class="spin"></span> In attesa dell\'amico…';
      },
      onConnected: () => {
        $('#hostStatus').textContent = '✅ Amico collegato!';
        Sound.sfx.pickup();
        setTimeout(() => { if (online) startOnlineRound(online.hostRole); }, 700);
      },
      onError: msg => { $('#hostStatus').textContent = msg; $('#hostStatus').className = 'status err'; },
    }));
  });
  $('#shareCode').addEventListener('click', async () => {
    const code = $('#hostCode').textContent;
    const base = location.href.split('#')[0].split('?')[0];
    const text = `Giochiamo a Ciccio e Tuk! Codice partita: ${code}\n${base}?c=${code}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Ciccio e Tuk', text });
      else { await navigator.clipboard.writeText(text); toast('Codice copiato!'); }
    } catch (e) {}
  });
  $('#hostBack').addEventListener('click', () => { Sound.sfx.click(); Net.close(); online = null; show('online'); });

  const joinInput = $('#joinCode');
  joinInput.addEventListener('input', () => { joinInput.value = joinInput.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4); });
  joinInput.addEventListener('keydown', e => { if (e.key === 'Enter') $('#joinGo').click(); });
  $('#joinGo').addEventListener('click', () => {
    Sound.init(); Sound.sfx.click();
    const code = joinInput.value.trim();
    const st = $('#joinStatus');
    if (code.length !== 4) { st.textContent = 'Il codice è di 4 lettere.'; st.className = 'status err'; return; }
    if (typeof Peer === 'undefined') { st.textContent = 'Libreria di rete non caricata.'; st.className = 'status err'; return; }
    joinInput.blur();
    st.innerHTML = '<span class="spin"></span> Mi collego…'; st.className = 'status';
    $('#joinGo').disabled = true;
    online = { isHost: false, hostRole: null, round: 0 };
    Net.join(code, netHandlers({
      onConnected: () => { st.textContent = '✅ Collegato! Si parte…'; Sound.sfx.pickup(); },
      onError: msg => { st.textContent = msg; st.className = 'status err'; $('#joinGo').disabled = false; online = null; },
    }));
  });
  $('#joinBack').addEventListener('click', () => { Sound.sfx.click(); Net.close(); online = null; show('online'); });

  // codice nel link (?c=ABCD) per entrare più in fretta
  const urlCode = new URLSearchParams(location.search).get('c');
  if (urlCode) { joinInput.value = urlCode.toUpperCase().slice(0, 4); show('join'); }

  // ---------- disegni dei menu ----------
  function fitCanvas(c) {
    const r = Math.min(window.devicePixelRatio || 1, 2.5);
    c.width = Math.max(1, c.clientWidth * r); c.height = Math.max(1, c.clientHeight * r);
    const ctx = c.getContext('2d'); ctx.setTransform(r, 0, 0, r, 0, 0); return ctx;
  }
  const charCanvases = $$('canvas[data-char]');
  const hero = $('#hero');
  let heroCtx = null, charCtx = [];
  function refit() { heroCtx = fitCanvas(hero); charCtx = charCanvases.map(c => fitCanvas(c)); }
  window.addEventListener('resize', () => setTimeout(refit, 50));

  function menuLoop(t) {
    requestAnimationFrame(menuLoop);
    if (current === null || current === 'end') return;
    if (!heroCtx || hero.width < 2) refit();
    const tt = t / 1000;
    charCanvases.forEach((c, i) => {
      if (!c.offsetParent) return;
      const ctx = charCtx[i], w = c.clientWidth, h = c.clientHeight;
      if (c.width < 2) { charCtx[i] = fitCanvas(c); return; }
      ctx.clearRect(0, 0, w, h);
      if (c.dataset.char === 'ciccio') Art.ciccio(ctx, w / 2, h * 0.6, h * 0.29, { dir: 1, t: tt, look: { x: 1, y: 0 } });
      else Art.tuki(ctx, w / 2 - h * 0.15, h * 0.55, h * 0.3, { dir: 1, t: tt });
    });
    if (current === 'menu' && hero.offsetParent) {
      const w = hero.clientWidth, h = hero.clientHeight, ctx = heroCtx;
      ctx.clearRect(0, 0, w, h);
      // inseguimento infinito
      const span = w + 260, p = (tt * 110) % span - 130;
      const tx = p + 120, cx = p - 20 + Math.sin(tt * 3) * 10;
      const gy = h * 0.62;
      ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(0, gy + h * 0.2, w, 3);
      Art.tuki(ctx, tx, gy + Math.sin(tt * 7) * 3, h * 0.2, { dir: 1, t: tt, moving: true });
      Art.ciccio(ctx, cx, gy - h * 0.02, h * 0.27, { dir: 1, t: tt, moving: true, sprint: true, look: { x: 1, y: 0 } });
      // sbuffi di fumo
      for (let i = 0; i < 6; i++) {
        const k = (tt * 1.2 + i / 6) % 1;
        ctx.fillStyle = `rgba(200,200,205,${0.6 * (1 - k)})`;
        Art.circ(ctx, tx + h * 0.32 - k * 50, gy - h * 0.05 - k * 40, 3 + k * 10); ctx.fill();
      }
    }
  }
  requestAnimationFrame(menuLoop);

  // ---------- installazione / offline ----------
  const standalone = matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!standalone) {
    $('#installHint').textContent = isIOS
      ? 'Suggerimento: Condividi → «Aggiungi alla schermata Home» per giocare a schermo intero.'
      : 'Suggerimento: dal menu del browser scegli «Installa app» per averlo come un\'app.';
  }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('dblclick', e => e.preventDefault());

  Game.init({ onEnd });
  show(urlCode ? 'join' : 'menu');
  // debug: esponi per i test
  window.__fdt = { Game, Net, show, play };
})();

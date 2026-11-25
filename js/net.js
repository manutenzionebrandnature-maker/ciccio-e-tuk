// Connessione diretta tra due telefoni (WebRTC tramite PeerJS).
const Net = (() => {
  const PREFIX = 'ciccio-e-tuk-v1-';
  const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let peer = null, conn = null, isHost = false, handlers = {};

  function code4() {
    let s = '';
    for (let i = 0; i < 4; i++) s += LETTERS[Math.floor(Math.random() * LETTERS.length)];
    return s;
  }

  function errText(e) {
    const t = e && e.type;
    if (t === 'peer-unavailable') return 'Partita non trovata. Controlla il codice.';
    if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return 'Problema di rete. Controlla la connessione internet.';
    if (t === 'browser-incompatible') return 'Questo browser non supporta il gioco online.';
    return 'Errore di connessione' + (t ? ' (' + t + ')' : '') + '.';
  }

  function wire(c) {
    conn = c;
    c.on('data', d => handlers.onData && handlers.onData(d));
    c.on('close', () => { if (conn === c) { conn = null; handlers.onClose && handlers.onClose(); } });
    c.on('error', e => handlers.onError && handlers.onError(errText(e)));
  }

  function host(h) {
    close(); handlers = h; isHost = true;
    let tries = 0;
    const attempt = () => {
      const code = code4();
      peer = new Peer(PREFIX + code, { debug: 0 });
      peer.on('open', () => h.onCode && h.onCode(code));
      peer.on('connection', c => {
        if (conn) { c.on('open', () => { c.send({ t: 'full' }); setTimeout(() => c.close(), 300); }); return; }
        c.on('open', () => { wire(c); h.onConnected && h.onConnected(); });
      });
      peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) {} });
      peer.on('error', e => {
        if (e.type === 'unavailable-id' && tries++ < 5) { peer.destroy(); attempt(); return; }
        h.onError && h.onError(errText(e));
      });
    };
    attempt();
  }

  function join(code, h) {
    close(); handlers = h; isHost = false;
    peer = new Peer({ debug: 0 });
    let timer = setTimeout(() => { if (!conn) h.onError && h.onError('Il compagno non risponde. Riprova.'); }, 15000);
    peer.on('open', () => {
      const c = peer.connect(PREFIX + code.toUpperCase().trim(), { reliable: true, serialization: 'json' });
      c.on('open', () => { clearTimeout(timer); wire(c); h.onConnected && h.onConnected(); });
    });
    peer.on('error', e => { clearTimeout(timer); h.onError && h.onError(errText(e)); });
  }

  function send(msg) { if (conn && conn.open) { try { conn.send(msg); } catch (e) {} } }

  function close() {
    if (conn) { try { conn.send({ t: 'bye' }); } catch (e) {} try { conn.close(); } catch (e) {} }
    conn = null;
    if (peer) { try { peer.destroy(); } catch (e) {} }
    peer = null; handlers = {};
  }

  return {
    host, join, send, close,
    get isHost() { return isHost; },
    get connected() { return !!(conn && conn.open); },
  };
})();

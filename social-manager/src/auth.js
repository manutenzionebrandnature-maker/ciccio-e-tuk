#!/usr/bin/env node
// Collegamento degli account: apre una piccola pagina web locale con i pulsanti
// "Collega Facebook + Instagram" e "Collega TikTok".
import http from 'node:http';
import crypto from 'node:crypto';
import { exec } from 'node:child_process';
import { config, graphBase } from './config.js';
import { request } from './http.js';
import { getAccounts, setAccount } from './store.js';

const META_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'pages_read_user_content',
  'pages_manage_engagement',
  'read_insights',
  'business_management',
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_insights',
  'instagram_manage_comments',
];
const TIKTOK_SCOPES = ['user.info.basic', 'user.info.profile', 'user.info.stats', 'video.list', 'video.publish', 'video.upload'];

const redirect = (p) => `${config.redirectBase}${p}`;
const pending = new Map(); // state -> { kind, verifier }
let metaPages = null; // pagine in attesa di scelta

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function page(body) {
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Collega i social</title><style>
body{font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;color:#1d1d1f;background:#fafafa}
a.btn,button{display:inline-block;padding:12px 18px;border-radius:10px;border:0;color:#fff;text-decoration:none;font-size:16px;margin:6px 0;cursor:pointer}
.meta{background:#1877f2}.tt{background:#111}.ok{color:#137333}.ko{color:#b3261e}
li{margin:8px 0} code{background:#eee;padding:2px 5px;border-radius:4px}
</style></head><body>${body}</body></html>`;
}

function home(msg = '') {
  const a = getAccounts();
  const row = (name, acc, label) =>
    `<li><b>${name}</b>: ${acc ? `<span class="ok">collegato</span> — ${esc(label(acc))}` : '<span class="ko">non collegato</span>'}</li>`;
  const metaReady = config.meta.appId && config.meta.appSecret;
  const ttReady = config.tiktok.clientKey && config.tiktok.clientSecret;
  return page(`<h1>Collega i tuoi social</h1>${msg ? `<p>${msg}</p>` : ''}
<ul>
${row('Facebook', a.facebook, (x) => x.pageName)}
${row('Instagram', a.instagram, (x) => '@' + x.username)}
${row('TikTok', a.tiktok, (x) => x.displayName)}
</ul>
${metaReady ? '<a class="btn meta" href="/meta/start">Collega Facebook + Instagram</a>' : '<p class="ko">Mancano META_APP_ID e META_APP_SECRET nel file <code>.env</code>.</p>'}<br>
${ttReady ? '<a class="btn tt" href="/tiktok/start">Collega TikTok</a>' : '<p class="ko">Mancano TIKTOK_CLIENT_KEY e TIKTOK_CLIENT_SECRET nel file <code>.env</code>.</p>'}
<p>Quando hai finito puoi chiudere questa pagina e premere Ctrl+C nel terminale.</p>`);
}

// ---------- Meta (Facebook + Instagram) ----------

function metaStart(res) {
  const state = crypto.randomBytes(16).toString('hex');
  pending.set(state, { kind: 'meta' });
  const u = new URL(`https://www.facebook.com/${config.meta.graphVersion}/dialog/oauth`);
  u.searchParams.set('client_id', config.meta.appId);
  u.searchParams.set('redirect_uri', redirect('/meta/callback'));
  u.searchParams.set('state', state);
  u.searchParams.set('scope', META_SCOPES.join(','));
  res.writeHead(302, { Location: u.toString() }).end();
}

async function metaCallback(q, res) {
  if (q.get('error')) throw new Error(q.get('error_description') || q.get('error'));
  if (pending.get(q.get('state'))?.kind !== 'meta') throw new Error('Sessione di login non valida, riprova.');
  pending.delete(q.get('state'));
  const short = await request('facebook', `${graphBase()}/oauth/access_token`, {
    query: {
      client_id: config.meta.appId,
      client_secret: config.meta.appSecret,
      redirect_uri: redirect('/meta/callback'),
      code: q.get('code'),
    },
  });
  // token utente di lunga durata -> i token pagina derivati non scadono
  const long = await request('facebook', `${graphBase()}/oauth/access_token`, {
    query: {
      grant_type: 'fb_exchange_token',
      client_id: config.meta.appId,
      client_secret: config.meta.appSecret,
      fb_exchange_token: short.access_token,
    },
  });
  const pages = await request('facebook', `${graphBase()}/me/accounts`, {
    query: { access_token: long.access_token, fields: 'id,name,access_token,instagram_business_account{id,username}', limit: 100 },
  });
  metaPages = pages.data ?? [];
  if (!metaPages.length) throw new Error('Nessuna pagina Facebook trovata. Durante il login seleziona la pagina da gestire.');
  if (metaPages.length === 1) return metaSave(metaPages[0].id, res);
  const list = metaPages
    .map((p) => `<li><a href="/meta/select?page=${esc(p.id)}">${esc(p.name)}</a>${p.instagram_business_account ? ` + Instagram @${esc(p.instagram_business_account.username)}` : ''}</li>`)
    .join('');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(page(`<h1>Quale pagina vuoi gestire?</h1><ul>${list}</ul>`));
}

function metaSave(pageId, res) {
  const p = metaPages?.find((x) => x.id === pageId);
  if (!p) throw new Error('Pagina non trovata, ripeti il collegamento.');
  setAccount('facebook', { pageId: p.id, pageName: p.name, pageToken: p.access_token });
  let msg = `<span class="ok">Facebook collegato: ${esc(p.name)}.</span>`;
  if (p.instagram_business_account) {
    setAccount('instagram', {
      igUserId: p.instagram_business_account.id,
      username: p.instagram_business_account.username,
      pageId: p.id,
      pageToken: p.access_token,
    });
    msg += ` <span class="ok">Instagram collegato: @${esc(p.instagram_business_account.username)}.</span>`;
  } else {
    msg += ' <span class="ko">Nessun account Instagram professionale è collegato a questa pagina.</span>';
  }
  metaPages = null;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(home(msg));
}

// ---------- TikTok ----------

function tiktokStart(res) {
  const state = crypto.randomBytes(16).toString('hex');
  const verifier = crypto.randomBytes(48).toString('base64url');
  pending.set(state, { kind: 'tiktok', verifier });
  const u = new URL('https://www.tiktok.com/v2/auth/authorize/');
  u.searchParams.set('client_key', config.tiktok.clientKey);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', TIKTOK_SCOPES.join(','));
  u.searchParams.set('redirect_uri', redirect('/tiktok/callback'));
  u.searchParams.set('state', state);
  // TikTok usa la codifica esadecimale per il code_challenge
  u.searchParams.set('code_challenge', crypto.createHash('sha256').update(verifier).digest('hex'));
  u.searchParams.set('code_challenge_method', 'S256');
  res.writeHead(302, { Location: u.toString() }).end();
}

async function tiktokCallback(q, res) {
  if (q.get('error')) throw new Error(q.get('error_description') || q.get('error'));
  const st = pending.get(q.get('state'));
  if (st?.kind !== 'tiktok') throw new Error('Sessione di login non valida, riprova.');
  pending.delete(q.get('state'));
  const t = await request('tiktok', 'https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    form: {
      client_key: config.tiktok.clientKey,
      client_secret: config.tiktok.clientSecret,
      code: q.get('code'),
      grant_type: 'authorization_code',
      redirect_uri: redirect('/tiktok/callback'),
      code_verifier: st.verifier,
    },
  });
  let displayName = '';
  try {
    const u = await request('tiktok', 'https://open.tiktokapis.com/v2/user/info/', {
      query: { fields: 'display_name' },
      headers: { Authorization: `Bearer ${t.access_token}` },
    });
    displayName = u.data?.user?.display_name ?? '';
  } catch {}
  setAccount('tiktok', {
    openId: t.open_id,
    displayName,
    scopes: t.scope,
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: new Date(Date.now() + t.expires_in * 1000).toISOString(),
    refreshExpiresAt: new Date(Date.now() + (t.refresh_expires_in ?? 0) * 1000).toISOString(),
  });
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(home(`<span class="ok">TikTok collegato${displayName ? `: ${esc(displayName)}` : ''}.</span>`));
}

// ---------- server ----------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    switch (url.pathname) {
      case '/':
        return res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(home());
      case '/meta/start':
        return metaStart(res);
      case '/meta/callback':
        return await metaCallback(url.searchParams, res);
      case '/meta/select':
        return metaSave(url.searchParams.get('page'), res);
      case '/tiktok/start':
        return tiktokStart(res);
      case '/tiktok/callback':
        return await tiktokCallback(url.searchParams, res);
      default:
        return res.writeHead(404).end('Non trovato');
    }
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' }).end(home(`<span class="ko">Errore: ${esc(e.message)}</span>`));
  }
});

server.listen(config.authPort, '127.0.0.1', () => {
  const u = `http://localhost:${config.authPort}/`;
  console.log(`Apri ${u} nel browser per collegare i social (Ctrl+C per chiudere).`);
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start ""' : 'xdg-open';
  exec(`${cmd} ${u}`, () => {});
});

// Test con API finte: nessuna chiamata reale ai social.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'social-test-'));
process.env.DATA_DIR = dir;
process.env.TIKTOK_CLIENT_KEY = 'k';
process.env.TIKTOK_CLIENT_SECRET = 's';

const calls = [];
const routes = [];
const on = (method, re, reply) => routes.push({ method, re, reply });

globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const method = init.method || 'GET';
  const body = init.body instanceof URLSearchParams ? Object.fromEntries(init.body) : init.body;
  calls.push({ method, url: u, body });
  const r = routes.findLast((x) => x.method === method && x.re.test(u));
  if (!r) return new Response(JSON.stringify({ error: { message: `no route ${method} ${u}` } }), { status: 404 });
  const data = typeof r.reply === 'function' ? r.reply(u, body) : r.reply;
  return new Response(JSON.stringify(data), { status: 200 });
};

let store, publisher;
before(async () => {
  store = await import('../src/store.js');
  publisher = await import('../src/publisher.js');
  store.setAccount('facebook', { pageId: 'P1', pageName: 'Pagina', pageToken: 'PT' });
  store.setAccount('instagram', { igUserId: 'IG1', username: 'ciccio', pageId: 'P1', pageToken: 'PT' });
  store.setAccount('tiktok', {
    accessToken: 'old',
    refreshToken: 'R',
    expiresAt: new Date(Date.now() - 1000).toISOString(), // scaduto: deve rinnovarlo
    displayName: 'Ciccio',
  });
});

const inHours = (h) => new Date(Date.now() + h * 3600_000).toISOString();

test('Facebook programmato nativamente, Instagram in coda locale', async () => {
  on('POST', /\/P1\/photos(\?|$)/, { id: 'PH1', post_id: 'P1_100' });
  const res = await publisher.createPost({
    platforms: ['facebook', 'instagram'],
    text: 'Ciao!',
    media: [{ type: 'image', url: 'https://example.com/a.jpg' }],
    publishAt: inHours(3),
  });
  assert.equal(res.length, 2);
  const fb = res.find((r) => r.platform === 'facebook');
  const ig = res.find((r) => r.platform === 'instagram');
  assert.equal(fb.status, 'scheduled');
  assert.equal(fb.remoteId, 'P1_100');
  assert.match(fb.how, /Facebook/);
  assert.equal(ig.status, 'scheduled');
  assert.match(ig.how, /coda locale/);
  const fbCall = calls.find((c) => /photos(\?|$)/.test(c.url));
  assert.equal(fbCall.body.published, 'false');
  assert.ok(Number(fbCall.body.scheduled_publish_time) > Date.now() / 1000);
});

test('Instagram senza media viene rifiutato senza bloccare le altre piattaforme', async () => {
  on('POST', /\/P1\/feed(\?|$)/, { id: 'P1_200' });
  const res = await publisher.createPost({ platforms: ['instagram', 'facebook'], text: 'solo testo' });
  assert.equal(res.find((r) => r.platform === 'instagram').status, 'error');
  assert.equal(res.find((r) => r.platform === 'facebook').status, 'published');
});

test('Lo scheduler pubblica i post Instagram arrivati all\'ora', async () => {
  on('POST', /\/IG1\/media(\?|$)/, { id: 'C1' });
  on('GET', /\/C1\?/, { status_code: 'FINISHED' });
  on('POST', /\/IG1\/media_publish(\?|$)/, { id: 'M1' });
  on('GET', /\/M1\?/, { permalink: 'https://instagram.com/p/xyz' });

  const [r] = await publisher.createPost({
    platforms: ['instagram'],
    text: 'Reel!',
    media: [{ type: 'image', url: 'https://example.com/b.jpg' }],
    publishAt: inHours(1),
  });
  // sposto l'orario nel passato per simulare l'arrivo dell'ora
  store.updatePost(r.id, { publishAt: new Date(Date.now() - 1000).toISOString() });
  const n = await publisher.runDue();
  assert.ok(n >= 1);
  const p = store.getPost(r.id);
  assert.equal(p.status, 'published');
  assert.equal(p.url, 'https://instagram.com/p/xyz');
  // non deve ripubblicarlo
  assert.equal(await publisher.runDue(), 0);
});

test('Annullare un post Facebook programmato lo cancella anche su Facebook', async () => {
  on('POST', /\/P1\/feed(\?|$)/, { id: 'P1_300' });
  on('DELETE', /\/P1_300\?/, { success: true });
  const [r] = await publisher.createPost({ platforms: ['facebook'], text: 'domani', publishAt: inHours(24) });
  const c = await publisher.cancelPost(r.id);
  assert.equal(c.status, 'cancelled');
  assert.ok(calls.some((x) => x.method === 'DELETE' && /P1_300/.test(x.url)));
});

test('TikTok: rinnova il token, carica il video e usa la privacy disponibile', async () => {
  on('POST', /oauth\/token/, { access_token: 'new', refresh_token: 'R2', expires_in: 86400, refresh_expires_in: 31536000 });
  on('POST', /creator_info\/query/, { data: { privacy_level_options: ['SELF_ONLY'] }, error: { code: 'ok' } });
  on('POST', /publish\/video\/init/, { data: { publish_id: 'pub1', upload_url: 'https://upload.tiktok.test/u' }, error: { code: 'ok' } });
  on('PUT', /upload\.tiktok\.test/, {});
  on('POST', /status\/fetch/, { data: { status: 'PUBLISH_COMPLETE', publicaly_available_post_id: [7777] }, error: { code: 'ok' } });

  const video = path.join(dir, 'v.mp4');
  fs.writeFileSync(video, Buffer.alloc(1024, 1));
  const [r] = await publisher.createPost({ platforms: ['tiktok'], text: 'Video!', media: [{ type: 'video', url: video }] });
  assert.equal(r.status, 'published');
  assert.equal(r.remoteId, '7777');
  assert.match(r.note, /privati/);
  assert.equal(store.getAccount('tiktok').accessToken, 'new');
  const init = calls.find((c) => /video\/init/.test(c.url));
  assert.equal(JSON.parse(init.body).post_info.privacy_level, 'SELF_ONLY');
  const put = calls.find((c) => c.method === 'PUT');
  assert.ok(put);
});

test('Le metriche non disponibili vengono saltate, non fanno fallire la richiesta', async () => {
  on('GET', /\/M9\/insights\?.*metric=reach/, { data: [{ name: 'reach', values: [{ value: 120 }] }] });
  on('GET', /\/M9\/insights\?.*metric=saved/, { data: [{ name: 'saved', total_value: { value: 4 } }] });
  on('GET', /\/M9\?/, { id: 'M9', caption: 'x', media_type: 'IMAGE', like_count: 10, comments_count: 2, permalink: 'u' });
  const ig = await import('../src/platforms/instagram.js');
  const r = await ig.postInsights('M9');
  assert.equal(r.likes, 10);
  assert.equal(r.metrics.reach, 120);
  assert.equal(r.metrics.saved, 4);
  assert.ok(r.unavailable.includes('views'));
});

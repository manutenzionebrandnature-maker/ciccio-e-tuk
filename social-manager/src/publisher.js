// Logica comune: programmare, pubblicare, annullare, eseguire la coda.
import crypto from 'node:crypto';
import * as facebook from './platforms/facebook.js';
import * as instagram from './platforms/instagram.js';
import * as tiktok from './platforms/tiktok.js';
import * as store from './store.js';

export const PLATFORMS = { facebook, instagram, tiktok };
export const PLATFORM_NAMES = Object.keys(PLATFORMS);

const isUrl = (s) => /^https?:\/\//i.test(s);

function validate(platform, { text, media, link }) {
  if (!text && !media.length && !link) throw new Error('Il post è vuoto: servono un testo, un link o dei media.');
  for (const m of media) {
    if (!isUrl(m.url) && !(platform === 'tiktok' && m.type === 'video')) {
      throw new Error(`${platform}: "${m.url}" deve essere un URL pubblico (https://...). Solo i video TikTok possono essere file locali.`);
    }
  }
  if (platform === 'instagram' && !media.length) throw new Error('Instagram: serve almeno una foto o un video.');
  if (platform === 'tiktok') {
    if (!media.length) throw new Error('TikTok: serve un video o delle foto.');
    if (media.some((m) => m.type === 'video') && media.length > 1) throw new Error('TikTok: un solo video per post (senza foto).');
  }
}

async function publishOn(platform, post) {
  const opts = post.options ?? {};
  switch (platform) {
    case 'facebook':
      return facebook.publish({ text: post.text, link: post.link, media: post.media });
    case 'instagram':
      return instagram.publish({ text: post.text, media: post.media, igKind: opts.igKind });
    case 'tiktok':
      return tiktok.publish({ text: post.text, media: post.media, tiktokMode: opts.tiktokMode, privacy: opts.privacy, title: opts.title });
    default:
      throw new Error(`Piattaforma sconosciuta: ${platform}`);
  }
}

/**
 * Crea un post su una o più piattaforme. Se publishAt manca o è passato, pubblica subito.
 * Restituisce un risultato per piattaforma (gli errori di una non bloccano le altre).
 */
export async function createPost({ platforms, text = '', link, media = [], publishAt, options = {} }) {
  const group = crypto.randomUUID().slice(0, 8);
  const when = publishAt ? new Date(publishAt) : null;
  if (when && Number.isNaN(when.getTime())) throw new Error(`Data non valida: ${publishAt}`);
  const future = when && when.getTime() > Date.now() + 30_000;
  const results = [];

  for (const platform of [...new Set(platforms)]) {
    const base = { group, platform, text, link, media, options, publishAt: (future ? when : new Date()).toISOString() };
    try {
      validate(platform, base);
      store.getAccount(platform) || (() => { throw new Error(`${platform} non collegato: esegui "npm run auth".`); })();

      if (!future) {
        const r = await publishOn(platform, base);
        const rec = store.addPost({ ...base, mode: 'now', status: 'published', remoteId: r.id, url: r.url, note: r.note, publishedAt: new Date().toISOString() });
        results.push(summary(rec));
      } else if (platform === 'facebook' && facebook.canScheduleNatively(when)) {
        const r = await facebook.publish({ text, link, media, publishAt: when });
        const rec = store.addPost({ ...base, mode: 'facebook-native', remoteId: r.id });
        results.push(summary(rec));
      } else {
        const rec = store.addPost({ ...base, mode: 'local' });
        results.push(summary(rec));
      }
    } catch (e) {
      results.push({ platform, status: 'error', error: e.message });
    }
  }
  return results;
}

export function summary(p) {
  return {
    id: p.id,
    platform: p.platform,
    status: p.status,
    publishAt: p.publishAt,
    how:
      p.mode === 'facebook-native'
        ? 'programmato su Facebook (esce anche a computer spento)'
        : p.mode === 'local'
          ? 'in coda locale (serve lo scheduler acceso all\'ora indicata)'
          : 'pubblicato subito',
    text: p.text?.length > 120 ? `${p.text.slice(0, 117)}...` : p.text,
    media: p.media?.length ? p.media.map((m) => `${m.type}: ${m.url}`) : undefined,
    remoteId: p.remoteId,
    url: p.url,
    note: p.note,
    error: p.error,
  };
}

/** Allinea lo stato dei post programmati nativamente su Facebook. */
function syncNative() {
  for (const p of store.listPosts()) {
    if (p.mode === 'facebook-native' && p.status === 'scheduled' && new Date(p.publishAt) <= new Date()) {
      store.updatePost(p.id, { status: 'published', publishedAt: p.publishAt });
    }
  }
}

export function listPosts({ status, platform, includePast = false } = {}) {
  syncNative();
  return store
    .listPosts()
    .filter((p) => (status ? p.status === status : includePast || ['scheduled', 'publishing', 'failed'].includes(p.status)))
    .filter((p) => !platform || p.platform === platform)
    .sort((a, b) => new Date(a.publishAt) - new Date(b.publishAt))
    .map(summary);
}

export async function cancelPost(id) {
  const p = store.getPost(id);
  if (!p) throw new Error(`Post ${id} non trovato`);
  if (!['scheduled', 'failed'].includes(p.status)) throw new Error(`Il post ${id} è "${p.status}" e non si può annullare.`);
  if (p.mode === 'facebook-native') await facebook.deleteObject(p.remoteId);
  return summary(store.updatePost(id, { status: 'cancelled', cancelledAt: new Date().toISOString() }));
}

export async function updatePost(id, { text, media, link, publishAt }) {
  const p = store.getPost(id);
  if (!p) throw new Error(`Post ${id} non trovato`);
  if (!['scheduled', 'failed'].includes(p.status)) throw new Error(`Il post ${id} è "${p.status}" e non si può modificare.`);
  const next = {
    text: text ?? p.text,
    media: media ?? p.media,
    link: link ?? p.link,
    publishAt: publishAt ?? p.publishAt,
  };
  if (p.mode === 'facebook-native') {
    // Facebook non permette di cambiare tutto: si cancella e si riprogramma
    await cancelPost(id);
    const [r] = await createPost({ platforms: ['facebook'], ...next, options: p.options });
    return { replaced: id, ...r };
  }
  validate(p.platform, { ...next });
  const when = new Date(next.publishAt);
  if (Number.isNaN(when.getTime())) throw new Error(`Data non valida: ${next.publishAt}`);
  return summary(store.updatePost(id, { ...next, publishAt: when.toISOString(), status: 'scheduled', error: undefined }));
}

/** Pubblica i post locali arrivati all'ora. Chiamata dallo scheduler. */
export async function runDue(log = () => {}) {
  store.releaseStalePosts();
  const due = store.claimDuePosts();
  for (const p of due) {
    try {
      log(`Pubblico ${p.id} su ${p.platform}...`);
      const r = await publishOn(p.platform, p);
      store.updatePost(p.id, { status: 'published', remoteId: r.id, url: r.url, note: r.note, publishedAt: new Date().toISOString(), error: undefined });
      log(`OK ${p.id} su ${p.platform}: ${r.url || r.id}`);
    } catch (e) {
      const network = e instanceof TypeError || /fetch failed|ECONN|ETIMEDOUT|ENOTFOUND/.test(e.message);
      if (network && p.attempts < 3) {
        store.updatePost(p.id, { status: 'scheduled', publishAt: new Date(Date.now() + 5 * 60_000).toISOString(), error: e.message });
        log(`Rete non disponibile per ${p.id}, riprovo tra 5 minuti`);
      } else {
        store.updatePost(p.id, { status: 'failed', error: e.message });
        log(`ERRORE ${p.id} su ${p.platform}: ${e.message}`);
      }
    }
  }
  return due.length;
}

// Instagram (account professionale collegato alla pagina Facebook) tramite Graph API.
// Instagram non ha la programmazione via API: i post restano in coda locale
// e li pubblica lo scheduler all'ora indicata.
import { graphBase } from '../config.js';
import { request, sleep } from '../http.js';
import { getAccount } from '../store.js';

function account() {
  const a = getAccount('instagram');
  if (!a?.igUserId || !a?.pageToken) {
    throw new Error('Instagram non collegato: serve un account professionale legato alla pagina Facebook. Esegui "npm run auth".');
  }
  return a;
}

const g = (path, opts = {}) => {
  const { pageToken } = account();
  return request('instagram', `${graphBase()}${path}`, {
    ...opts,
    query: { access_token: pageToken, ...(opts.query || {}) },
  });
};

async function waitContainer(id, timeoutMs = 10 * 60_000) {
  const start = Date.now();
  for (;;) {
    const r = await g(`/${id}`, { query: { fields: 'status_code,status' } });
    if (r.status_code === 'FINISHED') return;
    if (r.status_code === 'ERROR' || r.status_code === 'EXPIRED') {
      throw new Error(`[instagram] elaborazione media fallita: ${r.status || r.status_code}`);
    }
    if (Date.now() - start > timeoutMs) throw new Error('[instagram] elaborazione video troppo lunga, riprova più tardi');
    await sleep(5000);
  }
}

/**
 * media: [{ type: 'image'|'video', url }] — gli URL devono essere pubblici.
 * kind: 'feed' (default), 'reel', 'story'
 */
export async function publish({ text, media = [], igKind = 'feed' }) {
  const { igUserId } = account();
  if (!media.length) throw new Error('Instagram richiede almeno una foto o un video (URL pubblico).');

  let creationId;
  if (igKind === 'story') {
    const m = media[0];
    const r = await g(`/${igUserId}/media`, {
      method: 'POST',
      form: { media_type: 'STORIES', ...(m.type === 'video' ? { video_url: m.url } : { image_url: m.url }) },
    });
    creationId = r.id;
    await waitContainer(creationId);
  } else if (media.length === 1) {
    const m = media[0];
    const form =
      m.type === 'video'
        ? { media_type: 'REELS', video_url: m.url, caption: text, share_to_feed: true }
        : { image_url: m.url, caption: text };
    const r = await g(`/${igUserId}/media`, { method: 'POST', form });
    creationId = r.id;
    await waitContainer(creationId);
  } else {
    if (media.length > 10) throw new Error('Un carosello Instagram può avere al massimo 10 elementi.');
    const children = [];
    for (const m of media) {
      const form =
        m.type === 'video'
          ? { media_type: 'VIDEO', video_url: m.url, is_carousel_item: true }
          : { image_url: m.url, is_carousel_item: true };
      const r = await g(`/${igUserId}/media`, { method: 'POST', form });
      await waitContainer(r.id);
      children.push(r.id);
    }
    const r = await g(`/${igUserId}/media`, {
      method: 'POST',
      form: { media_type: 'CAROUSEL', children: children.join(','), caption: text },
    });
    creationId = r.id;
    await waitContainer(creationId);
  }

  const pub = await g(`/${igUserId}/media_publish`, { method: 'POST', form: { creation_id: creationId } });
  let url;
  try {
    url = (await g(`/${pub.id}`, { query: { fields: 'permalink' } })).permalink;
  } catch {}
  return { id: pub.id, url };
}

export async function recentPosts(limit = 10) {
  const { igUserId } = account();
  const r = await g(`/${igUserId}/media`, {
    query: { limit, fields: 'id,caption,media_type,media_product_type,timestamp,permalink,like_count,comments_count' },
  });
  return (r.data ?? []).map((p) => ({
    id: p.id,
    text: p.caption ?? '',
    type: p.media_product_type === 'REELS' ? 'REEL' : p.media_type,
    createdAt: p.timestamp,
    url: p.permalink,
    likes: p.like_count ?? 0,
    comments: p.comments_count ?? 0,
  }));
}

async function metrics(objectId, names, extraQuery = {}) {
  const out = {};
  const unavailable = [];
  await Promise.all(
    names.map(async (m) => {
      try {
        const r = await g(`/${objectId}/insights`, { query: { metric: m, ...extraQuery } });
        const item = r.data?.[0];
        if (!item) return unavailable.push(m);
        out[m] = item.total_value?.value ?? item.values?.[item.values.length - 1]?.value ?? null;
      } catch {
        unavailable.push(m);
      }
    })
  );
  return { metrics: out, unavailable };
}

export async function postInsights(mediaId) {
  const base = await g(`/${mediaId}`, {
    query: { fields: 'id,caption,media_type,media_product_type,timestamp,permalink,like_count,comments_count' },
  });
  const m = await metrics(mediaId, ['views', 'reach', 'saved', 'shares', 'total_interactions', 'ig_reels_avg_watch_time']);
  return {
    id: base.id,
    text: base.caption ?? '',
    type: base.media_product_type === 'REELS' ? 'REEL' : base.media_type,
    url: base.permalink,
    createdAt: base.timestamp,
    likes: base.like_count ?? 0,
    comments: base.comments_count ?? 0,
    ...m,
  };
}

export async function comments(mediaId, limit = 25) {
  const r = await g(`/${mediaId}/comments`, {
    query: { limit, fields: 'id,username,text,timestamp,like_count,replies{id}' },
  });
  return (r.data ?? []).map((c) => ({
    id: c.id,
    author: c.username ? `@${c.username}` : '(utente)',
    text: c.text,
    createdAt: c.timestamp,
    likes: c.like_count ?? 0,
    replies: c.replies?.data?.length ?? 0,
  }));
}

export async function reply(commentId, text) {
  const r = await g(`/${commentId}/replies`, { method: 'POST', form: { message: text } });
  return { id: r.id };
}

export async function accountOverview(days = 28) {
  const { igUserId } = account();
  const info = await g(`/${igUserId}`, { query: { fields: 'username,followers_count,follows_count,media_count' } });
  const until = Math.floor(Date.now() / 1000);
  // Instagram accetta al massimo 30 giorni per richiesta
  const since = until - Math.min(days, 30) * 86400;
  const m = await metrics(igUserId, ['reach', 'views', 'accounts_engaged', 'total_interactions', 'profile_views', 'follows_and_unfollows'], {
    period: 'day',
    metric_type: 'total_value',
    since,
    until,
  });
  return {
    username: info.username,
    url: `https://www.instagram.com/${info.username}/`,
    followers: info.followers_count,
    following: info.follows_count,
    posts: info.media_count,
    periodDays: Math.min(days, 30),
    ...m,
  };
}

// Pagina Facebook tramite Graph API.
// Facebook programma i post da solo (scheduled_publish_time), quindi questi
// escono anche se il computer è spento.
import { graphBase } from '../config.js';
import { request } from '../http.js';
import { getAccount } from '../store.js';

const MIN_NATIVE_DELAY_S = 11 * 60; // Facebook vuole almeno 10 minuti di anticipo
const MAX_NATIVE_DELAY_S = 29 * 24 * 3600;

function account() {
  const a = getAccount('facebook');
  if (!a?.pageId || !a?.pageToken) throw new Error('Facebook non collegato: esegui "npm run auth".');
  return a;
}

const g = (path, opts = {}) => {
  const { pageToken } = account();
  return request('facebook', `${graphBase()}${path}`, {
    ...opts,
    query: { access_token: pageToken, ...(opts.query || {}) },
  });
};

/** True se Facebook può programmare nativamente un post per questa data. */
export function canScheduleNatively(publishAt) {
  const delta = (new Date(publishAt).getTime() - Date.now()) / 1000;
  return delta >= MIN_NATIVE_DELAY_S && delta <= MAX_NATIVE_DELAY_S;
}

/**
 * Pubblica (o programma su Facebook se publishAt è indicato).
 * media: [{ type: 'image'|'video', url }]
 */
export async function publish({ text, link, media = [], publishAt }) {
  const { pageId } = account();
  const sched = publishAt
    ? { published: false, scheduled_publish_time: Math.floor(new Date(publishAt).getTime() / 1000) }
    : {};

  const videos = media.filter((m) => m.type === 'video');
  const images = media.filter((m) => m.type === 'image');

  if (videos.length) {
    const r = await g(`/${pageId}/videos`, {
      method: 'POST',
      form: { file_url: videos[0].url, description: text, ...sched },
    });
    return { id: r.id, kind: 'video' };
  }

  if (images.length === 1) {
    const r = await g(`/${pageId}/photos`, {
      method: 'POST',
      form: { url: images[0].url, caption: text, ...sched },
    });
    return { id: r.post_id || r.id, kind: 'photo' };
  }

  if (images.length > 1) {
    // più foto: si caricano non pubblicate e poi si allegano a un unico post
    const ids = [];
    for (const img of images) {
      const r = await g(`/${pageId}/photos`, {
        method: 'POST',
        form: { url: img.url, published: false, temporary: !!publishAt },
      });
      ids.push(r.id);
    }
    const form = { message: text, ...sched };
    ids.forEach((id, i) => (form[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id })));
    const r = await g(`/${pageId}/feed`, { method: 'POST', form });
    return { id: r.id, kind: 'album' };
  }

  const r = await g(`/${pageId}/feed`, { method: 'POST', form: { message: text, link, ...sched } });
  return { id: r.id, kind: 'status' };
}

export async function deleteObject(id) {
  await g(`/${id}`, { method: 'DELETE' });
}

export async function listScheduledOnFacebook() {
  const { pageId } = account();
  const r = await g(`/${pageId}/scheduled_posts`, {
    query: { fields: 'id,message,scheduled_publish_time,created_time' },
  });
  return r.data ?? [];
}

export async function recentPosts(limit = 10) {
  const { pageId } = account();
  const r = await g(`/${pageId}/posts`, {
    query: {
      limit,
      fields:
        'id,message,created_time,permalink_url,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)',
    },
  });
  return (r.data ?? []).map((p) => ({
    id: p.id,
    text: p.message ?? '',
    createdAt: p.created_time,
    url: p.permalink_url,
    reactions: p.reactions?.summary?.total_count ?? 0,
    comments: p.comments?.summary?.total_count ?? 0,
    shares: p.shares?.count ?? 0,
  }));
}

// Meta cambia spesso i nomi delle metriche: le chiediamo una per una
// e teniamo solo quelle che rispondono.
async function metrics(objectId, names, extraQuery = {}) {
  const out = {};
  const unavailable = [];
  await Promise.all(
    names.map(async (m) => {
      try {
        const r = await g(`/${objectId}/insights`, { query: { metric: m, ...extraQuery } });
        const item = r.data?.[0];
        if (!item) return unavailable.push(m);
        const values = (item.values ?? []).map((v) => v.value);
        if (item.total_value) out[m] = item.total_value.value;
        else if (values.length > 1 && values.every((v) => typeof v === 'number')) out[m] = values.reduce((a, b) => a + b, 0);
        else out[m] = values[values.length - 1] ?? null;
      } catch {
        unavailable.push(m);
      }
    })
  );
  return { metrics: out, unavailable };
}

export async function postInsights(postId) {
  const base = await g(`/${postId}`, {
    query: {
      fields:
        'id,message,created_time,permalink_url,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)',
    },
  });
  const m = await metrics(postId, [
    'post_media_view',
    'post_impressions_unique',
    'post_clicks',
    'post_reactions_by_type_total',
  ]);
  return {
    id: base.id,
    text: base.message ?? '',
    url: base.permalink_url,
    createdAt: base.created_time,
    reactions: base.reactions?.summary?.total_count ?? 0,
    comments: base.comments?.summary?.total_count ?? 0,
    shares: base.shares?.count ?? 0,
    ...m,
  };
}

export async function comments(postId, limit = 25) {
  const r = await g(`/${postId}/comments`, {
    query: { limit, order: 'reverse_chronological', fields: 'id,from,message,created_time,like_count,comment_count' },
  });
  return (r.data ?? []).map((c) => ({
    id: c.id,
    author: c.from?.name ?? '(utente)',
    text: c.message,
    createdAt: c.created_time,
    likes: c.like_count ?? 0,
    replies: c.comment_count ?? 0,
  }));
}

export async function reply(commentId, text) {
  const r = await g(`/${commentId}/comments`, { method: 'POST', form: { message: text } });
  return { id: r.id };
}

export async function accountOverview(days = 28) {
  const { pageId } = account();
  const page = await g(`/${pageId}`, { query: { fields: 'name,followers_count,fan_count,link' } });
  const until = Math.floor(Date.now() / 1000);
  const since = until - days * 86400;
  const m = await metrics(pageId, ['page_media_view', 'page_impressions_unique', 'page_post_engagements', 'page_follows'], {
    period: 'day',
    since,
    until,
  });
  return {
    name: page.name,
    url: page.link,
    followers: page.followers_count ?? page.fan_count ?? null,
    periodDays: days,
    ...m,
  };
}

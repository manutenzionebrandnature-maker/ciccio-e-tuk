// TikTok: Content Posting API (pubblicazione) + Display API (statistiche).
// Anche TikTok non programma i post via API: li pubblica lo scheduler locale.
import fs from 'node:fs';
import { config } from '../config.js';
import { request, sleep } from '../http.js';
import { getAccount, setAccount } from '../store.js';

const API = 'https://open.tiktokapis.com/v2';
const MB = 1024 * 1024;

export async function refreshIfNeeded(force = false) {
  const a = getAccount('tiktok');
  if (!a?.accessToken) throw new Error('TikTok non collegato: esegui "npm run auth".');
  if (!force && a.expiresAt && new Date(a.expiresAt).getTime() - Date.now() > 10 * 60_000) return a;
  if (!a.refreshToken) throw new Error('Token TikTok scaduto: esegui di nuovo "npm run auth".');
  const r = await request('tiktok', `${API}/oauth/token/`, {
    method: 'POST',
    form: {
      client_key: config.tiktok.clientKey,
      client_secret: config.tiktok.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: a.refreshToken,
    },
  });
  return setAccount('tiktok', {
    ...a,
    accessToken: r.access_token,
    refreshToken: r.refresh_token ?? a.refreshToken,
    expiresAt: new Date(Date.now() + r.expires_in * 1000).toISOString(),
    refreshExpiresAt: r.refresh_expires_in
      ? new Date(Date.now() + r.refresh_expires_in * 1000).toISOString()
      : a.refreshExpiresAt,
  });
}

async function api(path, opts = {}) {
  const { accessToken } = await refreshIfNeeded();
  return request('tiktok', `${API}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${accessToken}`, ...(opts.headers || {}) },
  });
}

export async function creatorInfo() {
  const r = await api('/post/publish/creator_info/query/', { method: 'POST', json: {} });
  return r.data;
}

async function loadVideo(source) {
  if (/^https?:\/\//i.test(source)) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`[tiktok] impossibile scaricare il video (${res.status}) da ${source}`);
    return Buffer.from(await res.arrayBuffer());
  }
  return fs.readFileSync(source);
}

function chunkPlan(size) {
  if (size <= 64 * MB) return { chunkSize: size, count: 1 };
  const chunkSize = 10 * MB;
  return { chunkSize, count: Math.floor(size / chunkSize) }; // l'ultimo pezzo prende il resto
}

async function uploadChunks(uploadUrl, buf, { chunkSize, count }) {
  for (let i = 0; i < count; i++) {
    const start = i * chunkSize;
    const end = i === count - 1 ? buf.length : start + chunkSize;
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(end - start),
        'Content-Range': `bytes ${start}-${end - 1}/${buf.length}`,
      },
      body: buf.subarray(start, end),
    });
    if (!res.ok && res.status !== 206) {
      throw new Error(`[tiktok] upload fallito (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
    }
  }
}

export async function fetchStatus(publishId) {
  const r = await api('/post/publish/status/fetch/', { method: 'POST', json: { publish_id: publishId } });
  return r.data;
}

async function waitPublish(publishId, timeoutMs = 3 * 60_000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    last = await fetchStatus(publishId);
    if (['PUBLISH_COMPLETE', 'SEND_TO_USER_INBOX'].includes(last.status)) return last;
    if (last.status === 'FAILED') throw new Error(`[tiktok] pubblicazione fallita: ${last.fail_reason || 'motivo sconosciuto'}`);
    await sleep(5000);
  }
  return last; // ancora in elaborazione: TikTok lo completerà da solo
}

/**
 * media: un video ({type:'video', url|percorso locale}) oppure 1-35 foto ({type:'image', url}).
 * tiktokMode: 'direct' pubblica subito, 'draft' lo manda nella casella di TikTok per finirlo dall'app.
 */
export async function publish({ text, media = [], tiktokMode = 'direct', privacy, title }) {
  if (!media.length) throw new Error('TikTok richiede un video o delle foto.');
  const videos = media.filter((m) => m.type === 'video');
  const images = media.filter((m) => m.type === 'image');

  let privacyLevel;
  let note;
  if (tiktokMode === 'direct') {
    const info = await creatorInfo();
    const options = info.privacy_level_options ?? [];
    privacyLevel = privacy && options.includes(privacy) ? privacy : options.includes('PUBLIC_TO_EVERYONE') ? 'PUBLIC_TO_EVERYONE' : options[0];
    if (privacy && privacy !== privacyLevel) note = `Privacy "${privacy}" non disponibile, usata "${privacyLevel}".`;
    if (privacyLevel === 'SELF_ONLY' && !options.includes('PUBLIC_TO_EVERYONE')) {
      note = 'La tua app TikTok non è ancora approvata (audit): i post escono come privati (solo tu). Rendili pubblici dall\'app o chiedi l\'audit.';
    }
  }

  let publishId;
  if (videos.length) {
    const buf = await loadVideo(videos[0].url);
    const plan = chunkPlan(buf.length);
    const source_info = { source: 'FILE_UPLOAD', video_size: buf.length, chunk_size: plan.chunkSize, total_chunk_count: plan.count };
    const r =
      tiktokMode === 'draft'
        ? await api('/post/publish/inbox/video/init/', { method: 'POST', json: { source_info } })
        : await api('/post/publish/video/init/', {
            method: 'POST',
            json: { post_info: { title: text?.slice(0, 2200), privacy_level: privacyLevel }, source_info },
          });
    publishId = r.data.publish_id;
    await uploadChunks(r.data.upload_url, buf, plan);
  } else {
    // Le foto si possono inviare solo da URL di un dominio verificato nel portale TikTok
    const r = await api('/post/publish/content/init/', {
      method: 'POST',
      json: {
        media_type: 'PHOTO',
        post_mode: tiktokMode === 'draft' ? 'MEDIA_UPLOAD' : 'DIRECT_POST',
        post_info: {
          title: (title || text || '').slice(0, 90),
          description: text?.slice(0, 4000),
          ...(privacyLevel ? { privacy_level: privacyLevel } : {}),
        },
        source_info: { source: 'PULL_FROM_URL', photo_images: images.map((i) => i.url), photo_cover_index: 0 },
      },
    });
    publishId = r.data.publish_id;
  }

  const status = await waitPublish(publishId);
  const postId = status?.publicaly_available_post_id?.[0];
  return { id: postId ? String(postId) : publishId, publishId, status: status?.status, privacy: privacyLevel, note };
}

const VIDEO_FIELDS = 'id,title,video_description,create_time,share_url,cover_image_url,duration,view_count,like_count,comment_count,share_count';

const mapVideo = (v) => ({
  id: v.id,
  text: v.video_description || v.title || '',
  createdAt: v.create_time ? new Date(v.create_time * 1000).toISOString() : null,
  url: v.share_url,
  durationSec: v.duration,
  views: v.view_count ?? 0,
  likes: v.like_count ?? 0,
  comments: v.comment_count ?? 0,
  shares: v.share_count ?? 0,
});

export async function recentPosts(limit = 10) {
  const r = await api('/video/list/', { method: 'POST', query: { fields: VIDEO_FIELDS }, json: { max_count: Math.min(limit, 20) } });
  return (r.data?.videos ?? []).map(mapVideo);
}

export async function postInsights(videoId) {
  const r = await api('/video/query/', {
    method: 'POST',
    query: { fields: VIDEO_FIELDS },
    json: { filters: { video_ids: [String(videoId)] } },
  });
  const v = r.data?.videos?.[0];
  if (!v) throw new Error(`[tiktok] video ${videoId} non trovato (deve essere tuo e già pubblicato)`);
  return mapVideo(v);
}

export async function accountOverview() {
  const r = await api('/user/info/', {
    query: { fields: 'open_id,display_name,username,profile_deep_link,follower_count,following_count,likes_count,video_count' },
  });
  const u = r.data?.user ?? {};
  return {
    name: u.display_name,
    username: u.username,
    url: u.profile_deep_link,
    followers: u.follower_count,
    following: u.following_count,
    totalLikes: u.likes_count,
    videos: u.video_count,
  };
}

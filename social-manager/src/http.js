// Piccolo wrapper su fetch con messaggi di errore leggibili.
export class ApiError extends Error {
  constructor(platform, status, body) {
    const msg =
      body?.error?.message ||
      body?.error?.error_user_msg ||
      body?.error_description ||
      (typeof body?.error === 'string' ? body.error : '') ||
      body?.message ||
      JSON.stringify(body).slice(0, 300);
    super(`[${platform}] HTTP ${status}: ${msg}`);
    this.platform = platform;
    this.status = status;
    this.body = body;
  }
}

export async function request(platform, url, { method = 'GET', query, json, form, headers = {}, body } = {}) {
  const u = new URL(url);
  if (query) for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
  const init = { method, headers: { ...headers } };
  if (json !== undefined) {
    init.body = JSON.stringify(json);
    init.headers['Content-Type'] = 'application/json; charset=UTF-8';
  } else if (form !== undefined) {
    init.body = new URLSearchParams(Object.entries(form).filter(([, v]) => v !== undefined && v !== null));
    init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
  } else if (body !== undefined) {
    init.body = body;
  }
  const res = await fetch(u, init);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  // TikTok risponde 200 con error.code != "ok" in alcuni casi
  const tiktokErr = data?.error && typeof data.error === 'object' && data.error.code && data.error.code !== 'ok';
  if (!res.ok || (platform !== 'tiktok' && data?.error) || tiktokErr) throw new ApiError(platform, res.status, data);
  return data;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

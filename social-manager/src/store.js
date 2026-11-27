// Archivio locale in JSON: account collegati e post programmati.
// Le scritture passano da un lock su file, così server MCP e scheduler
// possono girare insieme senza pestarsi i piedi.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';

const file = (name) => path.join(config.dataDir, name);

function ensureDir() {
  fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
}

function readJson(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file(name), 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw e;
  }
}

function writeJson(name, data) {
  ensureDir();
  const tmp = file(`${name}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file(name));
}

const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function withLock(fn) {
  ensureDir();
  const lock = file('.lock');
  const start = Date.now();
  for (;;) {
    try {
      fs.writeFileSync(lock, String(process.pid), { flag: 'wx' });
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      // lock abbandonato da un processo morto
      try {
        if (Date.now() - fs.statSync(lock).mtimeMs > 10_000) fs.rmSync(lock, { force: true });
      } catch {}
      if (Date.now() - start > 15_000) throw new Error('Archivio occupato, riprova.');
      sleepSync(25);
    }
  }
  try {
    return fn();
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

// ---------- account ----------

export function getAccounts() {
  return readJson('accounts.json', {});
}

export function setAccount(platform, data) {
  return withLock(() => {
    const all = readJson('accounts.json', {});
    all[platform] = { ...data, updatedAt: new Date().toISOString() };
    writeJson('accounts.json', all);
    return all[platform];
  });
}

export function getAccount(platform) {
  return getAccounts()[platform] ?? null;
}

// ---------- post programmati ----------

export function listPosts() {
  return readJson('posts.json', []);
}

export function getPost(id) {
  return listPosts().find((p) => p.id === id) ?? null;
}

export function addPost(post) {
  return withLock(() => {
    const posts = readJson('posts.json', []);
    const full = {
      id: crypto.randomUUID().slice(0, 8),
      createdAt: new Date().toISOString(),
      status: 'scheduled',
      attempts: 0,
      ...post,
    };
    posts.push(full);
    writeJson('posts.json', posts);
    return full;
  });
}

export function updatePost(id, patch) {
  return withLock(() => {
    const posts = readJson('posts.json', []);
    const i = posts.findIndex((p) => p.id === id);
    if (i < 0) throw new Error(`Post ${id} non trovato`);
    posts[i] = { ...posts[i], ...(typeof patch === 'function' ? patch(posts[i]) : patch) };
    writeJson('posts.json', posts);
    return posts[i];
  });
}

/**
 * Prende in carico in modo atomico i post da pubblicare adesso:
 * passano da "scheduled" a "publishing", quindi un secondo processo non li vede.
 */
export function claimDuePosts(now = new Date()) {
  return withLock(() => {
    const posts = readJson('posts.json', []);
    const due = [];
    for (const p of posts) {
      if (p.status === 'scheduled' && p.mode === 'local' && new Date(p.publishAt) <= now) {
        p.status = 'publishing';
        p.attempts = (p.attempts ?? 0) + 1;
        p.claimedAt = now.toISOString();
        due.push({ ...p });
      }
    }
    if (due.length) writeJson('posts.json', posts);
    return due;
  });
}

/** Riporta in coda i post rimasti bloccati in "publishing" (es. processo chiuso a metà). */
export function releaseStalePosts(maxAgeMs = 30 * 60_000) {
  return withLock(() => {
    const posts = readJson('posts.json', []);
    let changed = false;
    for (const p of posts) {
      if (p.status === 'publishing' && Date.now() - new Date(p.claimedAt).getTime() > maxAgeMs) {
        p.status = 'failed';
        p.error = 'Pubblicazione interrotta: controlla sul social se il post è uscito, poi riprogrammalo se serve.';
        changed = true;
      }
    }
    if (changed) writeJson('posts.json', posts);
  });
}

// Configurazione: legge social-manager/.env (se esiste) e le variabili d'ambiente.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadDotEnv(path.join(ROOT, '.env'));

const env = (k, d = '') => process.env[k] ?? d;

export const config = {
  dataDir: path.resolve(ROOT, env('DATA_DIR', 'data')),
  timezone: env('TIMEZONE', 'Europe/Rome'),
  authPort: Number(env('AUTH_PORT', '8787')),
  // URL pubblico a cui tornano i login (cambialo se usi un tunnel https per TikTok)
  redirectBase: env('REDIRECT_BASE_URL', `http://localhost:${env('AUTH_PORT', '8787')}`),
  // Il server MCP pubblica anche i post in coda mentre è aperto
  schedulerInMcp: env('SCHEDULER_IN_MCP', 'true') !== 'false',
  meta: {
    appId: env('META_APP_ID'),
    appSecret: env('META_APP_SECRET'),
    graphVersion: env('META_GRAPH_VERSION', 'v23.0'),
  },
  tiktok: {
    clientKey: env('TIKTOK_CLIENT_KEY'),
    clientSecret: env('TIKTOK_CLIENT_SECRET'),
  },
};

export const graphBase = () => `https://graph.facebook.com/${config.meta.graphVersion}`;

#!/usr/bin/env node
// Server MCP: espone a Claude gli strumenti per programmare post e leggere le interazioni.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { config } from './config.js';
import { getAccounts, listPosts as rawPosts } from './store.js';
import { PLATFORMS, PLATFORM_NAMES, createPost, listPosts, cancelPost, updatePost } from './publisher.js';
import { startScheduler } from './scheduler.js';

const server = new McpServer({ name: 'ciccio-social-manager', version: '1.0.0' });

const ok = (data) => ({ content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] });
const fail = (e) => ({ isError: true, content: [{ type: 'text', text: e?.message ?? String(e) }] });
const safe = (fn) => async (args) => {
  try {
    return ok(await fn(args));
  } catch (e) {
    return fail(e);
  }
};

const Platform = z.enum(PLATFORM_NAMES);
const Media = z.object({
  type: z.enum(['image', 'video']),
  url: z.string().describe('URL pubblico https. Solo per i video TikTok si può usare un percorso di file locale.'),
});

server.registerTool(
  'stato_account',
  {
    title: 'Stato account',
    description: 'Mostra quali social sono collegati, il fuso orario usato e quanti post sono in coda.',
    inputSchema: {},
  },
  safe(async () => {
    const a = getAccounts();
    const queued = rawPosts().filter((p) => p.status === 'scheduled');
    return {
      oraAttuale: new Date().toLocaleString('it-IT', { timeZone: config.timezone }),
      fusoOrario: config.timezone,
      schedulerAttivoInQuestoServer: config.schedulerInMcp,
      facebook: a.facebook ? { collegato: true, pagina: a.facebook.pageName } : { collegato: false },
      instagram: a.instagram ? { collegato: true, account: '@' + a.instagram.username } : { collegato: false },
      tiktok: a.tiktok
        ? { collegato: true, account: a.tiktok.displayName, rinnovoLoginEntro: a.tiktok.refreshExpiresAt }
        : { collegato: false },
      postInCoda: queued.length,
      comeCollegare: 'Nel terminale, dentro la cartella social-manager: npm run auth',
    };
  })
);

server.registerTool(
  'programma_post',
  {
    title: 'Programma o pubblica un post',
    description: [
      'Crea un post su una o più piattaforme. Senza "pubblica_il" esce subito.',
      'Le date sono ISO 8601 con fuso (es. 2026-12-01T18:30:00+01:00). Se l\'utente dice un orario senza fuso, usa il fuso di stato_account.',
      'Facebook programma nativamente (esce anche a computer spento); Instagram e TikTok restano in coda locale e servono lo scheduler acceso.',
      'Instagram: serve almeno una foto/video da URL pubblico; più elementi = carosello; un video = Reel.',
      'TikTok: un video (URL o file locale) oppure foto da URL di dominio verificato.',
      'Chiedi conferma all\'utente del testo finale prima di pubblicare subito.',
    ].join(' '),
    inputSchema: {
      piattaforme: z.array(Platform).min(1),
      testo: z.string().default('').describe('Testo/didascalia del post, con eventuali hashtag'),
      media: z.array(Media).default([]),
      link: z.string().optional().describe('Link da allegare (solo Facebook)'),
      pubblica_il: z.string().optional().describe('Data e ora ISO 8601 con fuso orario'),
      instagram_formato: z.enum(['feed', 'reel', 'story']).optional(),
      tiktok_modalita: z
        .enum(['direct', 'draft'])
        .optional()
        .describe('direct = pubblica; draft = lo manda nelle bozze/notifiche di TikTok da completare dall\'app'),
      tiktok_privacy: z.enum(['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY']).optional(),
    },
  },
  safe(async (a) =>
    createPost({
      platforms: a.piattaforme,
      text: a.testo,
      media: a.media,
      link: a.link,
      publishAt: a.pubblica_il,
      options: { igKind: a.instagram_formato, tiktokMode: a.tiktok_modalita, privacy: a.tiktok_privacy },
    })
  )
);

server.registerTool(
  'elenco_post_programmati',
  {
    title: 'Elenco post programmati',
    description: 'Elenca i post in coda, in pubblicazione o falliti. Con includi_passati mostra anche quelli già usciti o annullati.',
    inputSchema: {
      piattaforma: Platform.optional(),
      stato: z.enum(['scheduled', 'publishing', 'published', 'failed', 'cancelled']).optional(),
      includi_passati: z.boolean().default(false),
    },
  },
  safe(async (a) => {
    const posts = listPosts({ platform: a.piattaforma, status: a.stato, includePast: a.includi_passati });
    return posts.length ? posts : 'Nessun post trovato.';
  })
);

server.registerTool(
  'modifica_post_programmato',
  {
    title: 'Modifica post programmato',
    description: 'Cambia testo, media, link o orario di un post non ancora uscito (usa l\'id di elenco_post_programmati).',
    inputSchema: {
      id: z.string(),
      testo: z.string().optional(),
      media: z.array(Media).optional(),
      link: z.string().optional(),
      pubblica_il: z.string().optional(),
    },
  },
  safe(async (a) => updatePost(a.id, { text: a.testo, media: a.media, link: a.link, publishAt: a.pubblica_il }))
);

server.registerTool(
  'annulla_post_programmato',
  {
    title: 'Annulla post programmato',
    description: 'Annulla un post non ancora uscito. Chiedi conferma all\'utente prima.',
    inputSchema: { id: z.string() },
  },
  safe(async (a) => cancelPost(a.id))
);

server.registerTool(
  'post_recenti',
  {
    title: 'Post recenti e interazioni',
    description: 'Ultimi post pubblicati su una piattaforma con like/reazioni, commenti, condivisioni e (TikTok) visualizzazioni.',
    inputSchema: { piattaforma: Platform, quanti: z.number().int().min(1).max(50).default(10) },
  },
  safe(async (a) => PLATFORMS[a.piattaforma].recentPosts(a.quanti))
);

server.registerTool(
  'statistiche_post',
  {
    title: 'Statistiche di un post',
    description: 'Interazioni e metriche dettagliate di un singolo post (copertura, visualizzazioni, salvataggi... dove disponibili). L\'id si trova con post_recenti.',
    inputSchema: { piattaforma: Platform, id_post: z.string() },
  },
  safe(async (a) => PLATFORMS[a.piattaforma].postInsights(a.id_post))
);

server.registerTool(
  'commenti_post',
  {
    title: 'Commenti di un post',
    description: 'Legge gli ultimi commenti di un post Facebook o Instagram. (TikTok non dà accesso ai commenti tramite API.)',
    inputSchema: { piattaforma: z.enum(['facebook', 'instagram']), id_post: z.string(), quanti: z.number().int().min(1).max(100).default(25) },
  },
  safe(async (a) => PLATFORMS[a.piattaforma].comments(a.id_post, a.quanti))
);

server.registerTool(
  'rispondi_commento',
  {
    title: 'Rispondi a un commento',
    description: 'Pubblica una risposta a un commento Facebook o Instagram. Mostra sempre il testo all\'utente e chiedi conferma prima.',
    inputSchema: { piattaforma: z.enum(['facebook', 'instagram']), id_commento: z.string(), testo: z.string().min(1) },
  },
  safe(async (a) => PLATFORMS[a.piattaforma].reply(a.id_commento, a.testo))
);

server.registerTool(
  'panoramica_account',
  {
    title: 'Panoramica account',
    description: 'Follower e metriche dell\'account negli ultimi giorni (copertura, visualizzazioni, interazioni dove disponibili).',
    inputSchema: { piattaforma: Platform, giorni: z.number().int().min(1).max(90).default(28) },
  },
  safe(async (a) => PLATFORMS[a.piattaforma].accountOverview(a.giorni))
);

server.registerTool(
  'stato_pubblicazione_tiktok',
  {
    title: 'Stato pubblicazione TikTok',
    description: 'Controlla a che punto è un video TikTok inviato (usa publishId restituito da programma_post).',
    inputSchema: { publish_id: z.string() },
  },
  safe(async (a) => PLATFORMS.tiktok.fetchStatus(a.publish_id))
);

if (config.schedulerInMcp) startScheduler();

await server.connect(new StdioServerTransport());
console.error('ciccio-social-manager pronto');

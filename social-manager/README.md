# Ciccio Social Manager

Un'app che collega **Facebook**, **Instagram** e **TikTok** a **Claude**: chiedi a Claude in italiano di programmare un post o di mostrarti come vanno i tuoi contenuti, e lui usa questi strumenti.

Esempi di cosa puoi chiedere:

- «Programma per venerdì alle 18:30 questo post su Facebook e Instagram con la foto https://…/pizza.jpg»
- «Carica il video ~/Video/ciccio.mp4 su TikTok domani alle 12»
- «Quali sono stati i miei 5 post Instagram con più interazioni questo mese?»
- «Leggimi i commenti dell'ultimo post Facebook e proponimi delle risposte»
- «Cosa ho in programma questa settimana? Sposta il post di giovedì a sabato»

Tecnicamente è un **server MCP** (il sistema con cui Claude usa strumenti esterni) che gira sul tuo computer. Funziona con **Claude Desktop** e **Claude Code**. I tuoi token restano sul tuo computer, nella cartella `data/`.

## Cosa sa fare

| Strumento | Facebook | Instagram | TikTok |
|---|---|---|---|
| Pubblicare subito | ✅ testo, link, foto, album, video | ✅ foto, carosello, Reel, storia | ✅ video, foto |
| Programmare | ✅ nativo (esce anche a PC spento) | ✅ coda locale¹ | ✅ coda locale¹ |
| Modificare / annullare i programmati | ✅ | ✅ | ✅ |
| Post recenti con interazioni | ✅ reazioni, commenti, condivisioni | ✅ like, commenti | ✅ visualizzazioni, like, commenti, condivisioni |
| Statistiche del singolo post | ✅ | ✅ copertura, views, salvataggi… | ✅ |
| Leggere e rispondere ai commenti | ✅ | ✅ | ❌ non previsto dalle API TikTok |
| Panoramica account (follower, copertura) | ✅ | ✅ | ✅ |

¹ Instagram e TikTok non permettono di programmare via API: il post resta in coda sul tuo computer e viene pubblicato all'ora giusta **se lo scheduler è acceso** (Claude Desktop aperto, oppure `npm run scheduler` in una finestra). Se il computer è spento, il post esce appena lo riaccendi.

## Installazione

Serve [Node.js](https://nodejs.org) versione 20 o successiva.

```bash
cd social-manager
npm install
cp .env.example .env     # poi compila .env con le chiavi (vedi sotto)
```

### 1. App Meta (Facebook + Instagram)

1. Vai su <https://developers.facebook.com/apps> → **Crea app** → tipo **Business**.
2. Aggiungi i prodotti **Facebook Login for Business** e **Instagram** (API con login Facebook).
3. In *Facebook Login → Impostazioni* aggiungi come URI di reindirizzamento valido: `http://localhost:8787/meta/callback`
4. Da *Impostazioni app → Di base* copia **ID app** e **Chiave segreta** in `.env` (`META_APP_ID`, `META_APP_SECRET`).
5. L'account Instagram deve essere **professionale** (Creator o Business) e **collegato alla tua pagina Facebook** (dall'app Instagram: Impostazioni → Centro gestione account).

Finché l'app è in modalità *Sviluppo* funziona per te e per chi aggiungi come tester: per uso personale basta così, non serve la revisione di Meta.

### 2. App TikTok

1. Vai su <https://developers.tiktok.com/apps> → **Connect an app**.
2. Aggiungi i prodotti **Login Kit**, **Content Posting API** (attiva *Direct Post*) e **Display API**.
3. Scope: `user.info.basic`, `user.info.profile`, `user.info.stats`, `video.list`, `video.publish`, `video.upload`.
4. Come Redirect URI metti `http://localhost:8787/tiktok/callback`. Se TikTok rifiuta `localhost`, avvia un tunnel https (es. `ngrok http 8787`), usa `https://<tuo-tunnel>/tiktok/callback` e scrivi `REDIRECT_BASE_URL=https://<tuo-tunnel>` in `.env`.
5. Copia **Client key** e **Client secret** in `.env`.

> **Importante:** finché TikTok non approva l'app (*audit*), i video pubblicati via API escono come **privati** (solo tu li vedi); poi li rendi pubblici dall'app TikTok. In alternativa chiedi a Claude la modalità *bozza* (`draft`): il video arriva nelle notifiche di TikTok e lo completi tu dall'app. Per le **foto** TikTok scarica le immagini solo da domini verificati nel portale sviluppatori.

### 3. Collega gli account

```bash
npm run auth
```

Si apre una pagina nel browser: premi **Collega Facebook + Instagram** e **Collega TikTok** e accetta i permessi. Il login TikTok dura un anno, quello Meta non scade (salvo cambio password o permessi revocati): quando serve, ripeti questo comando.

### 4. Aggiungi l'app a Claude

**Claude Desktop** — Impostazioni → Sviluppatore → *Modifica configurazione*, e aggiungi (con il tuo percorso):

```json
{
  "mcpServers": {
    "social": {
      "command": "node",
      "args": ["/percorso/completo/ciccio-e-tuk/social-manager/src/server.js"]
    }
  }
}
```

Riavvia Claude Desktop: nell'icona degli strumenti compariranno quelli di *social*.

**Claude Code**:

```bash
claude mcp add social -- node /percorso/completo/ciccio-e-tuk/social-manager/src/server.js
```

### 5. (Facoltativo) Scheduler sempre acceso

Per far uscire i post Instagram/TikTok anche con Claude chiuso, lascia aperto:

```bash
npm run scheduler
```

Su un computer o server sempre acceso puoi avviarlo in automatico (es. con `pm2 start src/scheduler.js --name social`). Server MCP e scheduler possono girare insieme senza pubblicare due volte lo stesso post.

## Strumenti disponibili per Claude

| Nome | A cosa serve |
|---|---|
| `stato_account` | Account collegati, ora e fuso, post in coda |
| `programma_post` | Pubblica subito o programma su una o più piattaforme |
| `elenco_post_programmati` | Coda dei post (e storico con `includi_passati`) |
| `modifica_post_programmato` | Cambia testo, media o orario |
| `annulla_post_programmato` | Annulla un post non ancora uscito |
| `post_recenti` | Ultimi post con le interazioni |
| `statistiche_post` | Metriche dettagliate di un post |
| `commenti_post` / `rispondi_commento` | Commenti Facebook e Instagram |
| `panoramica_account` | Follower e metriche del periodo |
| `stato_pubblicazione_tiktok` | Avanzamento di un video TikTok inviato |

## Note

- **Foto e video per Facebook/Instagram** devono essere a un **URL pubblico** (es. un link diretto da Google Drive pubblico, Dropbox con `?dl=1`, il tuo sito). Per TikTok il video può essere anche un file del computer.
- Meta cambia periodicamente i nomi delle metriche: se una non è più disponibile compare in `unavailable` invece di bloccare tutto. La versione delle API si cambia con `META_GRAPH_VERSION`.
- I dati (token e coda) sono in `data/`, esclusa da git. Non condividere quella cartella né il file `.env`.

## Struttura

- `src/server.js` — server MCP con gli strumenti per Claude
- `src/publisher.js` — logica di programmazione e coda
- `src/scheduler.js` — pubblica i post in coda all'ora giusta
- `src/auth.js` — pagina locale per collegare gli account
- `src/platforms/` — `facebook.js`, `instagram.js`, `tiktok.js`
- `src/store.js` — archivio JSON locale con lock tra processi
- `test/` — test con API simulate (`npm test`)

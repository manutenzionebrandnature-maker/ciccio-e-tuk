# Ciccio e Tuk 🍩🐦🚬

Gioco per smartphone (iPhone, Android e foldable) tipo guardie e ladri.
**Ciccio** ha sempre fame e vuole mangiarsi **Tuk**, il tucano che fuma.

## Come si gioca
- **Ciccio** vince se tocca il tucano. Tieni premuto ⚡ **SCATTO** per correre, ma consuma energia. Ciambelle, panini e pizza ricaricano l'energia.
- **Tuk** vince se raccoglie **12 sigarette** o se resiste **90 secondi**. Il pulsante 💨 **FUMO** lascia una nuvola: se Ciccio ci entra, tossisce e resta fermo. Nei cespugli Tuk è invisibile, ma la scia di fumo lo può tradire.
- Ci si muove trascinando il dito in un punto qualsiasi dello schermo. Da computer si usano le frecce o WASD, più la barra spaziatrice.

## Modalità
- **Contro il computer**: scegli il personaggio e la difficoltà (facile, normale, difficile). Funziona anche senza internet.
- **Con un amico**: ognuno usa il proprio telefono. Uno tocca «Crea partita» e riceve un codice di 4 lettere, l'altro tocca «Entra con un codice». La connessione è diretta tra i due telefoni (WebRTC tramite PeerJS), quindi non c'è un server da gestire. Serve internet su entrambi.

## Installazione sul telefono
1. Apri il link del gioco.
2. **iPhone (Safari)**: Condividi → «Aggiungi alla schermata Home».
   **Android (Chrome)**: menu ⋮ → «Installa app».
3. Il gioco si apre a schermo intero come un'app.

## Pubblicazione con GitHub Pages
Settings → Pages → *Build and deployment* → Source: **Deploy from a branch**, Branch: `main` / `(root)` → Save.
Dopo circa un minuto il gioco è online su `https://<utente>.github.io/<nome-repository>/`.

## Struttura
- `index.html`, `style.css`: schermate e grafica dei menu
- `js/game.js`: mondo, fisica, intelligenza del computer, gioco online, disegno
- `js/art.js`: personaggi e scenario disegnati in codice
- `js/audio.js`: effetti sonori e musichetta generati con WebAudio
- `js/net.js`: connessione tra telefoni
- `js/main.js`: menu e flusso delle partite
- `sw.js`, `manifest.webmanifest`: app installabile e uso offline
- `vendor/peerjs.min.js`: libreria PeerJS 1.5.4 (licenza MIT, vedi `vendor/peerjs-LICENSE`)

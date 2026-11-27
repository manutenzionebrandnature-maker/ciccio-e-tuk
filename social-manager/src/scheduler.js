#!/usr/bin/env node
// Scheduler: ogni 30 secondi pubblica i post in coda arrivati all'ora.
// Può girare da solo (npm run scheduler) oppure dentro il server MCP.
import { fileURLToPath } from 'node:url';
import { runDue } from './publisher.js';

export function startScheduler({ intervalMs = 30_000, log = (m) => console.error(`[scheduler] ${m}`) } = {}) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runDue(log);
    } catch (e) {
      log(`errore: ${e.message}`);
    } finally {
      running = false;
    }
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  return () => clearInterval(timer);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const log = (m) => console.log(`${new Date().toLocaleString('it-IT')} ${m}`);
  log('Scheduler avviato. Lascia questa finestra aperta (Ctrl+C per fermare).');
  startScheduler({ log });
}

// Avvia il vero server MCP e controlla che Claude veda gli strumenti.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const serverPath = fileURLToPath(new URL('../src/server.js', import.meta.url));

test('il server MCP espone gli strumenti e risponde', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'social-mcp-'));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    env: { ...process.env, DATA_DIR: dataDir, SCHEDULER_IN_MCP: 'false' },
    stderr: 'ignore',
  });
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    for (const n of ['programma_post', 'elenco_post_programmati', 'post_recenti', 'statistiche_post', 'commenti_post', 'panoramica_account', 'stato_account']) {
      assert.ok(names.includes(n), `manca ${n}`);
    }
    const status = await client.callTool({ name: 'stato_account', arguments: {} });
    const data = JSON.parse(status.content[0].text);
    assert.equal(data.facebook.collegato, false);

    const res = await client.callTool({
      name: 'programma_post',
      arguments: { piattaforme: ['tiktok'], testo: 'x', media: [{ type: 'video', url: '/tmp/v.mp4' }] },
    });
    assert.match(res.content[0].text, /non collegato/);
  } finally {
    await client.close();
  }
});

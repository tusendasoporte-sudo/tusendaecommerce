import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import test from 'node:test';
import { WebSocket } from 'ws';

import {
  createRealtimeServer,
  loadConfig,
  parseRealtimeTicket,
  parseWakePayload,
  ticketSignature,
  wakeSignature,
} from '../src/server.mjs';

const TICKET_SECRET = `ticket-${'a'.repeat(40)}`;
const WAKE_SECRET = `wake-${'b'.repeat(40)}`;
const CHANNEL_ID = 'c'.repeat(64);

function ticket(nowSeconds, nonce = 'A'.repeat(32)) {
  const prefix = [
    'pzrt_v1', CHANNEL_ID,
    String(nowSeconds), String(nowSeconds + 60), nonce,
  ].join('.');
  return `${prefix}.${ticketSignature(prefix, TICKET_SECRET)}`;
}

async function listen(realtime) {
  await new Promise((resolve) => realtime.server.listen(0, '127.0.0.1', resolve));
  return realtime.server.address().port;
}

test('valida configuración y tickets breves firmados sin credencial de instalación', () => {
  const config = loadConfig({
    PORT: '8081',
    PZ_STOREFRONT_REALTIME_TICKET_SECRET: TICKET_SECRET,
    PZ_STOREFRONT_REALTIME_WAKE_SECRET: WAKE_SECRET,
  });
  assert.equal(config.port, 8081);
  const now = 1_788_000_000;
  assert.deepEqual(parseRealtimeTicket(ticket(now), TICKET_SECRET, now * 1000), {
    channelId: CHANNEL_ID,
    issuedAt: now,
    expiresAt: now + 60,
    nonce: 'A'.repeat(32),
  });
  assert.equal(parseRealtimeTicket(ticket(now), `${TICKET_SECRET}bad`, now * 1000), null);
  assert.equal(parseRealtimeTicket(ticket(now), TICKET_SECRET, (now + 61) * 1000), null);
  assert.throws(() => loadConfig({
    PZ_STOREFRONT_REALTIME_TICKET_SECRET: TICKET_SECRET,
    PZ_STOREFRONT_REALTIME_WAKE_SECRET: TICKET_SECRET,
  }), /realtime_configuration_invalid/);
});

test('acepta solo el contrato exacto y acotado de wakeup', () => {
  const body = JSON.stringify({
    version: 1,
    type: 'sync_required',
    campaign_id: 'campaign0000001',
    channel_ids: [CHANNEL_ID],
  });
  assert.deepEqual(parseWakePayload(body), {
    campaignId: 'campaign0000001',
    channelIds: [CHANNEL_ID],
  });
  assert.equal(parseWakePayload(JSON.stringify({ ...JSON.parse(body), body: 'secreto' })), null);
  assert.equal(parseWakePayload(JSON.stringify({ ...JSON.parse(body), channel_ids: [CHANNEL_ID, CHANNEL_ID] })), null);
});

test('autentica el upgrade, rechaza replay y entrega solo una señal de sincronización', async (t) => {
  let nowMs = 1_788_000_000_000;
  const realtime = createRealtimeServer({
    ticketSecret: TICKET_SECRET,
    wakeSecret: WAKE_SECRET,
    port: 8081,
    maxConnections: 100,
  }, { now: () => nowMs });
  t.after(() => realtime.close());
  const port = await listen(realtime);
  const authTicket = ticket(Math.floor(nowMs / 1000));
  const socket = new WebSocket(`ws://127.0.0.1:${port}/v1/connect`, {
    headers: { Authorization: `Bearer ${authTicket}` },
  });
  const messages = [];
  socket.on('message', (data) => messages.push(JSON.parse(data.toString('utf8'))));
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });

  const replay = new WebSocket(`ws://127.0.0.1:${port}/v1/connect`, {
    headers: { Authorization: `Bearer ${authTicket}` },
  });
  await new Promise((resolve) => {
    replay.once('unexpected-response', (_request, response) => {
      assert.equal(response.statusCode, 401);
      resolve();
    });
    replay.once('error', resolve);
  });

  const rawBody = JSON.stringify({
    version: 1,
    type: 'sync_required',
    campaign_id: 'campaign0000001',
    channel_ids: [CHANNEL_ID],
  });
  const timestamp = String(Math.floor(nowMs / 1000));
  const nonce = randomUUID();
  const response = await fetch(`http://127.0.0.1:${port}/internal/wakeup`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-pz-realtime-timestamp': timestamp,
      'x-pz-realtime-nonce': nonce,
      'x-pz-realtime-signature': wakeSignature(timestamp, nonce, rawBody, WAKE_SECRET),
    },
    body: rawBody,
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, matched: 1, sent: 1 });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(messages.some((message) => message.type === 'ready'), true);
  const wake = messages.find((message) => message.type === 'sync_required');
  assert.deepEqual(Object.keys(wake).sort(), ['cursor', 'server_time', 'type', 'version']);
  assert.equal(wake.cursor, 'campaign0000001');

  const signature = createHmac('sha256', WAKE_SECRET)
    .update(`${timestamp}\n${nonce}\n${rawBody}`)
    .digest('hex');
  assert.equal(signature, wakeSignature(timestamp, nonce, rawBody, WAKE_SECRET));
  socket.close();
});

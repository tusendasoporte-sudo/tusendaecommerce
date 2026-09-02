import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';

const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const CHANNEL_ID_PATTERN = /^[a-f0-9]{64}$/;
const TICKET_NONCE_PATTERN = /^[A-Za-z0-9]{32}$/;
const WAKE_NONCE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SIGNATURE_PATTERN = /^[a-f0-9]{64}$/;
const TICKET_PREFIX = 'pzrt_v1';
const CONNECT_PATH = '/v1/connect';
const WAKE_PATH = '/internal/wakeup';
const MAX_WAKE_BODY_BYTES = 65_536;
const MAX_WAKE_INSTALLATIONS = 500;
const CLOCK_SKEW_SECONDS = 30;
const MAX_TICKET_LIFETIME_SECONDS = 120;
const REPLAY_TTL_MS = 180_000;
const REPLAY_LIMIT = 50_000;

function clean(value) {
  return String(value ?? '').trim();
}

function distinctSecret(value, compared = []) {
  const secret = clean(value);
  return secret.length >= 32 && secret.length <= 512
    && compared.filter(Boolean).every((candidate) => !safeEqual(secret, clean(candidate)))
    ? secret
    : '';
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left), 'utf8');
  const rightBuffer = Buffer.from(String(right), 'utf8');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function integer(value, minimum, maximum) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : 0;
}

export function loadConfig(environment = process.env) {
  const ticketSecret = distinctSecret(environment.PZ_STOREFRONT_REALTIME_TICKET_SECRET, [
    environment.PZ_STOREFRONT_REALTIME_WAKE_SECRET,
  ]);
  const wakeSecret = distinctSecret(environment.PZ_STOREFRONT_REALTIME_WAKE_SECRET, [ticketSecret]);
  const port = integer(environment.PORT || 8081, 1, 65_535);
  const maxConnections = integer(environment.PZ_STOREFRONT_REALTIME_MAX_CONNECTIONS || 25_000, 1, 100_000);
  if (!ticketSecret || !wakeSecret || !port || !maxConnections) {
    throw new Error('realtime_configuration_invalid');
  }
  return Object.freeze({ ticketSecret, wakeSecret, port, maxConnections });
}

export function ticketSignature(prefix, secret) {
  return createHmac('sha256', secret)
    .update(`pz_storefront_realtime_ticket:v1|${prefix}`, 'utf8')
    .digest('hex');
}

export function parseRealtimeTicket(ticketValue, secret, nowMs = Date.now()) {
  const ticket = clean(ticketValue);
  if (ticket.length > 256) return null;
  const segments = ticket.split('.');
  if (segments.length !== 6 || segments[0] !== TICKET_PREFIX) return null;
  const [prefix, channelId, issuedRaw, expiresRaw, nonce, signature] = segments;
  if (!CHANNEL_ID_PATTERN.test(channelId)
    || !/^\d{10}$/.test(issuedRaw) || !/^\d{10}$/.test(expiresRaw)
    || !TICKET_NONCE_PATTERN.test(nonce) || !SIGNATURE_PATTERN.test(signature)) return null;
  const issuedAt = Number(issuedRaw);
  const expiresAt = Number(expiresRaw);
  const nowSeconds = Math.floor(nowMs / 1000);
  if (expiresAt <= issuedAt || expiresAt - issuedAt > MAX_TICKET_LIFETIME_SECONDS
    || issuedAt > nowSeconds + CLOCK_SKEW_SECONDS || expiresAt < nowSeconds) return null;
  const signedPrefix = [prefix, channelId, issuedRaw, expiresRaw, nonce].join('.');
  if (!safeEqual(signature, ticketSignature(signedPrefix, secret))) return null;
  return Object.freeze({ channelId, issuedAt, expiresAt, nonce });
}

export function wakeSignature(timestamp, nonce, rawBody, secret) {
  return createHmac('sha256', secret)
    .update(`${timestamp}\n${nonce}\n${rawBody}`, 'utf8')
    .digest('hex');
}

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return keys.length === wanted.length && keys.every((key, index) => key === wanted[index]);
}

export function parseWakePayload(rawBody) {
  let value;
  try { value = JSON.parse(rawBody); } catch { return null; }
  if (!exactKeys(value, ['campaign_id', 'channel_ids', 'type', 'version'])
    || value.version !== 1 || value.type !== 'sync_required'
    || !RECORD_ID_PATTERN.test(String(value.campaign_id || ''))
    || !Array.isArray(value.channel_ids)
    || value.channel_ids.length < 1
    || value.channel_ids.length > MAX_WAKE_INSTALLATIONS) return null;
  const channelIds = value.channel_ids.map((item) => String(item || ''));
  if (channelIds.some((item) => !CHANNEL_ID_PATTERN.test(item))
    || new Set(channelIds).size !== channelIds.length) return null;
  return Object.freeze({
    campaignId: value.campaign_id,
    channelIds: Object.freeze(channelIds),
  });
}

function json(response, status, body) {
  const encoded = JSON.stringify(body);
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(encoded),
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(encoded);
}

function pruneReplayCache(cache, nowMs) {
  for (const [key, expiresAt] of cache) if (expiresAt <= nowMs) cache.delete(key);
  if (cache.size <= REPLAY_LIMIT) return;
  let excess = cache.size - REPLAY_LIMIT;
  for (const key of cache.keys()) {
    cache.delete(key);
    excess -= 1;
    if (excess <= 0) break;
  }
}

function bearerTicket(request) {
  const value = Array.isArray(request.headers.authorization)
    ? request.headers.authorization[0]
    : clean(request.headers.authorization);
  const match = value.match(/^Bearer (pzrt_v1\.[A-Za-z0-9.]+)$/);
  return match ? match[1] : '';
}

function readLimitedBody(request) {
  return new Promise((resolve, reject) => {
    const declared = Number(request.headers['content-length'] || 0);
    if (!Number.isSafeInteger(declared) || declared < 0 || declared > MAX_WAKE_BODY_BYTES) {
      reject(new Error('payload_too_large'));
      return;
    }
    const chunks = [];
    let total = 0;
    request.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_WAKE_BODY_BYTES) {
        reject(new Error('payload_too_large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

export function createRealtimeServer(config, options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const sockets = new Map();
  const usedTickets = new Map();
  const usedWakeNonces = new Map();
  const websocketServer = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
    maxPayload: 1024,
    maxBufferedChunks: 16,
    maxFragments: 16,
  });

  const server = createServer(async (request, response) => {
    let path = '';
    try { path = new URL(request.url || '/', 'http://realtime.internal').pathname; } catch {}
    if (request.method === 'GET' && path === '/healthz') {
      json(response, 200, { ok: true, connections: sockets.size });
      return;
    }
    if (request.method !== 'POST' || path !== WAKE_PATH || request.url !== WAKE_PATH) {
      json(response, 404, { ok: false, error: 'not_found' });
      return;
    }
    try {
      const rawBody = await readLimitedBody(request);
      const timestamp = clean(request.headers['x-pz-realtime-timestamp']);
      const nonce = clean(request.headers['x-pz-realtime-nonce']);
      const signature = clean(request.headers['x-pz-realtime-signature']).toLowerCase();
      const nowMs = now();
      const nowSeconds = Math.floor(nowMs / 1000);
      if (!/^\d{10}$/.test(timestamp) || Math.abs(nowSeconds - Number(timestamp)) > 90
        || !WAKE_NONCE_PATTERN.test(nonce) || !SIGNATURE_PATTERN.test(signature)
        || !safeEqual(signature, wakeSignature(timestamp, nonce, rawBody, config.wakeSecret))) {
        json(response, 401, { ok: false, error: 'unauthorized' });
        return;
      }
      pruneReplayCache(usedWakeNonces, nowMs);
      if (usedWakeNonces.has(nonce)) {
        json(response, 409, { ok: false, error: 'replayed_request' });
        return;
      }
      usedWakeNonces.set(nonce, nowMs + REPLAY_TTL_MS);
      const payload = parseWakePayload(rawBody);
      if (!payload) {
        json(response, 400, { ok: false, error: 'invalid_payload' });
        return;
      }
      let matched = 0;
      let sent = 0;
      const message = JSON.stringify({
        type: 'sync_required',
        version: 1,
        cursor: payload.campaignId,
        server_time: new Date(nowMs).toISOString(),
      });
      for (const channelId of payload.channelIds) {
        const socket = sockets.get(channelId);
        if (!socket || socket.readyState !== WebSocket.OPEN) continue;
        matched += 1;
        socket.send(message, { binary: false }, () => {});
        sent += 1;
      }
      json(response, 200, { ok: true, matched, sent });
    } catch {
      if (!response.headersSent) json(response, 413, { ok: false, error: 'payload_too_large' });
      else response.end();
    }
  });

  server.on('upgrade', (request, socket, head) => {
    const reject = (status, label) => {
      socket.end(`HTTP/1.1 ${status} ${label}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    };
    if (request.url !== CONNECT_PATH || request.headers.origin || sockets.size >= config.maxConnections) {
      reject(sockets.size >= config.maxConnections ? 503 : 404, 'Rejected');
      return;
    }
    const identity = parseRealtimeTicket(bearerTicket(request), config.ticketSecret, now());
    if (!identity) {
      reject(401, 'Unauthorized');
      return;
    }
    pruneReplayCache(usedTickets, now());
    const replayKey = `${identity.channelId}:${identity.nonce}`;
    if (usedTickets.has(replayKey)) {
      reject(401, 'Unauthorized');
      return;
    }
    usedTickets.set(replayKey, identity.expiresAt * 1000 + CLOCK_SKEW_SECONDS * 1000);
    request.realtimeIdentity = identity;
    websocketServer.handleUpgrade(request, socket, head, (websocket) => {
      websocketServer.emit('connection', websocket, request);
    });
  });

  websocketServer.on('connection', (socket, request) => {
    const identity = request.realtimeIdentity;
    const previous = sockets.get(identity.channelId);
    if (previous && previous !== socket) previous.close(4001, 'replaced');
    socket.isAlive = true;
    socket.realtimeIdentity = identity;
    sockets.set(identity.channelId, socket);
    socket.on('pong', () => { socket.isAlive = true; });
    socket.on('message', () => socket.close(1008, 'server_events_only'));
    socket.on('error', () => {});
    socket.on('close', () => {
      if (sockets.get(identity.channelId) === socket) sockets.delete(identity.channelId);
    });
    socket.send(JSON.stringify({
      type: 'ready',
      version: 1,
      server_time: new Date(now()).toISOString(),
    }));
  });

  const heartbeat = setInterval(() => {
    for (const socket of sockets.values()) {
      if (!socket.isAlive) {
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
    pruneReplayCache(usedTickets, now());
    pruneReplayCache(usedWakeNonces, now());
  }, 25_000);
  heartbeat.unref();

  async function close() {
    clearInterval(heartbeat);
    for (const socket of sockets.values()) socket.close(1001, 'server_shutdown');
    websocketServer.close();
    if (!server.listening) return;
    await new Promise((resolve) => server.close(resolve));
  }

  return Object.freeze({ server, websocketServer, sockets, close });
}

export async function start(environment = process.env) {
  const config = loadConfig(environment);
  const realtime = createRealtimeServer(config);
  await new Promise((resolve, reject) => {
    realtime.server.once('error', reject);
    realtime.server.listen(config.port, '0.0.0.0', resolve);
  });
  const shutdown = async () => {
    await realtime.close();
    process.exit(0);
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  console.info(`[realtime_gateway] listening port=${config.port}`);
  return realtime;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  start().catch((error) => {
    console.error(`[realtime_gateway] startup_failed reason=${clean(error?.message).slice(0, 80)}`);
    process.exit(1);
  });
}

export const testing = Object.freeze({ CONNECT_PATH, WAKE_PATH, randomUUID });

# PZ-SEC-IDENTITY02A Deployment

## Environment Variables

Set these variables only in the PocketBase backend runtime, preferably as backend/Coolify secrets. Keep `.env.example` empty:

- `PZ_SECURITY_HMAC_SECRET`: required for identity writes and security events. It must be random, non-placeholder material with at least 32 UTF-8 bytes.
- `PZ_SECURITY_AES_KEY`: optional. Required only when a store uses full IP visibility. It must be a different secret from the HMAC secret, with exactly 32 printable non-space ASCII characters because PocketBase `$security.encrypt()` uses AES-256-GCM.

Do not create `PUBLIC_` versions of these variables. They must never be exposed to Astro, browser code, logs, or client bundles. Do not copy placeholders such as `changeme`, `replace-me`, `example`, or the legacy placeholder text from older `.env.example` files.

If `PZ_SECURITY_HMAC_SECRET` is missing, a forbidden placeholder, or shorter than 32 UTF-8 bytes, the public register endpoint returns `{ "ok": true }` and writes nothing. Real backfill rejects execution with a generic technical error. If full IP visibility is selected without a valid 32-character printable non-space ASCII AES key, the backend stores only partial IP data and logs a safe warning code.

To verify a variable is configured without printing it, run a backend-shell check that reports only whether the variable is present and meets the expected length/character contract. Never print the secret value, copy it into tickets, or expose it in client-side code.

Plan secret rotation before production changes. Changing `PZ_SECURITY_HMAC_SECRET` after identities exist breaks correlation with historical hashes until a future rotation/backfill plan is implemented. Changing `PZ_SECURITY_AES_KEY` prevents decrypting IP values encrypted with the previous key.

## Localhost

Correct local startup:

```powershell
cd "<repo>"
.\Start-PowerZonaLocal.ps1
```

Or use the Windows launcher:

```text
Start-PowerZonaLocal.cmd
```

On first run the launcher creates local secrets outside the repository at `%LOCALAPPDATA%\PowerZona\security.local.env`, then starts the repository `pocketbase.exe` on `http://127.0.0.1:8091` with `PZ_SECURITY_HMAC_SECRET` and `PZ_SECURITY_AES_KEY` available only to that process tree. Later runs reuse the same file and do not rotate secrets. The same launcher starts Astro on `http://localhost:4321` with `PUBLIC_POCKETBASE_URL=http://127.0.0.1:8091`.

The backend-only launcher remains available for diagnostics:

```powershell
cd "<repo>\backend-powerzona"
.\scripts\Start-PocketBaseLocal.ps1 -Http 127.0.0.1:8091 -RestartExisting
```

Do not use this old command as the normal M-017 local startup:

```powershell
.\pocketbase.exe serve
```

It does not automatically load the external local security secrets, so the process can serve requests while identity and monitoring writes silently skip HMAC/AES-dependent records.

Do not copy the local secret file into tickets, chats, ZIP files, commits, screenshots, or public issue reports. Do not regenerate it while local data still needs to correlate HMAC values or decrypt full IP records. If local diagnostics are needed, run:

```powershell
.\scripts\Test-SecurityLocal.ps1 -VerifyRuntimeHealth
```

After authenticating as Master, the diagnostic must show:

```text
Backend de Seguridad listo
```

The diagnostic reports only OK/error states and never prints secret values. Without `-VerifyRuntimeHealth`, it validates only the local secret file and static endpoint shape; it does not prove that the running PocketBase process inherited HMAC/AES.

## Staging And Production Secrets

Do not use the localhost secret file in staging or production. Configure `PZ_SECURITY_HMAC_SECRET` and `PZ_SECURITY_AES_KEY` as backend secrets in Coolify or the server runtime.

Keep those values stable across deploys. Do not define `PUBLIC_PZ_SECURITY_HMAC_SECRET`, `PUBLIC_PZ_SECURITY_AES_KEY`, or any other `PUBLIC_*` copy. Restart PocketBase after configuring or rotating backend secrets.

## Proxy And IP Capture

The register endpoint uses `e.realIP()`. Configure PocketBase trusted proxy settings so `realIP()` trusts only your reverse proxy or edge provider.

For Cloudflare and Coolify:

- Keep the PocketBase origin protected from direct public access.
- Allow inbound traffic to the origin only from Cloudflare, the Coolify proxy, a private network, or a tunnel.
- Configure trusted proxies to match the actual proxy hop that forwards client IP headers.
- Confirm staging environments do not expose a direct origin IP that bypasses the trusted proxy path.

If trusted proxies are not configured correctly, IP hashes can represent a proxy address instead of the shopper address.

IP capture uses only the value returned by `e.realIP()`. Valid IPv4 values are trimmed, range-checked by octet, canonicalized before HMAC, and masked as `181.225.***.42` for `181.225.10.42`. The IPv4-mapped IPv6 forms `::ffff:181.225.10.42` and `0:0:0:0:0:ffff:181.225.10.42` are treated as that canonical IPv4 address; other hybrid formats are rejected. Valid IPv6 values are canonicalized to stable eight-group lowercase form for HMAC and masked with only the first three groups visible. Invalid IP values are treated as unavailable and are not hashed or encrypted.

Visibility modes:

- `hidden`: stores only `ip_hmac` for valid IPs.
- `partial`: stores `ip_hmac` and `ip_masked`.
- `full`: stores `ip_hmac`, `ip_masked`, and AES-256-GCM encrypted canonical IP. If AES is unavailable, it falls back to the partial data set and never stores raw IP text.

## Deployment Steps

1. Set `PZ_SECURITY_HMAC_SECRET` in the backend environment.
2. Set `PZ_SECURITY_AES_KEY` only if any store will use full IP visibility.
3. Deploy the backend image. The Dockerfile copies both `pb_migrations` and `pb_hooks`.
4. Run PocketBase migrations in the target environment.
5. In Master Admin, enable security for each store that should collect identity data.
6. Place test orders and verify customers/events are created only for active stores.

## Backfill

Dry run first:

```bash
curl -X POST "$PB_URL/api/pz/security/backfill-customers" \
  -H "Authorization: Bearer <SUPERUSER_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"dry_run":true,"limit":500,"offset":0}'
```

Run for real:

```bash
curl -X POST "$PB_URL/api/pz/security/backfill-customers" \
  -H "Authorization: Bearer <SUPERUSER_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"dry_run":false,"limit":500,"offset":0}'
```

Optional store-scoped run:

```bash
curl -X POST "$PB_URL/api/pz/security/backfill-customers" \
  -H "Authorization: Bearer <SUPERUSER_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"dry_run":true,"store_id":"<STORE_ID>","limit":500,"offset":0}'
```

Backfill accepts only `dry_run`, `store_id`, `limit`, and `offset`. Extra keys or wrong types return `400` with the invalid parameter name. `dry_run` must be boolean when present, `limit` must be an integer from 1 to 500, `offset` must be a non-negative integer, and `store_id` must be an existing PocketBase record id when present.

Backfill only processes stores with active security settings. It processes orders with valid phones and at least one `order_item`, creates or updates `store_customers`, links valid orders, rebuilds stats, and creates no events or IP history. With an explicit `store_id` whose security is disabled, it reports zero active stores and performs no writes.

Backfill uses a stable universe ordered by active store, then order `created,id`, with a run-local `created <= snapshot` cutoff. It never sorts by fields it modifies such as `customer`, `security_registered_at`, or `updated`.

`offset` skips orders from that stable universe before scanning. `limit` is the maximum number of orders examined after the offset. `scanned_orders` is the number examined in that range. `valid_orders` have a valid phone and at least one item. `unique_customers_seen` counts unique `store + phone_normalized` combinations in the range. `linked_orders` counts orders whose `customer` relation changed. `created_or_updated_customers` counts unique destination customer records for orders in the range. `rebuilt_previous_customers` counts old customer records rebuilt only because an order was relinked away from them, and `touched_customer_records` is the total rebuilt record count. The response does not list PII.

## Privacy Checks

After deploy, confirm:

- `store_customers` and `store_security_events` have `createRule`, `updateRule`, and `deleteRule` set to `null`.
- Store admins can list/view only records from their own store.
- `orders.customer` and `orders.security_registered_at` are hidden and cannot be set through the public or admin collection API.
- Hidden fields such as `phone_hmac`, `ip_hmac`, `ip_encrypted`, `browser_token_hmac`, and event `metadata_json` are not present in normal API responses.
- Event metadata contains only `order_status`, `delivery_method`, and `has_shipping_zone`.

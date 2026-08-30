import type PocketBase from 'pocketbase';

const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const REQUEST_TIMEOUT_MS = 9000;

export const PROMO_MASTER_CONTRACTS = Object.freeze({
  catalogRead: 'promo.master.store.catalog.read.v1',
  catalog: 'promo.master.store.catalog.v1',
  overviewRead: 'promo.master.overview.read.v1',
  overview: 'promo.master.overview.v1',
  lifecycleUpdate: 'promo.master.lifecycle.update.v1',
  entitlementUpdate: 'promo.entitlements.update.v1',
  themeRelease: 'promo.theme.release.update.v1',
  candidateCreate: 'promo.candidate.create.v1',
  publish: 'promo.publication.publish.v1',
  rollback: 'promo.publication.rollback.v1',
  unpublish: 'promo.publication.unpublish.v1',
  pause: 'promo.publication.pause.v1',
  resume: 'promo.publication.resume.v1',
});

export type PromoMasterCatalogItem = {
  store_id: string;
  type: 'promo';
  site: { public_slug: string; status: string };
  entitlement_state: 'enabled' | 'disabled' | 'missing';
  publication: { state: string; generation: number; canonical: { mode: 'platform' } };
};

export type PromoMasterCatalogResult = {
  available: boolean;
  status: number;
  error: string;
  items: PromoMasterCatalogItem[];
  map: Map<string, PromoMasterCatalogItem>;
};

export type PromoMasterOverview = {
  contract: 'promo.master.overview.v1';
  store: { name: string; slug: string; status: string; type: 'promo' };
  site: { public_slug: string; status: string; contract_version: number; updated: string; allowed_next_statuses: string[] };
  operations: Record<string, boolean>;
  entitlement: {
    source: string;
    updated: string;
    capabilities: Record<string, boolean | number>;
  };
  draft: {
    state: string;
    version: number;
    digest: string;
    theme: { theme_id: string; version: string; override_keys: string[] } | null;
    locales: { default: string; published: string[] } | null;
    readiness: { state: string; code: string };
  };
  publication: {
    state: string;
    generation: number;
    canonical: { mode: 'platform' };
    revision_id: string;
    published_at: string;
    updated: string;
    health: { state: string; issues: string[] };
    controls: Record<string, boolean>;
    reason_codes: Record<string, string[]>;
  };
  revisions: Array<{
    revision_id: string;
    sequence: number;
    digest: string;
    source_draft_version: number;
    created: string;
    current: boolean;
    theme: { theme_id: string; version: string };
    locales: { default: string; published: string[] };
    publish_readiness: { state: string; code: string };
    rollback_readiness: { state: string; code: string };
  }>;
  theme: {
    draft: { theme_id: string; version: string } | null;
    published: { theme_id: string; version: string } | null;
    releases: Array<{
      theme_id: string;
      version: string;
      renderer_key: string;
      status: string;
      allowed_next_statuses: string[];
    }>;
  };
  activity: Array<{
    created: string;
    module: string;
    action: string;
    severity: string;
    summary: string;
    actor: { name: string; role: string };
  }>;
  health: { state: string; issues: string[] };
};

export type PromoMasterOverviewResult = {
  available: boolean;
  status: number;
  error: string;
  data: PromoMasterOverview | null;
};

function text(value: unknown, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function recordId(value: unknown) {
  const id = text(value, 15);
  return RECORD_ID_PATTERN.test(id) ? id : '';
}

function unavailableCatalog(status = 0, error = 'promo_master_unavailable'): PromoMasterCatalogResult {
  return { available: false, status, error, items: [], map: new Map() };
}

async function postServer(
  pocketbaseUrl: string,
  token: string,
  endpoint: string,
  body: Record<string, unknown>,
  storeId = '',
) {
  const baseUrl = text(pocketbaseUrl, 500).replace(/\/$/, '');
  const authToken = text(token, 5000);
  if (!baseUrl || !authToken || (storeId && !recordId(storeId))) {
    return { status: 0, error: 'promo_master_unavailable', payload: null as any };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: authToken,
        'Content-Type': 'application/json',
        ...(storeId ? { 'X-PZ-Promo-Store': storeId } : {}),
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    return { status: response.status, error: text(payload?.error, 80), payload };
  } catch (_) {
    return { status: 0, error: 'promo_master_unavailable', payload: null as any };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getPromoMasterCatalog(
  pocketbaseUrl: string,
  token: string,
): Promise<PromoMasterCatalogResult> {
  const result = await postServer(
    pocketbaseUrl,
    token,
    '/api/pz/promo/master/v1/stores/catalog',
    { contract: PROMO_MASTER_CONTRACTS.catalogRead },
  );
  if (result.status !== 200 || result.payload?.ok !== true
    || result.payload?.contract !== PROMO_MASTER_CONTRACTS.catalog || !Array.isArray(result.payload?.items)) {
    return unavailableCatalog(result.status, result.error);
  }
  const items: PromoMasterCatalogItem[] = [];
  const map = new Map<string, PromoMasterCatalogItem>();
  for (const raw of result.payload.items) {
    const storeId = recordId(raw?.store_id);
    const generation = Number(raw?.publication?.generation);
    if (!storeId || raw?.type !== 'promo' || map.has(storeId)
      || !Number.isSafeInteger(generation) || generation < 0
      || raw?.publication?.canonical?.mode !== 'platform') {
      return unavailableCatalog(503, 'promo_catalog_incoherent');
    }
    const item: PromoMasterCatalogItem = {
      store_id: storeId,
      type: 'promo',
      site: {
        public_slug: text(raw?.site?.public_slug, 80),
        status: text(raw?.site?.status, 40),
      },
      entitlement_state: ['enabled', 'disabled'].includes(raw?.entitlement_state) ? raw.entitlement_state : 'missing',
      publication: {
        state: text(raw?.publication?.state, 40),
        generation,
        canonical: { mode: 'platform' },
      },
    };
    items.push(item);
    map.set(storeId, item);
  }
  return { available: true, status: 200, error: '', items, map };
}

export async function getPromoMasterOverview(
  pocketbaseUrl: string,
  token: string,
  storeId: string,
): Promise<PromoMasterOverviewResult> {
  const id = recordId(storeId);
  if (!id) return { available: false, status: 400, error: 'invalid_payload', data: null };
  const result = await postServer(
    pocketbaseUrl,
    token,
    '/api/pz/promo/master/v1/overview',
    { contract: PROMO_MASTER_CONTRACTS.overviewRead },
    id,
  );
  if (result.status !== 200 || result.payload?.ok !== true
    || result.payload?.contract !== PROMO_MASTER_CONTRACTS.overview
    || !validOverviewPayload(result.payload)) {
    return { available: false, status: result.status, error: result.error, data: null };
  }
  return { available: true, status: 200, error: '', data: result.payload as PromoMasterOverview };
}

function validOverviewPayload(payload: any): payload is PromoMasterOverview & { ok: true } {
  if (!payload || payload.store?.type !== 'promo'
    || typeof payload.store?.name !== 'string' || typeof payload.store?.slug !== 'string'
    || typeof payload.site?.status !== 'string' || typeof payload.site?.updated !== 'string'
    || !Number.isSafeInteger(payload.site?.contract_version)
    || !Array.isArray(payload.site?.allowed_next_statuses)
    || !payload.operations || typeof payload.operations !== 'object'
    || Object.values(payload.operations).some((value) => typeof value !== 'boolean')
    || !payload.entitlement || typeof payload.entitlement.updated !== 'string'
    || !payload.entitlement.capabilities || typeof payload.entitlement.capabilities !== 'object'
    || !payload.draft || !payload.draft.readiness
    || !payload.publication || !payload.publication.controls || !payload.publication.reason_codes
    || Object.values(payload.publication.controls).some((value) => typeof value !== 'boolean')
    || Object.values(payload.publication.reason_codes).some((value) => (
      !Array.isArray(value) || value.some((code) => typeof code !== 'string')
    ))
    || !Number.isSafeInteger(payload.publication.generation)
    || payload.publication.generation < 0
    || payload.publication.canonical?.mode !== 'platform'
    || !Array.isArray(payload.revisions)
    || !payload.theme || !Array.isArray(payload.theme.releases)
    || !Array.isArray(payload.activity) || !payload.health || !Array.isArray(payload.health.issues)) return false;
  if (payload.revisions.some((item: any) => !recordId(item?.revision_id)
    || !item?.publish_readiness || !item?.rollback_readiness)) return false;
  return true;
}

export async function getMasterStoreKind(
  pocketbaseUrl: string,
  token: string,
  storeId: string,
): Promise<'commerce' | 'promo' | 'unknown'> {
  const id = recordId(storeId);
  if (!id) return 'unknown';
  const catalog = await getPromoMasterCatalog(pocketbaseUrl, token);
  if (!catalog.available) return 'unknown';
  return catalog.map.has(id) ? 'promo' : 'commerce';
}

function supportOptions(storeId: string, body: Record<string, unknown>) {
  const id = recordId(storeId);
  if (!id) throw new Error('invalid_promo_store_context');
  return {
    method: 'POST',
    headers: { 'X-PZ-Promo-Store': id },
    body,
    cache: 'no-store',
    requestKey: null,
  };
}

export function promoIdempotencyKey(operation: string) {
  const prefix = text(operation, 24).replace(/[^a-z0-9_-]/gi, '-') || 'operation';
  const random = globalThis.crypto?.randomUUID?.();
  if (!random) throw new Error('promo_idempotency_unavailable');
  return `promo-master-${prefix}-${random}`.slice(0, 128);
}

export async function updatePromoLifecycle(client: PocketBase, storeId: string, input: {
  expected_status: string; expected_updated: string; next_status: string; reason_code: string;
}) {
  return client.send('/api/pz/promo/master/v1/lifecycle/update', supportOptions(storeId, {
    contract: PROMO_MASTER_CONTRACTS.lifecycleUpdate,
    ...input,
  }));
}

export async function updatePromoEntitlements(client: PocketBase, storeId: string, input: {
  expected_updated: string;
  source: string;
  capabilities: Record<string, boolean | number>;
  reason: string;
}) {
  return client.send('/api/pz/promo/master/entitlements/update', supportOptions(storeId, input));
}

export async function updatePromoThemeRelease(client: PocketBase, storeId: string, input: {
  theme_id: string; version: string; expected_status: string; next_status: string;
}) {
  return client.send('/api/pz/promo/private/v1/themes/releases/update', supportOptions(storeId, {
    contract: PROMO_MASTER_CONTRACTS.themeRelease, ...input,
  }));
}

export async function createPromoCandidate(client: PocketBase, storeId: string, expectedDraftVersion: number) {
  return client.send('/api/pz/promo/private/v1/publication/candidates/create', supportOptions(storeId, {
    contract: PROMO_MASTER_CONTRACTS.candidateCreate,
    expected_draft_version: expectedDraftVersion,
  }));
}

export type PromoPublicationOperation = 'publish' | 'rollback' | 'unpublish' | 'pause' | 'resume';

const PUBLICATION_ENDPOINTS: Record<PromoPublicationOperation, string> = {
  publish: '/api/pz/promo/private/v1/publication/publish',
  rollback: '/api/pz/promo/private/v1/publication/rollback',
  unpublish: '/api/pz/promo/private/v1/publication/unpublish',
  pause: '/api/pz/promo/private/v1/publication/pause',
  resume: '/api/pz/promo/private/v1/publication/resume',
};

const PUBLICATION_CONTRACTS: Record<PromoPublicationOperation, string> = {
  publish: PROMO_MASTER_CONTRACTS.publish,
  rollback: PROMO_MASTER_CONTRACTS.rollback,
  unpublish: PROMO_MASTER_CONTRACTS.unpublish,
  pause: PROMO_MASTER_CONTRACTS.pause,
  resume: PROMO_MASTER_CONTRACTS.resume,
};

export async function transitionPromoPublication(client: PocketBase, storeId: string, input: {
  operation: PromoPublicationOperation;
  expected_generation: number;
  reason_code: string;
  candidate_revision_id?: string;
  canonical?: { mode: 'platform' };
  idempotency_key?: string;
}) {
  const withRevision = input.operation === 'publish' || input.operation === 'rollback';
  const withCanonical = withRevision;
  const body: Record<string, unknown> = {
    contract: PUBLICATION_CONTRACTS[input.operation],
    expected_generation: input.expected_generation,
    idempotency_key: input.idempotency_key || promoIdempotencyKey(input.operation),
    reason_code: input.reason_code,
  };
  if (withRevision) body.candidate_revision_id = input.candidate_revision_id;
  if (withCanonical) body.canonical = input.canonical;
  return client.send(PUBLICATION_ENDPOINTS[input.operation], supportOptions(storeId, body));
}

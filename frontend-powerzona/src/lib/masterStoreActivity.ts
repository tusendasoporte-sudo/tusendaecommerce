export type MasterStoreActivity = {
  store_id: string;
  orders_total: number;
  orders_30d: number;
  visitors_30d: number;
  pageviews_30d: number;
  last_activity_at: string;
};

export type MasterStoreActivityResponse = {
  available: boolean;
  period_days: number;
  generated_at: string;
  items: MasterStoreActivity[];
  map: Map<string, MasterStoreActivity>;
};

const DEFAULT_PERIOD_DAYS = 30;
const REQUEST_TIMEOUT_MS = 7000;
const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;

function nonNegativeInteger(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.floor(number);
}

function safeIsoDate(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : '';
}

function unavailableResponse(periodDays = DEFAULT_PERIOD_DAYS): MasterStoreActivityResponse {
  return {
    available: false,
    period_days: periodDays,
    generated_at: '',
    items: [],
    map: new Map(),
  };
}

function normalizeItem(input: any): MasterStoreActivity | null {
  const storeId = String(input?.store_id || '').trim();
  if (!RECORD_ID_PATTERN.test(storeId)) return null;

  return {
    store_id: storeId,
    orders_total: nonNegativeInteger(input?.orders_total),
    orders_30d: nonNegativeInteger(input?.orders_30d),
    visitors_30d: nonNegativeInteger(input?.visitors_30d),
    pageviews_30d: nonNegativeInteger(input?.pageviews_30d),
    last_activity_at: safeIsoDate(input?.last_activity_at),
  };
}

export async function getMasterStoreActivitySummary(
  pocketbaseUrl: string,
  token: string,
  periodDays = DEFAULT_PERIOD_DAYS
): Promise<MasterStoreActivityResponse> {
  const safePeriodDays = Number(periodDays) === DEFAULT_PERIOD_DAYS ? DEFAULT_PERIOD_DAYS : Number(periodDays);
  const baseUrl = String(pocketbaseUrl || '').trim().replace(/\/$/, '');
  const authToken = String(token || '').trim();
  if (!baseUrl || !authToken || safePeriodDays !== DEFAULT_PERIOD_DAYS) {
    return unavailableResponse(safePeriodDays);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/api/pz/master/store-activity-summary`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ period_days: safePeriodDays }),
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return unavailableResponse(safePeriodDays);

    const payload = await response.json().catch(() => null);
    if (payload?.ok !== true || Number(payload?.period_days) !== safePeriodDays || !Array.isArray(payload?.items)) {
      return unavailableResponse(safePeriodDays);
    }

    const itemMap = new Map<string, MasterStoreActivity>();
    payload.items.forEach((item: any) => {
      const normalized = normalizeItem(item);
      if (normalized) itemMap.set(normalized.store_id, normalized);
    });
    const items = Array.from(itemMap.values());

    return {
      available: true,
      period_days: safePeriodDays,
      generated_at: safeIsoDate(payload.generated_at),
      items,
      map: itemMap,
    };
  } catch (_) {
    return unavailableResponse(safePeriodDays);
  } finally {
    clearTimeout(timeout);
  }
}

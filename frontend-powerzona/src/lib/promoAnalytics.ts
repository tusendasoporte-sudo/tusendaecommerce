export const PROMO_ANALYTICS_SUMMARY_CONTRACT = 'promo.analytics.summary.v1';
export const PROMO_ANALYTICS_RANGES = Object.freeze([7, 30, 90] as const);

export type PromoAnalyticsRange = (typeof PROMO_ANALYTICS_RANGES)[number];
export type PromoAnalyticsCounts = Readonly<{
  page_views: number;
  section_views: number;
  contact_activations: number;
  landing_qr_opens: number;
}>;
export type PromoAnalyticsSummary = Readonly<{
  range: Readonly<{ days: PromoAnalyticsRange; from: string; to: string }>;
  totals: PromoAnalyticsCounts;
  by_day: readonly (Readonly<{ day: string }> & PromoAnalyticsCounts)[];
  sections: readonly Readonly<{ key: string; count: number }>[];
  contact_actions: readonly Readonly<{ key: string; count: number }>[];
  locales: readonly Readonly<{ key: string; count: number }>[];
  privacy: Readonly<{ unique_visitors_measured: false; raw_event_retention_days: 7 }>;
}>;

export class PromoAnalyticsError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status = 503) {
    super(code);
    this.name = 'PromoAnalyticsError';
    this.code = code;
    this.status = status;
  }
}

function fail(code = 'promo_analytics_unavailable', status = 503): never {
  throw new PromoAnalyticsError(code, status);
}

function exact(value: unknown, keys: readonly string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  const object = value as Record<string, any>;
  const actual = Object.keys(object).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail();
  return object;
}

function count(value: unknown) {
  if (!Number.isSafeInteger(value) || Number(value) < 0) fail();
  return Number(value);
}

function day(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value) fail();
  return value;
}

function counts(value: unknown): PromoAnalyticsCounts {
  const object = exact(value, ['page_views', 'section_views', 'contact_activations', 'landing_qr_opens']);
  return Object.freeze({
    page_views: count(object.page_views),
    section_views: count(object.section_views),
    contact_activations: count(object.contact_activations),
    landing_qr_opens: count(object.landing_qr_opens),
  });
}

function dimensionList(value: unknown, maximum: number, pattern: RegExp) {
  if (!Array.isArray(value) || value.length > maximum) fail();
  const seen = new Set<string>();
  return Object.freeze(value.map((raw) => {
    const object = exact(raw, ['key', 'count']);
    if (typeof object.key !== 'string' || !pattern.test(object.key) || seen.has(object.key)) fail();
    seen.add(object.key);
    return Object.freeze({ key: object.key, count: count(object.count) });
  }));
}

export function normalizePromoAnalyticsSummary(value: unknown): PromoAnalyticsSummary {
  const envelope = exact(value, [
    'ok', 'contract', 'range', 'totals', 'by_day', 'sections', 'contact_actions', 'locales', 'privacy',
  ]);
  if (envelope.ok !== true || envelope.contract !== PROMO_ANALYTICS_SUMMARY_CONTRACT) fail();
  const rawRange = exact(envelope.range, ['days', 'from', 'to']);
  if (!PROMO_ANALYTICS_RANGES.includes(rawRange.days)) fail();
  const from = day(rawRange.from);
  const to = day(rawRange.to);
  if (!Array.isArray(envelope.by_day) || envelope.by_day.length !== rawRange.days) fail();
  const byDay = envelope.by_day.map((raw: unknown, index: number) => {
    const object = exact(raw, ['day', 'page_views', 'section_views', 'contact_activations', 'landing_qr_opens']);
    const expected = new Date(`${from}T00:00:00.000Z`);
    expected.setUTCDate(expected.getUTCDate() + index);
    const itemDay = day(object.day);
    if (itemDay !== expected.toISOString().slice(0, 10)) fail();
    return Object.freeze({ day: itemDay, ...counts({
      page_views: object.page_views,
      section_views: object.section_views,
      contact_activations: object.contact_activations,
      landing_qr_opens: object.landing_qr_opens,
    }) });
  });
  if (byDay.at(-1)?.day !== to) fail();
  const privacy = exact(envelope.privacy, ['unique_visitors_measured', 'raw_event_retention_days']);
  if (privacy.unique_visitors_measured !== false || privacy.raw_event_retention_days !== 7) fail();
  return Object.freeze({
    range: Object.freeze({ days: rawRange.days, from, to }),
    totals: counts(envelope.totals),
    by_day: Object.freeze(byDay),
    sections: dimensionList(envelope.sections, 20, /^[a-z][a-z0-9_-]{0,63}$/),
    contact_actions: dimensionList(envelope.contact_actions, 5, /^(?:whatsapp|phone|email|internal_form|approved_live_chat)$/),
    locales: dimensionList(envelope.locales, 10, /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/),
    privacy: Object.freeze({ unique_visitors_measured: false, raw_event_retention_days: 7 }),
  });
}

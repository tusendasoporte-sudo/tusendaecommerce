import { getStoreAdminPath } from './adminRoutes.ts';

export type ProductHistoryOrigin = 'products' | 'expirations' | 'team-activity';

export type ProductHistoryReturnNavigation = Readonly<{
  origin: ProductHistoryOrigin;
  path: string;
  label: string;
}>;

type ActivityHistoryContext = Readonly<{
  module?: unknown;
  action?: unknown;
  severity?: unknown;
  review_status?: unknown;
  date_from?: unknown;
  date_to?: unknown;
  search?: unknown;
  page?: unknown;
}>;

const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const ACTION_PATTERN = /^[a-z0-9_.-]{1,80}$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ACTIVITY_MODULES = new Set(['catalog', 'orders', 'shipping', 'marketing', 'operation', 'security', 'team', 'settings', 'plan']);
const ACTIVITY_SEVERITIES = new Set(['normal', 'important', 'critical']);
const ACTIVITY_REVIEW_STATUSES = new Set(['pending', 'reviewed', 'requires_correction']);

function text(value: unknown, max: number) {
  return String(value === null || value === undefined ? '' : value).trim().replace(/\s+/g, ' ').slice(0, max);
}

function validCivilDate(value: unknown) {
  const normalized = text(value, 10);
  const match = DATE_PATTERN.exec(normalized);
  if (!match) return '';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() === Number(match[2]) - 1
    && date.getUTCDate() === Number(match[3])
    ? normalized
    : '';
}

function positivePage(value: unknown) {
  const page = Number(value);
  return Number.isInteger(page) && page > 1 && page <= 100_000 ? page : 0;
}

function pathWithParams(path: string, params: URLSearchParams) {
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function safeHistoryPath(storeSlug: string, rawHistoryPath: unknown) {
  const raw = text(rawHistoryPath, 500);
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\') || raw.includes('://')) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw, 'https://powerzona.invalid');
  } catch (_) {
    return null;
  }
  if (parsed.origin !== 'https://powerzona.invalid') return null;
  const productsPath = getStoreAdminPath(storeSlug, 'products');
  const escapedProductsPath = productsPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^${escapedProductsPath}/([a-z0-9]{15})/history$`).exec(parsed.pathname);
  if (!match) return null;
  const variation = parsed.searchParams.get('variation') || '';
  return {
    path: parsed.pathname,
    variation: RECORD_ID_PATTERN.test(variation) ? variation : '',
  };
}

export function buildTeamActivityProductHistoryPath(
  storeSlug: string,
  rawHistoryPath: unknown,
  context: ActivityHistoryContext = {},
) {
  const safe = safeHistoryPath(storeSlug, rawHistoryPath);
  if (!safe) return '';
  const params = new URLSearchParams({ from: 'team-activity' });
  if (safe.variation) params.set('variation', safe.variation);

  const moduleName = text(context.module, 40).toLowerCase();
  const action = text(context.action, 80).toLowerCase();
  const severity = text(context.severity, 20).toLowerCase();
  const reviewStatus = text(context.review_status, 30).toLowerCase();
  const dateFrom = validCivilDate(context.date_from);
  const dateTo = validCivilDate(context.date_to);
  const search = text(context.search, 120);
  const page = positivePage(context.page);

  if (ACTIVITY_MODULES.has(moduleName)) params.set('module', moduleName);
  if (ACTION_PATTERN.test(action)) params.set('action', action);
  if (ACTIVITY_SEVERITIES.has(severity)) params.set('severity', severity);
  if (ACTIVITY_REVIEW_STATUSES.has(reviewStatus)) params.set('review_status', reviewStatus);
  if (dateFrom) params.set('date_from', dateFrom);
  if (dateTo && (!dateFrom || dateTo >= dateFrom)) params.set('date_to', dateTo);
  if (search) params.set('search', search);
  if (page) params.set('page', String(page));
  return pathWithParams(safe.path, params);
}

function expirationReturnParams(input: URLSearchParams) {
  const params = new URLSearchParams();
  const view = input.get('view') === 'upcoming' ? 'upcoming' : (input.get('view') === 'expired' ? 'expired' : '');
  const range = Number(input.get('range'));
  const page = positivePage(input.get('page'));
  const query = text(input.get('query'), 80);
  const product = text(input.get('product'), 15);
  const variation = text(input.get('variation'), 15);
  if (view) params.set('view', view);
  if (view === 'upcoming' && [30, 60, 90].includes(range)) params.set('range', String(range));
  if (page) params.set('page', String(page));
  if (query) params.set('query', query);
  if (RECORD_ID_PATTERN.test(product)) params.set('product', product);
  if (RECORD_ID_PATTERN.test(variation)) params.set('variation', variation);
  return params;
}

function teamActivityReturnParams(input: URLSearchParams) {
  const params = new URLSearchParams({ tab: 'activity' });
  const moduleName = text(input.get('module'), 40).toLowerCase();
  const action = text(input.get('action'), 80).toLowerCase();
  const severity = text(input.get('severity'), 20).toLowerCase();
  const reviewStatus = text(input.get('review_status'), 30).toLowerCase();
  const dateFrom = validCivilDate(input.get('date_from'));
  const dateTo = validCivilDate(input.get('date_to'));
  const search = text(input.get('search'), 120);
  const page = positivePage(input.get('page'));
  if (ACTIVITY_MODULES.has(moduleName)) params.set('module', moduleName);
  if (ACTION_PATTERN.test(action)) params.set('action', action);
  if (ACTIVITY_SEVERITIES.has(severity)) params.set('severity', severity);
  if (ACTIVITY_REVIEW_STATUSES.has(reviewStatus)) params.set('review_status', reviewStatus);
  if (dateFrom) params.set('date_from', dateFrom);
  if (dateTo && (!dateFrom || dateTo >= dateFrom)) params.set('date_to', dateTo);
  if (search) params.set('search', search);
  if (page) params.set('page', String(page));
  return params;
}

export function resolveProductHistoryReturnNavigation(
  storeSlug: string,
  input: URLSearchParams,
): ProductHistoryReturnNavigation {
  const requestedOrigin = input.get('from');
  if (requestedOrigin === 'team-activity') {
    return {
      origin: 'team-activity',
      path: pathWithParams(getStoreAdminPath(storeSlug, 'team'), teamActivityReturnParams(input)),
      label: 'Volver a Actividad del equipo',
    };
  }
  if (requestedOrigin === 'expirations') {
    return {
      origin: 'expirations',
      path: pathWithParams(getStoreAdminPath(storeSlug, 'expirations'), expirationReturnParams(input)),
      label: 'Volver a Vencimientos',
    };
  }
  return {
    origin: 'products',
    path: getStoreAdminPath(storeSlug, 'products'),
    label: 'Volver a Productos',
  };
}

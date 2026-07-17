import { normalizePriceWatchPage, normalizePriceWatchStatus } from './masterStoreOverview.ts';
import type { MasterPriceWatchDetail } from './masterProductWatches.ts';

export type MasterPriceWatchReturnContext = {
  page: number;
  status: 'active' | 'paused' | 'deleted' | 'all';
  storeId: string;
  search: string;
};

type ReturnContextInput = {
  return_page?: unknown;
  return_status?: unknown;
  return_store_id?: unknown;
  return_q?: unknown;
};

const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;

export function normalizePriceWatchReturnContext(input: ReturnContextInput): MasterPriceWatchReturnContext {
  const rawStoreId = String(input.return_store_id || '').trim();
  return {
    page: normalizePriceWatchPage(input.return_page),
    status: normalizePriceWatchStatus(input.return_status),
    storeId: RECORD_ID_PATTERN.test(rawStoreId) ? rawStoreId : '',
    search: String(input.return_q || '').trim().slice(0, 100),
  };
}

export function buildPriceWatchDetailHref(watchId: string, context: MasterPriceWatchReturnContext) {
  const safeWatchId = String(watchId || '').trim();
  if (!RECORD_ID_PATTERN.test(safeWatchId)) return '/master/price-watch';

  const params = new URLSearchParams();
  params.set('return_page', String(context.page));
  params.set('return_status', context.status);
  if (context.storeId) params.set('return_store_id', context.storeId);
  if (context.search) params.set('return_q', context.search);
  return `/master/price-watch/${encodeURIComponent(safeWatchId)}?${params.toString()}`;
}

export function matchesPriceWatchProductContext(
  detail: MasterPriceWatchDetail | null,
  watchId: string,
  storeId: string,
  productId: string,
) {
  return Boolean(
    detail?.product.exists
    && RECORD_ID_PATTERN.test(watchId)
    && RECORD_ID_PATTERN.test(storeId)
    && RECORD_ID_PATTERN.test(productId)
    && detail.watch.id === watchId
    && detail.product.id === productId
    && detail.store.id === storeId,
  );
}

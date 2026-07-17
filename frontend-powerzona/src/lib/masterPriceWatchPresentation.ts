import type { MasterPriceHistoryItem } from './masterProductWatches.ts';

export type MasterPriceMovement = {
  beforeUsd: number;
  afterUsd: number;
  differenceUsd: number;
  direction: 'down' | 'up' | 'removed';
};

function roundedUsd(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

export function formatPriceEventCount(value: unknown) {
  const count = Math.max(0, Math.floor(Number(value) || 0));
  return `${count} ${count === 1 ? 'evento' : 'eventos'}`;
}

export function resolvePriceHistoryMovement(item: MasterPriceHistoryItem): MasterPriceMovement | null {
  if (item.change_type === 'product_deleted') {
    return {
      beforeUsd: roundedUsd(item.effective_price_before_usd),
      afterUsd: 0,
      differenceUsd: 0,
      direction: 'removed',
    };
  }

  const variationScoped = item.change_type.startsWith('variation_') || Boolean(item.variation_label);
  const beforeUsd = roundedUsd(variationScoped
    ? item.before_effective_price_usd
    : item.effective_price_before_usd);
  const afterUsd = roundedUsd(variationScoped
    ? item.after_effective_price_usd
    : item.effective_price_after_usd);
  const signedDifference = roundedUsd(afterUsd - beforeUsd);

  if (signedDifference === 0) return null;
  return {
    beforeUsd,
    afterUsd,
    differenceUsd: Math.abs(signedDifference),
    direction: signedDifference < 0 ? 'down' : 'up',
  };
}

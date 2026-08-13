export type ProductActionsMenuRect = Readonly<{
  top: number;
  right: number;
  bottom: number;
}>;

export type ProductActionsMenuPosition = Readonly<{
  top: number;
  left: number;
  maxHeight: number;
  openAbove: boolean;
}>;

function finite(value: unknown, fallback = 0) {
  const candidate = Number(value);
  return Number.isFinite(candidate) ? candidate : fallback;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

export function calculateProductActionsMenuPosition({
  triggerRect,
  menuWidth,
  menuHeight,
  viewportWidth,
  viewportHeight,
  viewportPadding = 12,
  topReserved = 12,
  bottomReserved = 12,
  gap = 8,
}: {
  triggerRect: ProductActionsMenuRect;
  menuWidth: number;
  menuHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  viewportPadding?: number;
  topReserved?: number;
  bottomReserved?: number;
  gap?: number;
}): ProductActionsMenuPosition {
  const safeViewportWidth = Math.max(1, finite(viewportWidth, 1));
  const safeViewportHeight = Math.max(1, finite(viewportHeight, 1));
  const safePadding = Math.max(0, finite(viewportPadding, 12));
  const safeTop = clamp(finite(topReserved, safePadding), 0, safeViewportHeight);
  const safeBottom = clamp(finite(bottomReserved, safePadding), 0, safeViewportHeight - safeTop);
  const safeGap = Math.max(0, finite(gap, 8));
  const availableViewportHeight = Math.max(1, safeViewportHeight - safeTop - safeBottom);
  const naturalHeight = clamp(finite(menuHeight, 1), 1, availableViewportHeight);
  const safeMenuWidth = clamp(finite(menuWidth, 1), 1, Math.max(1, safeViewportWidth - (safePadding * 2)));
  const triggerTop = clamp(finite(triggerRect?.top), 0, safeViewportHeight);
  const triggerBottom = clamp(finite(triggerRect?.bottom, triggerTop), triggerTop, safeViewportHeight);
  const triggerRight = clamp(finite(triggerRect?.right), 0, safeViewportWidth);
  const availableBelow = Math.max(0, safeViewportHeight - safeBottom - triggerBottom - safeGap);
  const availableAbove = Math.max(0, triggerTop - safeTop - safeGap);
  const openAbove = availableBelow < naturalHeight && availableAbove > availableBelow;
  const directionalHeight = openAbove ? availableAbove : availableBelow;
  const maxHeight = Math.max(1, Math.min(naturalHeight, directionalHeight || availableViewportHeight));
  const unclampedTop = openAbove
    ? triggerTop - safeGap - maxHeight
    : triggerBottom + safeGap;
  const top = clamp(unclampedTop, safeTop, safeViewportHeight - safeBottom - maxHeight);
  const left = clamp(
    triggerRight - safeMenuWidth,
    safePadding,
    safeViewportWidth - safePadding - safeMenuWidth,
  );

  return { top, left, maxHeight, openAbove };
}

export type PromoAdminConfirmTone = 'normal' | 'info' | 'success' | 'warning' | 'danger';

export interface PromoAdminConfirmOptions {
  title: string;
  message: string;
  confirmText: string;
  cancelText?: string;
  kicker?: string;
  tone?: PromoAdminConfirmTone;
}

interface SharedAdminDialog {
  confirm(options: PromoAdminConfirmOptions): Promise<boolean>;
}

type PromoDialogWindow = Window & {
  AdminDialog?: SharedAdminDialog;
};

export async function confirmPromoAdminAction(options: PromoAdminConfirmOptions): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const dialog = (window as PromoDialogWindow).AdminDialog;
  if (!dialog || typeof dialog.confirm !== 'function') return false;
  return Boolean(await dialog.confirm({
    ...options,
    cancelText: options.cancelText || 'Cancelar',
    tone: options.tone || 'warning',
  }));
}

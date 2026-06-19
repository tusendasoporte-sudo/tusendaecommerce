export const TEMPORARILY_CLOSED_PUBLIC_MESSAGE = 'Estamos cerrados temporalmente. Vuelve pronto.';

export function isStoreTemporarilyClosed(settings: any) {
  return settings?.business_hours_mode === 'temporarily_closed';
}

export function getTemporarilyClosedMessage(settings: any) {
  const message = String(settings?.temporarily_closed_message || '').trim();
  return message || TEMPORARILY_CLOSED_PUBLIC_MESSAGE;
}

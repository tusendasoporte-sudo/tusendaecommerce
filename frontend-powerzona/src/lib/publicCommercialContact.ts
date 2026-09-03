export type PublicCommercialContact = {
  available: boolean;
  configured: boolean;
  href: string;
};

export type CommercialPlanContactDetails = {
  storeTypeName: string;
  planName: string;
  duration: string;
  monthlyEquivalent: string;
  total: string;
  isTrial: boolean;
};

const REQUEST_TIMEOUT_MS = 3500;
const WHATSAPP_PATH_PATTERN = /^\/[1-9][0-9]{7,14}$/;

function cleanText(value: unknown, maxLength = 160) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function publicWhatsappBaseHref(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw || !/^[+0-9\s().-]+$/.test(raw)) return '';
  const digits = raw.replace(/\D/g, '');
  return /^[1-9][0-9]{7,14}$/.test(digits) ? `https://wa.me/${digits}` : '';
}

export function normalizePublicCommercialContact(value: unknown): PublicCommercialContact | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const payload = value as Record<string, any>;
  const contact = payload.contact;
  if (payload.ok !== true || !contact || typeof contact !== 'object' || Array.isArray(contact)) return null;
  if (contact.configured === false && contact.href === '') {
    return { available: true, configured: false, href: '' };
  }
  if (contact.configured !== true || typeof contact.href !== 'string') return null;
  try {
    const url = new URL(contact.href);
    if (url.protocol !== 'https:' || url.hostname !== 'wa.me' || !WHATSAPP_PATH_PATTERN.test(url.pathname)
      || url.search || url.hash || url.username || url.password) return null;
    return { available: true, configured: true, href: url.toString() };
  } catch (_) {
    return null;
  }
}

export async function getPublicCommercialContact(
  pocketbaseUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<PublicCommercialContact> {
  const baseUrl = String(pocketbaseUrl || '').trim().replace(/\/$/, '');
  if (!baseUrl) return { available: false, configured: false, href: '' };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetcher(`${baseUrl}/api/pz/public/commercial-contact`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    const contact = response.status === 200 ? normalizePublicCommercialContact(payload) : null;
    return contact || { available: false, configured: false, href: '' };
  } catch (_) {
    return { available: false, configured: false, href: '' };
  } finally {
    clearTimeout(timeout);
  }
}

export function buildCommercialPlanWhatsappHref(
  baseHref: string,
  details: CommercialPlanContactDetails,
) {
  const storeTypeName = cleanText(details.storeTypeName, 100);
  const planName = cleanText(details.planName, 100);
  const duration = cleanText(details.duration, 80);
  const monthlyEquivalent = cleanText(details.monthlyEquivalent, 80);
  const total = cleanText(details.total, 80);
  if (!storeTypeName || !planName || !duration || !monthlyEquivalent || !total) return '';
  try {
    const url = new URL(baseHref);
    if (url.protocol !== 'https:' || url.hostname !== 'wa.me' || !WHATSAPP_PATH_PATTERN.test(url.pathname)
      || url.search || url.hash || url.username || url.password) return '';
    const intent = details.isTrial ? 'activar la prueba gratuita' : 'contratar un plan';
    const priceLine = details.isTrial ? '' : `\nPrecio mensual equivalente: ${monthlyEquivalent}.`;
    const message = `Hola, quiero ${intent} de Tu Senda 84.\n\nModalidad: ${storeTypeName}.\nPlan: ${planName}.\nDuración: ${duration}.${priceLine}\nTotal a pagar: ${total}.\n\n¿Podrían ayudarme a comenzar?`;
    url.searchParams.set('text', message);
    return url.toString();
  } catch (_) {
    return '';
  }
}

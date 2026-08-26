const SUPPORT_ENDPOINT = '/api/pz/admin/support-contact';
const SUPPORT_REQUEST_TIMEOUT_MS = 3500;
const WHATSAPP_PATH_PATTERN = /^\/[1-9][0-9]{7,14}$/;
const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;

export type AdminSupportContact = {
  configured: boolean;
  href: string;
};

export type AdminSupportContactResult = {
  available: boolean;
  status: number;
  contact: AdminSupportContact;
};

type SupportContactOptions = {
  baseUrl: string;
  token: string;
  supportStoreId?: string;
  fetcher?: typeof fetch;
};

const unavailable = (status = 0): AdminSupportContactResult => ({
  available: false,
  status,
  contact: { configured: false, href: '' },
});

function normalizeContact(value: unknown): AdminSupportContact | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.configured === false && candidate.href === '') {
    return { configured: false, href: '' };
  }
  if (candidate.configured !== true || typeof candidate.href !== 'string') return null;

  try {
    const url = new URL(candidate.href);
    if (url.protocol !== 'https:'
      || url.hostname !== 'wa.me'
      || !WHATSAPP_PATH_PATTERN.test(url.pathname)
      || !url.searchParams.get('text')) return null;
    return { configured: true, href: url.toString() };
  } catch (_) {
    return null;
  }
}

export async function getAdminSupportContact({
  baseUrl,
  token,
  supportStoreId,
  fetcher = fetch,
}: SupportContactOptions): Promise<AdminSupportContactResult> {
  const normalizedBaseUrl = String(baseUrl || '').trim().replace(/\/$/, '');
  const normalizedToken = String(token || '').trim();
  const normalizedSupportStoreId = String(supportStoreId || '').trim().toLowerCase();
  if (!normalizedBaseUrl || !normalizedToken) return unavailable();
  if (supportStoreId !== undefined && !RECORD_ID_PATTERN.test(normalizedSupportStoreId)) return unavailable();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPPORT_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetcher(`${normalizedBaseUrl}${SUPPORT_ENDPOINT}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${normalizedToken}`,
        ...(normalizedSupportStoreId ? { 'X-PZ-Support-Store': normalizedSupportStoreId } : {}),
      },
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    const contact = response.status === 200 && payload?.ok === true
      ? normalizeContact(payload.contact)
      : null;
    return contact
      ? { available: true, status: response.status, contact }
      : unavailable(response.status);
  } catch (_) {
    return unavailable();
  } finally {
    clearTimeout(timeout);
  }
}

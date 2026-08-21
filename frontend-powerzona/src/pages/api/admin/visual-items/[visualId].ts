import type { APIRoute } from 'astro';
import { refreshAuthFromCookie } from '../../../../lib/auth';
import { serverPocketBaseUrl } from '../../../../lib/pocketBaseServerUrl';
import { requireCurrentStoreForAdmin } from '../../../../lib/storeContext';
import { getStoreAccessContext } from '../../../../lib/storeTeam';
import { hasStorePermission } from '../../../../lib/storeTeamPermissions';

const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const MAX_REQUEST_BYTES = 12 * 1024 * 1024;
const ALLOWED_FIELDS = new Set([
  'type',
  'title',
  'description',
  'button_text',
  'action_type',
  'target_url',
  'whatsapp_message',
  'category',
  'sort_order',
  'active',
  'image',
  'attachment',
]);

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store, max-age=0',
      Pragma: 'no-cache',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
    },
  });
}

function safeId(value: unknown) {
  const id = String(value || '').trim();
  return RECORD_ID_PATTERN.test(id) ? id : '';
}

function relationId(value: unknown) {
  if (Array.isArray(value)) return String(value[0] || '');
  if (value && typeof value === 'object') return String((value as { id?: unknown }).id || '');
  return String(value || '');
}

function cleanText(value: unknown, max: number) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function sameOriginMutation(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const origin = new URL(String(request.headers.get('origin') || '').trim());
    const fetchSite = String(request.headers.get('sec-fetch-site') || '').trim().toLowerCase();
    if (fetchSite && fetchSite !== 'same-origin') return false;
    if (origin.origin === requestUrl.origin) return true;
    const proto = String(request.headers.get('x-forwarded-proto') || '').trim().toLowerCase();
    const host = String(request.headers.get('x-forwarded-host') || '').trim().toLowerCase();
    return Boolean(proto && host && !proto.includes(',') && !host.includes(','))
      && proto === origin.protocol.slice(0, -1)
      && host === requestUrl.host.toLowerCase()
      && host === origin.host.toLowerCase();
  } catch {
    return false;
  }
}

function sanitizeItem(record: any) {
  return {
    id: safeId(record?.id),
    store: relationId(record?.store),
    type: cleanText(record?.type, 40),
    title: cleanText(record?.title, 160),
    description: cleanText(record?.description, 600),
    image: String(Array.isArray(record?.image) ? record.image[0] || '' : record?.image || ''),
    button_text: cleanText(record?.button_text, 120),
    action_type: cleanText(record?.action_type, 40),
    target_url: cleanText(record?.target_url, 1200),
    whatsapp_message: cleanText(record?.whatsapp_message, 1200),
    category: relationId(record?.category),
    attachment: String(Array.isArray(record?.attachment) ? record.attachment[0] || '' : record?.attachment || ''),
    sort_order: Math.max(0, Number(record?.sort_order || 0)),
    active: record?.active !== false,
  };
}

async function adminContext(request: Request) {
  const authPb = await refreshAuthFromCookie(request.headers.get('cookie') || '');
  const storeSlug = String(new URL(request.url).searchParams.get('store') || '').trim().toLowerCase();
  const context = await requireCurrentStoreForAdmin(authPb, { storeSlug });
  const access = await getStoreAccessContext({
    baseUrl: import.meta.env.PUBLIC_POCKETBASE_URL,
    token: authPb.authStore.token,
    supportStoreId: context.isMasterSupport ? context.storeId : undefined,
  });
  const permissionContext = {
    permissions: access.access.permissions,
    is_primary_admin: access.access.is_primary_admin,
    blocked_by_plan: access.access.blocked_by_plan,
  };
  if (!hasStorePermission(permissionContext, 'promotions.manage')) {
    const error = new Error('visual_access_denied') as Error & { status?: number };
    error.status = 403;
    throw error;
  }
  return { authPb, context };
}

async function pocketBaseRequest(
  path: string,
  token: string,
  supportStoreId: string,
  options: RequestInit = {},
) {
  const baseUrl = serverPocketBaseUrl();
  if (!baseUrl) throw new Error('visual_backend_unavailable');
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(supportStoreId ? { 'X-PZ-Support-Store': supportStoreId } : {}),
      ...(options.headers || {}),
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(30_000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error('visual_backend_failed') as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return result;
}

async function loadRecord(id: string, token: string, supportStoreId: string, storeId: string) {
  const record = await pocketBaseRequest(
    `/api/collections/store_visual_items/records/${encodeURIComponent(id)}`,
    token,
    supportStoreId,
  );
  if (relationId(record?.store) !== storeId) {
    const error = new Error('visual_not_found') as Error & { status?: number };
    error.status = 404;
    throw error;
  }
  return record;
}

async function loadCategories(token: string, supportStoreId: string, selectedId: string) {
  const result = await pocketBaseRequest(
    '/api/pz/store/marketing/selectors',
    token,
    supportStoreId,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refs: selectedId ? [selectedId] : [], taxonomy_page: 1, taxonomy_per_page: 100 }),
    },
  );
  return (Array.isArray(result?.categories) ? result.categories : []).flatMap((item: any) => {
    const ref = safeId(item?.ref);
    return ref ? [{ ref, name: cleanText(item?.name, 160) || 'Sin nombre' }] : [];
  });
}

function errorResponse(error: any) {
  const status = Number(error?.status || error?.response?.status || 0);
  if (status === 401 || status === 403) {
    return json({ ok: false, message: 'No tienes permiso para editar esta tarjeta.' }, 403);
  }
  if (status === 404) return json({ ok: false, message: 'No se encontró la tarjeta.' }, 404);
  if (status === 413) return json({ ok: false, message: 'El archivo supera el tamaño permitido.' }, 413);
  return json({ ok: false, message: 'No se pudo completar la operación.' }, status >= 500 ? 500 : 400);
}

export const GET: APIRoute = async ({ request, params }) => {
  const visualId = safeId(params.visualId);
  if (!visualId) return json({ ok: false, message: 'No se encontró la tarjeta.' }, 404);
  try {
    const { authPb, context } = await adminContext(request);
    const supportStoreId = context.isMasterSupport ? context.storeId : '';
    const record = await loadRecord(visualId, authPb.authStore.token, supportStoreId, context.storeId);
    const item = sanitizeItem(record);
    const categories = await loadCategories(authPb.authStore.token, supportStoreId, item.category);
    return json({ ok: true, item, categories });
  } catch (error) {
    return errorResponse(error);
  }
};

export const PATCH: APIRoute = async ({ request, params }) => {
  if (!sameOriginMutation(request)) return json({ ok: false, message: 'Solicitud no autorizada.' }, 403);
  const visualId = safeId(params.visualId);
  if (!visualId) return json({ ok: false, message: 'No se encontró la tarjeta.' }, 404);
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return json({ ok: false, message: 'El archivo supera el tamaño permitido.' }, 413);
  }
  try {
    const { authPb, context } = await adminContext(request);
    const supportStoreId = context.isMasterSupport ? context.storeId : '';
    await loadRecord(visualId, authPb.authStore.token, supportStoreId, context.storeId);
    const submitted = await request.formData();
    if ([...new Set(submitted.keys())].some((key) => !ALLOWED_FIELDS.has(key))) {
      return json({ ok: false, message: 'La solicitud contiene campos no permitidos.' }, 400);
    }

    const type = cleanText(submitted.get('type'), 40);
    const actionType = cleanText(submitted.get('action_type'), 40);
    const title = cleanText(submitted.get('title'), 160);
    const category = cleanText(submitted.get('category'), 40);
    if (!['promo_visual', 'acceso_rapido'].includes(type)
      || !['whatsapp', 'url', 'categoria', 'archivo'].includes(actionType)
      || !title
      || (category && !safeId(category))) {
      return json({ ok: false, message: 'Revisa los datos de la tarjeta.' }, 400);
    }

    const payload = new FormData();
    payload.append('store', context.storeId);
    payload.append('type', type);
    payload.append('title', title);
    payload.append('description', cleanText(submitted.get('description'), 600));
    payload.append('button_text', cleanText(submitted.get('button_text'), 120));
    payload.append('action_type', actionType);
    payload.append('target_url', cleanText(submitted.get('target_url'), 1200));
    payload.append('whatsapp_message', cleanText(submitted.get('whatsapp_message'), 1200));
    payload.append('category', category);
    payload.append('sort_order', String(Math.max(0, Number(submitted.get('sort_order') || 0))));
    payload.append('active', submitted.get('active') === 'true' ? 'true' : 'false');

    const image = submitted.get('image');
    const attachment = submitted.get('attachment');
    if (image instanceof File && image.size > 0) payload.append('image', image);
    if (attachment instanceof File && attachment.size > 0) payload.append('attachment', attachment);

    const record = await pocketBaseRequest(
      `/api/collections/store_visual_items/records/${encodeURIComponent(visualId)}`,
      authPb.authStore.token,
      supportStoreId,
      { method: 'PATCH', body: payload },
    );
    return json({ ok: true, item: sanitizeItem(record) });
  } catch (error) {
    return errorResponse(error);
  }
};

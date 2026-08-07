import type { APIRoute } from 'astro';
import { serverPocketBaseUrl } from '../../../lib/pocketBaseServerUrl.ts';
import { RAFFLES_PRIVATE_NO_STORE_HEADERS } from '../../../lib/raffleAccess';
import { publicSecurityProxyHeaders } from '../../../lib/publicSecurity';

const MAX_BODY_BYTES = 4096;

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...RAFFLES_PRIVATE_NO_STORE_HEADERS,
      'Content-Type': 'application/json',
    },
  });
}

function canonicalizeReceiptLinks(result: any, requestUrl: string) {
  const receipt = result?.receipt;
  if (!receipt || typeof receipt !== 'object' || !receipt.raffle_url) return result;
  const absoluteRaffleUrl = new URL(String(receipt.raffle_url), requestUrl).toString();
  receipt.raffle_url = absoluteRaffleUrl;
  if (receipt.whatsapp_url) {
    try {
      const whatsappUrl = new URL(String(receipt.whatsapp_url));
      const text = whatsappUrl.searchParams.get('text') || '';
      whatsappUrl.searchParams.set(
        'text',
        text.replace(/Link de la rifa:\s*[^\n]*/u, `Link de la rifa: ${absoluteRaffleUrl}`),
      );
      receipt.whatsapp_url = whatsappUrl.toString();
    } catch (_) {
      receipt.whatsapp_url = '';
    }
  }
  return result;
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const length = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    return json({ ok: false, message: 'Solicitud demasiado grande.' }, 413);
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return json({ ok: false, message: 'Solicitud inválida.' }, 400);
  }

  const baseUrl = serverPocketBaseUrl();
  if (!baseUrl) {
    return json({ ok: false, message: 'No se pudo reservar el número. Intenta nuevamente.' }, 503);
  }

  try {
    const response = await fetch(`${baseUrl}/api/pz/raffles/enter`, {
      method: 'POST',
      headers: publicSecurityProxyHeaders(request, clientAddress),
      cache: 'no-store',
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => null);
    if (!result || typeof result !== 'object') {
      return json({ ok: false, message: 'No se pudo reservar el número. Intenta nuevamente.' }, 502);
    }
    return json(canonicalizeReceiptLinks(result, request.url), response.status);
  } catch (_) {
    return json({ ok: false, message: 'No se pudo reservar el número. Intenta nuevamente.' }, 503);
  }
};

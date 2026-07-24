import type { APIRoute } from 'astro';
import QRCode from 'qrcode';
import { getStoreBySlug } from '../../../../lib/stores';
import {
  LANDING_QR_PRIVATE_NO_STORE_HEADERS,
  getLandingQrPath,
  landingQrUnavailableResponse,
  resolveLandingQrCapability,
} from '../../../../lib/landingQr';

export const GET: APIRoute = async ({ params, url }) => {
  const store = await getStoreBySlug(String(params.storeSlug || ''));

  if (!store) {
    return landingQrUnavailableResponse();
  }

  if (!resolveLandingQrCapability(store).allowed) {
    return landingQrUnavailableResponse();
  }

  const publicUrl = new URL(getLandingQrPath(store), url.origin).toString();
  const svg = await QRCode.toString(publicUrl, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 512,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      ...LANDING_QR_PRIVATE_NO_STORE_HEADERS,
    },
  });
};

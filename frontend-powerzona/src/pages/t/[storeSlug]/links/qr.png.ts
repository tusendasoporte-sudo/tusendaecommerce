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
  const png = await QRCode.toBuffer(publicUrl, {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 1024,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });

  return new Response(png, {
    headers: {
      'Content-Type': 'image/png',
      ...LANDING_QR_PRIVATE_NO_STORE_HEADERS,
    },
  });
};

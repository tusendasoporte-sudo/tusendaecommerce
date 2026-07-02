import type { APIRoute } from 'astro';
import QRCode from 'qrcode';
import { getStoreBySlug } from '../../../../lib/stores';
import { getLandingQrPath } from '../../../../lib/landingQr';

export const GET: APIRoute = async ({ params, url }) => {
  const store = await getStoreBySlug(String(params.storeSlug || ''));

  if (!store) {
    return new Response('Tienda no encontrada.', { status: 404 });
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
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
};

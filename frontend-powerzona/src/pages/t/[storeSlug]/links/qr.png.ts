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
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
};

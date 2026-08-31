import type { APIRoute } from 'astro';

import { publicPocketBaseUrl } from '../../../lib/pocketBaseServerUrl';
import { storefrontAppDownloadAliasUrl } from '../../../lib/storefrontAppDownload';

function unavailable(status = 404) {
  return new Response(JSON.stringify({ ok: false, error: 'apk_not_found' }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store, max-age=0',
      Pragma: 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

export const GET: APIRoute = ({ params }) => {
  const location = storefrontAppDownloadAliasUrl(publicPocketBaseUrl(), params.storeSlug);
  if (!location) return unavailable(503);
  return new Response(null, {
    status: 307,
    headers: {
      Location: location,
      'Cache-Control': 'private, no-store, max-age=0',
      Pragma: 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'Referrer-Policy': 'no-referrer',
    },
  });
};

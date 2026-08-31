import type { APIRoute } from 'astro';

const statements = Object.freeze([
  Object.freeze({
    relation: Object.freeze(['delegate_permission/common.handle_all_urls']),
    target: Object.freeze({
      namespace: 'android_app',
      package_name: 'com.tusenda84.powerzona',
      sha256_cert_fingerprints: Object.freeze([
        '12:5B:DC:CC:B5:53:0D:94:FC:7C:0C:E3:32:21:BE:78:52:96:0C:45:3E:D2:F0:47:46:29:82:FC:C5:4F:B3:72',
      ]),
    }),
  }),
]);

export const GET: APIRoute = async () => new Response(JSON.stringify(statements), {
  status: 200,
  headers: {
    'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  },
});

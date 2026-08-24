import type { APIRoute } from 'astro';
import { PromoPublicShellError, promoPublicUnavailable } from '../../../lib/promoPublicShell';
import { promoSeoResourceResponse, readPlatformPromoSeo } from '../../../lib/promoPublicSeo';

export const GET: APIRoute = async ({ params, request, url }) => {
  if (url.search) return promoPublicUnavailable(404);
  try {
    return promoSeoResourceResponse(await readPlatformPromoSeo(request, String(params.publicSlug || ''), 'sitemap'));
  } catch (error) {
    return promoPublicUnavailable(error instanceof PromoPublicShellError ? error.status : 503);
  }
};

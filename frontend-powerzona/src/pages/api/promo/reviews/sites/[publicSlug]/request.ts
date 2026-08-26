import type { APIRoute } from 'astro';
import { publicReviewRequestContext } from '../../../../../../lib/promoPublicReviewsApi';

export const POST: APIRoute = async ({ request, params }) => publicReviewRequestContext(request, params.publicSlug);

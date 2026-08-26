import type { APIRoute } from 'astro';
import { publicReviewRequestPhoto } from '../../../../../../lib/promoPublicReviewsApi';

export const POST: APIRoute = async ({ request, params }) => publicReviewRequestPhoto(request, params.publicSlug);

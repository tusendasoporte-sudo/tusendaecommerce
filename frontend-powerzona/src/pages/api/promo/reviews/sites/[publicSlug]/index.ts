import type { APIRoute } from 'astro';
import { publicReviewsList, publicReviewSubmit } from '../../../../../../lib/promoPublicReviewsApi';

export const GET: APIRoute = async ({ request, params }) => publicReviewsList(request, params.publicSlug);
export const POST: APIRoute = async ({ request, params }) => publicReviewSubmit(request, params.publicSlug);

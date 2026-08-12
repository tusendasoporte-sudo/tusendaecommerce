import type { APIRoute } from 'astro';
import { consumeStorefrontBootstrap } from '../../../../../../lib/storefrontPushAppCheck.ts';

export const prerender = false;

export const GET: APIRoute = async ({ request, clientAddress, params }) => consumeStorefrontBootstrap({
  request,
  clientAddress,
  code: String(params.code || ''),
});

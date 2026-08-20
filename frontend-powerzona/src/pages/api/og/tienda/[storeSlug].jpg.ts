import type { APIRoute } from 'astro';
import { Buffer } from 'node:buffer';
import sharp, { type Sharp } from 'sharp';
import { getSettings } from '../../../../lib/api';
import {
  STORE_SOCIAL_IMAGE_HEIGHT,
  STORE_SOCIAL_IMAGE_WIDTH,
  cleanStoreSeoText,
} from '../../../../lib/storeSeo';
import { getStoreBySlug } from '../../../../lib/stores';

const JPEG_TARGET_BYTES = 450_000;
const JPEG_QUALITIES = [84, 80, 76, 72];
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const RESPONSE_HEADERS = {
  'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
  'X-Content-Type-Options': 'nosniff',
};
const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
};

export const GET: APIRoute = async ({ params }) => {
  const storeSlug = cleanStoreSeoText(params.storeSlug).replace(/\.jpe?g$/i, '').toLowerCase();
  if (!storeSlug) return notFound();

  try {
    const store = await getStoreBySlug(storeSlug);
    if (!store) return notFound();

    const settings = await getSettings({ storeId: store.id, store }).catch(() => null);
    const galleryHeroUrls = Array.isArray(settings?.coverGalleryHeroUrls)
      ? settings.coverGalleryHeroUrls.filter(Boolean)
      : [];
    const coverUrl = settings?.cover_mode === 'carousel' && galleryHeroUrls.length
      ? galleryHeroUrls[0]
      : store.bannerHeroUrl
        || settings?.coverHeroImageUrl
        || galleryHeroUrls[0]
        || '';
    const logoUrl = settings?.logoImageUrl || store.logoUrl || '';
    const storeName = cleanStoreSeoText(settings?.store_name || settings?.stored_name || store.name, 'Tienda');
    const jpeg = await renderStoreSocialImage({ coverUrl, logoUrl, storeName });

    return new Response(jpeg, {
      headers: {
        'Content-Type': 'image/jpeg',
        ...RESPONSE_HEADERS,
      },
    });
  } catch (_) {
    return notFound();
  }
};

function notFound() {
  return new Response('Not found', { status: 404, headers: NO_STORE_HEADERS });
}

async function renderStoreSocialImage(input: { coverUrl: unknown; logoUrl: unknown; storeName: string }) {
  const cover = await fetchPublicImage(input.coverUrl);
  if (cover) {
    return encodeOptimizedJpeg(
      sharp(cover, { failOn: 'none' })
        .rotate()
        .resize(STORE_SOCIAL_IMAGE_WIDTH, STORE_SOCIAL_IMAGE_HEIGHT, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
    );
  }

  const logo = await fetchPublicImage(input.logoUrl);
  if (logo) {
    const containedLogo = await sharp(logo, { failOn: 'none' })
      .rotate()
      .resize(360, 360, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 },
      })
      .png()
      .toBuffer();
    const metadata = await sharp(containedLogo).metadata();
    const left = Math.max(0, Math.round((STORE_SOCIAL_IMAGE_WIDTH - Number(metadata.width || 0)) / 2));
    const top = Math.max(0, Math.round((STORE_SOCIAL_IMAGE_HEIGHT - Number(metadata.height || 0)) / 2));
    return encodeOptimizedJpeg(createCleanBackground().composite([{ input: containedLogo, left, top }]));
  }

  return encodeOptimizedJpeg(sharp(Buffer.from(createFallbackSvg(input.storeName))));
}

async function fetchPublicImage(value: unknown) {
  const url = cleanStoreSeoText(value);
  if (!/^https?:\/\//i.test(url)) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType && !contentType.toLowerCase().startsWith('image/')) return null;
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > MAX_SOURCE_BYTES) return null;

    const source = Buffer.from(await response.arrayBuffer());
    return source.length > 0 && source.length <= MAX_SOURCE_BYTES ? source : null;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function createCleanBackground() {
  return sharp({
    create: {
      width: STORE_SOCIAL_IMAGE_WIDTH,
      height: STORE_SOCIAL_IMAGE_HEIGHT,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  });
}

function createFallbackSvg(storeName: string) {
  const safeName = escapeSvg(cleanStoreSeoText(storeName, 'Tienda')).slice(0, 60);
  const initials = escapeSvg(getStoreInitials(safeName));
  return `<svg width="${STORE_SOCIAL_IMAGE_WIDTH}" height="${STORE_SOCIAL_IMAGE_HEIGHT}" viewBox="0 0 ${STORE_SOCIAL_IMAGE_WIDTH} ${STORE_SOCIAL_IMAGE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#f8fafc"/>
    <rect x="390" y="95" width="420" height="440" rx="42" fill="#ffffff" stroke="#e2e8f0" stroke-width="4"/>
    <rect x="510" y="145" width="180" height="180" rx="48" fill="#111827"/>
    <text x="600" y="260" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="72" font-weight="900" fill="#ffffff">${initials}</text>
    <text x="600" y="405" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="46" font-weight="900" fill="#0f172a">${safeName}</text>
    <text x="600" y="460" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700" fill="#64748b">Tienda en Tu Senda 84</text>
  </svg>`;
}

function getStoreInitials(value: string) {
  const parts = cleanStoreSeoText(value, 'Tienda').split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'TS';
}

function escapeSvg(value: unknown) {
  return cleanStoreSeoText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function encodeOptimizedJpeg(image: Sharp) {
  let optimized = Buffer.alloc(0);

  for (const quality of JPEG_QUALITIES) {
    const candidate = await image
      .clone()
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .jpeg({ quality, mozjpeg: true, progressive: true, chromaSubsampling: '4:2:0' })
      .toBuffer();
    optimized = candidate;
    if (candidate.length <= JPEG_TARGET_BYTES) break;
  }

  return optimized;
}

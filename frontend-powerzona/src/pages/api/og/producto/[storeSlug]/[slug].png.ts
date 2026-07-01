import type { APIRoute } from 'astro';
import { Buffer } from 'node:buffer';
import sharp from 'sharp';
import { getProductBySlug, getSettings } from '../../../../../lib/api';
import {
  PRODUCT_OG_HEIGHT,
  PRODUCT_OG_WIDTH,
  cleanSeoText,
} from '../../../../../lib/productSeo';
import { isStoreTemporarilyClosed } from '../../../../../lib/storeAvailability';
import { getStoreBySlug } from '../../../../../lib/stores';

const CARD_WIDTH = PRODUCT_OG_WIDTH;
const CARD_HEIGHT = PRODUCT_OG_HEIGHT;
const PRODUCT_IMAGE_MAX_WIDTH = 1120;
const PRODUCT_IMAGE_MAX_HEIGHT = 600;

export const GET: APIRoute = async ({ params }) => {
  const storeSlug = cleanSeoText(params.storeSlug).toLowerCase();
  const productSlug = cleanSeoText(params.slug).replace(/\.png$/i, '');

  if (!storeSlug || !productSlug) {
    return new Response('Not found', { status: 404 });
  }

  try {
    const store = await getStoreBySlug(storeSlug);
    if (!store) return new Response('Not found', { status: 404 });

    const storeQuery = { storeId: store.id };
    const settings = await getSettings(storeQuery);
    if (isStoreTemporarilyClosed(settings)) return new Response('Not found', { status: 404 });

    const product = await getProductBySlug(productSlug, storeQuery);
    const productImageUrl = product.imageUrls?.[0] || '';
    const png = await renderProductOgImage(productImageUrl);

    return new Response(png, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (_) {
    return new Response('Not found', { status: 404 });
  }
};

async function renderProductOgImage(productImageUrl: unknown) {
  const background = await createCleanBackground();
  const productImage = await getContainedProductImage(productImageUrl);

  if (!productImage) {
    return background
      .composite([{ input: await createNoImagePlaceholder(), left: 390, top: 105 }])
      .png({ compressionLevel: 9 })
      .toBuffer();
  }

  const metadata = await sharp(productImage).metadata();
  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);
  const left = Math.max(0, Math.round((CARD_WIDTH - width) / 2));
  const top = Math.max(0, Math.round((CARD_HEIGHT - height) / 2));

  return background
    .composite([{ input: productImage, left, top }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function createCleanBackground() {
  const base = sharp({
    create: {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      channels: 4,
      background: { r: 248, g: 251, b: 255, alpha: 1 },
    },
  });

  return base.composite([
    {
      input: Buffer.from(
        `<svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
          <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="#ffffff"/>
          <rect x="28" y="28" width="1144" height="574" rx="42" fill="#f8fbff" stroke="#e6edf7" stroke-width="2"/>
          <ellipse cx="600" cy="585" rx="350" ry="30" fill="#dbe7f5" opacity="0.42"/>
        </svg>`
      ),
      left: 0,
      top: 0,
    },
  ]);
}

async function getContainedProductImage(value: unknown) {
  const url = cleanSeoText(value);
  if (!/^https?:\/\//i.test(url)) return '';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return '';
    const contentType = response.headers.get('content-type') || '';
    if (contentType && !contentType.toLowerCase().startsWith('image/')) return '';

    const source = await trimImageSafely(Buffer.from(await response.arrayBuffer()));
    return await sharp(source, { failOn: 'none' })
      .resize(PRODUCT_IMAGE_MAX_WIDTH, PRODUCT_IMAGE_MAX_HEIGHT, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 },
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
  } catch (_) {
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

async function trimImageSafely(source: Buffer) {
  try {
    const trimmed = await sharp(source, { failOn: 'none' })
      .rotate()
      .trim({
        background: { r: 255, g: 255, b: 255, alpha: 1 },
        threshold: 18,
      })
      .png()
      .toBuffer();

    return trimmed.length ? trimmed : source;
  } catch (_) {
    try {
      return await sharp(source, { failOn: 'none' }).rotate().png().toBuffer();
    } catch (_) {
      return source;
    }
  }
}

async function createNoImagePlaceholder() {
  return sharp({
    create: {
      width: 420,
      height: 420,
      channels: 4,
      background: { r: 241, g: 246, b: 252, alpha: 1 },
    },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="420" height="420" viewBox="0 0 420 420" xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="0" width="420" height="420" rx="54" fill="#f1f6fc"/>
            <rect x="118" y="128" width="184" height="164" rx="28" fill="#dce8f5"/>
            <rect x="146" y="100" width="128" height="54" rx="20" fill="#cbdbea"/>
            <circle cx="210" cy="210" r="46" fill="#edf4fb"/>
          </svg>`
        ),
        left: 0,
        top: 0,
      },
    ])
    .png()
    .toBuffer();
}

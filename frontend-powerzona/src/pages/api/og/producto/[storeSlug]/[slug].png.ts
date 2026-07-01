import type { APIRoute } from 'astro';
import { Buffer } from 'node:buffer';
import sharp from 'sharp';
import { getProductBySlug, getSettings } from '../../../../../lib/api';
import { cleanSeoText } from '../../../../../lib/productSeo';
import { isStoreTemporarilyClosed } from '../../../../../lib/storeAvailability';
import { getStoreBySlug } from '../../../../../lib/stores';

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1080;
const PRODUCT_IMAGE_MAX_WIDTH = 1000;
const PRODUCT_IMAGE_MAX_HEIGHT = 1020;

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
    const placeholder = await createNoImagePlaceholder();
    const metadata = await sharp(placeholder).metadata();
    const width = Number(metadata.width || 0);
    const height = Number(metadata.height || 0);

    return background
      .composite([
        {
          input: placeholder,
          left: Math.max(0, Math.round((CARD_WIDTH - width) / 2)),
          top: Math.max(0, Math.round((CARD_HEIGHT - height) / 2)),
        },
      ])
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
  return sharp({
    create: {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  });
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
  return sharp(
    Buffer.from(
      `<svg width="520" height="520" viewBox="0 0 520 520" xmlns="http://www.w3.org/2000/svg">
        <path d="M154 190h56l28-36h44l28 36h56c30 0 54 24 54 54v122c0 30-24 54-54 54H154c-30 0-54-24-54-54V244c0-30 24-54 54-54Z" fill="#dce8f5"/>
        <circle cx="260" cy="304" r="72" fill="#f7fbff"/>
        <circle cx="260" cy="304" r="46" fill="#dce8f5"/>
      </svg>`
    )
  )
    .png()
    .toBuffer();
}

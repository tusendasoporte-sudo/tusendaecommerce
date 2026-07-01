import type { APIRoute } from 'astro';
import { Buffer } from 'node:buffer';
import sharp from 'sharp';
import { getProductBySlug, getProductVariations, getSettings } from '../../../../../lib/api';
import {
  PRODUCT_OG_HEIGHT,
  PRODUCT_OG_WIDTH,
  buildProductSeoDescription,
  cleanSeoText,
  formatProductSeoPrice,
  getProductPublicSeoPrice,
  parseProductExtraInfo,
  pickProductSeoExtraInfo,
} from '../../../../../lib/productSeo';
import { isStoreTemporarilyClosed } from '../../../../../lib/storeAvailability';
import { getStoreBySlug } from '../../../../../lib/stores';

const CARD_WIDTH = PRODUCT_OG_WIDTH;
const CARD_HEIGHT = PRODUCT_OG_HEIGHT;
const SVG_FONT_STACK = 'DejaVu Sans, Liberation Sans, Noto Sans, Arial, sans-serif';

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
    const variations = product.has_variations ? await getProductVariations(product.id) : [];
    const price = getProductPublicSeoPrice(product, variations);
    const extraInfoItems = parseProductExtraInfo(
      product.extra_info ?? product.extraInfo ?? product.additional_info ?? product.product_extra_info ?? [],
      12
    );
    const seoExtraInfoItems = pickProductSeoExtraInfo(extraInfoItems, 3);
    const storeName = settings?.store_name || settings?.stored_name || store.name || 'Tienda';
    const productImageUrl = product.imageUrls?.[0] || '';
    const logoUrl = settings?.logoImageUrl || store.logoUrl || '';
    const description = buildProductSeoDescription({
      productName: product.name,
      extraInfoItems: seoExtraInfoItems,
      storeName,
      price,
    });

    const png = await renderProductOgImage({
      productName: product.name,
      storeName,
      price,
      productImageUrl,
      logoUrl,
      extraInfoItems: seoExtraInfoItems,
      description,
    });

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

type ProductOgImageInput = {
  productName: unknown;
  storeName: unknown;
  price: unknown;
  productImageUrl: unknown;
  logoUrl: unknown;
  extraInfoItems: Array<{ label: string; value: string }>;
  description: unknown;
};

async function renderProductOgImage(input: ProductOgImageInput) {
  const storeName = cleanSeoText(input.storeName, 'Tienda') || 'Tienda';
  const productName = cleanSeoText(input.productName, 'Producto') || 'Producto';
  const priceText = formatProductSeoPrice(input.price);
  const displayPrice = priceText ? `$${priceText}` : 'Disponible';
  const details = input.extraInfoItems.slice(0, 3).map((item) => `${item.label}: ${item.value}`);
  const [productImageDataUri, logoDataUri] = await Promise.all([
    imageUrlToPngDataUri(input.productImageUrl, 480, 430),
    imageUrlToPngDataUri(input.logoUrl, 140, 140),
  ]);

  const titleLines = wrapText(productName, 19, 3);
  const titleFontSize = titleLines.some((line) => line.length > 18) ? 52 : 58;
  const titleLineHeight = titleFontSize + 8;
  const priceY = 172 + titleLines.length * titleLineHeight + 42;
  const detailStartY = Math.min(priceY + 92, 478);
  const detailLines = details.length
    ? details.map((detail) => cleanSeoText(detail))
    : [`Disponible en ${storeName}`, 'Compra fácil por WhatsApp'];
  const priceBadgeWidth = Math.min(460, Math.max(260, 96 + displayPrice.length * 32));
  const safeFontFamily = escapeSvg(SVG_FONT_STACK);

  const productImageMarkup = productImageDataUri
    ? `<image href="${productImageDataUri}" x="86" y="96" width="466" height="410" preserveAspectRatio="xMidYMid meet" />`
    : `<text x="318" y="318" text-anchor="middle" font-family="${safeFontFamily}" font-size="148" font-weight="900" fill="#cbd5e1">${escapeSvg(productName.slice(0, 1).toUpperCase())}</text>`;
  const logoMarkup = logoDataUri
    ? `<image href="${logoDataUri}" x="612" y="56" width="74" height="74" preserveAspectRatio="xMidYMid slice" clip-path="url(#logoClip)" />`
    : `<rect x="612" y="56" width="74" height="74" rx="20" fill="#111827" /><text x="649" y="104" text-anchor="middle" font-family="${safeFontFamily}" font-size="27" font-weight="900" fill="#ffffff">${escapeSvg(getInitials(storeName))}</text>`;

  const titleMarkup = titleLines
    .map((line, index) => `<text x="612" y="${172 + index * titleLineHeight}" font-family="${safeFontFamily}" font-size="${titleFontSize}" font-weight="900" fill="#0f172a">${escapeSvg(line)}</text>`)
    .join('');
  const detailMarkup = detailLines
    .slice(0, 3)
    .map((line, index) => {
      const y = detailStartY + index * 42;
      return `<circle cx="624" cy="${y - 10}" r="6" fill="#2563eb" /><text x="644" y="${y}" font-family="${safeFontFamily}" font-size="30" font-weight="800" fill="#263449">${escapeSvg(limitInline(line, 36))}</text>`;
    })
    .join('');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f8fafc" />
      <stop offset="0.56" stop-color="#eef6ff" />
      <stop offset="1" stop-color="#fff7ed" />
    </linearGradient>
    <clipPath id="logoClip"><rect x="612" y="56" width="74" height="74" rx="20" /></clipPath>
  </defs>
  <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="url(#bg)" />
  <rect x="0" y="0" width="14" height="${CARD_HEIGHT}" fill="#2563eb" />
  <rect x="14" y="0" width="8" height="${CARD_HEIGHT}" fill="#ef4444" />
  <path d="M0 528 L1200 430 L1200 630 L0 630 Z" fill="#0f172a" opacity="0.055" />
  <rect x="54" y="54" width="530" height="522" rx="36" fill="#ffffff" stroke="#e2e8f0" stroke-width="2" />
  <rect x="84" y="86" width="470" height="434" rx="28" fill="#f8fafc" />
  ${productImageMarkup}
  ${logoMarkup}
  <text x="706" y="88" font-family="${safeFontFamily}" font-size="31" font-weight="900" fill="#111827">${escapeSvg(limitInline(storeName, 24))}</text>
  <text x="706" y="120" font-family="${safeFontFamily}" font-size="23" font-weight="800" fill="#52627a">Producto disponible</text>
  ${titleMarkup}
  <rect x="612" y="${priceY - 58}" width="${priceBadgeWidth}" height="84" rx="22" fill="#111827" />
  <text x="648" y="${priceY}" font-family="${safeFontFamily}" font-size="56" font-weight="900" fill="#ffffff">${escapeSvg(displayPrice)}</text>
  ${detailMarkup}
  <text x="612" y="574" font-family="${safeFontFamily}" font-size="27" font-weight="900" fill="#52627a">${escapeSvg(limitInline(`Disponible en ${storeName}`, 35))}</text>
</svg>`;

  return sharp(Buffer.from(svg), { density: 144 })
    .resize(CARD_WIDTH, CARD_HEIGHT, { fit: 'fill' })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function imageUrlToPngDataUri(value: unknown, width: number, height: number) {
  const url = cleanSeoText(value);
  if (!/^https?:\/\//i.test(url)) return '';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return '';
    const contentType = response.headers.get('content-type') || '';
    if (contentType && !contentType.toLowerCase().startsWith('image/')) return '';

    const source = Buffer.from(await response.arrayBuffer());
    const png = await sharp(source, { failOn: 'none' })
      .resize(width, height, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 },
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();

    return `data:image/png;base64,${png.toString('base64')}`;
  } catch (_) {
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

function wrapText(value: unknown, maxChars: number, maxLines: number) {
  const words = cleanSeoText(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }

    if (current) lines.push(current);
    current = word;

    if (lines.length >= maxLines) break;
  }

  if (current && lines.length < maxLines) lines.push(current);
  if (!lines.length) lines.push('Producto');

  const overflow = words.join(' ').length > lines.join(' ').length;
  if (overflow) lines[lines.length - 1] = limitInline(lines[lines.length - 1], maxChars);

  return lines.slice(0, maxLines).map((line) => limitInline(line, maxChars));
}

function limitInline(value: unknown, max: number) {
  const text = cleanSeoText(value);
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3)).trim()}...`;
}

function escapeSvg(value: unknown) {
  return cleanSeoText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getInitials(value: unknown) {
  const parts = cleanSeoText(value, 'Tienda').split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'T';
}

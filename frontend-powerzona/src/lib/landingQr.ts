import type { PublicStore } from './stores';

export const LANDING_QR_ACCENT_FALLBACK = '#2563eb';
export const LANDING_QR_MAX_LINKS = 10;

export type LandingQrLink = {
  id: string;
  type: string;
  icon: string;
  label: string;
  subtitle: string;
  url: string;
  active: boolean;
  order: number;
};

const ALLOWED_ICONS = new Set([
  'store',
  'whatsapp',
  'group',
  'instagram',
  'facebook',
  'tiktok',
  'offer',
  'location',
  'download',
  'link',
]);

function cleanText(value: unknown, max = 120) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function parseLandingQrJsonArray(value: unknown) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

export function parseLandingQrJsonObject(value: unknown) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string' || !value.trim()) return {};

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch (_) {
    return {};
  }
}

export function normalizeLandingQrAccentColor(value: unknown) {
  const color = String(value || '').trim();
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color) ? color : LANDING_QR_ACCENT_FALLBACK;
}

export function getLandingQrStoreName(settings: any, currentStore: PublicStore) {
  return cleanText(settings?.store_name || settings?.stored_name || currentStore?.name || currentStore?.slug || 'Tienda', 80) || 'Tienda';
}

export function getLandingQrInitials(name: unknown) {
  const parts = cleanText(name, 80)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  const initials = parts.map((part) => part[0]).join('').toUpperCase();
  return initials || 'TS';
}

export function normalizeWhatsAppUrl(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (/^(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com|chat\.whatsapp\.com)\//i.test(raw)) {
    return `https://${raw}`;
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      if (/(^|\.)whatsapp\.com$/i.test(url.hostname) || /^wa\.me$/i.test(url.hostname)) {
        return url.toString();
      }
    } catch (_) {
      return '';
    }
  }

  if (/^\+?\d[\d\s().-]{5,}$/.test(raw)) {
    const digits = raw.replace(/\D/g, '');
    return digits.length >= 7 ? `https://wa.me/${digits}` : '';
  }

  return '';
}

export function normalizeLandingQrUrl(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const whatsappUrl = normalizeWhatsAppUrl(raw);
  if (whatsappUrl) return whatsappUrl;

  if (raw.startsWith('/')) {
    return raw.startsWith('//') ? '' : raw;
  }

  if (/^(javascript|data|vbscript):/i.test(raw)) return '';

  if (/^(https?|mailto|tel):/i.test(raw)) {
    try {
      const parsed = new URL(raw);
      return /^(https?:|mailto:|tel:)$/i.test(parsed.protocol) ? raw : '';
    } catch (_) {
      return '';
    }
  }

  return '';
}

export function getLandingQrPath(store: PublicStore | string) {
  const slug = typeof store === 'string' ? store : store?.slug;
  return `/t/${encodeURIComponent(String(slug || 'powerzona'))}/links`;
}

export function normalizeLandingQrLinks(value: unknown) {
  return parseLandingQrJsonArray(value)
    .map((entry, index) => {
      const item = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
      const label = cleanText(item.label, 60);
      const url = normalizeLandingQrUrl(item.url);
      const icon = cleanText(item.icon || item.type || 'link', 24).toLowerCase();
      const type = cleanText(item.type || icon || 'link', 24).toLowerCase();
      const order = Number(item.order);

      return {
        id: cleanText(item.id || `${type || 'link'}-${index + 1}`, 60) || `link-${index + 1}`,
        type,
        icon: ALLOWED_ICONS.has(icon) ? icon : 'link',
        label,
        subtitle: cleanText(item.subtitle, 90),
        url,
        active: item.active !== false,
        order: Number.isFinite(order) && order > 0 ? order : index + 1,
        originalIndex: index,
      };
    })
    .filter((item) => item.active && item.label && item.url)
    .sort((a, b) => a.order - b.order || a.originalIndex - b.originalIndex)
    .slice(0, LANDING_QR_MAX_LINKS)
    .map(({ originalIndex: _originalIndex, ...item }) => item);
}

export function buildDefaultLandingQrLinks(currentStore: PublicStore, settings: any): LandingQrLink[] {
  const storePath = getLandingQrPath(currentStore).replace(/\/links$/, '');
  const socialLinks = parseLandingQrJsonObject(settings?.footer_social_links);
  const links: LandingQrLink[] = [];

  links.push({
    id: 'store',
    type: 'store',
    icon: 'store',
    label: 'Ver tienda online',
    subtitle: 'Explora nuestros productos',
    url: storePath,
    active: true,
    order: 1,
  });

  const whatsappUrl = normalizeWhatsAppUrl(settings?.whatsapp_number || socialLinks.whatsapp);
  if (whatsappUrl) {
    links.push({
      id: 'whatsapp',
      type: 'whatsapp',
      icon: 'whatsapp',
      label: 'Escríbenos por WhatsApp',
      subtitle: 'Respuesta rápida',
      url: whatsappUrl,
      active: true,
      order: 2,
    });
  }

  [
    ['instagram', 'Instagram', 'Síguenos en Instagram'],
    ['facebook', 'Facebook', 'Síguenos en Facebook'],
    ['tiktok', 'TikTok', 'Videos y novedades'],
  ].forEach(([key, label, subtitle], offset) => {
    const url = normalizeLandingQrUrl(socialLinks[key]);
    if (!url) return;
    links.push({
      id: key,
      type: key,
      icon: key,
      label,
      subtitle,
      url,
      active: true,
      order: 3 + offset,
    });
  });

  return links.slice(0, LANDING_QR_MAX_LINKS);
}

import type {
  PromoPublicMedia,
  PromoPublicProfile,
  PromoPublicSection,
  PromoPublicSeo,
} from './promoPublicShell.ts';

const SERVICE_KEY_PATTERN = /^[a-z][a-z0-9_-]{0,119}$/;

export type PromoServiceProduct = Readonly<{
  key: string;
  name: string;
  summary: string;
  caption: string;
  media: readonly PromoPublicMedia[];
}>;

export type PromoServiceDetail = Readonly<{
  key: string;
  name: string;
  summary: string;
  caption: string;
  iconKey: string;
  cover?: PromoPublicMedia;
  products: readonly PromoServiceProduct[];
  section: PromoPublicSection;
  sectionHeading: string;
  navigationLabel: string;
}>;

function localizedItems(profile: PromoPublicProfile, section: PromoPublicSection) {
  const localized = profile.content.sections[section.key] || {};
  return Array.isArray(localized.items) ? localized.items : [];
}

function serviceProducts(
  profile: PromoPublicProfile,
  gallery: PromoPublicSection,
  mediaByKey: ReadonlyMap<string, PromoPublicMedia>,
): PromoServiceProduct[] {
  const copyByKey = new Map(localizedItems(profile, gallery)
    .map((item: Record<string, string>) => [item.key, item]));
  return (Array.isArray(gallery.config.items) ? gallery.config.items : [])
    .filter((item: Record<string, any>) => item.visible === true)
    .map((item: Record<string, any>) => {
      const copy = copyByKey.get(item.key) || {};
      return {
        key: String(item.key),
        name: String(copy.name || ''),
        summary: String(copy.summary || ''),
        caption: String(copy.caption || ''),
        media: (Array.isArray(item.media_use_keys) ? item.media_use_keys : [])
          .map((key: string) => mediaByKey.get(key))
          .filter((media): media is PromoPublicMedia => Boolean(media && media.purpose === 'gallery')),
      };
    });
}

export function promoServicePath(profile: PromoPublicProfile, serviceKey: string) {
  if (!SERVICE_KEY_PATTERN.test(serviceKey)) return '';
  return `${profile.locale.canonical_path}/servicios/${serviceKey}`;
}

export function findPromoService(
  profile: PromoPublicProfile,
  requestedServiceKey: string,
): PromoServiceDetail | null {
  if (!SERVICE_KEY_PATTERN.test(requestedServiceKey)) return null;
  const mediaByKey = new Map(profile.media.map((media) => [media.key, media]));
  const sectionByKey = new Map(profile.sections.map((section) => [section.key, section]));

  for (const section of profile.sections.filter((candidate) => candidate.type === 'services')) {
    const items = localizedItems(profile, section);
    const serviceIndex = items.findIndex((item: Record<string, string>) => item.key === requestedServiceKey);
    if (serviceIndex < 0) continue;
    const item = items[serviceIndex] || {};
    const galleryKey = String(section.config.gallery_keys?.[serviceIndex] || '');
    const gallery = galleryKey ? sectionByKey.get(galleryKey) : undefined;
    if (!gallery || gallery.type !== 'gallery') return null;
    const products = serviceProducts(profile, gallery, mediaByKey);
    if (!products.length) return null;
    const coverKey = String(gallery.config.cover_media_use_key || '');
    const cover = coverKey ? mediaByKey.get(coverKey) : undefined;
    const localized = profile.content.sections[section.key] || {};
    return {
      key: requestedServiceKey,
      name: String(item.name || ''),
      summary: String(item.summary || ''),
      caption: String(item.caption || ''),
      iconKey: String(section.config.icon_keys?.[serviceIndex] || ''),
      cover: cover?.purpose === 'gallery' ? cover : undefined,
      products,
      section,
      sectionHeading: String(localized.heading || profile.content.navigation[section.key] || ''),
      navigationLabel: String(profile.content.navigation[section.key] || ''),
    };
  }
  return null;
}

function appendServicePath(url: string, serviceKey: string) {
  const parsed = new URL(url);
  parsed.pathname = `${parsed.pathname.replace(/\/$/, '')}/servicios/${serviceKey}`;
  return parsed.toString();
}

export function promoServiceSeo(
  profile: PromoPublicProfile,
  seo: PromoPublicSeo,
  service: PromoServiceDetail,
): PromoPublicSeo {
  const canonicalUrl = appendServicePath(seo.canonical_url, service.key);
  const alternates = seo.alternates.map((alternate) => ({
    locale: alternate.locale,
    url: appendServicePath(alternate.url, service.key),
  }));
  const defaultAlternate = alternates.find((alternate) => alternate.locale === profile.locale.default);
  const title = `${service.name} | ${profile.content.identity.name}`;
  const description = service.summary || profile.content.seo.description;
  return {
    ...seo,
    canonical_url: canonicalUrl,
    alternates,
    x_default: defaultAlternate?.url || canonicalUrl,
    open_graph: {
      ...seo.open_graph,
      url: canonicalUrl,
      title,
      description,
    },
    twitter: {
      ...seo.twitter,
      title,
      description,
    },
  };
}

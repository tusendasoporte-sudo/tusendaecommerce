import type PocketBase from 'pocketbase';
import { pb } from './pocketbase';

export const PUBLIC_HOMEPAGE_SETTINGS_COLLECTION = 'public_homepage_settings';
export const PUBLIC_HOMEPAGE_SETTINGS_KEY = 'main';
export const MAX_HOMEPAGE_FAQS = 10;

export type PublicHomepageFaq = {
  id: string;
  question: string;
  answer: string;
  visible: boolean;
};

export type PublicHomepageSettings = {
  available: boolean;
  recordId: string;
  storesSectionEnabled: boolean;
  faqSectionEnabled: boolean;
  faqEyebrow: string;
  faqTitle: string;
  faqIntro: string;
  faqs: PublicHomepageFaq[];
  updated: string;
};

export const DEFAULT_HOMEPAGE_FAQS: readonly PublicHomepageFaq[] = Object.freeze([
  { id: 'store-types', visible: true, question: '¿Cuál es la diferencia entre Promocional y Tienda?', answer: 'Promocional está orientada a presentar servicios, catálogo, reseñas y contacto. Tienda añade productos, pedidos y herramientas operativas de venta.' },
  { id: 'monthly-equivalent', visible: true, question: '¿Qué significa precio mensual equivalente?', answer: 'En los periodos de 6 y 12 meses permite comparar el valor mensual, pero el total indicado corresponde al pago completo del periodo.' },
  { id: 'free-trial', visible: true, question: '¿Cómo funciona la prueba gratis?', answer: 'La prueba dura 30 días, tiene un total de 0 CUP y puede utilizarse una sola vez por tienda.' },
  { id: 'android-apps', visible: true, question: '¿Las dos aplicaciones Android son iguales?', answer: 'No. La aplicación administrativa es para el equipo que gestiona el negocio. La aplicación para clientes lleva la identidad de la tienda y está pensada para comprar.' },
  { id: 'advanced-security', visible: true, question: '¿Seguridad avanzada viene activada al crear la tienda?', answer: 'No. No está incluida ni activada por defecto. En la modalidad Tienda es una capacidad opcional y solo Master puede controlarla.' },
  { id: 'plan-renewal', visible: true, question: '¿Puedo cambiar o renovar el plan?', answer: 'Sí. La administración Master gestiona la asignación, el cambio y la renovación dentro de los periodos comerciales disponibles.' },
]);

export const DEFAULT_PUBLIC_HOMEPAGE_SETTINGS: PublicHomepageSettings = {
  available: false,
  recordId: '',
  storesSectionEnabled: true,
  faqSectionEnabled: true,
  faqEyebrow: 'Preguntas frecuentes',
  faqTitle: 'Antes de comenzar.',
  faqIntro: 'Los precios y límites mostrados provienen del catálogo comercial vigente de Tu Senda 84.',
  faqs: DEFAULT_HOMEPAGE_FAQS.map((faq) => ({ ...faq })),
  updated: '',
};

function cleanText(value: unknown, maxLength: number) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function jsonValue(value: unknown) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (_) { return null; }
}

export function normalizeHomepageFaqs(value: unknown, fallback: readonly PublicHomepageFaq[] = DEFAULT_HOMEPAGE_FAQS) {
  const source = jsonValue(value);
  if (!Array.isArray(source)) return fallback.map((faq) => ({ ...faq }));
  const ids = new Set<string>();
  const normalized: PublicHomepageFaq[] = [];
  for (const item of source.slice(0, MAX_HOMEPAGE_FAQS)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const entry = item as Record<string, unknown>;
    const id = cleanText(entry.id, 40).toLowerCase();
    const question = cleanText(entry.question, 180);
    const answer = cleanText(entry.answer, 800);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || ids.has(id) || !question || !answer) continue;
    ids.add(id);
    normalized.push({ id, question, answer, visible: entry.visible !== false });
  }
  return normalized.length > 0 ? normalized : fallback.map((faq) => ({ ...faq }));
}

export function validateHomepageFaqs(value: unknown) {
  const source = jsonValue(value);
  if (!Array.isArray(source) || source.length < 1 || source.length > MAX_HOMEPAGE_FAQS) return null;
  const normalized = normalizeHomepageFaqs(source, []);
  return normalized.length === source.length ? normalized : null;
}

export async function getPublicHomepageSettings(client: PocketBase = pb): Promise<PublicHomepageSettings> {
  try {
    const record: any = await client.collection(PUBLIC_HOMEPAGE_SETTINGS_COLLECTION).getFirstListItem(
      `key="${PUBLIC_HOMEPAGE_SETTINGS_KEY}"`,
      { fields: 'id,key,stores_section_enabled,faq_section_enabled,faq_eyebrow,faq_title,faq_intro,faqs_json,updated', requestKey: null },
    );
    return {
      available: true,
      recordId: String(record.id || ''),
      storesSectionEnabled: record.stores_section_enabled !== false,
      faqSectionEnabled: record.faq_section_enabled !== false,
      faqEyebrow: cleanText(record.faq_eyebrow, 80) || DEFAULT_PUBLIC_HOMEPAGE_SETTINGS.faqEyebrow,
      faqTitle: cleanText(record.faq_title, 140) || DEFAULT_PUBLIC_HOMEPAGE_SETTINGS.faqTitle,
      faqIntro: cleanText(record.faq_intro, 360) || DEFAULT_PUBLIC_HOMEPAGE_SETTINGS.faqIntro,
      faqs: normalizeHomepageFaqs(record.faqs_json),
      updated: String(record.updated || ''),
    };
  } catch (_) {
    return {
      ...DEFAULT_PUBLIC_HOMEPAGE_SETTINGS,
      faqs: DEFAULT_HOMEPAGE_FAQS.map((faq) => ({ ...faq })),
    };
  }
}

export function normalizeHomepageCopy(input: Record<string, unknown>) {
  const faqEyebrow = cleanText(input.faq_eyebrow, 80);
  const faqTitle = cleanText(input.faq_title, 140);
  const faqIntro = cleanText(input.faq_intro, 360);
  if (!faqEyebrow || !faqTitle || !faqIntro) return null;
  return { faqEyebrow, faqTitle, faqIntro };
}

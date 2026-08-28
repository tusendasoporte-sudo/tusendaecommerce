import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildPromoCmsContactDocument,
  buildPromoCmsContentDocument,
  createPromoCmsWorkspace,
  isPromoCmsWorkGalleryReady,
  normalizePromoCmsDocument,
  normalizePromoCmsDraftResponse,
  parsePromoCmsUpdate,
  PromoCmsError,
  promoCmsErrorMessage,
  promoCmsSameOriginMutation,
  promoCmsStoreSlug,
} from '../src/lib/promoCms.ts';

const require = createRequire(import.meta.url);
const backendContract = require('../../backend-powerzona/pb_hooks/pz_promo_pubcfg_lib.js');

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

function emptyDraft() {
  return {
    contract: 'promo.site.v1',
    system_catalog_version: 'promo.system.v1',
    locales: { default: '', published: [] },
    theme: { theme_id: '', version: '', tokens: {} },
    identity: { public_business_key: '' },
    section_order: [],
    sections: [],
    media_refs: {},
    contact: { enabled: false, primary_action_key: '', secondary_action_keys: [], actions: [] },
    content_by_locale: {},
    adapters: { store_rating: { enabled: false }, landing_qr_link: { enabled: false } },
  };
}

function localized(name) {
  return {
    identity: { name, summary: 'Resumen actual' },
    navigation: {},
    sections: {},
    contact: {},
    media_alt: {},
    seo: { title: name, description: 'Descripción aprobada' },
  };
}

function completeDocument() {
  const document = emptyDraft();
  document.locales = { default: 'es', published: ['en', 'es'] };
  document.theme = { theme_id: 'promo.black-gold', version: '1.0.0', tokens: { surface: 'obsidian' } };
  document.identity = { public_business_key: 'negocio-demo' };
  document.section_order = ['hero-main', 'services-main', 'gallery-main', 'owner-main', 'contact-main', 'footer-main'];
  document.sections = [
    { key: 'hero-main', type: 'hero', variant: 'default', visible: true, config: { media_use_key: '', action_key: 'call-main' }, media_use_keys: [] },
    { key: 'services-main', type: 'services', variant: 'default', visible: true, config: { item_keys: ['service-one'] }, media_use_keys: [] },
    { key: 'gallery-main', type: 'gallery', variant: 'default', visible: true, config: { item_keys: ['work-one'] }, media_use_keys: [] },
    { key: 'owner-main', type: 'owner', variant: 'default', visible: true, config: { media_use_key: '' }, media_use_keys: [] },
    { key: 'contact-main', type: 'contact', variant: 'default', visible: true, config: { action_keys: ['call-main'] }, media_use_keys: [] },
    { key: 'footer-main', type: 'footer', variant: 'default', visible: true, config: {}, media_use_keys: [] },
  ];
  document.media_refs = { gallery_one: { asset_id: 'assetaaaaaaaaaa', purpose: 'gallery' } };
  document.contact = {
    enabled: true,
    primary_action_key: 'call-main',
    secondary_action_keys: [],
    actions: [{ key: 'call-main', type: 'phone', enabled: true, config: { phone_e164: '+13055550184' } }],
  };
  const es = localized('Negocio actual');
  es.navigation = {
    'hero-main': 'Inicio', 'services-main': 'Servicios', 'gallery-main': 'Galería',
    'owner-main': 'Propietario', 'contact-main': 'Contacto', 'footer-main': 'Pie',
  };
  es.sections = {
    'hero-main': { heading: 'Portada actual', summary: 'Resumen de portada' },
    'services-main': { heading: 'Servicios', summary: 'Resumen', items: [{ key: 'service-one', name: 'Limpieza', summary: 'Cuidado', caption: '' }] },
    'gallery-main': { heading: 'Galería', summary: 'Trabajos', items: [{ key: 'work-one', caption: 'Antes y después' }] },
    'owner-main': { heading: 'Conoce al propietario', name: 'Ada', bio: 'Historia pública' },
    'contact-main': { heading: 'Hablemos', summary: 'Solicita información' },
    'footer-main': { text: 'Atención con cita previa.' },
  };
  es.contact = { 'call-main': { label: 'Llamar', aria_label: 'Llamar al negocio', message: '' } };
  const en = structuredClone(es);
  en.identity.name = 'Current business';
  en.navigation['hero-main'] = 'Home';
  en.contact['call-main'].label = 'Call';
  document.content_by_locale = { en, es };
  document.adapters = { store_rating: { enabled: true }, landing_qr_link: { enabled: true } };
  return document;
}

function contentPatch(document) {
  const es = document.content_by_locale.es;
  return {
    identity: { name: 'Negocio editado', slogan: 'Tu visión, nuestro trabajo', summary: 'Resumen seguro y actualizado' },
    sectionOrder: document.section_order,
    sections: document.sections.map((section) => ({
      key: section.key,
      visible: section.type === 'owner' ? false : section.visible,
      navigationLabel: es.navigation[section.key],
      ...(section.type === 'hero' ? {
        heading: 'Nueva portada',
        intro: 'Experiencia premium',
        summary: 'Mensaje principal',
        heroLayout: 'editorial',
        highlights: ['Alfombras', 'Pisos', 'Escaleras', 'Acabados'],
        buttons: [
          { target: 'primary-contact', label: 'Solicitar estimado' },
          { target: 'work-section', label: 'Ver trabajos' },
        ],
      } : {}),
      ...(section.type === 'services' ? {
        heading: 'Servicios especializados',
        summary: 'Soluciones informativas sin precio',
        items: [
          { key: 'service-one', name: 'Limpieza', summary: 'Cuidado', caption: '', iconKey: 'cleaning' },
          { key: 'service-two', name: 'Restauración', summary: 'Trabajo artesanal', caption: 'Solo con estimado', iconKey: 'carpet' },
        ],
      } : {}),
      ...(section.type === 'owner' ? { heading: 'Nuestra historia', name: 'Ada', bio: 'Biografía nueva' } : {}),
      ...(section.type === 'contact' ? {
        heading: 'Hagamos realidad tu visión',
        consultationHeading: 'Consulta sin compromiso',
        summary: 'Solicita tu estimado hoy.',
        qrHeading: 'Escanea para conversar por WhatsApp',
      } : {}),
      ...(section.type === 'footer' ? {
        heading: 'Conecta con nosotros',
        summary: 'Enlaces oficiales del negocio',
        text: 'Texto legal y de cierre.',
        navigationSectionKeys: ['hero-main', 'contact-main'],
        socialProfiles: [
          { network: 'instagram', handle: 'negocio.demo' },
          { network: 'linkedin', handle: 'negocio-demo' },
        ],
      } : {}),
    })),
  };
}

test('workspace vacío asigna solo el locale base y las secciones del alcance CMS solicitado', () => {
  const content = createPromoCmsWorkspace(emptyDraft(), 'content');
  assert.equal(content.locale, 'es');
  assert.deepEqual(content.document.locales, { default: 'es', published: ['es'] });
  assert.deepEqual(content.document.sections.map((section) => section.type), ['hero', 'services', 'owner', 'gallery', 'footer']);
  assert.equal(content.document.sections.find((section) => section.type === 'gallery')?.key, 'videos-main');
  assert.equal(content.document.sections.some((section) => ['featured_work', 'contact'].includes(section.type)), false);

  const contact = createPromoCmsWorkspace(emptyDraft(), 'contact');
  assert.deepEqual(contact.document.sections.map((section) => section.type), ['contact']);
  assert.deepEqual(contact.document.contact, normalizePromoCmsDocument(emptyDraft()).contact);
});

test('Organización fija Portada al inicio y Pie del sitio al final en UI y contrato', () => {
  const disordered = completeDocument();
  const byKey = new Map(disordered.sections.map((section) => [section.key, section]));
  disordered.section_order = [
    'footer-main', 'owner-main', 'services-main', 'hero-main', 'contact-main', 'gallery-main',
  ];
  disordered.sections = disordered.section_order.map((sectionKey) => byKey.get(sectionKey));

  assert.throws(
    () => backendContract.validatePromoDocument(disordered, { publicRevision: false }),
    (error) => error?.code === 'invalid_promo_document',
  );

  const upgraded = backendContract.upgradePromoDocument(disordered);
  assert.equal(upgraded.sections[0].type, 'hero');
  assert.equal(upgraded.sections.at(-1).type, 'footer');
  assert.deepEqual(upgraded.section_order, upgraded.sections.map((section) => section.key));
  assert.deepEqual(backendContract.validatePromoDocument(upgraded, { publicRevision: false }), upgraded);

  const workspace = createPromoCmsWorkspace(disordered, 'content');
  assert.equal(workspace.document.sections[0].type, 'hero');
  assert.equal(workspace.document.sections.at(-1).type, 'footer');
  assert.equal(workspace.document.content_by_locale.es.navigation['videos-main'], 'Trabajos realizados');

  const invalidPatch = contentPatch(workspace.document);
  invalidPatch.sectionOrder = [
    'footer-main',
    ...invalidPatch.sectionOrder.filter((sectionKey) => sectionKey !== 'footer-main'),
  ];
  assert.throws(
    () => buildPromoCmsContentDocument(workspace.document, invalidPatch, 4),
    (error) => error instanceof PromoCmsError && error.code === 'invalid_promo_document',
  );
});

test('Trabajos realizados explica sus medios obligatorios antes de intentar publicar', () => {
  const workspace = createPromoCmsWorkspace(completeDocument(), 'content');
  const workSection = workspace.document.sections.find((section) => section.key === 'videos-main');
  assert.equal(isPromoCmsWorkGalleryReady(workspace.document), false);

  workSection.visible = true;
  workSection.config = {
    item_keys: ['work-ready'],
    cover_media_use_key: 'work_cover',
    items: [{ key: 'work-ready', media_use_keys: ['work_photo'], featured: false, visible: true }],
  };
  workSection.media_use_keys = ['work_cover', 'work_photo'];
  assert.equal(isPromoCmsWorkGalleryReady(workspace.document), true);

  workSection.config.items[0].media_use_keys = [];
  assert.equal(isPromoCmsWorkGalleryReady(workspace.document), false);
  assert.equal(
    promoCmsErrorMessage('promo_work_gallery_incomplete'),
    'Para mostrar Trabajos realizados, agrega primero al menos un trabajo con una foto.',
  );

  const editor = read('../src/components/admin/promo/PromoCmsEditor.astro');
  assert.match(editor, /data-cms-error-action/);
  assert.match(editor, /isPromoCmsWorkGalleryReady\(documentValue\)/);
  assert.match(editor, /showError\('promo_work_gallery_incomplete'\)/);
});

test('Contacto informa la causa exacta cuando una imagen no puede procesarse', () => {
  assert.equal(
    promoCmsErrorMessage('promo_media_duplicate'),
    'Esta imagen ya está guardada en la tienda. Usa el medio existente o selecciona un archivo diferente.',
  );
  assert.equal(
    promoCmsErrorMessage('promo_media_dimensions_invalid'),
    'La imagen no cumple las dimensiones indicadas para este espacio.',
  );
  assert.equal(
    promoCmsErrorMessage('promo_media_type_invalid'),
    'El formato de la imagen no está permitido. Usa JPG, PNG, WebP o AVIF.',
  );
});

test('normalización acepta documentos vivos anteriores al campo aditivo del logo', () => {
  const previousLive = backendContract.upgradePromoDocument(completeDocument());
  delete previousLive.contact.logo_media_use_key;
  const normalized = normalizePromoCmsDocument(previousLive);
  assert.equal(normalized.contract, 'promo.site.v2');
  assert.equal(normalized.contact.logo_media_use_key, '');
  assert.equal(normalized.contact.qr_media_use_key, '');
});

test('edición de contenido preserva tema, media, galería, contacto, adapters y locales ajenos', () => {
  const original = normalizePromoCmsDocument(completeDocument());
  const protectedBefore = structuredClone({
    theme: original.theme,
    media_refs: original.media_refs,
    contact: original.contact,
    adapters: original.adapters,
    en: original.content_by_locale.en,
    gallery: original.sections[2],
    galleryContent: original.content_by_locale.es.sections['gallery-main'],
  });
  protectedBefore.en.sections['hero-main'].button_labels = ['', ''];
  const updated = buildPromoCmsContentDocument(original, contentPatch(original), 4);
  assert.deepEqual(backendContract.validatePromoDocument(updated, { publicRevision: false }), updated);
  assert.equal(updated.content_by_locale.es.identity.name, 'Negocio editado');
  assert.equal(updated.content_by_locale.es.identity.slogan, 'Tu visión, nuestro trabajo');
  assert.deepEqual(updated.sections.find((section) => section.type === 'hero').config, {
    media_use_key: '',
    action_key: 'call-main',
    layout: 'editorial',
    button_targets: ['primary-contact', 'work-section'],
  });
  assert.deepEqual(updated.content_by_locale.es.sections['hero-main'], {
    heading: 'Nueva portada',
    intro: 'Experiencia premium',
    summary: 'Mensaje principal',
    highlights: ['Alfombras', 'Pisos', 'Escaleras', 'Acabados'],
    button_labels: ['Solicitar estimado', 'Ver trabajos'],
  });
  assert.equal(updated.sections.find((section) => section.type === 'owner').visible, false);
  assert.deepEqual(updated.sections.find((section) => section.type === 'services').config.item_keys, ['service-one', 'service-two']);
  assert.deepEqual(updated.sections.find((section) => section.type === 'services').config.icon_keys, ['cleaning', 'carpet']);
  assert.deepEqual(updated.sections.find((section) => section.type === 'footer').config, {
    navigation_section_keys: ['hero-main', 'contact-main'],
    social_profiles: [
      { network: 'instagram', handle: 'negocio.demo' },
      { network: 'linkedin', handle: 'negocio-demo' },
    ],
  });
  assert.equal(updated.content_by_locale.es.sections['footer-main'].heading, 'Conecta con nosotros');
  assert.deepEqual(updated.content_by_locale.es.sections['contact-main'], {
    heading: 'Hagamos realidad tu visión',
    consultation_heading: 'Consulta sin compromiso',
    summary: 'Solicita tu estimado hoy.',
    qr_heading: 'Escanea para conversar por WhatsApp',
  });
  assert.deepEqual({
    theme: updated.theme,
    media_refs: updated.media_refs,
    contact: updated.contact,
    adapters: updated.adapters,
    en: updated.content_by_locale.en,
    gallery: updated.sections[2],
    galleryContent: updated.content_by_locale.es.sections['gallery-main'],
  }, protectedBefore);
});

test('portada limita cuatro especialidades, dos botones y diseños aprobados', () => {
  const original = completeDocument();
  const tooManyHighlights = contentPatch(original);
  tooManyHighlights.sections.find((section) => section.key === 'hero-main').highlights.push('Quinta');
  assert.throws(
    () => buildPromoCmsContentDocument(original, tooManyHighlights, 4),
    (error) => error instanceof PromoCmsError && error.code === 'invalid_promo_document',
  );

  const invalidLayout = contentPatch(original);
  invalidLayout.sections.find((section) => section.key === 'hero-main').heroLayout = 'custom-css';
  assert.throws(
    () => buildPromoCmsContentDocument(original, invalidLayout, 4),
    (error) => error instanceof PromoCmsError && error.code === 'invalid_promo_document',
  );
});

test('servicios respetan cuota efectiva y el documento no acepta contenido activo', () => {
  const original = completeDocument();
  assert.throws(
    () => buildPromoCmsContentDocument(original, contentPatch(original), 1),
    (error) => error instanceof PromoCmsError && error.code === 'promo_capability_denied',
  );
  const unsafe = contentPatch(original);
  unsafe.identity.summary = '<script>alert(1)</script>';
  assert.throws(
    () => buildPromoCmsContentDocument(original, unsafe, 4),
    (error) => error instanceof PromoCmsError && error.code === 'unsafe_promo_document_value',
  );
  const unsafeSocial = contentPatch(original);
  unsafeSocial.sections.find((section) => section.key === 'footer-main').socialProfiles = [
    { network: 'instagram', handle: 'https://attacker.example/demo' },
  ];
  assert.throws(
    () => buildPromoCmsContentDocument(original, unsafeSocial, 4),
    (error) => error instanceof PromoCmsError && error.code === 'invalid_promo_document',
  );
  const unsafeIcon = contentPatch(original);
  unsafeIcon.sections.find((section) => section.key === 'services-main').items[0].iconKey = '<svg>';
  assert.throws(
    () => buildPromoCmsContentDocument(original, unsafeIcon, 4),
    (error) => error instanceof PromoCmsError && error.code === 'invalid_promo_document',
  );
});

test('contacto actualiza canales tipados sin alterar las otras facetas del tenant', () => {
  const original = normalizePromoCmsDocument(completeDocument());
  const protectedBefore = structuredClone({
    theme: original.theme,
    media_refs: original.media_refs,
    adapters: original.adapters,
    en: original.content_by_locale.en,
    nonContactSections: original.sections.filter((section) => section.type !== 'contact'),
  });
  const updated = buildPromoCmsContactDocument(original, {
    enabled: true,
    primaryActionKey: 'call-main',
    secondaryActionKeys: ['mail-main'],
    section: {
      key: 'contact-main', visible: true, navigationLabel: 'Contáctanos',
      heading: 'Conversemos', summary: 'Elige el canal más cómodo.',
    },
    actions: [
      {
        key: 'call-main', type: 'whatsapp', enabled: true, destination: '+13055550184',
        label: 'WhatsApp', ariaLabel: 'Contactar por WhatsApp', message: 'Deseo solicitar un estimado.',
      },
      {
        key: 'mail-main', type: 'email', enabled: true, destination: 'contacto@example.com',
        label: 'Correo', ariaLabel: 'Enviar correo al negocio', message: '',
      },
    ],
  });
  assert.deepEqual(backendContract.validatePromoDocument(updated, { publicRevision: false }), updated);
  assert.deepEqual(updated.contact, {
    enabled: true,
    primary_action_key: 'call-main',
    secondary_action_keys: ['mail-main'],
    actions: [
      { key: 'call-main', type: 'whatsapp', enabled: true, config: { phone_e164: '+13055550184' } },
      { key: 'mail-main', type: 'email', enabled: true, config: { email_address: 'contacto@example.com' } },
    ],
    logo_media_use_key: '',
    qr_media_use_key: '',
  });
  assert.equal(updated.content_by_locale.es.contact['call-main'].message, 'Deseo solicitar un estimado.');
  assert.deepEqual({
    theme: updated.theme,
    media_refs: updated.media_refs,
    adapters: updated.adapters,
    en: updated.content_by_locale.en,
    nonContactSections: updated.sections.filter((section) => section.type !== 'contact'),
  }, protectedBefore);
  assert.throws(() => buildPromoCmsContactDocument(original, {
    enabled: true,
    primaryActionKey: 'call-main',
    secondaryActionKeys: [],
    section: { key: 'contact-main', visible: true, navigationLabel: 'Contacto', heading: '', summary: '' },
    actions: [{
      key: 'call-main', type: 'whatsapp', enabled: true, destination: 'https://evil.test',
      label: 'Contacto', ariaLabel: 'Contactar', message: '',
    }],
  }), /No se pudo completar/);
});

test('envelopes, tenant slug y origen fallan cerrados ante campos o señales ambiguas', () => {
  const document = emptyDraft();
  assert.equal(promoCmsStoreSlug(' Promo-A '), 'promo-a');
  assert.equal(promoCmsStoreSlug('../promo-a'), '');
  assert.throws(() => parsePromoCmsUpdate({ expected_version: 1, document, store_id: 'storeaaaaaaaaaa' }));
  const live = {
    ok: true,
    contract: 'promo.live.v1',
    draft: {
      schema_version: 2,
      version: 1,
      generation: 0,
      public_state: 'inactive',
      document,
    },
  };
  assert.equal(normalizePromoCmsDraftResponse(live).document.contract, 'promo.site.v2');
  assert.throws(() => normalizePromoCmsDraftResponse({ ...live, token: 'secret' }));
  assert.equal(promoCmsSameOriginMutation(new Request('https://admin.test/api/admin/promo-cms', {
    method: 'PUT', headers: { Origin: 'https://admin.test', 'Sec-Fetch-Site': 'same-origin' },
  })), true);
  assert.equal(promoCmsSameOriginMutation(new Request('https://admin.test/api/admin/promo-cms', {
    method: 'PUT', headers: { Origin: 'https://evil.test', 'Sec-Fetch-Site': 'cross-site' },
  })), false);
});

test('API SSR y shell conservan auth central, CAS, soporte Master y aislamiento de módulos posteriores', () => {
  const api = read('../src/pages/api/admin/promo-cms.ts');
  const editor = read('../src/components/admin/promo/PromoCmsEditor.astro');
  const shell = read('../src/components/admin/promo/PromoAdminShell.astro');
  const styles = read('../src/styles/promo-cms.css');
  assert.match(api, /refreshAuthFromCookie/);
  assert.match(api, /requireCurrentStoreForAdmin/);
  assert.match(api, /context\.store\.slug[\s\S]*?storeSlug/);
  assert.match(api, /promoCmsSameOriginMutation/);
  assert.match(api, /expected_version: parsed\.expectedVersion/);
  assert.match(api, /\/api\/pz\/promo\/private\/v1\/live\/read/);
  assert.match(api, /\/api\/pz\/promo\/private\/v1\/live\/update/);
  assert.match(api, /promo\.live\.read\.v1/);
  assert.match(api, /promo\.live\.update\.v1/);
  assert.match(api, /X-PZ-Promo-Store/);
  assert.doesNotMatch(api, /filter|sort|fields|expand|realtime|Cloudflare|Coolify/);
  assert.match(editor, /Guardar actualiza la página automáticamente/);
  assert.match(editor, /la página pública se actualiza automáticamente después de validar permisos/);
  assert.match(editor, /role="alert"/);
  assert.match(editor, /aria-live="polite"/);
  assert.match(editor, /reportValidity\(\)/);
  assert.equal((editor.match(/data-cms-contact-panel=/g) || []).length, 4);
  assert.match(editor, /data-cms-logo-file[\s\S]*?purpose', 'logo'/);
  assert.match(editor, /<summary class="pz-promo-cms__panel-heading pz-promo-cms__accordion-summary">/);
  assert.match(editor, /data-cms-logo-slot[\s\S]*?Arrastra una imagen aquí[\s\S]*?data-cms-choose-logo[\s\S]*?data-cms-remove-logo/);
  assert.match(editor, /data-cms-qr-slot[\s\S]*?Arrastra una imagen aquí[\s\S]*?data-cms-choose-qr[\s\S]*?data-cms-remove-qr/);
  assert.match(editor, /bindContactMediaDrop\('\[data-cms-logo-slot\]'[\s\S]*?bindContactMediaDrop\('\[data-cms-qr-slot\]'/);
  assert.match(editor, /data-cms-logo-count[\s\S]*?se adapta automáticamente a 1024×512 px · formato horizontal y sin recorte/);
  assert.match(editor, /data-cms-qr-count[\s\S]*?se adapta automáticamente a 512×512 px · fondo blanco y sin recorte/);
  assert.match(editor, /addEventListener\('invalid'[\s\S]*?accordion\.open = true/);
  assert.match(editor, /Subir/);
  assert.match(editor, /Bajar/);
  assert.match(editor, /sectionType === 'hero' \|\| sectionType === 'footer'[\s\S]*?return null/);
  assert.match(editor, /data-cms-section-move/);
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /\.pz-promo-cms__accordion:not\(\[open\]\)/);
  assert.match(styles, /\.pz-promo-cms__media-slots[\s\S]*?padding: 20px 22px/);
  assert.match(styles, /\.pz-promo-cms__media-slot \.pz-promo-gallery__item-preview img[\s\S]*?object-fit: contain/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(shell, /section === 'content' \|\| section === 'contact'/);
  assert.match(shell, /<PromoCmsEditor/);
  assert.match(editor, /\/api\/admin\/promo-media/);
  assert.match(editor, /purpose: 'qr'/);
  assert.doesNotMatch(editor, /themes\/catalog|publication|Cloudflare|Coolify/);
});

'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const translation = require('../pb_hooks/pz_promo_translation_lib.js');

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const clone = (value) => JSON.parse(JSON.stringify(value));

function documentFixture() {
  return {
    contract: 'promo.site.v2',
    locales: { default: 'es', published: ['en', 'es'] },
    sections: [
      { key: 'hero-main', type: 'hero' },
      { key: 'services-main', type: 'services' },
      { key: 'owner-main', type: 'owner' },
      { key: 'contact-main', type: 'contact' },
    ],
    content_by_locale: {
      es: {
        identity: {
          name: "Aladdin's Carpet", slogan: 'Cuidamos cada fibra', summary: 'Cuidado experto',
          contact_cta_label: 'Escríbeme por WhatsApp',
          owner_name: 'Aladdin Smith', owner_bio: 'Especialista en alfombras.',
        },
        navigation: {
          'hero-main': 'Inicio', 'services-main': 'Servicios', 'owner-main': 'Propietario', 'contact-main': 'Contacto',
        },
        sections: {
          'hero-main': {
            heading: 'Alfombras renovadas', intro: 'Desde 1990', summary: 'Tratamiento profundo',
            highlights: ['Atención personal'], button_labels: ['Solicitar estimado'],
          },
          'services-main': {
            heading: 'Servicios', summary: 'Opciones disponibles',
            items: [{ key: 'deep-clean', name: 'Limpieza profunda', summary: 'Limpieza profunda', caption: '' }],
          },
          'owner-main': { heading: 'Conoce al propietario', name: 'Aladdin Smith', bio: 'Trabajo artesanal.' },
          'contact-main': {
            heading: 'Contacto', consultation_heading: 'Solicita una evaluación',
            summary: 'Conversemos', qr_heading: 'Escanea para escribirnos',
          },
        },
        contact: {
          estimate: {
            label: 'Solicitar estimado', aria_label: 'Solicitar estimado por teléfono', message: 'Hola, deseo un estimado.',
          },
        },
        media_alt: { rug_main: { alt: 'Alfombra limpia en una sala', decorative: false } },
        seo: {
          title: 'Limpieza de alfombras', description: 'Limpieza profesional de alfombras.',
          social_title: 'Alfombras renovadas', social_description: 'Conoce nuestro trabajo.',
        },
      },
      en: {
        identity: {
          name: "Aladdin's Carpet", slogan: 'We care for every fiber', summary: 'Expert care',
          contact_cta_label: 'Message me on WhatsApp',
          owner_name: 'Aladdin Smith', owner_bio: 'Carpet specialist.',
        },
        navigation: {
          'hero-main': 'Home', 'services-main': 'Services', 'owner-main': 'Owner', 'contact-main': 'Contact',
        },
        sections: {
          'hero-main': {
            heading: 'Renewed carpets', intro: 'Since 1990', summary: 'Deep treatment',
            highlights: ['Personal service'], button_labels: ['Request an estimate'],
          },
          'services-main': {
            heading: 'Services', summary: 'Available options',
            items: [{ key: 'deep-clean', name: 'Limpieza profunda', summary: 'Limpieza profunda', caption: '' }],
          },
          'owner-main': { heading: 'Meet the owner', name: 'Aladdin Smith', bio: 'Craftsmanship.' },
          'contact-main': {
            heading: 'Contact', consultation_heading: 'Request an assessment',
            summary: "Let's talk", qr_heading: 'Scan to message us',
          },
        },
        contact: {
          estimate: {
            label: 'Request an estimate', aria_label: 'Request an estimate by phone', message: 'Hello, I would like an estimate.',
          },
        },
        media_alt: { rug_main: { alt: 'Alfombra limpia en una sala', decorative: false } },
        seo: {
          title: 'Carpet cleaning', description: 'Professional carpet cleaning.',
          social_title: 'Renewed carpets', social_description: 'See our work.',
        },
      },
    },
  };
}

function provider(translationsBySource = {}) {
  const calls = [];
  const send = (request) => {
    const body = JSON.parse(request.body);
    const input = JSON.parse(body.input);
    calls.push({ request, body, input });
    return {
      statusCode: 200,
      json: {
        status: 'completed',
        output: [{
          type: 'message', status: 'completed',
          content: [{
            type: 'output_text',
            text: JSON.stringify({
              translations: input.entries.map((entry) => ({
                id: entry.id,
                text: translationsBySource[entry.text] || `EN:${entry.text}`,
              })),
            }),
          }],
        }],
      },
    };
  };
  return { calls, send };
}

function cloudflareProvider(translationsBySource = {}) {
  const calls = [];
  const send = (request) => {
    const body = JSON.parse(request.body);
    calls.push({ request, body });
    return {
      statusCode: 200,
      json: {
        success: true,
        errors: [],
        messages: [],
        result: {
          translated_text: translationsBySource[body.text] || `EN:${body.text}`,
        },
      },
    };
  };
  return { calls, send };
}

const config = {
  enabled: true,
  apiKey: `sk-test-${'x'.repeat(40)}`,
  model: 'gpt-5.4-mini',
  url: translation.OPENAI_RESPONSES_URL,
};

const cloudflareConfig = {
  enabled: true,
  provider: 'cloudflare',
  accountId: '15ffc4e5014b573740ac139b5b734bd4',
  apiKey: `cf-test-${'x'.repeat(40)}`,
  model: translation.CLOUDFLARE_TRANSLATION_MODEL,
  url: `https://api.cloudflare.com/client/v4/accounts/15ffc4e5014b573740ac139b5b734bd4/ai/run/${translation.CLOUDFLARE_TRANSLATION_MODEL}`,
};

test('corrige copias ES incrustadas en EN sin enviar rutas, nombres propios ni secretos al documento', () => {
  const previous = documentFixture();
  const next = clone(previous);
  const fake = provider({
    'Limpieza profunda': 'Deep cleaning',
    'Alfombra limpia en una sala': 'Clean rug in a living room',
  });
  const result = translation.autoTranslatePromoDocument(previous, next, {}, {
    config, hash: sha256, send: fake.send,
  });

  assert.equal(result.document.content_by_locale.en.sections['services-main'].items[0].name, 'Deep cleaning');
  assert.equal(result.document.content_by_locale.en.sections['services-main'].items[0].summary, 'Deep cleaning');
  assert.equal(result.document.content_by_locale.en.media_alt.rug_main.alt, 'Clean rug in a living room');
  assert.equal(result.document.content_by_locale.en.identity.name, "Aladdin's Carpet");
  assert.equal(result.document.content_by_locale.en.identity.owner_name, 'Aladdin Smith');
  assert.equal(result.document.content_by_locale.en.sections['owner-main'].name, 'Aladdin Smith');
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0].request.headers.authorization, `Bearer ${config.apiKey}`);
  assert.equal(fake.calls[0].body.store, false);
  assert.equal(fake.calls[0].body.text.format.type, 'json_schema');
  assert.equal(fake.calls[0].body.text.format.strict, true);
  assert.equal(JSON.stringify(fake.calls[0].input).includes('services-main'), false);
  assert.equal(fake.calls[0].input.entries.every((entry) => /^t\d{6}$/.test(entry.id)), true);
  assert.equal(JSON.stringify(result.document).includes(config.apiKey), false);
});

test('Cloudflare traduce por REST, deduplica texto repetido y nunca persiste el token', () => {
  const previous = documentFixture();
  const next = clone(previous);
  const fake = cloudflareProvider({
    'Limpieza profunda': 'Deep cleaning',
    'Alfombra limpia en una sala': 'Clean rug in a living room',
  });
  const result = translation.autoTranslatePromoDocument(previous, next, {}, {
    config: cloudflareConfig, hash: sha256, send: fake.send,
  });

  assert.equal(result.document.content_by_locale.en.sections['services-main'].items[0].name, 'Deep cleaning');
  assert.equal(result.document.content_by_locale.en.sections['services-main'].items[0].summary, 'Deep cleaning');
  assert.equal(result.document.content_by_locale.en.media_alt.rug_main.alt, 'Clean rug in a living room');
  assert.equal(fake.calls.length, 2);
  assert.equal(fake.calls.every((call) => call.request.url === cloudflareConfig.url), true);
  assert.equal(fake.calls.every((call) => call.request.headers.authorization === `Bearer ${cloudflareConfig.apiKey}`), true);
  assert.equal(fake.calls.every((call) => call.body.source_lang === 'es' && call.body.target_lang === 'en'), true);
  assert.equal(fake.calls.some((call) => call.body.text === 'Limpieza profunda'), true);
  assert.equal(JSON.stringify(result.document).includes(cloudflareConfig.apiKey), false);
});

test('un cambio del idioma base vuelve a traducir automáticamente un valor administrado', () => {
  const previous = documentFixture();
  previous.content_by_locale.en.sections['services-main'].items[0].name = 'Deep cleaning';
  const next = clone(previous);
  next.content_by_locale.es.sections['services-main'].items[0].name = 'Limpieza intensiva';
  next.content_by_locale.es.identity.contact_cta_label = 'Contáctame';
  const fake = provider({
    'Limpieza intensiva': 'Intensive cleaning',
    'Contáctame': 'Contact me',
  });

  const result = translation.autoTranslatePromoDocument(previous, next, {}, {
    config, hash: sha256, send: fake.send,
  });
  assert.equal(result.document.content_by_locale.en.sections['services-main'].items[0].name, 'Intensive cleaning');
  assert.equal(result.document.content_by_locale.en.identity.contact_cta_label, 'Contact me');
  assert.equal(fake.calls.flatMap((call) => call.input.entries).some((entry) => entry.text === 'Limpieza intensiva'), true);
  assert.equal(fake.calls.flatMap((call) => call.input.entries).some((entry) => entry.text === 'Contáctame'), true);
});

test('una corrección manual crea un bloqueo privado y vaciarla reactiva la traducción automática', () => {
  const previous = documentFixture();
  previous.content_by_locale.en.sections['services-main'].items[0].name = 'Deep cleaning';
  const changed = clone(previous);
  changed.content_by_locale.es.sections['services-main'].items[0].name = 'Limpieza intensiva';
  changed.content_by_locale.en.sections['services-main'].items[0].name = 'Editorial deep clean';
  const initialProvider = provider({
    'Limpieza profunda': 'Deep cleaning',
    'Alfombra limpia en una sala': 'Clean rug in a living room',
  });
  const first = translation.autoTranslatePromoDocument(previous, changed, {}, {
    config, hash: sha256, send: initialProvider.send,
  });
  assert.equal(first.document.content_by_locale.en.sections['services-main'].items[0].name, 'Editorial deep clean');
  assert.equal(first.state.locked.en.some((key) => key.includes('deep-clean') && key.includes('name')), true);
  assert.equal(initialProvider.calls.flatMap((call) => call.input.entries)
    .some((entry) => entry.text === 'Limpieza intensiva'), false);

  const later = clone(first.document);
  later.content_by_locale.es.sections['services-main'].items[0].name = 'Lavado especializado';
  const second = translation.autoTranslatePromoDocument(first.document, later, first.state, {
    config, hash: sha256, send: () => { throw new Error('no debe invocarse'); },
  });
  assert.equal(second.document.content_by_locale.en.sections['services-main'].items[0].name, 'Editorial deep clean');

  const reset = clone(second.document);
  reset.content_by_locale.en.sections['services-main'].items[0].name = '';
  const fake = provider({ 'Lavado especializado': 'Specialized washing' });
  const third = translation.autoTranslatePromoDocument(second.document, reset, second.state, {
    config, hash: sha256, send: fake.send,
  });
  assert.equal(third.document.content_by_locale.en.sections['services-main'].items[0].name, 'Specialized washing');
});

test('falla cerrado ante IDs faltantes, contenido activo o proveedor no configurado', () => {
  const previous = documentFixture();
  const next = clone(previous);
  assert.throws(() => translation.autoTranslatePromoDocument(previous, next, {}, {
    config, hash: sha256,
    send: () => ({
      statusCode: 200,
      json: {
        status: 'completed',
        output: [{ type: 'message', content: [{ type: 'output_text', text: '{"translations":[]}' }] }],
      },
    }),
  }), /promo_translation_invalid_response/);

  assert.throws(() => translation.autoTranslatePromoDocument(previous, next, {}, {
    config, hash: sha256,
    send: () => ({
      statusCode: 200,
      json: {
        status: 'completed',
        output: [{
          type: 'message',
          content: [{
            type: 'output_text',
            text: JSON.stringify({
              translations: [
                { id: 't000001', text: '<script>alert(1)</script>' },
                { id: 't000002', text: '<script>alert(1)</script>' },
                { id: 't000003', text: '<script>alert(1)</script>' },
              ],
            }),
          }],
        }],
      },
    }),
  }), /promo_translation_invalid_response/);

  const plan = translation.preparePromoTranslations(previous, next, {}, { hash: sha256 });
  assert.throws(() => translation.executePromoTranslations(plan, {
    config: { enabled: true, apiKey: '', model: 'gpt-5.4-mini', url: translation.OPENAI_RESPONSES_URL },
    hash: sha256,
  }), /promo_translation_unavailable/);

  assert.throws(() => translation.executePromoTranslations(plan, {
    config: cloudflareConfig,
    hash: sha256,
    send: () => ({
      statusCode: 200,
      json: { success: true, errors: [], result: { translated_text: '<script>alert(1)</script>' } },
    }),
  }), /promo_translation_invalid_response/);
});

test('la activación es explícita y el modo desactivado preserva el documento', () => {
  assert.deepEqual(translation.translationConfig(() => ''), { enabled: false });
  const enabled = translation.translationConfig((name) => ({
    PZ_PROMO_TRANSLATION_ENABLED: '1',
    PZ_PROMO_TRANSLATION_OPENAI_API_KEY: `sk-test-${'x'.repeat(40)}`,
    PZ_PROMO_TRANSLATION_MODEL: 'gpt-5.4-mini',
  })[name] || '');
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.provider, 'openai');
  assert.equal(enabled.url, 'https://api.openai.com/v1/responses');

  const cloudflare = translation.translationConfig((name) => ({
    PZ_PROMO_TRANSLATION_ENABLED: '1',
    PZ_PROMO_TRANSLATION_PROVIDER: 'cloudflare',
    PZ_PROMO_TRANSLATION_STORE_IDS: 'c7f698w9kgurrdo',
    PZ_PROMO_TRANSLATION_CLOUDFLARE_ACCOUNT_ID: '15ffc4e5014b573740ac139b5b734bd4',
    PZ_PROMO_TRANSLATION_CLOUDFLARE_API_TOKEN: `cf-test-${'x'.repeat(40)}`,
  })[name] || '');
  assert.equal(cloudflare.provider, 'cloudflare');
  assert.equal(cloudflare.model, '@cf/meta/m2m100-1.2b');
  assert.equal(cloudflare.url, 'https://api.cloudflare.com/client/v4/accounts/15ffc4e5014b573740ac139b5b734bd4/ai/run/@cf/meta/m2m100-1.2b');
  assert.equal(translation.translationEnabledForStore(cloudflare, 'c7f698w9kgurrdo'), true);
  assert.equal(translation.translationEnabledForStore(cloudflare, 'aaaaaaaaaaaaaaa'), false);

  const previous = documentFixture();
  const result = translation.autoTranslatePromoDocument(previous, previous, {}, {
    config: { enabled: false }, hash: sha256,
  });
  assert.deepEqual(result.document, previous);
  assert.equal(result.requests.length, 0);
});

test('migración agrega estado privado acotado al draft Promo', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../pb_migrations/1787699100_promo_translation_state.js'),
    'utf8',
  );
  assert.match(source, /promo_draft_documents/);
  assert.match(source, /translation_state_json/);
  assert.match(source, /hidden:\s*true/);
  assert.match(source, /maxSize:\s*4\s*\*\s*1024\s*\*\s*1024/);
  assert.doesNotMatch(source, /stores|products|orders|landing_qr/i);
});

test('PUBCFG integra la traducción fuera de la transacción y persiste estado junto al documento', () => {
  const source = fs.readFileSync(path.join(__dirname, '../pb_hooks/pz_promo_pubcfg_api_lib.js'), 'utf8');
  const handler = source.slice(source.indexOf('function handleDraftUpdate'), source.indexOf('\nmodule.exports'));
  const executeIndex = handler.indexOf('executePromoTranslations');
  const transactionIndex = handler.indexOf('runInTransaction');
  assert.ok(executeIndex > -1 && transactionIndex > executeIndex);
  assert.match(handler, /promo\.translations\.manage/);
  assert.match(handler, /translationEnabledForStore/);
  assert.match(handler, /translation_state_json/);
  assert.match(handler, /promo_live_conflict/);
});

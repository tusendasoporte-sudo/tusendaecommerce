const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const contact = require('../pb_hooks/pz_promo_contact_lib.js');

function documentFixture(type = 'whatsapp', destination = '+5351234567') {
  const config = type === 'email' ? { email_address: destination } : { phone_e164: destination };
  return {
    sections: [{
      key: 'hero-main', type: 'hero', visible: true,
      config: { media_use_key: '', action_key: 'primary-contact' }, media_use_keys: [],
    }],
    contact: {
      enabled: true,
      primary_action_key: 'primary-contact',
      secondary_action_keys: ['secondary-contact'],
      actions: [
        { key: 'primary-contact', type, enabled: true, config },
        { key: 'secondary-contact', type: 'phone', enabled: true, config: { phone_e164: '+15551234567' } },
      ],
    },
    content_by_locale: {
      es: {
        contact: {
          'primary-contact': {
            label: 'Solicitar estimado',
            aria_label: 'Solicitar un estimado por el canal principal',
            message: 'Hola, deseo solicitar un estimado para mi alfombra.',
          },
          'secondary-contact': {
            label: 'Llamar', aria_label: 'Llamar', message: '',
          },
        },
      },
      en: {
        contact: {
          'primary-contact': {
            label: 'Request an estimate',
            aria_label: 'Request an estimate through the primary channel',
            message: 'Hello, I would like to request an estimate.',
          },
          'secondary-contact': {
            label: 'Call', aria_label: 'Call', message: '',
          },
        },
      },
    },
  };
}

test('CONTACT compila WhatsApp desde E.164 y copy del locale exacto', () => {
  const compiled = contact.compilePrimaryAction(documentFixture(), 'es');
  assert.equal(compiled.contract, 'promo.contact.action.v1');
  assert.equal(compiled.available, true);
  assert.deepEqual(compiled.action, {
    key: 'primary-contact',
    type: 'whatsapp',
    label: 'Solicitar estimado',
    aria_label: 'Solicitar un estimado por el canal principal',
    href: 'https://wa.me/5351234567?text=Hola%2C%20deseo%20solicitar%20un%20estimado%20para%20mi%20alfombra.',
  });
  assert.doesNotMatch(compiled.action.href, /secondary|15551234567/);
});

test('CONTACT compila teléfono y correo sin concatenación insegura', () => {
  const phone = contact.compilePrimaryAction(documentFixture('phone'), 'en');
  assert.equal(phone.action.href, 'tel:+5351234567');
  assert.equal(phone.action.label, 'Request an estimate');

  const email = contact.compilePrimaryAction(documentFixture('email', 'quotes+promo@example.com'), 'es');
  assert.equal(
    email.action.href,
    'mailto:quotes%2Bpromo@example.com?body=Hola%2C%20deseo%20solicitar%20un%20estimado%20para%20mi%20alfombra.',
  );
});

test('CONTACT falla cerrado ante canal, destino, locale o copy no aprobados', () => {
  const disabled = documentFixture();
  disabled.contact.enabled = false;
  assert.deepEqual(contact.compilePrimaryAction(disabled, 'es'), contact.unavailableAction());

  const unsupported = documentFixture();
  unsupported.contact.actions[0] = {
    key: 'primary-contact', type: 'approved_live_chat', enabled: true, config: { adapter_key: 'tenant-script' },
  };
  assert.equal(contact.compilePrimaryAction(unsupported, 'es').available, false);

  const unsafePhone = documentFixture('phone', '+5351234567;ext=javascript:alert(1)');
  assert.equal(contact.compilePrimaryAction(unsafePhone, 'es').available, false);
  assert.equal(contact.compilePrimaryAction(documentFixture(), 'fr').available, false);

  const incomplete = documentFixture();
  incomplete.content_by_locale.es.contact['primary-contact'].aria_label = '';
  assert.equal(contact.compilePrimaryAction(incomplete, 'es').available, false);

  const unreferenced = documentFixture();
  unreferenced.sections[0].config.action_key = 'secondary-contact';
  assert.equal(contact.compilePrimaryAction(unreferenced, 'es').available, false);
});

test('CONTACT se adjunta al perfil localized sin exponer config ni habilitar analítica', () => {
  const localized = { locale: { effective: 'es' }, content: { identity: { name: 'Demo' } } };
  const attached = contact.attachPublicContact(localized, { document: documentFixture() });
  assert.equal(attached.contact_action.available, true);
  assert.deepEqual(attached.content, localized.content);
  assert.doesNotMatch(JSON.stringify(attached.contact_action), /phone_e164|email_address|secondary-contact/);

  const api = fs.readFileSync(path.join(__dirname, '..', 'pb_hooks', 'pz_promo_shell_api_lib.js'), 'utf8');
  assert.match(api, /promoContact\.attachPublicContact/);
  assert.ok(api.indexOf('localizeProjection') < api.indexOf('promoContact.attachPublicContact'));
  assert.doesNotMatch(api, /promo_contact_activate|analytics|products|orders|checkout/);
});

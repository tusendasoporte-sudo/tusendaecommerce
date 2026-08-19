'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const support = require('../pb_hooks/pz_admin_support_lib.js');

const STORE_ID = 'supportstore001';

function record(id, values) {
  return { id, get(key) { return values[key]; } };
}

function appWith({ store, masters }) {
  return {
    findRecordById(collection, id) {
      if (collection === 'stores' && id === store.id) return store;
      throw new Error('not_found');
    },
    findRecordsByFilter(collection, filter, sort) {
      assert.equal(collection, 'users');
      assert.equal(filter, 'role = "master_admin" && status = "active"');
      assert.equal(sort, '-updated,+id');
      return masters;
    },
  };
}

test('normaliza únicamente números internacionales válidos para WhatsApp', () => {
  assert.equal(support.normalizeWhatsappNumber('+1 (305) 555-0187'), '13055550187');
  assert.equal(support.normalizeWhatsappNumber('WhatsApp +1 305 555 0187'), '');
  assert.equal(support.normalizeWhatsappNumber('555'), '');
});

test('el contacto del admin usa el WhatsApp configurado por el Master activo', () => {
  const store = record(STORE_ID, { status: 'active', name: 'Tienda Norte', slug: 'tienda-norte' });
  const actor = record('adminsupport001', { role: 'store_admin', status: 'active', store: STORE_ID });
  const invalidMaster = record('mastersupport01', { role: 'master_admin', status: 'active', phone: '123' });
  const configuredMaster = record('mastersupport02', { role: 'master_admin', status: 'active', phone: '+53 5 123 4567' });

  const contact = support.supportContactSnapshot(appWith({ store, masters: [invalidMaster, configuredMaster] }), actor);
  const url = new URL(contact.href);
  assert.equal(contact.configured, true);
  assert.equal(url.origin, 'https://wa.me');
  assert.equal(url.pathname, '/5351234567');
  assert.match(url.searchParams.get('text'), /Tienda Norte \(tienda-norte\)/);
  assert.equal(Object.hasOwn(contact, 'whatsapp_number'), false);
});

test('sin número Master válido devuelve un estado seguro deshabilitado', () => {
  const store = record(STORE_ID, { status: 'active', name: 'Tienda Norte', slug: 'tienda-norte' });
  const actor = record('staffsupport001', { role: 'store_staff', status: 'active', store: STORE_ID });
  assert.deepEqual(
    support.supportContactSnapshot(appWith({ store, masters: [] }), actor),
    { configured: false, href: '' },
  );
});

test('rechaza usuarios suspendidos y la ruta exige autenticación', () => {
  const store = record(STORE_ID, { status: 'active' });
  const actor = record('adminsupport001', { role: 'store_admin', status: 'suspended', store: STORE_ID });
  assert.throws(() => support.supportContactSnapshot(appWith({ store, masters: [] }), actor), /unauthorized/);

  const route = readFileSync(path.join(__dirname, '../pb_hooks/pz_admin_support.pb.js'), 'utf8');
  assert.match(route, /"GET",\s*"\/api\/pz\/admin\/support-contact"/);
  assert.match(route, /requireAuthenticatedUser/);
  assert.match(route, /\$apis\.requireAuth\(\)/);
});

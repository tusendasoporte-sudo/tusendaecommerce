'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const support = require('../pb_hooks/pz_admin_support_lib.js');

function record(id, values) {
  return { id, get(key) { return values[key]; } };
}

function appWithMasters(masters) {
  return {
    findRecordsByFilter(collection, filter, sort) {
      assert.equal(collection, 'users');
      assert.equal(filter, 'role = "master_admin" && status = "active"');
      assert.equal(sort, '-updated,+id');
      return masters;
    },
  };
}

test('el contacto comercial público expone solo el enlace wa.me del Master activo', () => {
  const master = record('mastersupport02', {
    role: 'master_admin',
    status: 'active',
    phone: '+53 5 123 4567',
  });
  const contact = support.publicCommercialContactSnapshot(appWithMasters([master]));

  assert.deepEqual(contact, { configured: true, href: 'https://wa.me/5351234567' });
  assert.equal(Object.hasOwn(contact, 'whatsapp_number'), false);
  assert.deepEqual(
    support.publicCommercialContactSnapshot(appWithMasters([])),
    { configured: false, href: '' },
  );
});

test('la ruta comercial es pública, de solo lectura y sin cuerpo', () => {
  const route = readFileSync(path.join(__dirname, '../pb_hooks/pz_public_commercial_contact.pb.js'), 'utf8');
  assert.match(route, /"GET",\s*"\/api\/pz\/public\/commercial-contact"/);
  assert.match(route, /handlePublicCommercialContact/);
  assert.match(route, /\$apis\.bodyLimit\(0\)/);
  assert.doesNotMatch(route, /requireAuthenticatedUser|\$apis\.requireAuth/);
});

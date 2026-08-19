'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const migrationPath = path.resolve(__dirname, '../pb_migrations/1787191200_admin_app_global_private_delivery.js');
const source = fs.readFileSync(migrationPath, 'utf8');

class FakeFields extends Array {
  getByName(name) {
    const field = this.find((item) => item.name === name);
    if (!field) throw new Error(`missing_field:${name}`);
    return field;
  }
  add(field) { this.push(field); }
  removeById(id) {
    const index = this.findIndex((item) => item.id === id);
    if (index >= 0) this.splice(index, 1);
  }
}
class FakeField { constructor(values) { Object.assign(this, values); } }
class FakeRecord {
  constructor(id, values) { this.id = id; this.values = { ...values }; }
  get(key) { return this.values[key]; }
  set(key, value) { this.values[key] = value; }
}

function loadMigration() {
  let up; let down;
  vm.runInNewContext(source, {
    Field: FakeField, Error, Array,
    migrate(forward, rollback) { up = forward; down = rollback; },
  }, { filename: migrationPath });
  return { up, down };
}

function fixture() {
  const collections = new Map([
    ['admin_app_release_profiles', { id: 'profiles', name: 'admin_app_release_profiles', fields: new FakeFields() }],
    ['admin_app_download_tickets', {
      id: 'tickets', name: 'admin_app_download_tickets',
      fields: new FakeFields({ id: 'assignment-field', name: 'assignment', required: true, minSelect: 1 }),
    }],
    ['admin_app_release_events', {
      id: 'events', name: 'admin_app_release_events',
      fields: new FakeFields({ id: 'action-field', name: 'action', values: ['pilot_validated', 'release_published'] }),
    }],
  ]);
  const records = new Map([
    ['admin_app_release_assignments', new FakeRecord('assignment00001', { profile: 'profile00000001' })],
    ['admin_app_artifacts', new FakeRecord('artifact0000001', { profile: 'profile00000001' })],
  ]);
  const tickets = [];
  return {
    collections, tickets,
    findCollectionByNameOrId(name) { return collections.get(name); },
    findRecordById(name, id) {
      const record = records.get(name);
      if (!record || record.id !== id) throw new Error('missing_record');
      return record;
    },
    findRecordsByFilter(name, filter) {
      if (name === 'admin_app_release_events') return [];
      if (name !== 'admin_app_download_tickets') return [];
      if (filter === "assignment = '' && profile != ''") {
        return tickets.filter((item) => !item.get('assignment') && item.get('profile'));
      }
      return tickets;
    },
    save() {},
  };
}

test('la migración hace opcional la asignación y enlaza el ticket con el perfil', () => {
  const app = fixture();
  app.tickets.push(new FakeRecord('ticket000000001', {
    assignment: 'assignment00001', artifact: 'artifact0000001', profile: '',
  }));
  const { up } = loadMigration();
  up(app);
  const fields = app.collections.get('admin_app_download_tickets').fields;
  assert.equal(fields.getByName('assignment').required, false);
  assert.equal(fields.getByName('assignment').minSelect, 0);
  assert.equal(fields.getByName('profile').collectionId, 'profiles');
  assert.equal(app.tickets[0].get('profile'), 'profile00000001');
  assert.equal(app.collections.get('admin_app_release_events').fields.getByName('action').values.includes('test_approved'), true);
});

test('rollback restaura el contrato anterior solo si no existen tickets globales', () => {
  const app = fixture();
  const { up, down } = loadMigration();
  up(app);
  app.tickets.push(new FakeRecord('ticket000000001', { assignment: '', profile: 'profile00000001' }));
  assert.throws(() => down(app), /unsafe_rollback_admin_app_global_private_delivery/);
  app.tickets.length = 0;
  down(app);
  const fields = app.collections.get('admin_app_download_tickets').fields;
  assert.equal(fields.getByName('assignment').required, true);
  assert.equal(fields.getByName('assignment').minSelect, 1);
  assert.throws(() => fields.getByName('profile'), /missing_field/);
  assert.equal(app.collections.get('admin_app_release_events').fields.getByName('action').values.includes('test_approved'), false);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'src/lib/stores.ts'), 'utf8');

test('crear tienda usa el endpoint atómico y conserva el aprovisionamiento Commerce', () => {
  const start = source.indexOf('export async function createStoreFromMaster');
  const end = source.indexOf('export async function updateStoreFromMaster');
  const createSource = source.slice(start, end);
  assert.match(createSource, /\/api\/pz\/master\/stores\/create/);
  assert.match(createSource, /method: 'POST'/);
  assert.match(createSource, /body: payload/);
  assert.match(createSource, /store_type: storeType/);
  assert.doesNotMatch(createSource, /collection\('stores'\)\.create/);
});

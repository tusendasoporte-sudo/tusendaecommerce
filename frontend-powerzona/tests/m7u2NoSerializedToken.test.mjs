import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../src', import.meta.url));

function astroFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return astroFiles(absolute);
    return entry.isFile() && entry.name.endsWith('.astro') ? [absolute] : [];
  });
}

test('M7U2: ningún script admin serializa el bearer SSR en define:vars', () => {
  const files = [
    ...astroFiles(path.join(root, 'pages', 'admin')),
    ...astroFiles(path.join(root, 'pages', 't')),
    ...astroFiles(path.join(root, 'components', 'admin')),
  ];
  let inlineCount = 0;
  files.forEach((file) => {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/<script\s+define:vars=\{\{([\s\S]*?)\}\}>/g)) {
      inlineCount += 1;
      assert.doesNotMatch(match[1], /(?:adminAuthToken|authToken|ADMIN_AUTH_TOKEN|bearer)/i, file);
    }
    assert.doesNotMatch(source, /(?:ADMIN_AUTH_TOKEN|ADMIN_TOKEN)\s*=\s*String\(adminAuthToken\s*\|\|\s*''\)/, file);
  });
  assert.ok(inlineCount > 10, `define:vars inspeccionados: ${inlineCount}`);
});

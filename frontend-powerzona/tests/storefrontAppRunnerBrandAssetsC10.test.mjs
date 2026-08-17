import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import sharp from 'sharp';

import { normalizeStorefrontAppBrandAsset } from '../src/lib/storefrontAppBrandAssets.ts';

const workspace = path.resolve(import.meta.dirname, '..', '..');
const validator = path.join(workspace, 'mobile-storefront', 'scripts', 'validate-store-config.ps1');

function fileLike(buffer, name, type) {
  return { name, type, size: buffer.length, async arrayBuffer() { return buffer; } };
}

test('runner valida configuración externa con los PNG exactos aprobados por el Master', async (context) => {
  if (process.platform !== 'win32') return context.skip('El runner C10 actual usa PowerShell/gradlew.bat en Windows.');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pz-c10-runner-brand-'));
  try {
    const source = await sharp({ create: { width: 640, height: 480, channels: 4, background: '#6847E8' } }).png().toBuffer();
    const icon = await normalizeStorefrontAppBrandAsset(fileLike(source, 'icon.png', 'image/png'), 'icon', {
      randomSource: () => Buffer.from('11'.repeat(16), 'hex'),
    });
    const splash = await normalizeStorefrontAppBrandAsset(fileLike(source, 'splash.png', 'image/png'), 'splash', {
      randomSource: () => Buffer.from('22'.repeat(16), 'hex'),
    });
    await writeFile(path.join(directory, icon.filename), icon.buffer);
    await writeFile(path.join(directory, splash.filename), splash.buffer);

    const configPath = path.join(directory, 'storefront.properties');
    await writeFile(configPath, [
      'schema.version=1',
      'store.key=c10-runner-brand',
      'app.key=c10-runner-brand-storefront',
      'store.url=https://example.test/t/c10-runner-brand',
      'app.display_name=C10 Runner Brand',
      'application.id=com.tusenda84.c10runnerbrand',
      'brand.key=c10-runner-brand',
      'firebase.project_id=c10-runner-brand',
      'firebase.provisioning=create',
      'distribution=direct',
      'build.publishable=true',
      'version.code=1',
      'version.name=1.0.0',
      '',
    ].join('\n'), 'utf8');
    const asset = (value) => ({
      file: value.filename, sha256: value.sha256, width: value.width, height: value.height,
      bytes: value.bytes, normalizer_version: value.normalizerVersion,
    });
    const brandPath = path.join(directory, 'brand.json');
    await writeFile(brandPath, JSON.stringify({
      schema_version: 1,
      brand_key: 'c10-runner-brand',
      store_key: 'c10-runner-brand',
      display_name: 'C10 Runner Brand',
      application_id: 'com.tusenda84.c10runnerbrand',
      store_url: 'https://example.test/t/c10-runner-brand',
      publishable: true,
      firebase_android: {
        project_id: 'c10-runner-brand', package_name: 'com.tusenda84.c10runnerbrand',
        configuration_file: 'app/google-services.json', tracked_in_git: false,
      },
      assets: { icon: asset(icon), splash: asset(splash) },
      palette: {
        deep_sapphire: '#2D185E', energy_cobalt: '#6847E8', flash_blue: '#7C5CFC',
        platinum: '#CEC7E8', luminous_ice: '#EEE9FF', pearl_white: '#FFFFFF',
        ink: '#21143D', secondary_text: '#625879', base_background: '#F5F1FF',
      },
    }), 'utf8');

    const result = spawnSync('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', validator,
      '-ConfigKey', 'c10-runner-brand', '-ExternalConfigPath', configPath,
      '-ExternalBrandPath', brandPath,
    ], { cwd: workspace, encoding: 'utf8', windowsHide: true, timeout: 30_000 });
    assert.equal(result.status, 0, `${result.stdout || ''}\n${result.stderr || ''}`);
    assert.match(result.stdout, /valida y sin secretos rastreados/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('cola descarga marca por job y Gradle consume solo archivos externos', async () => {
  const [queue, runner, gradle] = await Promise.all([
    readFile(path.join(workspace, 'mobile-storefront', 'runner', 'run-job-queue.ps1'), 'utf8'),
    readFile(path.join(workspace, 'mobile-storefront', 'runner', 'store-app-runner.ps1'), 'utf8'),
    readFile(path.join(workspace, 'mobile-storefront', 'app', 'build.gradle'), 'utf8'),
  ]);
  assert.match(queue, /brand-assets\/\$jobId\/\$kind/);
  assert.match(queue, /brand_asset_download_mismatch_/);
  assert.match(queue, /_storefront-jobs/);
  assert.match(runner, /PZ_STOREFRONT_BRAND_CONFIG_FILE/);
  assert.match(gradle, /PZ_STOREFRONT_BRAND_CONFIG_FILE/);
  assert.match(gradle, /normalizer_version/);
});

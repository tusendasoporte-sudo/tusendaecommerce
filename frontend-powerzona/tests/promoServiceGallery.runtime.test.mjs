import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { build } from 'esbuild';
import { chromium } from 'playwright';

test('galería de opciones responde a flechas, puntos y teclado sin mezclar tarjetas', async (context) => {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL('../src/lib/promoServiceGallery.ts', import.meta.url))],
    bundle: true,
    format: 'iife',
    globalName: 'PromoServiceGallery',
    write: false,
  });
  const executablePath = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].find((candidate) => candidate && existsSync(candidate));
  if (!executablePath) return context.skip('No hay un navegador Chromium del sistema disponible.');
  const browser = await chromium.launch({ executablePath, headless: true });
  context.after(() => browser.close());
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await page.setContent(`
    <style>
      [data-promo-gallery-track] { display: flex; width: 320px; overflow: auto; padding: 0; margin: 0; }
      [data-promo-gallery-track] > li { flex: 0 0 320px; height: 120px; list-style: none; }
    </style>
    <article class="promo-service-detail__product">
      <div class="promo-service-detail__product-media">
        <ol data-promo-gallery-track tabindex="0"><li>A</li><li>B</li><li>C</li></ol>
        <nav data-promo-gallery-controls>
          <button type="button" data-promo-gallery-previous>Previous</button>
          <button type="button" data-promo-gallery-indicator data-promo-gallery-index="0">1</button>
          <button type="button" data-promo-gallery-indicator data-promo-gallery-index="1">2</button>
          <button type="button" data-promo-gallery-indicator data-promo-gallery-index="2">3</button>
          <span data-promo-gallery-status></span>
          <button type="button" data-promo-gallery-next>Next</button>
        </nav>
      </div>
    </article>
  `);
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.evaluate(() => window.PromoServiceGallery.initializePromoServiceGalleries());

  const state = async () => page.evaluate(() => {
    const track = document.querySelector('[data-promo-gallery-track]');
    const indicators = Array.from(document.querySelectorAll('[data-promo-gallery-indicator]'));
    return {
      left: track.scrollLeft,
      status: document.querySelector('[data-promo-gallery-status]').textContent,
      current: indicators.findIndex((indicator) => indicator.getAttribute('aria-current') === 'true'),
    };
  });

  await page.click('[data-promo-gallery-next]');
  await page.waitForFunction(() => document.querySelector('[data-promo-gallery-track]').scrollLeft === 320);
  assert.deepEqual(await state(), { left: 320, status: '2/3', current: 1 });

  await page.click('[data-promo-gallery-index="2"]');
  await page.waitForFunction(() => document.querySelector('[data-promo-gallery-track]').scrollLeft === 640);
  assert.deepEqual(await state(), { left: 640, status: '3/3', current: 2 });

  await page.click('[data-promo-gallery-next]');
  await page.waitForFunction(() => document.querySelector('[data-promo-gallery-track]').scrollLeft === 0);
  assert.deepEqual(await state(), { left: 0, status: '1/3', current: 0 });

  await page.focus('[data-promo-gallery-track]');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('[data-promo-gallery-track]').scrollLeft === 320);
  assert.deepEqual(await state(), { left: 320, status: '2/3', current: 1 });
});

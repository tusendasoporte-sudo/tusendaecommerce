import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { confirmPromoAdminAction } from '../src/lib/promoAdminConfirm.ts';

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

test('la confirmación Promo delega en la tarjeta global y falla cerrada si no está disponible', async () => {
  const previousWindow = globalThis.window;
  const calls = [];
  try {
    globalThis.window = {
      AdminDialog: {
        async confirm(options) {
          calls.push(options);
          return true;
        },
      },
    };
    assert.equal(await confirmPromoAdminAction({
      title: 'Eliminar reseña',
      message: 'No se puede deshacer.',
      confirmText: 'Eliminar definitivamente',
      tone: 'danger',
    }), true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].tone, 'danger');
    assert.equal(calls[0].cancelText, 'Cancelar');

    globalThis.window = {};
    assert.equal(await confirmPromoAdminAction({
      title: 'Eliminar',
      message: 'Confirmar',
      confirmText: 'Eliminar',
    }), false);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('el Admin Promo carga una sola tarjeta compartida y elimina confirmaciones nativas', () => {
  const shell = read('../src/components/admin/promo/PromoAdminShell.astro');
  const reviews = read('../src/components/admin/promo/PromoReviewsEditor.astro');
  const locales = read('../src/components/admin/promo/PromoLocalesEditor.astro');
  const destructive = read('../src/lib/promoDestructiveActions.ts');
  const helper = read('../src/lib/promoAdminConfirm.ts');
  const promoConfirmationSources = [reviews, locales, destructive, helper].join('\n');

  assert.match(shell, /import AdminDialog from '\.\.\/AdminDialog\.astro'/);
  assert.match(shell, /<AdminDialog\s*\/>/);
  assert.match(reviews, /confirmPromoAdminAction/);
  assert.match(locales, /confirmPromoAdminAction/);
  assert.match(destructive, /confirmPromoAdminAction/);
  assert.doesNotMatch(promoConfirmationSources, /window\.confirm\s*\(/);
  assert.match(destructive, /tone:\s*'danger'/);
  assert.match(reviews, /action === 'delete' \? 'danger' : 'warning'/);
  assert.match(locales, /tone:\s*'warning'/);
});

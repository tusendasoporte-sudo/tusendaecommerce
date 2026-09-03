import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const page = read('src/pages/index.astro');
const contact = read('src/lib/publicCommercialContact.ts');

test('la portada obtiene únicamente un enlace wa.me validado del Master', () => {
  assert.match(contact, /\/api\/pz\/public\/commercial-contact/);
  assert.match(contact, /url\.protocol !== 'https:'/);
  assert.match(contact, /url\.hostname !== 'wa\.me'/);
  assert.match(contact, /WHATSAPP_PATH_PATTERN/);
  assert.match(contact, /export function publicWhatsappBaseHref/);
  assert.match(page, /getPublicCommercialContact\(pocketbaseUrl\)/);
  assert.match(page, /publicWhatsappBaseHref\(import\.meta\.env\.PUBLIC_MASTER_SUPPORT_WHATSAPP\)/);
});

test('cada plan prepara un mensaje con modalidad, plan, duración y precio', () => {
  for (const text of [
    'Modalidad:',
    'Plan:',
    'Duración:',
    'Precio mensual equivalente:',
    'Total a pagar:',
  ]) assert.match(contact, new RegExp(text));
  assert.match(contact, /details\.isTrial/);
  assert.match(page, /buildCommercialPlanWhatsappHref\(commercialWhatsappHref/);
  assert.match(page, /storeTypeName: storeType\.name/);
  assert.match(page, /monthlyEquivalent: pricing\.equivalent/);
});

test('el botón abre WhatsApp en una pestaña segura y se deshabilita si falta contacto', () => {
  assert.match(page, /href=\{whatsappHref\}/);
  assert.match(page, /target="_blank" rel="noopener noreferrer"/);
  assert.match(page, /consultar por WhatsApp/);
  assert.match(page, /class="commercial-plan-action is-unavailable"/);
  assert.match(page, /WhatsApp del Master no configurado/);
});

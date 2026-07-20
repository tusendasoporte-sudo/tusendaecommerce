import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  STORE_TEAM_DELETE_REASONS,
  getStoreTeamDeleteReasonLabel,
  validateStoreTeamDeleteReason,
} from '../src/lib/storeTeamDeleteReasons.ts';
import {
  STORE_TEAM_API_PATHS,
  deleteStoreTeamUser,
} from '../src/lib/storeTeam.ts';

const require = createRequire(import.meta.url);
const backendReasons = require('../../backend-powerzona/pb_hooks/pz_store_team_delete_reasons_lib.js');
const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

test('M7U2-C2F1: catálogo frontend mantiene paridad exacta con backend', () => {
  assert.equal(STORE_TEAM_DELETE_REASONS.length, 8);
  assert.deepEqual(
    STORE_TEAM_DELETE_REASONS.map(({ code, label }) => ({ code, label })),
    backendReasons.DELETE_REASON_DEFINITIONS.map(({ code, label }) => ({ code, label })),
  );
  for (const reason of STORE_TEAM_DELETE_REASONS) {
    assert.equal(getStoreTeamDeleteReasonLabel(reason.code), reason.label);
  }
});

test('M7U2-C2F1: validación frontend exige Otro y vacía detalle para motivos cerrados', () => {
  assert.deepEqual(validateStoreTeamDeleteReason('duplicate_account', 'texto no necesario'), {
    ok: true,
    value: { reason_code: 'duplicate_account', reason_detail: '' },
  });
  assert.equal(validateStoreTeamDeleteReason('', '').error, 'delete_reason_required');
  assert.equal(validateStoreTeamDeleteReason('Otro', '').error, 'delete_reason_invalid');
  assert.equal(validateStoreTeamDeleteReason('other', '       ').error, 'delete_reason_detail_required');
  assert.equal(validateStoreTeamDeleteReason('other', '1234567').error, 'delete_reason_detail_too_short');
  assert.equal(validateStoreTeamDeleteReason('other', 'x'.repeat(301)).error, 'delete_reason_detail_too_long');
  assert.equal(validateStoreTeamDeleteReason('other', '<script>alert(1)</script>').error, 'delete_reason_detail_invalid');
  assert.equal(validateStoreTeamDeleteReason('other', '12345678').ok, true);
});

test('M7U2-C2F1: cliente envía correo normalizado, código y detalle, nunca etiqueta ni reason libre', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(String(options.body || '{}')) });
    return jsonResponse({ ok: true, user_deleted: true, user_id: 'userc2f1test001', sessions_revoked: true });
  };
  const options = { baseUrl: 'https://pb.example.test/', token: 'private-token', fetcher };
  await deleteStoreTeamUser(
    'userc2f1test001',
    ' PERSONA@EXAMPLE.COM ',
    'other',
    '  Se sustituyó la cuenta por otra identidad.  ',
    options,
  );
  assert.equal(calls[0].url, `https://pb.example.test${STORE_TEAM_API_PATHS.delete}`);
  assert.deepEqual(calls[0].body, {
    user_id: 'userc2f1test001',
    confirmation_email: 'persona@example.com',
    reason_code: 'other',
    reason_detail: 'Se sustituyó la cuenta por otra identidad.',
  });
  assert.equal(Object.hasOwn(calls[0].body, 'reason'), false);
  assert.equal(Object.hasOwn(calls[0].body, 'reason_label_snapshot'), false);
  assert.equal(Object.hasOwn(calls[0].body, 'store_id'), false);
  assert.equal(Object.hasOwn(calls[0].body, 'actor_id'), false);
});

test('M7U2-C2F1: fila PC/móvil renderiza correo completo seleccionable sin enmascararlo', () => {
  const view = read('../src/components/admin/StoreTeamView.astro');
  const styles = read('../src/styles/store-team.css');
  assert.match(view, /class="store-team-row__email">\$\{escapeHtml\(user\.email \|\| 'Sin correo'\)\}/);
  assert.doesNotMatch(view, /function maskEmail|Correo protegido|\*'\.repeat/);
  assert.match(view, /function syncEmailTitles\(\)[\s\S]*scrollWidth > element\.clientWidth/);
  assert.match(styles, /\.store-team-row__identity \.store-team-row__email[\s\S]*user-select: text/);
  assert.match(styles, /\.store-team-row__identity,[\s\S]*min-width: 0/);
  assert.match(styles, /\.store-team-row__identity strong,[\s\S]*text-overflow: ellipsis/);
});

test('M7U2-C2F1: diálogo muestra correo, copia con fallback y mantiene confirmación vacía', () => {
  const view = read('../src/components/admin/StoreTeamView.astro');
  assert.match(view, /Correo del usuario/);
  assert.match(view, /data-team-delete-email-value/);
  assert.match(view, /data-team-delete-email-copy>Copiar correo/);
  assert.match(view, /navigator\.clipboard\?\.writeText/);
  assert.match(view, /document\.execCommand\('copy'\)/);
  assert.match(view, /Correo copiado/);
  assert.match(view, /deleteForm\?\.reset\(\)/);
  assert.match(view, /clearDeleteCopyState\(\)/);
  assert.doesNotMatch(view, /deleteEmail\.value\s*=\s*user\.email/);
  assert.match(view, /name="confirmation_email"[\s\S]*autocomplete="off"/);
});

test('M7U2-C2F1: selector usa ocho opciones centrales y Otro controla detalle y submit', () => {
  const view = read('../src/components/admin/StoreTeamView.astro');
  assert.match(view, /<option value="">Seleccione un motivo<\/option>/);
  assert.match(view, /STORE_TEAM_DELETE_REASONS\.map\(\(reason\) => <option value=\{reason\.code\}>\{reason\.label\}<\/option>\)/);
  assert.match(view, /name="reason_code"/);
  assert.match(view, /name="reason_detail"/);
  assert.match(view, /maxlength="300"/);
  assert.match(view, /const usesDetail = deleteReason\?\.value === 'other'/);
  assert.match(view, /deleteDetail\.required = usesDetail/);
  assert.match(view, /if \(!usesDetail\) deleteDetail\.value = ''/);
  assert.match(view, /deleteSubmit\.disabled = deletingUser \|\| !deleteFormIsValid\(\)/);
  assert.match(view, /data-team-delete-submit disabled/);
});

test('M7U2-C2F1: envío bloquea cierre, muestra error interno y preserva C1/C2', () => {
  const view = read('../src/components/admin/StoreTeamView.astro');
  const visualRunner = read('./m7u2C2.visual.mjs');
  const astroConfig = read('../astro.config.mjs');
  assert.match(view, /if \(deletingUser\) \{[\s\S]*event\.preventDefault\(\)/);
  assert.match(view, /showMessage\(deleteAlert, getStoreTeamErrorMessage\(error\), 'error'\)/);
  assert.match(view, /data-team-action="delete">Eliminar permanentemente/);
  assert.match(view, /data-team-floating-menu/);
  assert.match(view, /window\.setTimeout\(\(\) => hideTeamToast\(\), 3800\)/);
  assert.match(view, /data-team-tab="activity"/);
  assert.match(view, /document\.dispatchEvent\(new CustomEvent\('pz:last-modification:refresh'\)\)/);
  assert.match(visualRunner, /PZ_VISUAL_TEST: '1'/);
  assert.match(astroConfig, /enabled: process\.env\.PZ_VISUAL_TEST !== '1'/);
});

test('M7U2-C2F1: actividad prioriza motivo y detalle solo para la vista privada', () => {
  const activity = read('../src/components/admin/StoreActivityView.astro');
  const client = read('../src/lib/storeActivity.ts');
  assert.match(client, /reason_label_snapshot: 'Motivo'/);
  assert.match(client, /reason_detail: 'Detalle'/);
  assert.match(activity, /event\.action === 'user_deleted'[\s\S]*reason_label_snapshot[\s\S]*reason_detail/);
  assert.match(activity, /event\.action === 'user_deleted' \? 'Usuario eliminado'/);
});

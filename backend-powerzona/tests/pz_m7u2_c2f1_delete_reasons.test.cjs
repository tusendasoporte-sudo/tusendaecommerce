const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const hooks = path.join(__dirname, '..', 'pb_hooks');
const reasons = require(path.join(hooks, 'pz_store_team_delete_reasons_lib.js'));
const team = require(path.join(hooks, 'pz_store_team_lib.js'));
const masterUsers = require(path.join(hooks, 'pz_master_store_users_lib.js'));
const teamSource = fs.readFileSync(path.join(hooks, 'pz_store_team_lib.js'), 'utf8');
const masterSource = fs.readFileSync(path.join(hooks, 'pz_master_store_users_lib.js'), 'utf8');

const USER_ID = 'userc2f1test001';

function storeDeletePayload(overrides = {}) {
  return {
    user_id: USER_ID,
    confirmation_email: ' Persona@Example.COM ',
    reason_code: 'access_no_longer_needed',
    reason_detail: '',
    ...overrides,
  };
}

test('M7U2-C2F1: catálogo backend contiene exactamente los ocho códigos y etiquetas aprobados', () => {
  assert.deepEqual(reasons.DELETE_REASON_DEFINITIONS, [
    { code: 'employment_ended', label: 'Fin de relación laboral o colaboración' },
    { code: 'access_no_longer_needed', label: 'Acceso ya no necesario' },
    { code: 'created_by_mistake', label: 'Cuenta creada por error' },
    { code: 'duplicate_account', label: 'Usuario duplicado' },
    { code: 'role_or_responsibility_changed', label: 'Cambio de responsable o puesto' },
    { code: 'internal_policy_violation', label: 'Incumplimiento de políticas internas' },
    { code: 'security_incident', label: 'Riesgo o incidente de seguridad' },
    { code: 'other', label: 'Otro' },
  ]);
  assert.equal(new Set(reasons.DELETE_REASON_CODES).size, 8);
});

test('M7U2-C2F1: todos los códigos permitidos resuelven etiqueta en servidor y los normales vacían detalle', () => {
  for (const definition of reasons.DELETE_REASON_DEFINITIONS) {
    const detail = definition.code === 'other' ? 'Explicación válida de ocho o más caracteres.' : 'texto libre innecesario';
    const validated = reasons.validateStoreDeleteReason(definition.code, detail);
    assert.equal(validated.ok, true, definition.code);
    assert.equal(validated.value.reason_code, definition.code);
    assert.equal(validated.value.reason_label_snapshot, definition.label);
    assert.equal(validated.value.reason_detail, definition.code === 'other' ? detail : '');
  }
});

test('M7U2-C2F1: allowlist rechaza vacío, etiqueta, manipulación y detalle Otro inválido', () => {
  assert.equal(reasons.validateStoreDeleteReason('', '').error, 'delete_reason_required');
  assert.equal(reasons.validateStoreDeleteReason('Acceso ya no necesario', '').error, 'delete_reason_invalid');
  assert.equal(reasons.validateStoreDeleteReason(' access_no_longer_needed', '').error, 'delete_reason_invalid');
  assert.equal(reasons.validateStoreDeleteReason('unknown', '').error, 'delete_reason_invalid');
  assert.equal(reasons.validateStoreDeleteReason('other', '').error, 'delete_reason_detail_required');
  assert.equal(reasons.validateStoreDeleteReason('other', '       ').error, 'delete_reason_detail_required');
  assert.equal(reasons.validateStoreDeleteReason('other', '1234567').error, 'delete_reason_detail_too_short');
  assert.equal(reasons.validateStoreDeleteReason('other', 'x'.repeat(301)).error, 'delete_reason_detail_too_long');
  assert.equal(reasons.validateStoreDeleteReason('other', '<b>motivo interno</b>').error, 'delete_reason_detail_invalid');
  assert.equal(reasons.validateStoreDeleteReason('other', '12345678').ok, true);
});

test('M7U2-C2F1: contrato Store es exacto, normaliza correo y ya no acepta reason libre', () => {
  const parsed = team.parseDelete(storeDeletePayload());
  assert.equal(parsed.confirmationEmail, 'persona@example.com');
  assert.deepEqual(parsed.deletionReason, {
    reason_code: 'access_no_longer_needed',
    reason_label_snapshot: 'Acceso ya no necesario',
    reason_detail: '',
  });
  assert.equal(team.parseDelete({
    user_id: USER_ID,
    confirmation_email: 'persona@example.com',
    reason: 'Contrato anterior no permitido',
  }), null);
  assert.equal(team.parseDelete({ ...storeDeletePayload(), reason_label_snapshot: 'Etiqueta manipulada' }), null);
  const masked = team.parseDelete(storeDeletePayload({ confirmation_email: 'p***@example.com' }));
  assert.equal(masked.confirmationEmail, 'p***@example.com');
  assert.match(masterSource, /normalizeEmail\(input\.confirmationEmail\) !== snapshot\.email/);
});

test('M7U2-C2F1: auditoría estructurada conserva código, snapshot y detalle sin duplicar etiqueta del cliente', () => {
  const validated = reasons.validateStoreDeleteReason('other', '  Cuenta sustituida por otra identidad.  ');
  assert.equal(validated.ok, true);
  const stored = reasons.serializeDeleteReason(validated.value);
  assert.ok(stored.length <= 500);
  assert.deepEqual(reasons.parseStoredDeleteReason(stored), {
    structured: true,
    reason_code: 'other',
    reason_label_snapshot: 'Otro',
    reason_detail: 'Cuenta sustituida por otra identidad.',
    legacy_reason: '',
  });
  assert.deepEqual(reasons.parseStoredDeleteReason('Motivo libre conservado para Master'), {
    structured: false,
    reason_code: '',
    reason_label_snapshot: '',
    reason_detail: '',
    legacy_reason: 'Motivo libre conservado para Master',
  });
  assert.match(masterSource, /after\.reason_code = deletionReason\.reason_code/);
  assert.match(masterSource, /after\.reason_label_snapshot = deletionReason\.reason_label_snapshot/);
  assert.match(masterSource, /after\.reason_detail = deletionReason\.reason_detail/);
  assert.match(masterSource, /sourceEventKey: `team:\$\{action\}:\$\{specializedAudit\.id\}`/);
});

test('M7U2-C2F1: listado privado expone email solo tras exigir principal y Master conserva motivo libre', () => {
  assert.match(teamSource, /function handleList[\s\S]*requestContext\(e, parseEmpty, true\)/);
  assert.match(teamSource, /email: snapshot\.email/);
  assert.match(teamSource, /if \(requirePrimary && !isPrimary\)/);

  const masterParsed = masterUsers.parseDeletePayload({
    store_id: 'storec2f1test01',
    user_id: USER_ID,
    confirmation_email: ' Persona@Example.COM ',
    reason: 'Motivo libre compatible para Master',
  });
  assert.equal(masterParsed.ok, true);
  assert.equal(masterParsed.value.confirmationEmail, 'persona@example.com');
  assert.equal(masterParsed.value.reason, 'Motivo libre compatible para Master');
  assert.match(masterSource, /recordString\(actor, "role"\) === "master_admin" && !input\.reasonCode/);
});

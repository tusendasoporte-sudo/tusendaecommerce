export const STORE_TEAM_DELETE_REASONS = Object.freeze([
  Object.freeze({ code: 'employment_ended', label: 'Fin de relación laboral o colaboración' }),
  Object.freeze({ code: 'access_no_longer_needed', label: 'Acceso ya no necesario' }),
  Object.freeze({ code: 'created_by_mistake', label: 'Cuenta creada por error' }),
  Object.freeze({ code: 'duplicate_account', label: 'Usuario duplicado' }),
  Object.freeze({ code: 'role_or_responsibility_changed', label: 'Cambio de responsable o puesto' }),
  Object.freeze({ code: 'internal_policy_violation', label: 'Incumplimiento de políticas internas' }),
  Object.freeze({ code: 'security_incident', label: 'Riesgo o incidente de seguridad' }),
  Object.freeze({ code: 'other', label: 'Otro' }),
] as const);

export type StoreTeamDeleteReasonCode = typeof STORE_TEAM_DELETE_REASONS[number]['code'];

export const STORE_TEAM_DELETE_REASON_DETAIL_MIN = 8;
export const STORE_TEAM_DELETE_REASON_DETAIL_MAX = 300;

const REASONS_BY_CODE = new Map<StoreTeamDeleteReasonCode, typeof STORE_TEAM_DELETE_REASONS[number]>(
  STORE_TEAM_DELETE_REASONS.map((item) => [item.code, item]),
);

export function isStoreTeamDeleteReasonCode(value: unknown): value is StoreTeamDeleteReasonCode {
  return typeof value === 'string' && REASONS_BY_CODE.has(value as StoreTeamDeleteReasonCode);
}

export function getStoreTeamDeleteReasonLabel(value: unknown) {
  return isStoreTeamDeleteReasonCode(value) ? REASONS_BY_CODE.get(value)?.label || '' : '';
}

export function validateStoreTeamDeleteReason(reasonCode: unknown, reasonDetail: unknown) {
  if (typeof reasonCode !== 'string' || !reasonCode) return { ok: false as const, error: 'delete_reason_required' };
  if (reasonCode !== reasonCode.trim() || !isStoreTeamDeleteReasonCode(reasonCode)) {
    return { ok: false as const, error: 'delete_reason_invalid' };
  }
  if (typeof reasonDetail !== 'string') return { ok: false as const, error: 'delete_reason_detail_invalid' };
  if (reasonCode !== 'other') {
    return { ok: true as const, value: { reason_code: reasonCode, reason_detail: '' } };
  }
  if (reasonDetail.length > STORE_TEAM_DELETE_REASON_DETAIL_MAX) {
    return { ok: false as const, error: 'delete_reason_detail_too_long' };
  }
  const detail = reasonDetail.trim();
  if (!detail) return { ok: false as const, error: 'delete_reason_detail_required' };
  if (detail.length < STORE_TEAM_DELETE_REASON_DETAIL_MIN) {
    return { ok: false as const, error: 'delete_reason_detail_too_short' };
  }
  if (/[<>]/.test(detail)) return { ok: false as const, error: 'delete_reason_detail_invalid' };
  return { ok: true as const, value: { reason_code: reasonCode, reason_detail: detail } };
}

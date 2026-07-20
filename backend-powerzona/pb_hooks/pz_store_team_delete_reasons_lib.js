/// <reference path="../pb_data/types.d.ts" />

const DELETE_REASON_DEFINITIONS = Object.freeze([
  Object.freeze({ code: "employment_ended", label: "Fin de relación laboral o colaboración" }),
  Object.freeze({ code: "access_no_longer_needed", label: "Acceso ya no necesario" }),
  Object.freeze({ code: "created_by_mistake", label: "Cuenta creada por error" }),
  Object.freeze({ code: "duplicate_account", label: "Usuario duplicado" }),
  Object.freeze({ code: "role_or_responsibility_changed", label: "Cambio de responsable o puesto" }),
  Object.freeze({ code: "internal_policy_violation", label: "Incumplimiento de políticas internas" }),
  Object.freeze({ code: "security_incident", label: "Riesgo o incidente de seguridad" }),
  Object.freeze({ code: "other", label: "Otro" }),
]);

const DELETE_REASON_CODES = Object.freeze(DELETE_REASON_DEFINITIONS.map((item) => item.code));
const DELETE_REASON_BY_CODE = Object.freeze(DELETE_REASON_DEFINITIONS.reduce((result, item) => {
  result[item.code] = item;
  return result;
}, {}));
const DELETE_REASON_DETAIL_MIN = 8;
const DELETE_REASON_DETAIL_MAX = 300;

function resultError(error) {
  return { ok: false, error };
}

function validateStoreDeleteReason(reasonCode, reasonDetail) {
  if (typeof reasonCode !== "string" || !reasonCode) return resultError("delete_reason_required");
  if (reasonCode !== reasonCode.trim() || !DELETE_REASON_BY_CODE[reasonCode]) {
    return resultError("delete_reason_invalid");
  }
  if (typeof reasonDetail !== "string") return resultError("delete_reason_detail_invalid");
  if (reasonCode !== "other") {
    return {
      ok: true,
      value: Object.freeze({
        reason_code: reasonCode,
        reason_label_snapshot: DELETE_REASON_BY_CODE[reasonCode].label,
        reason_detail: "",
      }),
    };
  }

  if (reasonDetail.length > DELETE_REASON_DETAIL_MAX) return resultError("delete_reason_detail_too_long");
  const detail = reasonDetail.trim();
  if (!detail) return resultError("delete_reason_detail_required");
  if (detail.length < DELETE_REASON_DETAIL_MIN) return resultError("delete_reason_detail_too_short");
  if (/[<>]/.test(detail)) return resultError("delete_reason_detail_invalid");
  return {
    ok: true,
    value: Object.freeze({
      reason_code: reasonCode,
      reason_label_snapshot: DELETE_REASON_BY_CODE[reasonCode].label,
      reason_detail: detail,
    }),
  };
}

function serializeDeleteReason(value) {
  const candidate = value && typeof value === "object" ? value : {};
  const validated = validateStoreDeleteReason(candidate.reason_code, candidate.reason_detail);
  if (!validated.ok) return "";
  return JSON.stringify(validated.value);
}

function parseStoredDeleteReason(value) {
  const raw = typeof value === "string" ? value.trim().slice(0, 500) : "";
  if (!raw) {
    return { structured: false, reason_code: "", reason_label_snapshot: "", reason_detail: "", legacy_reason: "" };
  }
  try {
    const parsed = JSON.parse(raw);
    const validated = validateStoreDeleteReason(parsed && parsed.reason_code, parsed && parsed.reason_detail);
    if (validated.ok) {
      const storedLabel = typeof parsed.reason_label_snapshot === "string"
        ? parsed.reason_label_snapshot.trim().slice(0, 100)
        : "";
      return {
        structured: true,
        reason_code: validated.value.reason_code,
        reason_label_snapshot: storedLabel || validated.value.reason_label_snapshot,
        reason_detail: validated.value.reason_detail,
        legacy_reason: "",
      };
    }
  } catch (_) {}
  return { structured: false, reason_code: "", reason_label_snapshot: "", reason_detail: "", legacy_reason: raw };
}

module.exports = {
  DELETE_REASON_BY_CODE,
  DELETE_REASON_CODES,
  DELETE_REASON_DEFINITIONS,
  DELETE_REASON_DETAIL_MAX,
  DELETE_REASON_DETAIL_MIN,
  parseStoredDeleteReason,
  serializeDeleteReason,
  validateStoreDeleteReason,
};

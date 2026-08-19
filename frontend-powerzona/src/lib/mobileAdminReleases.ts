import { ADMIN_DEVICE_HEADER_NAME, isValidAdminDeviceToken } from './adminDevice.ts';

export type AdminAppProfile = {
  id: string;
  channel: 'staging' | 'production';
  display_name: string;
  package_name: string;
  admin_url: string;
  firebase_configured: boolean;
  signing_configured: boolean;
  signing_cert_sha256: string;
  latest_version_code: number;
  latest_version_name: string;
  next_version_code: number;
  identity_locked: boolean;
  icon: AdminAppBrandAsset | null;
  splash: AdminAppBrandAsset | null;
  splash_background_color: string;
  minimum_supported_version_code: number;
  status: 'active' | 'paused' | 'withdrawn';
};

export type AdminAppEngine = { name: string; version: string; contract_version: number; firebase_required: boolean; revision?: string };

export type AdminAppBrandAsset = {
  id: string;
  kind: 'icon' | 'splash';
  file_name: string;
  sha256: string;
  bytes: number;
  width: number;
  height: number;
  revision: number;
  status: 'active' | 'superseded';
  download_path: string;
};

export type AdminAppArtifact = {
  id: string;
  profile_id: string;
  job_id: string;
  kind: 'apk' | 'checksums' | 'instructions' | 'build_manifest';
  file_name: string;
  sha256: string;
  bytes: number;
  version_code: number;
  version_name: string;
  lifecycle_status: 'staged' | 'available' | 'deleted';
  stored: boolean;
};

export type AdminAppAssignment = {
  id: string;
  profile_id: string;
  artifact_id: string;
  store: { id: string; name: string; slug: string };
  user: { id: string; name: string; email: string };
  device: { id: string; label: string; status: string };
  stage: 'pilot' | 'gradual' | 'general';
  wave: number;
  status: 'active' | 'revoked';
  download_count: number;
  last_downloaded_at: string;
  installed_version_code: number;
  installed_version_name: string;
  installed_at: string;
  validated_at: string;
};

export type AdminAppJob = {
  id: string;
  profile_id: string;
  operation: 'provision' | 'update';
  status: 'preview' | 'queued' | 'claimed' | 'succeeded' | 'failed' | 'needs_attention' | 'canceled';
  version_code: number;
  version_name: string;
  preview_hash: string;
  preview: Record<string, unknown> | null;
  preview_expires_at: string;
  failure_code: string;
  engine: AdminAppEngine;
};

export type AdminAppEligibleDevice = {
  user_id: string;
  user_name: string;
  user_email: string;
  store_id: string;
  store_name: string;
  device_id: string;
  device_label: string;
  device_last_seen_at: string;
};

export type MasterAdminAppDetail = {
  engine: AdminAppEngine;
  profile: AdminAppProfile | null;
  jobs: AdminAppJob[];
  artifacts: AdminAppArtifact[];
  assignments: AdminAppAssignment[];
  eligible_devices: AdminAppEligibleDevice[];
  events: Array<{ id: string; action: string; outcome: string; reason: string; artifact_id: string; created: string }>;
};

export type AdminAppRecipient = {
  store: { id: string; name: string; slug: string };
  user: { id: string; name: string; email: string };
  device: { id: string; label: string; status: string };
};

export type AdminAppPortalAccess = {
  recipient: AdminAppRecipient;
  artifact: AdminAppArtifact;
  profile: AdminAppProfile;
  grant_present: boolean;
};

export type AdminAppPortalOptions = {
  grant?: string;
  package_name?: string;
  channel: 'staging' | 'production';
};

export type AdminAppPolicy = {
  package_name: string;
  current_version_code: number;
  current_version_name: string;
  latest_version_code: number;
  latest_version_name: string;
  minimum_supported_version_code: number;
  update_available: boolean;
  update_required: boolean;
  portal_path: string;
};

export type AdminAppResult<T> = { available: boolean; status: number; error: string; data: T | null };

export type NativeAdminAppIdentity = { package_name: string; version_code: number; version_name: string };

const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export function parseNativeAdminAppUserAgent(userAgent: string): NativeAdminAppIdentity | null {
  const value = String(userAgent || '').slice(0, 1000);
  const identified = /\bTuSenda84Admin\/([0-9]+\.[0-9]+\.[0-9]+)\s+\(([1-9][0-9]{0,9});\s*([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+)\)/.exec(value);
  if (identified) return { package_name: identified[3], version_name: identified[1], version_code: Number(identified[2]) };
  // Compatibilidad con las versiones C10.8 anteriores al motor 1.0.0.
  const current = /\bTuSenda84Admin\/([0-9]+\.[0-9]+\.[0-9]+)\s+\(([1-9][0-9]{0,9})\)/.exec(value);
  if (current) return { package_name: 'com.tusenda84.admin', version_name: current[1], version_code: Number(current[2]) };
  // Compatibilidad cerrada con la APK 1.0.2 (3), cuya UA histórica solo decía TuSenda84Admin/1.0.
  return /\bTuSenda84Admin\/1\.0\b/.test(value)
    ? { package_name: 'com.tusenda84.admin', version_name: '1.0.2', version_code: 3 }
    : null;
}

function text(value: unknown, max: number) {
  return String(value ?? '').trim().slice(0, max);
}

function integer(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function normalizeProfile(value: any): AdminAppProfile | null {
  if (!value || !RECORD_ID_PATTERN.test(text(value.id, 15))
    || !['staging', 'production'].includes(value.channel)
    || !['active', 'paused', 'withdrawn'].includes(value.status)) return null;
  const icon = value.icon ? normalizeBrandAsset(value.icon) : null;
  const splash = value.splash ? normalizeBrandAsset(value.splash) : null;
  if ((value.icon && !icon) || (value.splash && !splash)) return null;
  return {
    id: text(value.id, 15), channel: value.channel, display_name: text(value.display_name, 120),
    package_name: text(value.package_name, 190), admin_url: text(value.admin_url, 500),
    firebase_configured: value.firebase_configured === true, signing_configured: value.signing_configured === true,
    signing_cert_sha256: text(value.signing_cert_sha256, 95), latest_version_code: integer(value.latest_version_code),
    latest_version_name: text(value.latest_version_name, 40), next_version_code: integer(value.next_version_code),
    identity_locked: value.identity_locked === true, icon, splash,
    splash_background_color: /^#[A-F0-9]{6}$/.test(text(value.splash_background_color, 7)) ? text(value.splash_background_color, 7) : '#FFFFFF',
    minimum_supported_version_code: integer(value.minimum_supported_version_code),
    status: value.status,
  };
}

function normalizeEngine(value: any): AdminAppEngine | null {
  const version = text(value?.version, 20);
  const contract = integer(value?.contract_version);
  return text(value?.name, 80) === 'Tu Senda 84 Admin Engine' && /^[0-9]+\.[0-9]+\.[0-9]+$/.test(version) && contract > 0
    ? { name: 'Tu Senda 84 Admin Engine', version, contract_version: contract, firebase_required: value?.firebase_required === true, revision: text(value?.revision, 40) }
    : null;
}

function normalizeBrandAsset(value: any): AdminAppBrandAsset | null {
  if (!value || !RECORD_ID_PATTERN.test(text(value.id, 15)) || !['icon', 'splash'].includes(value.kind)
    || !['active', 'superseded'].includes(value.status) || !SHA256_PATTERN.test(text(value.sha256, 64))) return null;
  return {
    id: text(value.id, 15), kind: value.kind, file_name: text(value.file_name, 180), sha256: text(value.sha256, 64),
    bytes: integer(value.bytes), width: integer(value.width), height: integer(value.height), revision: integer(value.revision),
    status: value.status, download_path: text(value.download_path, 500),
  };
}

function normalizeArtifact(value: any): AdminAppArtifact | null {
  if (!value || ![value.id, value.profile_id, value.job_id].every((id) => RECORD_ID_PATTERN.test(text(id, 15)))
    || !['apk', 'checksums', 'instructions', 'build_manifest'].includes(value.kind)
    || !['staged', 'available', 'deleted'].includes(value.lifecycle_status)
    || !SHA256_PATTERN.test(text(value.sha256, 64))) return null;
  return {
    id: text(value.id, 15), profile_id: text(value.profile_id, 15), job_id: text(value.job_id, 15),
    kind: value.kind, file_name: text(value.file_name, 220), sha256: text(value.sha256, 64), bytes: integer(value.bytes),
    version_code: integer(value.version_code), version_name: text(value.version_name, 40),
    lifecycle_status: value.lifecycle_status, stored: value.stored === true,
  };
}

function normalizeAssignment(value: any): AdminAppAssignment | null {
  if (!value || ![value.id, value.profile_id, value.artifact_id, value.store?.id, value.user?.id, value.device?.id]
    .every((id) => RECORD_ID_PATTERN.test(text(id, 15)))
    || !['pilot', 'gradual', 'general'].includes(value.stage)
    || !['active', 'revoked'].includes(value.status)) return null;
  return {
    id: text(value.id, 15), profile_id: text(value.profile_id, 15), artifact_id: text(value.artifact_id, 15),
    store: { id: text(value.store.id, 15), name: text(value.store.name, 140), slug: text(value.store.slug, 80) },
    user: { id: text(value.user.id, 15), name: text(value.user.name, 140), email: text(value.user.email, 254) },
    device: { id: text(value.device.id, 15), label: text(value.device.label, 120), status: text(value.device.status, 20) },
    stage: value.stage, wave: integer(value.wave), status: value.status, download_count: integer(value.download_count),
    last_downloaded_at: text(value.last_downloaded_at, 80), installed_version_code: integer(value.installed_version_code),
    installed_version_name: text(value.installed_version_name, 40), installed_at: text(value.installed_at, 80),
    validated_at: text(value.validated_at, 80),
  };
}

function normalizeRecipient(value: any): AdminAppRecipient | null {
  if (![value?.store?.id, value?.user?.id, value?.device?.id].every((id) => RECORD_ID_PATTERN.test(text(id, 15)))) return null;
  return {
    store: { id: text(value.store.id, 15), name: text(value.store.name, 140), slug: text(value.store.slug, 80) },
    user: { id: text(value.user.id, 15), name: text(value.user.name, 140), email: text(value.user.email, 254) },
    device: { id: text(value.device.id, 15), label: text(value.device.label, 120), status: text(value.device.status, 20) },
  };
}

function normalizeJob(value: any): AdminAppJob | null {
  if (!value || ![value.id, value.profile_id].every((id) => RECORD_ID_PATTERN.test(text(id, 15)))
    || !['provision', 'update'].includes(value.operation)
    || !['preview', 'queued', 'claimed', 'succeeded', 'failed', 'needs_attention', 'canceled'].includes(value.status)
    || !SHA256_PATTERN.test(text(value.preview_hash, 64))) return null;
  const engine = normalizeEngine(value.engine);
  if (!engine) return null;
  return {
    id: text(value.id, 15), profile_id: text(value.profile_id, 15), operation: value.operation, status: value.status,
    version_code: integer(value.version_code), version_name: text(value.version_name, 40), preview_hash: text(value.preview_hash, 64),
    preview: value.preview && typeof value.preview === 'object' ? value.preview : null,
    preview_expires_at: text(value.preview_expires_at, 80), failure_code: text(value.failure_code, 80), engine,
  };
}

async function post<T>(baseUrl: string, token: string, path: string, body: Record<string, unknown>, normalize: (value: any) => T | null, deviceToken = ''): Promise<AdminAppResult<T>> {
  const origin = text(baseUrl, 500).replace(/\/+$/, '');
  const auth = text(token, 5000);
  if (!origin || !auth) return { available: false, status: 0, error: 'unavailable', data: null };
  const headers: Record<string, string> = { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' };
  if (isValidAdminDeviceToken(deviceToken)) headers[ADMIN_DEVICE_HEADER_NAME] = deviceToken;
  try {
    const response = await fetch(`${origin}${path}`, {
      method: 'POST', headers, body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(12_000),
    });
    const payload = await response.json().catch(() => null);
    const normalized = response.ok ? normalize(payload) : null;
    return {
      available: response.ok && normalized !== null,
      status: response.status,
      error: normalized ? '' : text(payload?.error, 80) || (response.ok ? 'invalid_response' : 'unavailable'),
      data: normalized,
    };
  } catch (_) { return { available: false, status: 0, error: 'unavailable', data: null }; }
}

export async function uploadMasterAdminAppBrandAsset(
  baseUrl: string,
  token: string,
  kind: 'icon' | 'splash',
  file: File,
): Promise<AdminAppResult<AdminAppBrandAsset>> {
  if (!(file instanceof File) || file.type !== 'image/png' || file.size < 1 || file.size > 2 * 1024 * 1024) {
    return { available: false, status: 400, error: 'brand_asset_invalid', data: null };
  }
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    if (bitmap.width !== bitmap.height || bitmap.width < 512 || bitmap.width > 2048) {
      return { available: false, status: 400, error: 'brand_asset_invalid', data: null };
    }
    const bytes = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const sha256 = Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, '0')).join('');
    const form = new FormData();
    form.set('kind', kind); form.set('sha256', sha256); form.set('bytes', String(file.size));
    form.set('width', String(bitmap.width)); form.set('height', String(bitmap.height));
    form.set('confirmation', 'CAMBIAR IMAGEN MOBILE ADMIN'); form.set('file', file, `${kind}.png`);
    const origin = text(baseUrl, 500).replace(/\/+$/, '');
    const auth = text(token, 5000);
    if (!origin || !auth) return { available: false, status: 0, error: 'unavailable', data: null };
    const response = await fetch(`${origin}/api/pz/master/admin-app-releases/brand/upload`, {
      method: 'POST', headers: { Authorization: `Bearer ${auth}` }, body: form, cache: 'no-store', signal: AbortSignal.timeout(20_000),
    });
    const payload = await response.json().catch(() => null);
    const asset = response.ok ? normalizeBrandAsset(payload?.asset) : null;
    return { available: response.ok && !!asset, status: response.status, error: asset ? '' : text(payload?.error, 80) || 'unavailable', data: asset };
  } catch (_) {
    return { available: false, status: 0, error: 'brand_asset_invalid', data: null };
  } finally { try { bitmap?.close(); } catch (_) {} }
}

export function getMasterAdminAppDetail(baseUrl: string, token: string, channel: 'staging' | 'production') {
  return post(baseUrl, token, '/api/pz/master/admin-app-releases/detail', { channel }, (value) => {
    if (value?.ok !== true) return null;
    const engine = normalizeEngine(value.engine);
    const profile = value.profile ? normalizeProfile(value.profile) : null;
    const jobs = Array.isArray(value.jobs) ? value.jobs.map(normalizeJob).filter(Boolean) as AdminAppJob[] : [];
    const artifacts = Array.isArray(value.artifacts) ? value.artifacts.map(normalizeArtifact).filter(Boolean) as AdminAppArtifact[] : [];
    const assignments = Array.isArray(value.assignments) ? value.assignments.map(normalizeAssignment).filter(Boolean) as AdminAppAssignment[] : [];
    if (!engine || (value.profile && !profile) || jobs.length !== (value.jobs || []).length || artifacts.length !== (value.artifacts || []).length
      || assignments.length !== (value.assignments || []).length) return null;
    const eligible_devices = Array.isArray(value.eligible_devices) ? value.eligible_devices.map((item: any) => ({
      user_id: text(item.user_id, 15), user_name: text(item.user_name, 140), user_email: text(item.user_email, 254),
      store_id: text(item.store_id, 15), store_name: text(item.store_name, 140), device_id: text(item.device_id, 15),
      device_label: text(item.device_label, 120), device_last_seen_at: text(item.device_last_seen_at, 80),
    })).filter((item: AdminAppEligibleDevice) => RECORD_ID_PATTERN.test(item.user_id) && RECORD_ID_PATTERN.test(item.store_id) && RECORD_ID_PATTERN.test(item.device_id)) : [];
    return { engine, profile, jobs, artifacts, assignments, eligible_devices, events: Array.isArray(value.events) ? value.events : [] } as MasterAdminAppDetail;
  });
}

export function configureMasterAdminApp(baseUrl: string, token: string, input: Record<string, unknown>) {
  return post(baseUrl, token, '/api/pz/master/admin-app-releases/configure', input, (value) => value?.ok === true ? normalizeProfile(value.profile) : null);
}

export function previewMasterAdminAppBuild(baseUrl: string, token: string, input: { version_name: string }) {
  return post(baseUrl, token, '/api/pz/master/admin-app-releases/preview', input, (value) => value?.ok === true ? normalizeJob(value.job) : null);
}

export function confirmMasterAdminAppBuild(baseUrl: string, token: string, input: { job_id: string; preview_hash: string; confirmation: string }) {
  return post(baseUrl, token, '/api/pz/master/admin-app-releases/confirm', input, (value) => value?.ok === true ? normalizeJob(value.job) : null);
}

export function runMasterAdminAppAction(baseUrl: string, token: string, input: Record<string, unknown>) {
  return post(baseUrl, token, '/api/pz/master/admin-app-releases/action', input, (value) => value?.ok === true ? value : null);
}

export function getAdminAppPortal(baseUrl: string, token: string, deviceToken: string, options: AdminAppPortalOptions) {
  const grant = text(options?.grant, 43);
  const packageName = text(options?.package_name, 190);
  const channel = options?.channel;
  if (grant && !TOKEN_PATTERN.test(grant)) return Promise.resolve({ available: false, status: 400, error: 'invalid_payload', data: null });
  if (packageName && !/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(packageName)) return Promise.resolve({ available: false, status: 400, error: 'invalid_payload', data: null });
  if (!['staging', 'production'].includes(channel)) return Promise.resolve({ available: false, status: 400, error: 'invalid_payload', data: null });
  return post(baseUrl, token, '/api/pz/admin-app/releases/portal', { grant, package_name: packageName, channel }, (value) => {
    if (value?.ok !== true) return null;
    const recipient = normalizeRecipient(value.access?.recipient);
    const artifact = normalizeArtifact(value.access?.artifact);
    const profile = normalizeProfile(value.access?.profile);
    return recipient && artifact && profile ? { ...value.access, recipient, artifact, profile } as AdminAppPortalAccess : null;
  }, deviceToken);
}

export function createAdminAppDownloadTicket(baseUrl: string, token: string, deviceToken: string, options: AdminAppPortalOptions) {
  const grant = text(options?.grant, 43);
  const packageName = text(options?.package_name, 190);
  const channel = options?.channel;
  if ((grant && !TOKEN_PATTERN.test(grant)) || (packageName && !/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(packageName))
    || !['staging', 'production'].includes(channel)) return Promise.resolve({ available: false, status: 400, error: 'invalid_payload', data: null });
  return post(baseUrl, token, '/api/pz/admin-app/releases/ticket', { grant, package_name: packageName, channel }, (value) => {
    const ticket = text(value?.ticket, 43);
    const artifact = normalizeArtifact(value?.artifact);
    return value?.ok === true && TOKEN_PATTERN.test(ticket) && artifact && text(value.download_path, 500).includes(`/admin-app-downloads/${artifact.id}/${ticket}/`)
      ? { ticket, expires_at: text(value.expires_at, 80), download_path: text(value.download_path, 500), artifact }
      : null;
  }, deviceToken);
}

export function checkInAdminApp(baseUrl: string, token: string, deviceToken: string, input: { package_name: string; version_code: number; version_name: string }) {
  return post(baseUrl, token, '/api/pz/admin-app/releases/check-in', input, (value) => {
    const recipient = normalizeRecipient(value?.recipient);
    const policy = value?.policy;
    return value?.ok === true && recipient && policy
      && Number.isSafeInteger(Number(policy.latest_version_code))
      && Number.isSafeInteger(Number(policy.minimum_supported_version_code))
      && typeof policy.update_available === 'boolean' && typeof policy.update_required === 'boolean'
      ? { ...value, recipient }
      : null;
  }, deviceToken);
}

export function getAdminAppPolicy(baseUrl: string, token: string, deviceToken: string, input: { package_name: string; version_code: number; version_name: string }) {
  return post(baseUrl, token, '/api/pz/admin-app/releases/policy', input, (value) => {
    const policy = value?.policy;
    if (value?.ok !== true || !policy || !/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(text(policy.package_name, 190))
      || !Number.isSafeInteger(Number(policy.current_version_code)) || Number(policy.current_version_code) < 1
      || !Number.isSafeInteger(Number(policy.latest_version_code)) || Number(policy.latest_version_code) < 0
      || !Number.isSafeInteger(Number(policy.minimum_supported_version_code)) || Number(policy.minimum_supported_version_code) < 0
      || typeof policy.update_available !== 'boolean' || typeof policy.update_required !== 'boolean'
      || !['', '/admin/mobile-app'].includes(text(policy.portal_path, 80))) return null;
    return {
      package_name: text(policy.package_name, 190), current_version_code: Number(policy.current_version_code),
      current_version_name: text(policy.current_version_name, 40), latest_version_code: Number(policy.latest_version_code),
      latest_version_name: text(policy.latest_version_name, 40), minimum_supported_version_code: Number(policy.minimum_supported_version_code),
      update_available: policy.update_available, update_required: policy.update_required, portal_path: text(policy.portal_path, 80),
    } as AdminAppPolicy;
  }, deviceToken);
}

export function getAdminAppErrorMessage(code: string) {
  const messages: Record<string, string> = {
    unauthorized: 'Debes iniciar sesión nuevamente.',
    device_not_authorized: 'Este dispositivo no está autorizado para recibir Mobile Admin.',
    assignment_not_found: 'La versión no está disponible para esta sesión y dispositivo.',
    release_not_available: 'La publicación está pausada o retirada.',
    pilot_required: 'Descarga, prueba y aprueba primero esta APK.',
    pilot_not_installed: 'El piloto aún no ha confirmado la instalación de esta versión.',
    pilot_already_exists: 'Este release ya tiene un dispositivo piloto activo.',
    general_release_required: 'La versión debe estar aprobada y publicada antes de hacerla obligatoria.',
    version_code_must_increase: 'El versionCode debe ser mayor que el último publicado.',
    version_sequence_changed: 'Otra compilación reservó ese número. Crea una vista previa nueva.',
    engine_incompatible: 'El runner y Tu Senda 84 Admin Engine no tienen la misma versión.',
    profile_identity_locked: 'El paquete y la firma quedaron congelados al completar la primera versión.',
    signing_identity_required: 'Configura primero la huella SHA-256 de la firma release existente.',
    assignment_revoked: 'Esta entrega fue revocada y no puede volver a emitirse para la misma versión y dispositivo.',
    artifacts_not_stored: 'El runner no transfirió todos los archivos físicos esperados.',
    brand_asset_required: 'Selecciona una imagen PNG.',
    brand_asset_invalid: 'La imagen debe ser PNG cuadrada, entre 512 y 2048 px y de máximo 2 MiB.',
    brand_asset_too_large: 'La imagen supera el máximo de 2 MiB.',
  };
  return messages[code] || 'No se pudo completar la operación de Mobile Admin.';
}

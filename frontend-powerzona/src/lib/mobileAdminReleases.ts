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
  current_engine_version: string;
  current_engine_revision: string;
  identity_locked: boolean;
  icon: AdminAppBrandAsset | null;
  splash: AdminAppBrandAsset | null;
  splash_background_color: string;
  minimum_supported_version_code: number;
  status: 'active' | 'paused' | 'withdrawn';
};

export type AdminAppEngine = {
  name: string;
  version: string;
  revision: string;
  contract_version: number;
  firebase_required: boolean;
  api_base_url: string;
  ready?: boolean;
  severity?: 'normal' | 'recommended' | 'critical';
};

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
  confirmed_at: string;
  runner_id: string;
  execution_authorized_at: string;
  execution_authorized_until: string;
  execution_authorized_by: string;
  execution_runner_id: string;
  failure_code: string;
  started_at: string;
  completed_at: string;
  created: string;
  updated: string;
  engine: AdminAppEngine;
};

export type AdminAppRunnerAgent = {
  runner_id: string;
  mode: 'service' | 'manual';
  engine_version: string;
  engine_revision: string;
  allow_firebase: boolean;
  allow_signing: boolean;
  workspace_clean: boolean;
  last_seen_at: string;
  online: boolean;
  compatible: boolean;
};

export type AdminAppRunnerControl = {
  online_ttl_seconds: number;
  authorization_ttl_seconds: number;
  required_capabilities: { firebase: boolean; signing: boolean };
  active_job_id: string;
  authorization_state: 'none' | 'pending' | 'authorized' | 'claimed' | 'expired';
  authorized_runner_id: string;
  agents: AdminAppRunnerAgent[];
};

export type AdminPushHealth = {
  available: boolean;
  generated_at: string;
  summary: {
    active_installations: number;
    credential_ready: number;
    firebase_registered: number;
    permission_granted: number;
    notifications_enabled: number;
    synced_24h: number;
    receipts_7d: number;
    delivery_triggers: {
      fcm: number;
      foreground_poll: number;
      resume_sync: number;
      workmanager: number;
    };
  };
  installations: Array<{
    id: string;
    store_id: string;
    user_id: string;
    device_label: string;
    app_version: string;
    firebase_status: string;
    notification_permission: string;
    notifications_enabled: boolean;
    last_seen_at: string;
    last_sync_at: string;
    last_delivery_trigger: string;
  }>;
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
  generated_at: string;
  engine: AdminAppEngine;
  profile: AdminAppProfile | null;
  jobs: AdminAppJob[];
  artifacts: AdminAppArtifact[];
  assignments: AdminAppAssignment[];
  eligible_devices: AdminAppEligibleDevice[];
  events: Array<{ id: string; action: string; outcome: string; reason: string; artifact_id: string; created: string }>;
  runner_control: AdminAppRunnerControl;
  notification_health: AdminPushHealth;
  policy: {
    runner_isolated: true;
    runner_requires_explicit_authorization: true;
    exact_engine_revision_required: true;
    canonical_build_channel: 'production';
    single_artifact_release: true;
    publication_reuses_approved_artifact: true;
  };
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
    current_engine_version: text(value.current_engine_version, 40),
    current_engine_revision: text(value.current_engine_revision, 40).toLowerCase(),
    identity_locked: value.identity_locked === true, icon, splash,
    splash_background_color: /^#[A-F0-9]{6}$/.test(text(value.splash_background_color, 7)) ? text(value.splash_background_color, 7) : '#FFFFFF',
    minimum_supported_version_code: integer(value.minimum_supported_version_code),
    status: value.status,
  };
}

function normalizeEngine(value: any): AdminAppEngine | null {
  const version = text(value?.version, 20);
  const revision = text(value?.revision, 40).toLowerCase();
  const contract = integer(value?.contract_version);
  const severity = text(value?.severity, 20);
  const apiBaseUrl = text(value?.api_base_url, 500).replace(/\/+$/, '');
  return text(value?.name, 80) === 'Tu Senda 84 Admin Engine'
    && /^[0-9]+\.[0-9]+\.[0-9]+$/.test(version)
    && (!revision || /^[a-f0-9]{40}$/.test(revision))
    && /^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/.test(apiBaseUrl)
    && contract > 0
    ? {
      name: 'Tu Senda 84 Admin Engine',
      version,
      revision,
      contract_version: contract,
      firebase_required: value?.firebase_required === true,
      api_base_url: apiBaseUrl,
      ready: value?.ready === true && /^[a-f0-9]{40}$/.test(revision),
      severity: ['normal', 'recommended', 'critical'].includes(severity)
        ? severity as AdminAppEngine['severity']
        : 'normal',
    }
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
  const executionAuthorizedBy = text(value.execution_authorized_by, 15);
  const executionRunnerId = text(value.execution_runner_id, 100);
  const runnerId = text(value.runner_id, 100);
  if (!engine
    || (executionAuthorizedBy && !RECORD_ID_PATTERN.test(executionAuthorizedBy))
    || (executionRunnerId && !/^[A-Za-z0-9._:-]{3,100}$/.test(executionRunnerId))
    || (runnerId && !/^[A-Za-z0-9._:-]{3,100}$/.test(runnerId))) return null;
  return {
    id: text(value.id, 15), profile_id: text(value.profile_id, 15), operation: value.operation, status: value.status,
    version_code: integer(value.version_code), version_name: text(value.version_name, 40), preview_hash: text(value.preview_hash, 64),
    preview: value.preview && typeof value.preview === 'object' ? value.preview : null,
    preview_expires_at: text(value.preview_expires_at, 80),
    confirmed_at: text(value.confirmed_at, 80),
    runner_id: runnerId,
    execution_authorized_at: text(value.execution_authorized_at, 80),
    execution_authorized_until: text(value.execution_authorized_until, 80),
    execution_authorized_by: executionAuthorizedBy,
    execution_runner_id: executionRunnerId,
    failure_code: text(value.failure_code, 80),
    started_at: text(value.started_at, 80),
    completed_at: text(value.completed_at, 80),
    created: text(value.created, 80),
    updated: text(value.updated, 80),
    engine,
  };
}

function normalizeRunnerAgent(value: any): AdminAppRunnerAgent | null {
  const runnerId = text(value?.runner_id, 100);
  const mode = text(value?.mode, 20);
  const engineVersion = text(value?.engine_version, 40);
  const engineRevision = text(value?.engine_revision, 40).toLowerCase();
  if (!/^[A-Za-z0-9._:-]{3,100}$/.test(runnerId)
    || !['service', 'manual'].includes(mode)
    || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(engineVersion)
    || !/^[a-f0-9]{40}$/.test(engineRevision)
    || typeof value?.allow_firebase !== 'boolean'
    || typeof value?.allow_signing !== 'boolean'
    || typeof value?.workspace_clean !== 'boolean'
    || typeof value?.online !== 'boolean'
    || typeof value?.compatible !== 'boolean'
    || !text(value?.last_seen_at, 80)) return null;
  return {
    runner_id: runnerId,
    mode: mode as AdminAppRunnerAgent['mode'],
    engine_version: engineVersion,
    engine_revision: engineRevision,
    allow_firebase: value.allow_firebase,
    allow_signing: value.allow_signing,
    workspace_clean: value.workspace_clean,
    last_seen_at: text(value.last_seen_at, 80),
    online: value.online,
    compatible: value.compatible,
  };
}

function normalizeRunnerControl(value: any): AdminAppRunnerControl | null {
  const state = text(value?.authorization_state, 20);
  const activeJobId = text(value?.active_job_id, 15);
  const authorizedRunnerId = text(value?.authorized_runner_id, 100);
  const agents = Array.isArray(value?.agents)
    ? value.agents.map(normalizeRunnerAgent).filter(Boolean) as AdminAppRunnerAgent[]
    : [];
  const onlineTtl = integer(value?.online_ttl_seconds);
  const authorizationTtl = integer(value?.authorization_ttl_seconds);
  if (!['none', 'pending', 'authorized', 'claimed', 'expired'].includes(state)
    || (activeJobId && !RECORD_ID_PATTERN.test(activeJobId))
    || (authorizedRunnerId && !/^[A-Za-z0-9._:-]{3,100}$/.test(authorizedRunnerId))
    || onlineTtl < 10
    || authorizationTtl < 60
    || typeof value?.required_capabilities?.firebase !== 'boolean'
    || typeof value?.required_capabilities?.signing !== 'boolean'
    || agents.length !== (Array.isArray(value?.agents) ? value.agents.length : 0)) return null;
  return {
    online_ttl_seconds: onlineTtl,
    authorization_ttl_seconds: authorizationTtl,
    required_capabilities: {
      firebase: value.required_capabilities.firebase,
      signing: value.required_capabilities.signing,
    },
    active_job_id: activeJobId,
    authorization_state: state as AdminAppRunnerControl['authorization_state'],
    authorized_runner_id: authorizedRunnerId,
    agents,
  };
}

function normalizeAdminPushHealth(value: any): AdminPushHealth | null {
  if (!value || typeof value.available !== 'boolean' || !text(value.generated_at, 80)) return null;
  const summary = value.summary;
  const triggers = summary?.delivery_triggers;
  const countKeys = [
    'active_installations', 'credential_ready', 'firebase_registered',
    'permission_granted', 'notifications_enabled', 'synced_24h', 'receipts_7d',
  ];
  const triggerKeys = ['fcm', 'foreground_poll', 'resume_sync', 'workmanager'];
  const validCount = (candidate: unknown) => {
    const number = Number(candidate);
    return Number.isSafeInteger(number) && number >= 0;
  };
  if (!summary || !triggers
    || countKeys.some((key) => !validCount(summary[key]))
    || triggerKeys.some((key) => !validCount(triggers[key]))
    || !Array.isArray(value.installations)
    || value.installations.length > 50) return null;
  const installations = value.installations.map((item: any) => ({
    id: text(item?.id, 15),
    store_id: text(item?.store_id, 15),
    user_id: text(item?.user_id, 15),
    device_label: text(item?.device_label, 120),
    app_version: text(item?.app_version, 40),
    firebase_status: text(item?.firebase_status, 30),
    notification_permission: text(item?.notification_permission, 20),
    notifications_enabled: item?.notifications_enabled === true,
    last_seen_at: text(item?.last_seen_at, 80),
    last_sync_at: text(item?.last_sync_at, 80),
    last_delivery_trigger: text(item?.last_delivery_trigger, 30),
  }));
  if (installations.some((item: AdminPushHealth['installations'][number]) =>
    !RECORD_ID_PATTERN.test(item.id)
      || !RECORD_ID_PATTERN.test(item.store_id)
      || !RECORD_ID_PATTERN.test(item.user_id)
      || !['pending', 'registered', 'unavailable', 'failed'].includes(item.firebase_status)
      || !['prompt', 'granted', 'denied'].includes(item.notification_permission)
      || !['', 'fcm', 'foreground_poll', 'resume_sync', 'workmanager'].includes(item.last_delivery_trigger)
  )) return null;
  return {
    available: value.available,
    generated_at: text(value.generated_at, 80),
    summary: {
      active_installations: integer(summary.active_installations),
      credential_ready: integer(summary.credential_ready),
      firebase_registered: integer(summary.firebase_registered),
      permission_granted: integer(summary.permission_granted),
      notifications_enabled: integer(summary.notifications_enabled),
      synced_24h: integer(summary.synced_24h),
      receipts_7d: integer(summary.receipts_7d),
      delivery_triggers: {
        fcm: integer(triggers.fcm),
        foreground_poll: integer(triggers.foreground_poll),
        resume_sync: integer(triggers.resume_sync),
        workmanager: integer(triggers.workmanager),
      },
    },
    installations,
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

export function getMasterAdminAppDetail(baseUrl: string, token: string) {
  return post(baseUrl, token, '/api/pz/master/admin-app-releases/detail', { channel: 'production' }, (value) => {
    if (value?.ok !== true) return null;
    const engine = normalizeEngine(value.engine);
    const profile = value.profile ? normalizeProfile(value.profile) : null;
    const jobs = Array.isArray(value.jobs) ? value.jobs.map(normalizeJob).filter(Boolean) as AdminAppJob[] : [];
    const artifacts = Array.isArray(value.artifacts) ? value.artifacts.map(normalizeArtifact).filter(Boolean) as AdminAppArtifact[] : [];
    const assignments = Array.isArray(value.assignments) ? value.assignments.map(normalizeAssignment).filter(Boolean) as AdminAppAssignment[] : [];
    const runnerControl = normalizeRunnerControl(value.runner_control);
    const notificationHealth = normalizeAdminPushHealth(value.notification_health);
    const policy = value.policy;
    const activeJobId = jobs.find((job) => ['queued', 'claimed'].includes(job.status))?.id || '';
    if (!engine || (value.profile && !profile) || jobs.length !== (value.jobs || []).length || artifacts.length !== (value.artifacts || []).length
      || assignments.length !== (value.assignments || []).length
      || !runnerControl
      || !notificationHealth
      || runnerControl.active_job_id !== activeJobId
      || policy?.runner_isolated !== true
      || policy?.runner_requires_explicit_authorization !== true
      || policy?.exact_engine_revision_required !== true
      || policy?.canonical_build_channel !== 'production'
      || policy?.single_artifact_release !== true
      || policy?.publication_reuses_approved_artifact !== true) return null;
    const eligible_devices = Array.isArray(value.eligible_devices) ? value.eligible_devices.map((item: any) => ({
      user_id: text(item.user_id, 15), user_name: text(item.user_name, 140), user_email: text(item.user_email, 254),
      store_id: text(item.store_id, 15), store_name: text(item.store_name, 140), device_id: text(item.device_id, 15),
      device_label: text(item.device_label, 120), device_last_seen_at: text(item.device_last_seen_at, 80),
    })).filter((item: AdminAppEligibleDevice) => RECORD_ID_PATTERN.test(item.user_id) && RECORD_ID_PATTERN.test(item.store_id) && RECORD_ID_PATTERN.test(item.device_id)) : [];
    return {
      generated_at: text(value.generated_at, 80),
      engine,
      profile,
      jobs,
      artifacts,
      assignments,
      eligible_devices,
      events: Array.isArray(value.events) ? value.events : [],
      runner_control: runnerControl,
      notification_health: notificationHealth,
      policy,
    } as MasterAdminAppDetail;
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

export function startMasterAdminAppRunner(
  baseUrl: string,
  token: string,
  input: { job_id: string; preview_hash: string; confirmation: 'INICIAR RUNNER ADMIN' },
) {
  return post(baseUrl, token, '/api/pz/master/admin-app-releases/start-runner', input, (value) => {
    if (value?.ok !== true) return null;
    const job = normalizeJob(value.job);
    const runner = normalizeRunnerAgent({ ...value.runner, compatible: true });
    return job && runner ? { job, runner, idempotent: value.idempotent === true } : null;
  });
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
    engine_release_unconfigured: 'Configura la versión y revisión Git exactas del motor Admin antes de crear la vista previa.',
    engine_release_changed: 'La release aprobada del motor Admin cambió. Cancela esta vista previa y crea una nueva.',
    active_job_exists: 'Ya existe una vista previa o compilación Admin activa.',
    runner_job_not_startable: 'Este trabajo Admin ya fue reclamado, cancelado o dejó de estar disponible.',
    runner_not_registered: 'El Runner Admin aún no está registrado. Regístralo una vez desde la PC de compilación.',
    runner_engine_mismatch: 'El Runner Admin no coincide con la versión y revisión Git aprobadas.',
    runner_capability_missing: 'El Runner Admin no tiene disponibles Firebase y la firma release requeridos.',
    runner_start_failed: 'No se pudo autorizar el Runner Admin. Revisa su registro e inténtalo nuevamente.',
    job_not_retryable: 'Este build Admin ya no admite reintento.',
    job_not_cancelable: 'Este build Admin ya fue reclamado y no puede cancelarse desde el panel.',
    candidate_not_discardable: 'Este APK ya no es una candidata descartable.',
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

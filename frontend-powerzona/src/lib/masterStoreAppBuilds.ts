export type StorefrontAppDistribution = 'play_and_direct' | 'direct';
export type StorefrontAppOperation = 'provision' | 'update';
export type StorefrontEngineUpdateSeverity = 'none' | 'normal' | 'recommended' | 'critical';

export type StorefrontEngineRelease = {
  version: string;
  revision: string;
  severity: Exclude<StorefrontEngineUpdateSeverity, 'none'>;
};

export type StorefrontEngineUpdate = {
  status: 'not_provisioned' | 'pending_first_build' | 'current' | 'update_available';
  available: boolean;
  severity: StorefrontEngineUpdateSeverity;
  reason: 'no_app' | 'first_build_pending' | 'engine_untracked' | 'version_changed' | 'revision_changed' | 'current';
  current_version: string;
  current_revision: string;
  target_version: string;
  target_revision: string;
};

export type StorefrontAppBuildProfile = {
  id: string;
  app_key: string;
  display_name: string;
  package_name: string;
  store_url: string;
  brand_key: string;
  distribution: StorefrontAppDistribution;
  status: 'draft' | 'queued' | 'provisioned' | 'needs_attention' | 'retired';
  firebase_project_id: string;
  firebase_project_number: string;
  firebase_app_id: string;
  signing_cert_sha256: string;
  upload_cert_sha256: string;
  current_version_code: number;
  current_version_name: string;
  current_engine_version: string;
  current_engine_revision: string;
  icon_asset_id: string;
  splash_asset_id: string;
  engine_update: StorefrontEngineUpdate;
  created: string;
  updated: string;
};

export type StorefrontAppBrandAsset = {
  id: string;
  kind: 'icon' | 'splash';
  file_name: string;
  sha256: string;
  width: number;
  height: number;
  bytes: number;
  source_format: 'jpeg' | 'png' | 'webp';
  source_width: number;
  source_height: number;
  normalizer_version: string;
  status: 'active' | 'retired';
  created: string;
  updated: string;
};

export type StorefrontAppBrandAssets = {
  ready: boolean;
  normalizer_policy: {
    input: string[];
    icon: { width: 1024; height: 1024 };
    splash: { width: 1080; height: 1920 };
    fit: 'contain_without_crop';
    metadata_removed: true;
  };
  palette: Record<string, string>;
  icon: StorefrontAppBrandAsset | null;
  splash: StorefrontAppBrandAsset | null;
};

export type StorefrontAppBuildPreview = {
  schema_version: 2;
  operation: StorefrontAppOperation;
  store: { id: string; slug: string; name: string };
  identity: { app_key: string; brand_key: string; display_name: string; package_name: string; store_url: string };
  engine: {
    target_version: string;
    target_revision: string;
    current_version: string;
    current_revision: string;
    update_available: boolean;
    update_reason: string;
    severity: Exclude<StorefrontEngineUpdateSeverity, 'none'>;
    change_scope: 'shared_native_engine';
  };
  firebase: {
    organization: string;
    project_id: string;
    create_project: boolean;
    register_android_app: boolean;
    adopts_existing_app_config?: boolean;
  };
  signing: {
    create_app_signing_key: boolean;
    create_play_upload_key: boolean;
    reuse_signing_cert_sha256?: string;
    custodian: string;
  };
  build: { version_code: number; version_name: string; apk: boolean; aab: boolean };
  delivery: { admin_receives: string[]; master_only: string[] };
  branding: {
    palette: Record<string, string>;
    assets: { icon: StorefrontAppBrandAsset; splash: StorefrontAppBrandAsset };
  };
  irreversible_or_sensitive_steps: string[];
  immutable_identity?: string[];
  generated_at: string;
};

export type StorefrontAppBuildJob = {
  id: string;
  profile_id: string;
  operation: StorefrontAppOperation;
  status: 'preview' | 'queued' | 'claimed' | 'succeeded' | 'failed' | 'needs_attention' | 'canceled';
  preview_hash: string;
  preview: StorefrontAppBuildPreview | null;
  preview_expires_at: string;
  confirmed_at: string;
  runner_id: string;
  failure_code: string;
  started_at: string;
  completed_at: string;
  delivery_status: '' | 'pending' | 'marked_sent';
  delivery_sender_id: string;
  delivery_recipient_id: string;
  delivery_sender_whatsapp: string;
  delivery_recipient_whatsapp: string;
  delivery_message_sha256: string;
  delivery_marked_at: string;
  created: string;
  updated: string;
};

export type StorefrontAppArtifact = {
  id: string;
  job_id: string;
  kind: 'apk' | 'aab' | 'checksums' | 'instructions' | 'build_manifest';
  visibility: 'store_delivery' | 'master_only';
  file_name: string;
  sha256: string;
  bytes: number;
  version_code: number;
  version_name: string;
  created: string;
};

export type ManualWhatsappContact = {
  user_id: string;
  display_name: string;
  whatsapp_number: string;
  configured: boolean;
  phone_state: 'configured' | 'missing' | 'invalid';
};

export type ManualWhatsappRecipient = ManualWhatsappContact & {
  status: 'ready' | 'missing_primary' | 'invalid_primary' | 'missing_whatsapp';
};

export type ManualWhatsappDelivery = {
  mode: 'manual_wa_me';
  automatic_send: false;
  cloud_api: false;
  attachment_mode: 'manual';
  sender: ManualWhatsappContact;
  recipient: ManualWhatsappRecipient;
};

export type ManualWhatsappDeliveryPreview = {
  schema_version: 1;
  mode: 'manual_wa_me';
  automatic_send: false;
  cloud_api: false;
  store_id: string;
  profile_id: string;
  job_id: string;
  artifact_id: string;
  sender_user_id: string;
  sender_whatsapp: string;
  recipient_user_id: string;
  recipient_whatsapp: string;
  app_name: string;
  version_code: number;
  version_name: string;
  attachment_file_name: string;
  attachment_sha256: string;
  attachment_required: true;
  message: string;
  message_sha256: string;
  whatsapp_url: string;
  sender_warning: string;
};

export type MasterStoreAppBuilds = {
  generated_at: string;
  store: { id: string; name: string; slug: string };
  engine_release: StorefrontEngineRelease;
  manual_whatsapp_delivery: ManualWhatsappDelivery;
  brand_assets: StorefrontAppBrandAssets;
  profile: StorefrontAppBuildProfile | null;
  jobs: StorefrontAppBuildJob[];
  artifacts: StorefrontAppArtifact[];
  policy: {
    firebase_project_per_store: true;
    signing_custodian: string;
    store_admin_delivery: string[];
    powerzona_distribution: 'play_and_direct';
    tenant_distribution: 'direct';
    runner_isolated: true;
  };
};

export type MasterStoreAppEngineUpdateItem = {
  store: { id: string; name: string; slug: string };
  profile_id: string;
  app_key: string;
  display_name: string;
  app_version_code: number;
  app_version_name: string;
  engine_update: StorefrontEngineUpdate;
  action_url: string;
};

export type MasterStoreAppPendingDelivery = {
  store: { id: string; name: string; slug: string };
  profile_id: string;
  job_id: string;
  artifact_id: string;
  display_name: string;
  version_code: number;
  version_name: string;
  file_name: string;
  recipient: ManualWhatsappRecipient;
  action_url: string;
};

export type MasterStoreAppEngineUpdates = {
  generated_at: string;
  engine_release: StorefrontEngineRelease;
  total_apps: number;
  update_count: number;
  critical_count: number;
  apps: MasterStoreAppEngineUpdateItem[];
  manual_whatsapp_sender: ManualWhatsappContact;
  delivery_pending_count: number;
  deliveries: MasterStoreAppPendingDelivery[];
};

export type MasterAppBuildRequest<T> = {
  available: boolean;
  status: number;
  error: string;
  data: T | null;
};

const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ENGINE_VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const ENGINE_REVISION_PATTERN = /^$|^[a-f0-9]{40}$/;
const VERSION_NAME_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const WHATSAPP_NUMBER_PATTERN = /^$|^[1-9][0-9]{7,14}$/;
const REQUEST_TIMEOUT_MS = 12000;

export function proposeFirebaseProjectId(storeName: string, storeId: string) {
  const suffix = String(storeId || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(-8) || 'tienda84';
  const normalizedName = String(storeName || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/google|ssl|undefined|null/g, 'tienda');
  const availableNameLength = 30 - 'ts84--'.length - suffix.length;
  const nameSegment = (normalizedName || 'tienda')
    .slice(0, availableNameLength)
    .replace(/-+$/g, '') || 'tienda';
  return `ts84-${nameSegment}-${suffix}`;
}

function text(value: unknown, max: number) {
  return String(value || '').trim().slice(0, max);
}

function isoDate(value: unknown) {
  const raw = text(value, 80);
  if (!raw) return '';
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : '';
}

function integer(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

function manualWhatsappContact(value: any): ManualWhatsappContact | null {
  const userId = text(value?.user_id, 15);
  const phone = text(value?.whatsapp_number, 15);
  const phoneState = text(value?.phone_state, 20);
  if ((userId && !RECORD_ID_PATTERN.test(userId))
    || !WHATSAPP_NUMBER_PATTERN.test(phone)
    || !['configured', 'missing', 'invalid'].includes(phoneState)
    || Boolean(value?.configured) !== (phoneState === 'configured')
    || (phoneState === 'configured') !== Boolean(phone)) return null;
  return {
    user_id: userId,
    display_name: text(value?.display_name, 140),
    whatsapp_number: phone,
    configured: phoneState === 'configured',
    phone_state: phoneState as ManualWhatsappContact['phone_state'],
  };
}

function manualWhatsappDelivery(value: any): ManualWhatsappDelivery | null {
  if (value?.mode !== 'manual_wa_me'
    || value?.automatic_send !== false
    || value?.cloud_api !== false
    || value?.attachment_mode !== 'manual') return null;
  const sender = manualWhatsappContact(value.sender);
  const recipientContact = manualWhatsappContact(value.recipient);
  const recipientStatus = text(value?.recipient?.status, 30);
  if (!sender || !recipientContact
    || !['ready', 'missing_primary', 'invalid_primary', 'missing_whatsapp'].includes(recipientStatus)
    || (recipientStatus === 'ready') !== recipientContact.configured) return null;
  return {
    mode: 'manual_wa_me', automatic_send: false, cloud_api: false, attachment_mode: 'manual', sender,
    recipient: { ...recipientContact, status: recipientStatus as ManualWhatsappRecipient['status'] },
  };
}

function manualWhatsappPreview(value: any): ManualWhatsappDeliveryPreview | null {
  const senderPhone = text(value?.sender_whatsapp, 15);
  const recipientPhone = text(value?.recipient_whatsapp, 15);
  const messageSha256 = text(value?.message_sha256, 64).toLowerCase();
  const attachmentSha256 = text(value?.attachment_sha256, 64).toLowerCase();
  const whatsappUrl = text(value?.whatsapp_url, 10000);
  const versionCode = integer(value?.version_code);
  const versionName = text(value?.version_name, 40);
  if (value?.schema_version !== 1
    || value?.mode !== 'manual_wa_me'
    || value?.automatic_send !== false
    || value?.cloud_api !== false
    || value?.attachment_required !== true
    || ![value?.store_id, value?.profile_id, value?.job_id, value?.artifact_id, value?.sender_user_id, value?.recipient_user_id]
      .every((id) => RECORD_ID_PATTERN.test(text(id, 15)))
    || !WHATSAPP_NUMBER_PATTERN.test(senderPhone) || !senderPhone
    || !WHATSAPP_NUMBER_PATTERN.test(recipientPhone) || !recipientPhone
    || !SHA256_PATTERN.test(messageSha256)
    || !SHA256_PATTERN.test(attachmentSha256)
    || !versionCode
    || !VERSION_NAME_PATTERN.test(versionName)
    || !whatsappUrl.startsWith(`https://wa.me/${recipientPhone}?text=`)
    || !text(value?.message, 4000)
    || !text(value?.attachment_file_name, 220)) return null;
  return {
    schema_version: 1,
    mode: 'manual_wa_me',
    automatic_send: false,
    cloud_api: false,
    store_id: text(value.store_id, 15),
    profile_id: text(value.profile_id, 15),
    job_id: text(value.job_id, 15),
    artifact_id: text(value.artifact_id, 15),
    sender_user_id: text(value.sender_user_id, 15),
    sender_whatsapp: senderPhone,
    recipient_user_id: text(value.recipient_user_id, 15),
    recipient_whatsapp: recipientPhone,
    app_name: text(value.app_name, 120),
    version_code: versionCode,
    version_name: versionName,
    attachment_file_name: text(value.attachment_file_name, 220),
    attachment_sha256: attachmentSha256,
    attachment_required: true,
    message: text(value.message, 4000),
    message_sha256: messageSha256,
    whatsapp_url: whatsappUrl,
    sender_warning: text(value.sender_warning, 300),
  };
}

function engineRelease(value: any): StorefrontEngineRelease | null {
  const version = text(value?.version, 40);
  const revision = text(value?.revision, 40).toLowerCase();
  const severity = text(value?.severity, 20);
  if (!ENGINE_VERSION_PATTERN.test(version)
    || !ENGINE_REVISION_PATTERN.test(revision)
    || !['normal', 'recommended', 'critical'].includes(severity)) return null;
  return { version, revision, severity: severity as StorefrontEngineRelease['severity'] };
}

function engineUpdate(value: any): StorefrontEngineUpdate | null {
  const status = text(value?.status, 30);
  const severity = text(value?.severity, 20);
  const reason = text(value?.reason, 40);
  const currentVersion = text(value?.current_version, 40);
  const currentRevision = text(value?.current_revision, 40).toLowerCase();
  const targetVersion = text(value?.target_version, 40);
  const targetRevision = text(value?.target_revision, 40).toLowerCase();
  if (!['not_provisioned', 'pending_first_build', 'current', 'update_available'].includes(status)
    || !['none', 'normal', 'recommended', 'critical'].includes(severity)
    || !['no_app', 'first_build_pending', 'engine_untracked', 'version_changed', 'revision_changed', 'current'].includes(reason)
    || (currentVersion && !ENGINE_VERSION_PATTERN.test(currentVersion))
    || !ENGINE_REVISION_PATTERN.test(currentRevision)
    || !ENGINE_VERSION_PATTERN.test(targetVersion)
    || !ENGINE_REVISION_PATTERN.test(targetRevision)
    || Boolean(value?.available) !== (status === 'update_available')) return null;
  return {
    status: status as StorefrontEngineUpdate['status'],
    available: status === 'update_available',
    severity: severity as StorefrontEngineUpdateSeverity,
    reason: reason as StorefrontEngineUpdate['reason'],
    current_version: currentVersion,
    current_revision: currentRevision,
    target_version: targetVersion,
    target_revision: targetRevision,
  };
}

function profile(value: any): StorefrontAppBuildProfile | null {
  if (!value || !RECORD_ID_PATTERN.test(text(value.id, 15))) return null;
  if (!['play_and_direct', 'direct'].includes(value.distribution)) return null;
  if (!['draft', 'queued', 'provisioned', 'needs_attention', 'retired'].includes(value.status)) return null;
  const normalizedEngineUpdate = engineUpdate(value.engine_update);
  const currentEngineVersion = text(value.current_engine_version, 40);
  const currentEngineRevision = text(value.current_engine_revision, 40).toLowerCase();
  if (!normalizedEngineUpdate
    || (currentEngineVersion && !ENGINE_VERSION_PATTERN.test(currentEngineVersion))
    || !ENGINE_REVISION_PATTERN.test(currentEngineRevision)
    || normalizedEngineUpdate.current_version !== currentEngineVersion
    || normalizedEngineUpdate.current_revision !== currentEngineRevision) return null;
  return {
    id: text(value.id, 15),
    app_key: text(value.app_key, 64),
    display_name: text(value.display_name, 120),
    package_name: text(value.package_name, 190),
    store_url: text(value.store_url, 500),
    brand_key: text(value.brand_key, 64),
    distribution: value.distribution,
    status: value.status,
    firebase_project_id: text(value.firebase_project_id, 128),
    firebase_project_number: text(value.firebase_project_number, 20),
    firebase_app_id: text(value.firebase_app_id, 255),
    signing_cert_sha256: text(value.signing_cert_sha256, 95),
    upload_cert_sha256: text(value.upload_cert_sha256, 95),
    current_version_code: integer(value.current_version_code),
    current_version_name: text(value.current_version_name, 40),
    current_engine_version: currentEngineVersion,
    current_engine_revision: currentEngineRevision,
    icon_asset_id: text(value.icon_asset_id, 15),
    splash_asset_id: text(value.splash_asset_id, 15),
    engine_update: normalizedEngineUpdate,
    created: isoDate(value.created),
    updated: isoDate(value.updated),
  };
}

function brandAsset(value: any, expectedKind: 'icon' | 'splash'): StorefrontAppBrandAsset | null {
  const expected = expectedKind === 'icon' ? { width: 1024, height: 1024 } : { width: 1080, height: 1920 };
  if (!value || !RECORD_ID_PATTERN.test(text(value.id, 15))
    || value.kind !== expectedKind
    || !/^(?:icon|splash)[-_][a-f0-9]{32}(?:_[A-Za-z0-9]{6,32})?\.png$/.test(text(value.file_name, 220))
    || !SHA256_PATTERN.test(text(value.sha256, 64).toLowerCase())
    || integer(value.width) !== expected.width || integer(value.height) !== expected.height
    || integer(value.bytes) < 1
    || !['jpeg', 'png', 'webp'].includes(value.source_format)
    || !/^[a-z0-9._-]{8,80}$/.test(text(value.normalizer_version, 80))
    || !['active', 'retired'].includes(value.status)) return null;
  return {
    id: text(value.id, 15), kind: expectedKind, file_name: text(value.file_name, 220),
    sha256: text(value.sha256, 64).toLowerCase(), width: expected.width, height: expected.height,
    bytes: integer(value.bytes), source_format: value.source_format,
    source_width: integer(value.source_width), source_height: integer(value.source_height),
    normalizer_version: text(value.normalizer_version, 80), status: value.status,
    created: isoDate(value.created), updated: isoDate(value.updated),
  };
}

function brandAssets(value: any): StorefrontAppBrandAssets | null {
  if (!value || !value.normalizer_policy || !value.palette) return null;
  const icon = value.icon ? brandAsset(value.icon, 'icon') : null;
  const splash = value.splash ? brandAsset(value.splash, 'splash') : null;
  if ((value.icon && !icon) || (value.splash && !splash) || Boolean(value.ready) !== Boolean(icon && splash)) return null;
  return {
    ready: Boolean(icon && splash), normalizer_policy: value.normalizer_policy,
    palette: value.palette, icon, splash,
  } as StorefrontAppBrandAssets;
}

function preview(value: any): StorefrontAppBuildPreview | null {
  if (!value || value.schema_version !== 2 || !['provision', 'update'].includes(value.operation)) return null;
  if (!RECORD_ID_PATTERN.test(text(value.store?.id, 15))) return null;
  if (!value.identity || !value.engine || !value.firebase || !value.signing || !value.build || !value.delivery || !value.branding) return null;
  if (!ENGINE_VERSION_PATTERN.test(text(value.engine.target_version, 40))
    || !ENGINE_REVISION_PATTERN.test(text(value.engine.target_revision, 40).toLowerCase())
    || value.engine.change_scope !== 'shared_native_engine') return null;
  if (!brandAsset(value.branding.assets?.icon, 'icon') || !brandAsset(value.branding.assets?.splash, 'splash')) return null;
  return value as StorefrontAppBuildPreview;
}

function job(value: any): StorefrontAppBuildJob | null {
  if (!value || !RECORD_ID_PATTERN.test(text(value.id, 15))) return null;
  if (!['provision', 'update'].includes(value.operation)
    || !['preview', 'queued', 'claimed', 'succeeded', 'failed', 'needs_attention', 'canceled'].includes(value.status)
    || !SHA256_PATTERN.test(text(value.preview_hash, 64))) return null;
  const normalizedPreview = value.preview ? preview(value.preview) : null;
  if (value.preview && !normalizedPreview) return null;
  const deliveryStatus = text(value.delivery_status, 30);
  const deliverySenderId = text(value.delivery_sender_id, 15);
  const deliveryRecipientId = text(value.delivery_recipient_id, 15);
  const deliverySenderWhatsapp = text(value.delivery_sender_whatsapp, 15);
  const deliveryRecipientWhatsapp = text(value.delivery_recipient_whatsapp, 15);
  const deliveryMessageSha256 = text(value.delivery_message_sha256, 64).toLowerCase();
  if (!['', 'pending', 'marked_sent'].includes(deliveryStatus)
    || (deliverySenderId && !RECORD_ID_PATTERN.test(deliverySenderId))
    || (deliveryRecipientId && !RECORD_ID_PATTERN.test(deliveryRecipientId))
    || !WHATSAPP_NUMBER_PATTERN.test(deliverySenderWhatsapp)
    || !WHATSAPP_NUMBER_PATTERN.test(deliveryRecipientWhatsapp)
    || (deliveryMessageSha256 && !SHA256_PATTERN.test(deliveryMessageSha256))) return null;
  return {
    id: text(value.id, 15),
    profile_id: text(value.profile_id, 15),
    operation: value.operation,
    status: value.status,
    preview_hash: text(value.preview_hash, 64),
    preview: normalizedPreview,
    preview_expires_at: isoDate(value.preview_expires_at),
    confirmed_at: isoDate(value.confirmed_at),
    runner_id: text(value.runner_id, 100),
    failure_code: text(value.failure_code, 80),
    started_at: isoDate(value.started_at),
    completed_at: isoDate(value.completed_at),
    delivery_status: deliveryStatus as StorefrontAppBuildJob['delivery_status'],
    delivery_sender_id: deliverySenderId,
    delivery_recipient_id: deliveryRecipientId,
    delivery_sender_whatsapp: deliverySenderWhatsapp,
    delivery_recipient_whatsapp: deliveryRecipientWhatsapp,
    delivery_message_sha256: deliveryMessageSha256,
    delivery_marked_at: isoDate(value.delivery_marked_at),
    created: isoDate(value.created),
    updated: isoDate(value.updated),
  };
}

function artifact(value: any): StorefrontAppArtifact | null {
  if (!value || !RECORD_ID_PATTERN.test(text(value.id, 15)) || !RECORD_ID_PATTERN.test(text(value.job_id, 15))) return null;
  if (!['apk', 'aab', 'checksums', 'instructions', 'build_manifest'].includes(value.kind)
    || !['store_delivery', 'master_only'].includes(value.visibility)
    || !SHA256_PATTERN.test(text(value.sha256, 64))) return null;
  return {
    id: text(value.id, 15), job_id: text(value.job_id, 15), kind: value.kind, visibility: value.visibility,
    file_name: text(value.file_name, 220), sha256: text(value.sha256, 64), bytes: integer(value.bytes),
    version_code: integer(value.version_code), version_name: text(value.version_name, 40), created: isoDate(value.created),
  };
}

function detail(value: any): MasterStoreAppBuilds | null {
  if (value?.ok !== true || !RECORD_ID_PATTERN.test(text(value.store?.id, 15))) return null;
  const normalizedProfile = value.profile ? profile(value.profile) : null;
  if (value.profile && !normalizedProfile) return null;
  const jobs = Array.isArray(value.jobs) ? value.jobs.map(job).filter(Boolean) as StorefrontAppBuildJob[] : [];
  const artifacts = Array.isArray(value.artifacts) ? value.artifacts.map(artifact).filter(Boolean) as StorefrontAppArtifact[] : [];
  const normalizedEngineRelease = engineRelease(value.engine_release);
  const normalizedManualWhatsappDelivery = manualWhatsappDelivery(value.manual_whatsapp_delivery);
  const normalizedBrandAssets = brandAssets(value.brand_assets);
  if (!normalizedEngineRelease || !normalizedManualWhatsappDelivery || !normalizedBrandAssets) return null;
  return {
    generated_at: isoDate(value.generated_at),
    store: { id: text(value.store.id, 15), name: text(value.store.name, 140), slug: text(value.store.slug, 80) },
    engine_release: normalizedEngineRelease,
    manual_whatsapp_delivery: normalizedManualWhatsappDelivery,
    brand_assets: normalizedBrandAssets,
    profile: normalizedProfile,
    jobs,
    artifacts,
    policy: value.policy,
  };
}

function engineUpdates(value: any): MasterStoreAppEngineUpdates | null {
  if (value?.ok !== true) return null;
  const release = engineRelease(value.engine_release);
  const manualWhatsappSender = manualWhatsappContact(value.manual_whatsapp_sender);
  if (!release || !manualWhatsappSender || !Array.isArray(value.apps) || !Array.isArray(value.deliveries)) return null;
  const apps: MasterStoreAppEngineUpdateItem[] = [];
  for (const item of value.apps) {
    const storeId = text(item?.store?.id, 15);
    const normalizedUpdate = engineUpdate(item?.engine_update);
    const actionUrl = text(item?.action_url, 200);
    if (!RECORD_ID_PATTERN.test(storeId)
      || !RECORD_ID_PATTERN.test(text(item?.profile_id, 15))
      || !normalizedUpdate?.available
      || actionUrl !== `/master/stores/${storeId}/app`) return null;
    apps.push({
      store: { id: storeId, name: text(item.store.name, 140), slug: text(item.store.slug, 80) },
      profile_id: text(item.profile_id, 15),
      app_key: text(item.app_key, 64),
      display_name: text(item.display_name, 120),
      app_version_code: integer(item.app_version_code),
      app_version_name: text(item.app_version_name, 40),
      engine_update: normalizedUpdate,
      action_url: actionUrl,
    });
  }
  const deliveries: MasterStoreAppPendingDelivery[] = [];
  for (const item of value.deliveries) {
    const storeId = text(item?.store?.id, 15);
    const recipientContact = manualWhatsappContact(item?.recipient);
    const recipientStatus = text(item?.recipient?.status, 30);
    const actionUrl = text(item?.action_url, 240);
    if (!RECORD_ID_PATTERN.test(storeId)
      || ![item?.profile_id, item?.job_id, item?.artifact_id].every((id) => RECORD_ID_PATTERN.test(text(id, 15)))
      || !recipientContact
      || !['ready', 'missing_primary', 'invalid_primary', 'missing_whatsapp'].includes(recipientStatus)
      || (recipientStatus === 'ready') !== recipientContact.configured
      || actionUrl !== `/master/stores/${storeId}/app#entrega-whatsapp`) return null;
    deliveries.push({
      store: { id: storeId, name: text(item.store.name, 140), slug: text(item.store.slug, 80) },
      profile_id: text(item.profile_id, 15),
      job_id: text(item.job_id, 15),
      artifact_id: text(item.artifact_id, 15),
      display_name: text(item.display_name, 120),
      version_code: integer(item.version_code),
      version_name: text(item.version_name, 40),
      file_name: text(item.file_name, 220),
      recipient: { ...recipientContact, status: recipientStatus as ManualWhatsappRecipient['status'] },
      action_url: actionUrl,
    });
  }
  const totalApps = integer(value.total_apps);
  const updateCount = integer(value.update_count);
  const criticalCount = integer(value.critical_count);
  const deliveryPendingCount = integer(value.delivery_pending_count);
  if (updateCount !== apps.length || criticalCount > updateCount || totalApps < updateCount
    || deliveryPendingCount !== deliveries.length) return null;
  return {
    generated_at: isoDate(value.generated_at), engine_release: release,
    total_apps: totalApps, update_count: updateCount, critical_count: criticalCount, apps,
    manual_whatsapp_sender: manualWhatsappSender,
    delivery_pending_count: deliveryPendingCount,
    deliveries,
  };
}

async function post<T>(
  pocketbaseUrl: string,
  token: string,
  endpoint: string,
  body: Record<string, unknown>,
  normalize: (value: any) => T | null,
): Promise<MasterAppBuildRequest<T>> {
  const baseUrl = text(pocketbaseUrl, 500).replace(/\/$/, '');
  const authToken = text(token, 5000);
  if (!baseUrl || !authToken) return { available: false, status: 0, error: 'unavailable', data: null };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    const data = response.status === 200 ? normalize(payload) : null;
    return {
      available: response.status === 200 && data !== null,
      status: response.status,
      error: data ? '' : text(payload?.error, 80) || (response.status === 200 ? 'invalid_response' : 'unavailable'),
      data,
    };
  } catch (_) {
    return { available: false, status: 0, error: 'unavailable', data: null };
  } finally { clearTimeout(timeout); }
}

export function getMasterAppBuildErrorMessage(error: string) {
  const messages: Record<string, string> = {
    invalid_payload: 'Revisa todos los campos de identidad y versión.',
    premium_required: 'La tienda necesita un plan Premium vigente para administrar su app.',
    store_url_mismatch: 'La URL debe terminar exactamente en /t/{slug de la tienda}.',
    powerzona_distribution_required: 'PowerZona debe generar APK directo y AAB para Google Play.',
    tenant_distribution_must_be_direct: 'Las demás tiendas solo pueden generar APK para distribución directa.',
    app_identity_already_used: 'El app key, paquete o proyecto Firebase ya pertenece a otra app.',
    version_code_must_increase: 'El nuevo versionCode debe ser mayor que el publicado anteriormente.',
    preview_expired: 'La vista previa venció. Genera una nueva antes de confirmar.',
    preview_mismatch: 'La vista previa cambió o no coincide con la confirmación.',
    preview_not_confirmable: 'Esta vista previa ya no se puede confirmar.',
    active_job_exists: 'Ya existe un trabajo confirmado o en ejecución para esta tienda.',
    brand_assets_required: 'Carga y revisa el icono y el splash antes de crear la vista previa.',
    brand_assets_changed: 'El icono o el splash cambiaron. Crea y revisa una nueva vista previa.',
    brand_asset_invalid: 'El archivo normalizado no cumple el contrato seguro de la app.',
    brand_asset_input_too_large: 'La imagen supera el máximo permitido de 12 MB.',
    brand_asset_dimensions_too_large: 'La imagen supera el máximo de 8000 px o 40 megapíxeles.',
    brand_asset_animated_unsupported: 'Usa una imagen JPG, PNG o WebP no animada.',
    brand_asset_corrupt: 'La imagen no se pudo leer o está dañada.',
    brand_asset_busy: 'Ya hay varias imágenes convirtiéndose. Espera un momento.',
    job_not_cancelable: 'El trabajo ya fue reclamado por el runner y no puede cancelarse desde el panel.',
    job_not_retryable: 'Este trabajo ya no admite reanudación.',
    profile_not_provisioned: 'La app todavía no está aprovisionada; no puede generar una actualización.',
    master_whatsapp_required: 'Configura primero el número oficial de WhatsApp del Master con código de país.',
    primary_admin_required: 'La tienda todavía no tiene un administrador principal designado.',
    primary_admin_invalid: 'El administrador principal debe estar activo y pertenecer a esta tienda.',
    primary_admin_whatsapp_required: 'El administrador principal necesita un WhatsApp válido con código de país.',
    apk_not_ready: 'Todavía no existe un APK exitoso y entregable para preparar este mensaje.',
    delivery_preview_mismatch: 'La vista previa del mensaje cambió. Revísala nuevamente antes de marcar el envío.',
    delivery_already_marked: 'Este trabajo ya tiene una entrega manual diferente registrada.',
  };
  return messages[error] || 'No se pudo completar la acción. Inténtalo nuevamente.';
}

export function getMasterStoreAppBuilds(pocketbaseUrl: string, token: string, storeId: string) {
  if (!RECORD_ID_PATTERN.test(storeId)) return Promise.resolve({ available: false, status: 400, error: 'invalid_payload', data: null });
  return post(pocketbaseUrl, token, '/api/pz/master/storefront-app-builds', { store_id: storeId }, detail);
}

export function getMasterStoreAppEngineUpdates(pocketbaseUrl: string, token: string) {
  return post(pocketbaseUrl, token, '/api/pz/master/storefront-app-builds/updates', {}, engineUpdates);
}

export type ProvisionPreviewInput = {
  store_id: string;
  operation: 'provision';
  app_key: string;
  brand_key: string;
  display_name: string;
  distribution: StorefrontAppDistribution;
  firebase_project_id: string;
  package_name: string;
  store_url: string;
  version_code: number;
  version_name: string;
};

export type UpdatePreviewInput = {
  store_id: string;
  operation: 'update';
  profile_id: string;
  version_code: number;
  version_name: string;
};

export function previewMasterStoreAppBuild(
  pocketbaseUrl: string,
  token: string,
  input: ProvisionPreviewInput | UpdatePreviewInput,
) {
  return post(pocketbaseUrl, token, '/api/pz/master/storefront-app-builds/preview', input, (value) => {
    if (value?.ok !== true) return null;
    const normalized = job(value.job);
    return normalized?.status === 'preview' ? normalized : null;
  });
}

export function confirmMasterStoreAppBuild(
  pocketbaseUrl: string,
  token: string,
  input: { job_id: string; preview_hash: string },
) {
  return post(pocketbaseUrl, token, '/api/pz/master/storefront-app-builds/confirm', input, (value) => {
    if (value?.ok !== true) return null;
    const normalizedJob = job(value.job);
    const normalizedProfile = profile(value.profile);
    return normalizedJob && normalizedProfile ? { job: normalizedJob, profile: normalizedProfile } : null;
  });
}

export function retryMasterStoreAppBuild(
  pocketbaseUrl: string,
  token: string,
  input: { job_id: string; preview_hash: string },
) {
  return post(pocketbaseUrl, token, '/api/pz/master/storefront-app-builds/retry', input, (value) => {
    if (value?.ok !== true) return null;
    const normalizedJob = job(value.job);
    const normalizedProfile = profile(value.profile);
    return normalizedJob && normalizedProfile ? { job: normalizedJob, profile: normalizedProfile } : null;
  });
}

export function cancelMasterStoreAppBuild(
  pocketbaseUrl: string,
  token: string,
  input: { job_id: string; confirmation: 'CANCELAR TRABAJO' },
) {
  return post(pocketbaseUrl, token, '/api/pz/master/storefront-app-builds/cancel', input, (value) => {
    if (value?.ok !== true) return null;
    const normalizedJob = job(value.job);
    return normalizedJob?.status === 'canceled' ? { job: normalizedJob } : null;
  });
}

export function saveMasterWhatsappSettings(
  pocketbaseUrl: string,
  token: string,
  whatsappNumber: string,
) {
  return post(pocketbaseUrl, token, '/api/pz/master/storefront-app-builds/whatsapp/settings', {
    whatsapp_number: whatsappNumber,
  }, (value) => {
    if (value?.ok !== true) return null;
    return manualWhatsappContact(value.sender);
  });
}

// Alias compatible con consumidores C10 anteriores al traslado del ajuste al panel global Master.
export const saveMasterStoreAppWhatsappSettings = saveMasterWhatsappSettings;

export function previewMasterStoreAppWhatsappDelivery(
  pocketbaseUrl: string,
  token: string,
  input: { store_id: string; artifact_id: string },
) {
  return post(pocketbaseUrl, token, '/api/pz/master/storefront-app-builds/whatsapp/preview', input, (value) => {
    if (value?.ok !== true) return null;
    const normalizedPreview = manualWhatsappPreview(value.preview);
    const normalizedJob = job(value.job);
    return normalizedPreview && normalizedJob ? { preview: normalizedPreview, job: normalizedJob } : null;
  });
}

export function markMasterStoreAppWhatsappSent(
  pocketbaseUrl: string,
  token: string,
  input: { store_id: string; artifact_id: string; message_sha256: string; confirmation: 'MARCAR ENVIADO' },
) {
  return post(pocketbaseUrl, token, '/api/pz/master/storefront-app-builds/whatsapp/marked-sent', input, (value) => {
    if (value?.ok !== true) return null;
    const normalizedPreview = manualWhatsappPreview(value.preview);
    const normalizedJob = job(value.job);
    return normalizedPreview && normalizedJob && normalizedJob.delivery_status === 'marked_sent'
      ? { preview: normalizedPreview, job: normalizedJob, idempotent: value.idempotent === true }
      : null;
  });
}

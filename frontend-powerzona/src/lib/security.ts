import PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import { isMasterAdmin } from './auth';
import { pb } from './pocketbase';

export const STORE_SECURITY_COLLECTION = 'store_security_settings';

export const SECURITY_MODES = ['disabled', 'monitoring', 'protection'] as const;
export const SECURITY_ACTIVE_MODES = ['monitoring', 'protection'] as const;
export const SECURITY_RETENTION_OPTIONS = [30, 60, 90] as const;
export const SECURITY_IP_VISIBILITY_OPTIONS = ['hidden', 'partial', 'full'] as const;
export const SECURITY_VPN_POLICIES = ['off', 'monitor', 'block'] as const;

export type SecurityMode = (typeof SECURITY_MODES)[number];
export type SecurityActiveMode = (typeof SECURITY_ACTIVE_MODES)[number];
export type SecurityRetentionDays = (typeof SECURITY_RETENTION_OPTIONS)[number];
export type SecurityIpVisibility = (typeof SECURITY_IP_VISIBILITY_OPTIONS)[number];
export type SecurityVpnPolicy = (typeof SECURITY_VPN_POLICIES)[number];

export type StoreSecuritySettings = {
  id: string;
  exists: boolean;
  store: string;
  enabled: boolean;
  mode: SecurityMode;
  manual_blocking_enabled: boolean;
  full_access_blocking_enabled: boolean;
  permanent_blocks_enabled: boolean;
  retention_days: SecurityRetentionDays;
  ip_visibility: SecurityIpVisibility;
  notify_blocked_attempts: boolean;
  vpn_policy: SecurityVpnPolicy;
  created?: string;
  updated?: string;
};

export type StoreSecuritySettingsInput = Partial<Omit<StoreSecuritySettings, 'id' | 'exists' | 'created' | 'updated'>>;

export type SecurityBackendHealth = {
  available: boolean;
  ok: boolean;
  hmac_identity_ready: boolean;
  hmac_monitoring_ready: boolean;
  aes_identity_ready: boolean;
  aes_monitoring_ready: boolean;
  security_settings_ready: boolean;
  customers_ready: boolean;
  security_events_ready: boolean;
  visitor_sessions_ready: boolean;
  visitor_pageviews_ready: boolean;
  ip_reputation_ready: boolean;
  address_alerts_ready: boolean;
  identity_collections_ready: boolean;
  visitor_collections_ready: boolean;
  orders_identity_fields_ready: boolean;
  full_ip_ready: boolean;
};

export const SECURITY_DEFAULTS = {
  enabled: false,
  mode: 'disabled',
  manual_blocking_enabled: false,
  full_access_blocking_enabled: false,
  permanent_blocks_enabled: false,
  retention_days: 30,
  ip_visibility: 'hidden',
  notify_blocked_attempts: false,
  vpn_policy: 'off',
} as const;

export const SECURITY_STATUS_LABELS: Record<SecurityMode, string> = {
  disabled: 'Seguridad desactivada',
  monitoring: 'Solo monitoreo',
  protection: 'Protección activa',
};

export const SECURITY_MODE_LABELS: Record<SecurityMode, string> = {
  disabled: 'Desactivado',
  monitoring: 'Solo monitoreo',
  protection: 'Protección activa',
};

export const SECURITY_IP_VISIBILITY_LABELS: Record<SecurityIpVisibility, string> = {
  hidden: 'Oculta',
  partial: 'Parcial',
  full: 'Completa',
};

export const SECURITY_VPN_POLICY_LABELS: Record<SecurityVpnPolicy, string> = {
  off: 'Desactivada',
  monitor: 'Solo detectar',
  block: 'Detectar y bloquear',
};

function escapePocketBaseValue(value: string) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function normalizeBoolean(value: unknown) {
  return value === true || value === 'true';
}

function normalizeMode(value: unknown): SecurityMode {
  const mode = String(value || '').trim();
  return SECURITY_MODES.includes(mode as SecurityMode) ? mode as SecurityMode : SECURITY_DEFAULTS.mode;
}

function normalizeRetentionDays(value: unknown): SecurityRetentionDays {
  const days = Number(value);
  return SECURITY_RETENTION_OPTIONS.includes(days as SecurityRetentionDays)
    ? days as SecurityRetentionDays
    : SECURITY_DEFAULTS.retention_days;
}

function normalizeIpVisibility(value: unknown): SecurityIpVisibility {
  const visibility = String(value || '').trim();
  return SECURITY_IP_VISIBILITY_OPTIONS.includes(visibility as SecurityIpVisibility)
    ? visibility as SecurityIpVisibility
    : SECURITY_DEFAULTS.ip_visibility;
}

function normalizeVpnPolicy(value: unknown): SecurityVpnPolicy {
  const policy = String(value || '').trim();
  return SECURITY_VPN_POLICIES.includes(policy as SecurityVpnPolicy)
    ? policy as SecurityVpnPolicy
    : SECURITY_DEFAULTS.vpn_policy;
}

function normalizeRecord(record: Partial<RecordModel> | null | undefined, storeId = '', exists = true): StoreSecuritySettings {
  const normalized = normalizeSecuritySettingsPayload({
    store: String(record?.store || storeId || ''),
    enabled: record?.enabled,
    mode: record?.mode,
    manual_blocking_enabled: record?.manual_blocking_enabled,
    full_access_blocking_enabled: record?.full_access_blocking_enabled,
    permanent_blocks_enabled: record?.permanent_blocks_enabled,
    retention_days: record?.retention_days,
    ip_visibility: record?.ip_visibility,
    notify_blocked_attempts: record?.notify_blocked_attempts,
    vpn_policy: record?.vpn_policy,
  });

  return {
    id: String(record?.id || ''),
    exists: exists && Boolean(record),
    ...normalized,
    created: String(record?.created || ''),
    updated: String(record?.updated || ''),
  };
}

function requireMasterClient(client: PocketBase) {
  if (!isMasterAdmin(client.authStore.record as any)) {
    throw new Error('No tienes permisos para configurar seguridad de tiendas.');
  }
}

export function getDefaultSecuritySettings(storeId = ''): StoreSecuritySettings {
  return {
    id: '',
    exists: false,
    store: String(storeId || ''),
    ...SECURITY_DEFAULTS,
  };
}

export function getDefaultSecurityBackendHealth(): SecurityBackendHealth {
  return {
    available: false,
    ok: false,
    hmac_identity_ready: false,
    hmac_monitoring_ready: false,
    aes_identity_ready: false,
    aes_monitoring_ready: false,
    security_settings_ready: false,
    customers_ready: false,
    security_events_ready: false,
    visitor_sessions_ready: false,
    visitor_pageviews_ready: false,
    ip_reputation_ready: false,
    address_alerts_ready: false,
    identity_collections_ready: false,
    visitor_collections_ready: false,
    orders_identity_fields_ready: false,
    full_ip_ready: false,
  };
}

function normalizeSecurityBackendHealth(input: any): SecurityBackendHealth {
  const fallback = getDefaultSecurityBackendHealth();
  return {
    available: true,
    ok: input?.ok === true,
    hmac_identity_ready: input?.hmac_identity_ready === true,
    hmac_monitoring_ready: input?.hmac_monitoring_ready === true,
    aes_identity_ready: input?.aes_identity_ready === true,
    aes_monitoring_ready: input?.aes_monitoring_ready === true,
    security_settings_ready: input?.security_settings_ready === true,
    customers_ready: input?.customers_ready === true,
    security_events_ready: input?.security_events_ready === true,
    visitor_sessions_ready: input?.visitor_sessions_ready === true,
    visitor_pageviews_ready: input?.visitor_pageviews_ready === true,
    ip_reputation_ready: input?.ip_reputation_ready === true,
    address_alerts_ready: input?.address_alerts_ready === true,
    identity_collections_ready: input?.identity_collections_ready === true,
    visitor_collections_ready: input?.visitor_collections_ready === true,
    orders_identity_fields_ready: input?.orders_identity_fields_ready === true,
    full_ip_ready: input?.full_ip_ready === true,
  } || fallback;
}

export async function getSecurityBackendHealthForToken(
  pocketbaseUrl: string,
  authToken: string
): Promise<SecurityBackendHealth> {
  const baseUrl = String(pocketbaseUrl || '').trim().replace(/\/$/, '');
  const token = String(authToken || '').trim();
  if (!baseUrl || !token) return getDefaultSecurityBackendHealth();

  try {
    const client = new PocketBase(baseUrl);
    client.autoCancellation(false);
    client.authStore.save(token, null);
    const result = await (client as any).send('/api/pz/security/health', {
      method: 'GET',
    });
    return normalizeSecurityBackendHealth(result);
  } catch (_) {
    return getDefaultSecurityBackendHealth();
  }
}

export function normalizeSecuritySettingsPayload(input: StoreSecuritySettingsInput = {}) {
  const enabled = normalizeBoolean(input.enabled);
  let mode = normalizeMode(input.mode);
  const manualBlockingEnabled = normalizeBoolean(input.manual_blocking_enabled);

  if (!enabled) mode = 'disabled';
  if (mode === 'disabled') {
    return {
      store: String(input.store || ''),
      enabled: false,
      mode,
      manual_blocking_enabled: false,
      full_access_blocking_enabled: false,
      permanent_blocks_enabled: false,
      retention_days: normalizeRetentionDays(input.retention_days),
      ip_visibility: normalizeIpVisibility(input.ip_visibility),
      notify_blocked_attempts: false,
      vpn_policy: 'off' as const,
    };
  }

  return {
    store: String(input.store || ''),
    enabled: true,
    mode,
    manual_blocking_enabled: manualBlockingEnabled,
    full_access_blocking_enabled: manualBlockingEnabled && normalizeBoolean(input.full_access_blocking_enabled),
    permanent_blocks_enabled: manualBlockingEnabled && normalizeBoolean(input.permanent_blocks_enabled),
    retention_days: normalizeRetentionDays(input.retention_days),
    ip_visibility: normalizeIpVisibility(input.ip_visibility),
    notify_blocked_attempts: normalizeBoolean(input.notify_blocked_attempts),
    vpn_policy: mode === 'protection'
      ? normalizeVpnPolicy(input.vpn_policy)
      : (normalizeVpnPolicy(input.vpn_policy) === 'block' ? 'monitor' : normalizeVpnPolicy(input.vpn_policy)),
  };
}

export function getSecurityStatusKey(settings: Partial<StoreSecuritySettings> | null | undefined): SecurityMode {
  if (!settings?.enabled || settings.mode === 'disabled') return 'disabled';
  return settings.mode === 'protection' ? 'protection' : 'monitoring';
}

export function getSecurityStatusLabel(settings: Partial<StoreSecuritySettings> | null | undefined) {
  return SECURITY_STATUS_LABELS[getSecurityStatusKey(settings)];
}

export function getSecurityModeLabel(mode: unknown) {
  return SECURITY_MODE_LABELS[normalizeMode(mode)];
}

export function getSecurityIpVisibilityLabel(value: unknown) {
  return SECURITY_IP_VISIBILITY_LABELS[normalizeIpVisibility(value)];
}

export function getSecurityVpnPolicyLabel(value: unknown) {
  return SECURITY_VPN_POLICY_LABELS[normalizeVpnPolicy(value)];
}

export function isStoreSecurityEnabled(settings: Partial<StoreSecuritySettings> | null | undefined) {
  return Boolean(settings?.enabled === true && settings.mode && settings.mode !== 'disabled');
}

export async function getStoreSecuritySettings(
  storeId: string,
  client: PocketBase = pb,
  options: { fields?: string } = {}
): Promise<StoreSecuritySettings> {
  const normalizedStoreId = String(storeId || '').trim();
  if (!normalizedStoreId) return getDefaultSecuritySettings();

  try {
    const record = await client.collection(STORE_SECURITY_COLLECTION).getFirstListItem(
      `store="${escapePocketBaseValue(normalizedStoreId)}"`,
      {
        sort: '-updated',
        ...(options.fields ? { fields: options.fields } : {}),
      }
    );

    return normalizeRecord(record, normalizedStoreId, true);
  } catch (error: any) {
    if (error?.status === 404) return getDefaultSecuritySettings(normalizedStoreId);
    throw error;
  }
}

export async function getStoreSecuritySettingsForToken(
  storeId: string,
  pocketbaseUrl: string,
  authToken: string,
  options: { fields?: string } = {}
) {
  const normalizedStoreId = String(storeId || '').trim();
  const baseUrl = String(pocketbaseUrl || '').trim().replace(/\/$/, '');
  const token = String(authToken || '').trim();

  if (!normalizedStoreId || !baseUrl || !token) return getDefaultSecuritySettings(normalizedStoreId);

  const client = new PocketBase(baseUrl);
  client.autoCancellation(false);
  client.authStore.save(token, null);

  return getStoreSecuritySettings(normalizedStoreId, client, options);
}

export async function getMasterSecuritySettingsMap(client: PocketBase = pb) {
  const settingsMap = new Map<string, StoreSecuritySettings>();

  try {
    const records = await client.collection(STORE_SECURITY_COLLECTION).getFullList({
      fields: 'id,store,enabled,mode,manual_blocking_enabled,full_access_blocking_enabled,permanent_blocks_enabled,retention_days,ip_visibility,notify_blocked_attempts,vpn_policy,created,updated',
      sort: 'store',
    });

    records.forEach((record) => {
      const settings = normalizeRecord(record, String(record.store || ''), true);
      if (settings.store) settingsMap.set(settings.store, settings);
    });
  } catch (error: any) {
    if (error?.status !== 404) throw error;
  }

  return settingsMap;
}

export async function upsertStoreSecuritySettings(
  storeId: string,
  input: StoreSecuritySettingsInput,
  client: PocketBase = pb
) {
  requireMasterClient(client);

  const normalizedStoreId = String(storeId || input.store || '').trim();
  if (!normalizedStoreId) throw new Error('No se encontró la tienda para configurar seguridad.');

  const payload = normalizeSecuritySettingsPayload({
    ...input,
    store: normalizedStoreId,
  });

  let existingId = '';
  try {
    const existing = await client.collection(STORE_SECURITY_COLLECTION).getFirstListItem(
      `store="${escapePocketBaseValue(normalizedStoreId)}"`,
      { fields: 'id' }
    );
    existingId = String(existing?.id || '');
  } catch (error: any) {
    if (error?.status !== 404) throw error;
  }

  const saved = existingId
    ? await client.collection(STORE_SECURITY_COLLECTION).update(existingId, payload)
    : await client.collection(STORE_SECURITY_COLLECTION).create(payload);

  return normalizeRecord(saved, normalizedStoreId, true);
}

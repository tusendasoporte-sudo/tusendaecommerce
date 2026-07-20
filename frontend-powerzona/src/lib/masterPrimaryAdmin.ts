import type PocketBase from 'pocketbase';
import { isMasterAdmin } from './auth';
import { pb } from './pocketbase';
import {
  isStorePermissionTemplateCode,
  normalizeStorePermissions,
  type StorePermission,
  type StorePermissionTemplateCode,
} from './storeTeamPermissions';

export const PRIMARY_ADMIN_REPLACEMENT_CONFIRMATION = 'REEMPLAZAR ADMINISTRADOR PRINCIPAL';

export type MasterPrimaryAdminState =
  | 'configured'
  | 'configured_invalid'
  | 'pending_multiple'
  | 'pending_single'
  | 'missing';

export type MasterPrimaryAdminCandidate = {
  id: string;
  email: string;
  display_name: string;
  phone: string;
  role: 'store_admin';
  status: 'active';
  created: string;
  is_primary_admin: boolean;
  valid?: boolean;
};

export type MasterPrimaryAdminStatus = {
  ok: true;
  store: { id: string; name: string; slug: string };
  state: MasterPrimaryAdminState;
  primary_admin: MasterPrimaryAdminCandidate | ({ id: string; valid: false } & Partial<MasterPrimaryAdminCandidate>) | null;
  candidates: MasterPrimaryAdminCandidate[];
  quota: { active_users: number; max_active_users: number; within_limit: boolean };
};

export type ReplaceMasterPrimaryAdminInput = {
  storeId: string;
  userId: string;
  previousUserMode: 'keep_active' | 'suspend';
  templateCode: StorePermissionTemplateCode | '';
  permissions: readonly StorePermission[];
  reason: string;
  confirmation: string;
};

function requireMasterClient(client: PocketBase) {
  if (!isMasterAdmin(client.authStore.record as any)) {
    throw new Error('No tienes permisos para gestionar al Administrador principal.');
  }
}

function validId(value: unknown) {
  return /^[a-z0-9]{15}$/.test(String(value || ''));
}

function integer(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function mapCandidate(value: any): MasterPrimaryAdminCandidate {
  return {
    id: String(value?.id || ''),
    email: String(value?.email || ''),
    display_name: String(value?.display_name || ''),
    phone: String(value?.phone || ''),
    role: 'store_admin',
    status: 'active',
    created: String(value?.created || ''),
    is_primary_admin: value?.is_primary_admin === true,
    valid: value?.valid !== false,
  };
}

function mapStatus(value: any): MasterPrimaryAdminStatus {
  const allowedStates: MasterPrimaryAdminState[] = [
    'configured',
    'configured_invalid',
    'pending_multiple',
    'pending_single',
    'missing',
  ];
  const state = allowedStates.includes(value?.state) ? value.state as MasterPrimaryAdminState : 'configured_invalid';
  const rawPrimary = value?.primary_admin;
  const primaryAdmin = rawPrimary?.id
    ? rawPrimary.valid === false
      ? { id: String(rawPrimary.id), valid: false as const }
      : mapCandidate(rawPrimary)
    : null;
  return {
    ok: true,
    store: {
      id: String(value?.store?.id || ''),
      name: String(value?.store?.name || ''),
      slug: String(value?.store?.slug || ''),
    },
    state,
    primary_admin: primaryAdmin,
    candidates: Array.isArray(value?.candidates)
      ? value.candidates.filter((candidate: any) => validId(candidate?.id)).map(mapCandidate)
      : [],
    quota: {
      active_users: integer(value?.quota?.active_users),
      max_active_users: integer(value?.quota?.max_active_users),
      within_limit: value?.quota?.within_limit === true,
    },
  };
}

async function postPrimaryAdmin<T>(
  client: PocketBase,
  action: 'status' | 'assign' | 'replace',
  body: Record<string, unknown>,
) {
  requireMasterClient(client);
  return client.send<T>(`/api/pz/master/primary-admin/${action}`, {
    method: 'POST',
    body,
    requestKey: null,
  });
}

export async function getMasterPrimaryAdminStatus(storeId: string, client = pb) {
  if (!validId(storeId)) throw new Error('No se encontró la tienda.');
  return mapStatus(await postPrimaryAdmin<any>(client, 'status', { store_id: storeId }));
}

export async function assignMasterPrimaryAdmin(
  storeId: string,
  userId: string,
  reason: string,
  client = pb,
) {
  if (!validId(storeId) || !validId(userId)) throw new Error('Selecciona un candidato válido.');
  const cleanReason = String(reason || '').trim();
  if (!cleanReason) throw new Error('Escribe el motivo interno.');
  return mapStatus(await postPrimaryAdmin<any>(client, 'assign', {
    store_id: storeId,
    user_id: userId,
    reason: cleanReason,
  }));
}

export async function replaceMasterPrimaryAdmin(input: ReplaceMasterPrimaryAdminInput, client = pb) {
  if (!validId(input.storeId) || !validId(input.userId)) throw new Error('Selecciona un candidato válido.');
  if (!['keep_active', 'suspend'].includes(input.previousUserMode)) throw new Error('Selecciona qué ocurrirá con el administrador anterior.');
  const reason = String(input.reason || '').trim();
  if (!reason) throw new Error('Escribe el motivo interno.');
  if (input.confirmation !== PRIMARY_ADMIN_REPLACEMENT_CONFIRMATION) {
    throw new Error(`Escribe exactamente: ${PRIMARY_ADMIN_REPLACEMENT_CONFIRMATION}`);
  }
  const suspending = input.previousUserMode === 'suspend';
  const templateCode = suspending ? '' : input.templateCode;
  if (!suspending && !isStorePermissionTemplateCode(templateCode)) throw new Error('Selecciona una plantilla válida.');
  const permissions = suspending ? [] : normalizeStorePermissions(input.permissions);
  return mapStatus(await postPrimaryAdmin<any>(client, 'replace', {
    store_id: input.storeId,
    user_id: input.userId,
    previous_user_mode: input.previousUserMode,
    template_code: templateCode,
    permissions,
    reason,
    confirmation: input.confirmation,
  }));
}

export function getMasterPrimaryAdminStateLabel(state: MasterPrimaryAdminState) {
  const labels: Record<MasterPrimaryAdminState, string> = {
    configured: 'Administrador principal definido',
    configured_invalid: 'Administrador principal requiere revisión',
    pending_multiple: 'Administrador principal pendiente de definir',
    pending_single: 'Administrador principal pendiente de confirmar',
    missing: 'La tienda necesita un Administrador principal',
  };
  return labels[state];
}

export function getMasterPrimaryAdminErrorCode(error: unknown) {
  const candidate = error as any;
  return String(candidate?.data?.error || candidate?.response?.error || candidate?.response?.data?.error || '');
}

export function getMasterPrimaryAdminErrorMessage(error: unknown) {
  const messages: Record<string, string> = {
    unauthorized: 'Solo un Master Admin activo puede realizar esta acción.',
    store_not_found: 'No se encontró la tienda.',
    user_not_found: 'El candidato no pertenece a esta tienda.',
    primary_admin_not_configured: 'La tienda todavía no tiene un Administrador principal configurado.',
    primary_admin_already_configured: 'La tienda ya tiene un Administrador principal. Usa el reemplazo explícito.',
    primary_admin_same_user: 'Selecciona un administrador diferente al actual.',
    primary_admin_candidate_inactive: 'El candidato debe estar activo.',
    primary_admin_candidate_role: 'El candidato debe tener rol de Administrador.',
    active_user_limit_reached: 'La operación supera el cupo de usuarios activos. Suspende al anterior u otro usuario primero.',
    replacement_confirmation_mismatch: `Escribe exactamente: ${PRIMARY_ADMIN_REPLACEMENT_CONFIRMATION}`,
    replacement_reason_required: 'Escribe el motivo interno.',
    invalid_template: 'Selecciona una plantilla válida para el administrador anterior.',
    invalid_permissions: 'Revisa los permisos del administrador anterior.',
    reserved_permission: 'Un usuario adicional no puede recibir permisos reservados.',
    primary_admin_unavailable: 'La gestión del Administrador principal no está disponible temporalmente.',
    primary_admin_assign_failed: 'No se pudo definir al Administrador principal.',
    primary_admin_replace_failed: 'No se pudo reemplazar al Administrador principal.',
  };
  const code = getMasterPrimaryAdminErrorCode(error);
  if (messages[code]) return messages[code];
  return error instanceof Error && error.message
    ? error.message
    : 'No se pudo completar la operación.';
}

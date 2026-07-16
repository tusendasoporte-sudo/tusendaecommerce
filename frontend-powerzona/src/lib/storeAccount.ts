import type PocketBase from 'pocketbase';
import { AUTH_COOKIE_NAME } from './auth';
import { pb } from './pocketbase';

export type StorePasswordInput = {
  currentPassword: string;
  newPassword: string;
  newPasswordConfirm: string;
};

export type StoreAccountMutationResult = {
  ok: true;
  code: string;
  reauth_required: true;
  sessions_revoked: true;
  must_change_password?: false;
};

function post<T>(client: PocketBase, action: string, body: Record<string, unknown>) {
  return client.send<T>(`/api/pz/store/account/${action}`, {
    method: 'POST',
    body,
    requestKey: null,
  });
}

export function getStoreAccountErrorCode(error: unknown) {
  const candidate = error as any;
  const direct = candidate?.data?.error || candidate?.response?.error || candidate?.response?.data?.error;
  if (typeof direct === 'string') return direct;
  const validation = candidate?.response?.data;
  if (validation && typeof validation === 'object') {
    for (const [key, value] of Object.entries(validation)) {
      if ((value as any)?.code === key) return key;
    }
  }
  return '';
}

export function getStoreAccountErrorMessage(error: unknown) {
  const messages: Record<string, string> = {
    unauthorized: 'No tienes permisos para realizar esta acción.',
    invalid_payload: 'Revisa los datos enviados.',
    current_password_required: 'Escribe tu contraseña actual.',
    new_password_required: 'Escribe una contraseña nueva.',
    password_confirmation_mismatch: 'Las contraseñas nuevas no coinciden.',
    password_reuse_not_allowed: 'La contraseña nueva debe ser diferente de la actual.',
    current_password_invalid: 'La contraseña actual no es correcta.',
    invalid_password: 'La contraseña nueva no cumple la política de seguridad.',
    temporary_password_expired: 'La contraseña temporal venció. Solicita una nueva al Master Admin.',
    temporary_password_change_required: 'Primero debes crear tu contraseña personal.',
    temporary_password_not_required: 'Tu cuenta no requiere un cambio de contraseña temporal.',
    temporary_password_issue_failed: 'No se pudo emitir la contraseña temporal.',
    forced_password_change_failed: 'No se pudo crear tu contraseña personal.',
    password_change_failed: 'No se pudo actualizar la contraseña.',
    session_revocation_failed: 'No se pudieron cerrar las sesiones.',
  };
  return messages[getStoreAccountErrorCode(error)] || 'No se pudo completar la operación.';
}

export function changeTemporaryPassword(input: StorePasswordInput, client = pb) {
  return post<StoreAccountMutationResult>(client, 'change-temporary-password', { ...input });
}

export function changeStoreAdminPassword(input: StorePasswordInput, client = pb) {
  return post<StoreAccountMutationResult>(client, 'change-password', { ...input });
}

export function revokeStoreAdminSessions(client = pb) {
  return post<StoreAccountMutationResult>(client, 'revoke-sessions', {});
}

export function clearStoreAuthentication(client = pb, cookieDocument: Pick<Document, 'cookie'> | null = typeof document === 'undefined' ? null : document) {
  client.authStore.clear();
  if (cookieDocument) cookieDocument.cookie = `${AUTH_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function finishStoreAccountMutation(query: 'password_setup=1' | 'password_changed=1' | 'sessions_closed=1', client = pb) {
  clearStoreAuthentication(client);
  if (typeof window !== 'undefined') window.location.assign(`/login?${query}`);
}

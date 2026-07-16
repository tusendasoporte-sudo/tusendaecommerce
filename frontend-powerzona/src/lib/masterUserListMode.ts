export const COMPACT_STORE_USER_LIMIT = 10;

function nonNegativeInteger(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

export function shouldUseCompactStoreUserList(totalUsers: unknown) {
  return nonNegativeInteger(totalUsers) <= COMPACT_STORE_USER_LIMIT;
}

export function formatMasterStoreUserCount(value: unknown) {
  const total = nonNegativeInteger(value);
  return `${total} ${total === 1 ? 'usuario' : 'usuarios'}`;
}

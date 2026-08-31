export type MasterStoreListLocation = Pick<Location, 'pathname' | 'search' | 'hash' | 'assign' | 'reload'>;

export function masterStoreListTarget(page: unknown) {
  const normalizedPage = Math.max(1, Math.floor(Number(page) || 1));
  return `/master/stores?stores_page=${normalizedPage}#tiendas-registradas`;
}

export function navigateToMasterStoreList(page: unknown, targetLocation: MasterStoreListLocation = window.location) {
  const target = masterStoreListTarget(page);
  const current = `${targetLocation.pathname}${targetLocation.search}${targetLocation.hash}`;
  if (current === target) {
    targetLocation.reload();
    return 'reload' as const;
  }
  targetLocation.assign(target);
  return 'assign' as const;
}

function normalizedOrigin(origin) {
  try {
    return new URL(String(origin || '')).origin;
  } catch (_) {
    return '';
  }
}

function normalizedAdminBasePath(adminBasePath, origin) {
  const value = String(adminBasePath || '').trim();
  if (!value || !origin) return '';
  try {
    const parsed = new URL(value, `${origin}/`);
    if (parsed.origin !== origin) return '';
    return parsed.pathname.replace(/\/+$/, '');
  } catch (_) {
    return '';
  }
}

/**
 * Returns a tenant-admin relative URL or an empty string when the target could
 * navigate outside the current store's admin surface.
 */
export function safeAdminNotificationTarget(target, adminBasePath, currentOrigin) {
  const value = String(target || '').trim();
  if (!value || /[\u0000-\u001f\u007f\\]/.test(value)) return '';

  const origin = normalizedOrigin(currentOrigin);
  const adminPath = normalizedAdminBasePath(adminBasePath, origin);
  if (!origin || !adminPath || adminPath === '/') return '';

  try {
    const parsed = new URL(value, `${origin}/`);
    if (parsed.origin !== origin || parsed.username || parsed.password) return '';
    // Notification destinations only use normalized slugs/record ids in the
    // pathname. Reject encoded path bytes to avoid single/double-decode route
    // ambiguities while still allowing ordinary encoding in query/hash data.
    if (parsed.pathname.includes('%')) return '';
    if (parsed.pathname !== adminPath && !parsed.pathname.startsWith(`${adminPath}/`)) return '';
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch (_) {
    return '';
  }
}

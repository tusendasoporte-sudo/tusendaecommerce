function environmentValue(name: 'PZ_POCKETBASE_INTERNAL_URL' | 'PUBLIC_POCKETBASE_URL') {
  const runtimeValue = typeof process !== 'undefined' ? process.env?.[name] : '';
  const buildEnvironment = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
  return String(runtimeValue || buildEnvironment?.[name] || '').trim();
}

function normalizedBaseUrl(value: unknown) {
  const candidate = String(value || '').trim();
  if (!candidate) return '';
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return '';
    if (parsed.pathname && parsed.pathname !== '/') return '';
    return parsed.origin;
  } catch (_) {
    return '';
  }
}

export function resolveServerPocketBaseUrl(internalUrl: unknown, publicUrl: unknown) {
  const configuredInternal = String(internalUrl || '').trim();
  if (configuredInternal) return normalizedBaseUrl(configuredInternal);
  return normalizedBaseUrl(publicUrl);
}

export function serverPocketBaseUrl() {
  return resolveServerPocketBaseUrl(
    environmentValue('PZ_POCKETBASE_INTERNAL_URL'),
    environmentValue('PUBLIC_POCKETBASE_URL'),
  );
}

export function publicPocketBaseUrl() {
  return normalizedBaseUrl(environmentValue('PUBLIC_POCKETBASE_URL'));
}

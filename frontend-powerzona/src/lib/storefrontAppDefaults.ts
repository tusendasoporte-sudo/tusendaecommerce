const APP_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{1,62}[a-z0-9]$/;
const FIREBASE_PROJECT_ID_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;

const STAGING_DEFAULTS = Object.freeze({
  appKey: 'powerzona-storefront-staging',
  firebaseProjectId: 'tu-senda-84-storefront-staging',
});

type Environment = Record<string, string | undefined>;

export function powerZonaStorefrontDefaults(environment: Environment = process.env) {
  const appKey = String(environment.PZ_POWERZONA_STOREFRONT_APP_KEY || '').trim();
  const firebaseProjectId = String(environment.PZ_STOREFRONT_FIREBASE_PROJECT_ID || '').trim();
  if (appKey && !APP_KEY_PATTERN.test(appKey)) throw new Error('powerzona_app_key_invalid');
  if (firebaseProjectId && !FIREBASE_PROJECT_ID_PATTERN.test(firebaseProjectId)) {
    throw new Error('powerzona_firebase_project_id_invalid');
  }
  return {
    appKey: appKey || STAGING_DEFAULTS.appKey,
    firebaseProjectId: firebaseProjectId || STAGING_DEFAULTS.firebaseProjectId,
  };
}

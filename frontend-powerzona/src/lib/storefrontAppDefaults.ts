const APP_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{1,62}[a-z0-9]$/;
const FIREBASE_PROJECT_ID_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;

const STAGING_DEFAULTS = Object.freeze({
  appKey: 'powerzona-storefront-staging',
  firebaseProjectId: 'tu-senda-84-storefront-staging',
});

type Environment = Record<string, string | undefined>;

export const POWERZONA_EXISTING_APP_BASELINE = Object.freeze({
  packageName: 'com.tusenda84.powerzona',
  versionCode: 10,
  versionName: '0.2.8',
  signingCertSha256: '12:5B:DC:CC:B5:53:0D:94:FC:7C:0C:E3:32:21:BE:78:52:96:0C:45:3E:D2:F0:47:46:29:82:FC:C5:4F:B3:72',
});

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

import { createHash } from 'node:crypto';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';

type FirebaseProjectEntry = {
  projectId: string;
  projectNumber: string;
  appIds: string[];
  credentialEnv: string;
  legacyServiceAccountJson: string;
};

const PROJECT_ID_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const PROJECT_NUMBER_PATTERN = /^[0-9]{6,20}$/;
const FIREBASE_APP_ID_PATTERN = /^1:[0-9]{6,20}:android:[a-f0-9]{16,64}$/;
const CREDENTIAL_ENV_PATTERN = /^PZ_STOREFRONT_FIREBASE_CREDENTIAL_[A-Z0-9_]{2,80}$/;

function environmentValue(name: string) {
  return String(process.env[name] || '').trim();
}

function exactObject(value: unknown, keys: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = keys.slice().sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function parseRegistry() {
  const raw = environmentValue('PZ_STOREFRONT_FIREBASE_PROJECTS_JSON');
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 100) throw new Error('firebase_registry_invalid');
  const projects: FirebaseProjectEntry[] = [];
  const seenProjects = new Set<string>();
  const seenApps = new Set<string>();
  for (const value of parsed) {
    if (!exactObject(value, ['app_ids', 'credential_env', 'project_id', 'project_number'])) {
      throw new Error('firebase_registry_invalid');
    }
    const projectId = String(value.project_id || '').trim();
    const projectNumber = String(value.project_number || '').trim();
    const credentialEnv = String(value.credential_env || '').trim();
    const appIds = Array.isArray(value.app_ids) ? value.app_ids.map((item: unknown) => String(item || '').trim()) : [];
    if (!PROJECT_ID_PATTERN.test(projectId)
      || !PROJECT_NUMBER_PATTERN.test(projectNumber)
      || !CREDENTIAL_ENV_PATTERN.test(credentialEnv)
      || appIds.length < 1
      || appIds.some((appId: string) => !FIREBASE_APP_ID_PATTERN.test(appId))
      || seenProjects.has(projectId)
      || appIds.some((appId: string) => seenApps.has(appId))) throw new Error('firebase_registry_invalid');
    seenProjects.add(projectId);
    appIds.forEach((appId: string) => seenApps.add(appId));
    projects.push({ projectId, projectNumber, credentialEnv, appIds, legacyServiceAccountJson: '' });
  }
  return projects;
}

function legacyProject(): FirebaseProjectEntry | null {
  const projectId = environmentValue('PZ_STOREFRONT_FIREBASE_PROJECT_ID');
  const serviceAccount = environmentValue('PZ_STOREFRONT_FIREBASE_SERVICE_ACCOUNT_JSON');
  if (!projectId && !serviceAccount) return null;
  if (!PROJECT_ID_PATTERN.test(projectId) || !serviceAccount) throw new Error('firebase_legacy_config_invalid');
  return { projectId, projectNumber: '', appIds: [], credentialEnv: '', legacyServiceAccountJson: serviceAccount };
}

export function storefrontFirebaseProjects() {
  const configured = parseRegistry();
  if (configured.length) return configured;
  const legacy = legacyProject();
  return legacy ? [legacy] : [];
}

function decodeJwtPayload(token: string) {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) throw new Error('app_check_invalid');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('app_check_invalid');
  const appId = String(payload.sub || '').trim();
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  const projectNumbers = audiences.map((audience: unknown) => {
    const match = /^projects\/([0-9]{6,20})$/.exec(String(audience || '').trim());
    return match ? match[1] : '';
  }).filter(Boolean);
  if (!FIREBASE_APP_ID_PATTERN.test(appId) || projectNumbers.length !== 1) throw new Error('app_check_invalid');
  return { appId, projectNumber: projectNumbers[0] };
}

function serviceAccountJson(entry: FirebaseProjectEntry) {
  const value = entry.credentialEnv ? environmentValue(entry.credentialEnv) : entry.legacyServiceAccountJson;
  if (!value) throw new Error('firebase_credentials_missing');
  const serviceAccount = JSON.parse(value);
  if (!serviceAccount || String(serviceAccount.project_id || '').trim() !== entry.projectId) {
    throw new Error('firebase_project_mismatch');
  }
  return serviceAccount;
}

function namedAdminApp(entry: FirebaseProjectEntry, purpose: 'app-check' | 'push') {
  const suffix = createHash('sha256').update(entry.projectId, 'utf8').digest('hex').slice(0, 16);
  const name = `pz-storefront-${purpose}-${suffix}`;
  const existing = getApps().find((app) => app.name === name);
  return existing || initializeApp({
    credential: cert(serviceAccountJson(entry)),
    projectId: entry.projectId,
  }, name);
}

export function storefrontFirebaseForAppCheckToken(token: string): { app: App; expectedAppId: string; projectId: string } {
  const entries = storefrontFirebaseProjects();
  if (!entries.length) throw new Error('firebase_not_configured');
  if (entries.length === 1 && !entries[0].projectNumber && !entries[0].appIds.length) {
    return { app: namedAdminApp(entries[0], 'app-check'), expectedAppId: '', projectId: entries[0].projectId };
  }
  const unverified = decodeJwtPayload(token);
  const entry = entries.find((candidate) => candidate.projectNumber === unverified.projectNumber
    && candidate.appIds.includes(unverified.appId));
  if (!entry) throw new Error('firebase_project_not_allowed');
  return { app: namedAdminApp(entry, 'app-check'), expectedAppId: unverified.appId, projectId: entry.projectId };
}

export function storefrontFirebaseForPush(projectId: string, firebaseAppId: string) {
  const entries = storefrontFirebaseProjects();
  if (!entries.length) throw new Error('firebase_not_configured');
  const entry = projectId
    ? entries.find((candidate) => candidate.projectId === projectId && candidate.appIds.includes(firebaseAppId))
    : (entries.length === 1 ? entries[0] : null);
  if (!entry) throw new Error('firebase_project_not_allowed');
  if (entry.appIds.length && !entry.appIds.includes(firebaseAppId)) throw new Error('firebase_app_not_allowed');
  return namedAdminApp(entry, 'push');
}

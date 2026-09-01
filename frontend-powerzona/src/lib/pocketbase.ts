import PocketBase from 'pocketbase';
import { serverPocketBaseUrl } from './pocketBaseServerUrl';
import { resolvePublicMediaBaseUrl } from './publicMediaUrl';

const publicPocketbaseUrl = String(import.meta.env.PUBLIC_POCKETBASE_URL || '').replace(/\/+$/, '');
const publicMediaUrl = resolvePublicMediaBaseUrl(
  import.meta.env.PUBLIC_MEDIA_CDN_URL,
  publicPocketbaseUrl,
);
const pocketbaseApiUrl = import.meta.env.SSR
  ? serverPocketBaseUrl()
  : publicPocketbaseUrl;

if (!publicPocketbaseUrl) {
  throw new Error('Falta PUBLIC_POCKETBASE_URL en el archivo .env');
}

if (!pocketbaseApiUrl) {
  throw new Error('La URL de PocketBase para SSR no es valida');
}

if (!publicMediaUrl) {
  throw new Error('PUBLIC_MEDIA_CDN_URL no es una URL publica valida');
}

export const pb = new PocketBase(pocketbaseApiUrl);

// Este cliente se comparte entre solicitudes SSR y tambien se usa en varias
// lecturas concurrentes de una misma coleccion.
pb.autoCancellation(false);

export function getPocketBaseFileUrl(
  collectionIdOrName: string,
  recordId: string,
  filename: string,
  options: { thumb?: string } = {},
) {
  const url = new URL(
    `/api/files/${encodeURIComponent(collectionIdOrName)}/${encodeURIComponent(recordId)}/${encodeURIComponent(filename)}`,
    publicMediaUrl,
  );
  if (options.thumb) url.searchParams.set('thumb', options.thumb);
  return url.toString();
}

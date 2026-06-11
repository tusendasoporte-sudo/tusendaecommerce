import PocketBase from 'pocketbase';

const pocketbaseUrl = import.meta.env.PUBLIC_POCKETBASE_URL;

if (!pocketbaseUrl) {
  throw new Error('Falta PUBLIC_POCKETBASE_URL en el archivo .env');
}

export const pb = new PocketBase(pocketbaseUrl);
pb.autoCancellation(false);

export function getPocketBaseFileUrl(
  collectionIdOrName: string,
  recordId: string,
  filename: string
) {
  return `${pocketbaseUrl}/api/files/${collectionIdOrName}/${recordId}/${filename}`;
}

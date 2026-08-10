import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, '..', '..');
const sourceLogo = resolve(
  workspaceRoot,
  'frontend-powerzona',
  'public',
  'brand',
  'tusenda84-bazzar-logo.png',
);
const androidDrawableDirectory = resolve(
  workspaceRoot,
  'mobile-admin',
  'app',
  'src',
  'main',
  'res',
  'drawable-nodpi',
);
const storeAssetsDirectory = resolve(workspaceRoot, 'mobile-admin', 'store-assets');

const symbolCrop = {
  left: 330,
  top: 145,
  width: 650,
  height: 585,
};

async function transparentBrandSymbol(width, height) {
  const { data, info } = await sharp(sourceLogo)
    .extract(symbolCrop)
    .resize(width, height, { fit: 'contain', background: { r: 255, g: 255, b: 255 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let offset = 0; offset < data.length; offset += 4) {
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const minimum = Math.min(red, green, blue);
    const maximum = Math.max(red, green, blue);
    const neutral = maximum - minimum < 14;

    if (minimum >= 246 && neutral) {
      data[offset + 3] = 0;
    } else if (minimum > 228 && neutral) {
      data[offset + 3] = Math.round(((246 - minimum) / 18) * 255);
    }
  }

  return { data, info };
}

async function writeLauncherAssets() {
  await mkdir(androidDrawableDirectory, { recursive: true });
  const symbol = await transparentBrandSymbol(320, 288);
  const left = Math.round((432 - symbol.info.width) / 2);
  const top = Math.round((432 - symbol.info.height) / 2);

  await sharp({
    create: {
      width: 432,
      height: 432,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    },
  })
    .composite([{ input: symbol.data, raw: symbol.info, left, top }])
    .png()
    .toFile(resolve(androidDrawableDirectory, 'ic_launcher_brand_foreground.png'));

  const monochrome = Buffer.from(symbol.data);
  for (let offset = 0; offset < monochrome.length; offset += 4) {
    monochrome[offset] = 255;
    monochrome[offset + 1] = 255;
    monochrome[offset + 2] = 255;
  }

  await sharp({
    create: {
      width: 432,
      height: 432,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    },
  })
    .composite([{ input: monochrome, raw: symbol.info, left, top }])
    .png()
    .toFile(resolve(androidDrawableDirectory, 'ic_launcher_brand_monochrome.png'));
}

async function writeStoreIcon() {
  await mkdir(storeAssetsDirectory, { recursive: true });
  const symbol = await transparentBrandSymbol(404, 364);
  const left = Math.round((512 - symbol.info.width) / 2);
  const top = Math.round((512 - symbol.info.height) / 2);

  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: symbol.data, raw: symbol.info, left, top }])
    .png()
    .toFile(resolve(storeAssetsDirectory, 'tu-senda-84-admin-icon-512.png'));
}

await writeLauncherAssets();
await writeStoreIcon();

console.log('Recursos de marca Android generados.');

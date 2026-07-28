import sharp from 'sharp';
import { writeFile } from 'fs/promises';
import { resolve } from 'path';

const SIZES = [16, 32, 48, 96, 128];
const SOURCE_ICON = resolve('prismi-icon.png');

async function main() {
  for (const size of SIZES) {
    const png = await sharp(SOURCE_ICON)
      .resize(size, size)
      .png()
      .toBuffer();
    await writeFile(resolve(`public/icons/icon-${size}.png`), png);
    console.log(`Created icon-${size}.png`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const SOURCE_SVG = fileURLToPath(new URL('../electron/urbanwave-logo.svg', import.meta.url));
const ICON_PNG_OUT = fileURLToPath(new URL('../electron/icon.png', import.meta.url));
const ICON_ICO_OUT = fileURLToPath(new URL('../electron/icon.ico', import.meta.url));

const SIZES = [16, 24, 32, 48, 64, 128, 256];

async function main() {
  const pngBuffers = [];
  for (const size of SIZES) {
    const buf = await sharp(SOURCE_SVG, { density: 384 })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    pngBuffers.push(buf);
  }

  await writeFile(ICON_PNG_OUT, pngBuffers[pngBuffers.length - 1]);

  const icoBuffer = await pngToIco(pngBuffers);
  await writeFile(ICON_ICO_OUT, icoBuffer);

  console.log(`Generated icon.png and icon.ico (${SIZES.join(', ')}px) from ${SOURCE_SVG}`);
}

main().catch((err) => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});

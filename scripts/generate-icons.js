import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateIcons() {
  const candidatePublicIcon = path.resolve(__dirname, '../public/Icon.png');
  const candidatePublicLogo = path.resolve(__dirname, '../public/Logo.png');
  const candidatePicturesVersion = path.resolve(__dirname, '../pictures/Version.png');
  const out180 = path.resolve(__dirname, '../public/icon-180.png');
  const out192 = path.resolve(__dirname, '../public/icon-192.png');
  const out512 = path.resolve(__dirname, '../public/icon-512.png');

  try {
    let srcPath = candidatePublicIcon;
    // Fallback to Logo.png or Version.png if Icon.png does not exist
    try {
      await sharp(candidatePublicIcon).metadata();
    } catch (_) {
      try {
        srcPath = candidatePublicLogo;
        await sharp(candidatePublicLogo).metadata();
      } catch (__) {
        srcPath = candidatePicturesVersion;
      }
    }

    console.log('Using source image:', srcPath);

    console.log('Generating 180x180 Apple touch icon');
    await sharp(srcPath)
      .resize(180, 180, { fit: 'cover' })
      .png({ quality: 100 })
      .toFile(out180);

    console.log('Generating 192x192 icon');
    await sharp(srcPath)
      .resize(192, 192, { fit: 'cover' })
      .png({ quality: 100 })
      .toFile(out192);

    console.log('Generating 512x512 icon');
    await sharp(srcPath)
      .resize(512, 512, { fit: 'cover' })
      .png({ quality: 100 })
      .toFile(out512);

    console.log('Icons created at:', out180, out192, 'and', out512);
  } catch (err) {
    console.error('Error generating icons:', err);
    process.exitCode = 1;
  }
}

generateIcons();

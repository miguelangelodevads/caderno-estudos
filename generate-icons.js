import sharp from 'sharp';
import fs from 'fs';

const svgBuffer = fs.readFileSync('./public/pwa-icon.svg');

async function generateIcons() {
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile('./public/pwa-192x192.png');
    
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile('./public/pwa-512x512.png');
    
  console.log("Icons generated successfully!");
}

generateIcons().catch(console.error);

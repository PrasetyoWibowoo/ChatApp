#!/usr/bin/env node

/**
 * PWA Icon Generator Script
 * 
 * This script generates PWA icons from a source image.
 * 
 * Requirements:
 * - Install sharp: npm install sharp --save-dev
 * - Place source image at: public/logo.png (recommended size: 1024x1024)
 * 
 * Usage:
 * node scripts/generate-icons.js
 */

const fs = require('fs');
const path = require('path');

// Check if sharp is available
let sharp;
try {
  sharp = require('sharp');
} catch (error) {
  console.error('❌ Sharp not installed. Install it with: npm install sharp --save-dev');
  process.exit(1);
}

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const sourceImage = path.join(__dirname, '../public/logo.png');
const outputDir = path.join(__dirname, '../public');

// Check if source image exists
if (!fs.existsSync(sourceImage)) {
  console.error(`❌ Source image not found: ${sourceImage}`);
  console.log('💡 Place a 1024x1024 PNG image at public/logo.png');
  process.exit(1);
}

console.log('🎨 Generating PWA icons...\n');

async function generateIcons() {
  for (const size of sizes) {
    const outputFile = path.join(outputDir, `icon-${size}x${size}.png`);
    
    try {
      await sharp(sourceImage)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 59, g: 130, b: 246, alpha: 1 } // #3b82f6
        })
        .png()
        .toFile(outputFile);
      
      console.log(`✅ Generated: icon-${size}x${size}.png`);
    } catch (error) {
      console.error(`❌ Failed to generate icon-${size}x${size}.png:`, error.message);
    }
  }
  
  console.log('\n✨ Icon generation complete!');
  console.log('\n📝 Next steps:');
  console.log('1. Build the frontend: npm run build');
  console.log('2. Test PWA with: npm run preview');
  console.log('3. Deploy to production');
}

generateIcons().catch(error => {
  console.error('❌ Icon generation failed:', error);
  process.exit(1);
});

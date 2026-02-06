#!/usr/bin/env node
/**
 * Upload plugin images to Convex storage
 * Usage: node upload-images.mjs <pluginId> <imageUrl>
 */

import { execSync } from 'child_process';

const pluginId = process.argv[2];
const imageUrl = process.argv[3];

if (!pluginId || !imageUrl) {
  console.error('Usage: node upload-images.mjs <pluginId> <imageUrl>');
  process.exit(1);
}

console.log(`Uploading image for plugin ${pluginId}...`);
console.log(`Image URL: ${imageUrl}`);

try {
  const result = execSync(
    `npx convex run storage:uploadFromUrl '${JSON.stringify({ url: imageUrl, pluginId })}'`,
    { cwd: process.cwd(), encoding: 'utf-8', timeout: 60000 }
  );
  console.log('Success:', result);
} catch (err) {
  console.error('Failed:', err.message);
  process.exit(1);
}

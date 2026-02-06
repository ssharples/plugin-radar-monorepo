#!/usr/bin/env node
/**
 * Script to find plugin images from Plugin Boutique
 * Usage: node find-plugin-images.mjs "Plugin Name" "Manufacturer"
 * Returns the image URL if found
 */

import https from 'https';
import http from 'http';

const pluginName = process.argv[2];
const manufacturer = process.argv[3];

if (!pluginName) {
  console.error('Usage: node find-plugin-images.mjs "Plugin Name" ["Manufacturer"]');
  process.exit(1);
}

const searchQuery = manufacturer 
  ? `${manufacturer} ${pluginName}`.replace(/\s+/g, '+')
  : pluginName.replace(/\s+/g, '+');

const searchUrl = `https://www.pluginboutique.com/search?q=${encodeURIComponent(searchQuery)}`;

function fetch(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

async function findImage() {
  try {
    // Try to search Plugin Boutique
    const searchResult = await fetch(searchUrl);
    
    // Look for product image URLs in the HTML
    const bannerMatches = searchResult.data.match(/https:\/\/banners\.pluginboutique\.com\/[a-z0-9]+/g);
    
    if (bannerMatches && bannerMatches.length > 0) {
      // Return the first unique image URL
      console.log(bannerMatches[0]);
      return;
    }
    
    // Look for product URLs to follow
    const productUrlMatch = searchResult.data.match(/\/products\/(\d+)-[^"'\s]+/);
    if (productUrlMatch) {
      const productUrl = `https://www.pluginboutique.com${productUrlMatch[0]}`;
      const productResult = await fetch(productUrl);
      
      const productBanners = productResult.data.match(/https:\/\/banners\.pluginboutique\.com\/[a-z0-9]+/g);
      if (productBanners && productBanners.length > 0) {
        console.log(productBanners[0]);
        return;
      }
    }
    
    console.error('No image found');
    process.exit(1);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

findImage();

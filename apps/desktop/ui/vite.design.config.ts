// Dev-only config for the design preview (design-preview.html).
// Swaps the real Convex client for fixture data so nothing hits the network.
import { defineConfig, mergeConfig } from 'vite';
import path from 'path';
import base from './vite.config';

const mock = path.resolve(__dirname, 'src/test/design/convex-client.design.ts');
const real = path.resolve(__dirname, 'src/api/convex-client');

export default mergeConfig(
  base,
  defineConfig({
    plugins: [
      {
        name: 'design-mock-convex',
        enforce: 'pre',
        async resolveId(source, importer) {
          if (!importer || importer === mock || !source.includes('convex-client')) return null;
          if (source.startsWith('.')) {
            const abs = path.resolve(path.dirname(importer), source).replace(/\.ts$/, '');
            if (abs === real) return mock;
          }
          return null;
        },
      },
    ],
    server: { port: 5199, strictPort: true },
  })
);

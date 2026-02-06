import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  plugins: [
    react(),
    viteSingleFile({
      removeViteModuleLoader: true,  // Remove module loader
    }),
    {
      name: 'remove-module-type',
      enforce: 'post',
      generateBundle(_, bundle) {
        for (const file of Object.values(bundle)) {
          if (file.type === 'asset' && file.fileName === 'index.html') {
            file.source = (file.source as string)
              .replace(/type="module"/g, '')
              .replace(/crossorigin/g, '');
          }
        }
      },
    },
  ],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    minify: 'esbuild',
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    target: 'es2015',  // Transpile to older JS
    rollupOptions: {
      output: {
        format: 'iife',  // Use IIFE, not ES modules
        manualChunks: undefined,
        inlineDynamicImports: true,
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})

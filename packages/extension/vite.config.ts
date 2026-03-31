import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { copyFileSync, cpSync, existsSync, mkdirSync } from 'fs'

function copyExtensionAssets() {
  return {
    name: 'copy-extension-assets',
    writeBundle() {
      const distDir = resolve(__dirname, 'dist')
      const manifestSource = resolve(__dirname, 'manifest.json')
      const manifestTarget = resolve(distDir, 'manifest.json')
      const iconsSource = resolve(__dirname, 'icons')
      const iconsTarget = resolve(distDir, 'icons')

      mkdirSync(distDir, { recursive: true })
      copyFileSync(manifestSource, manifestTarget)

      if (existsSync(iconsSource)) {
        cpSync(iconsSource, iconsTarget, { recursive: true })
      }
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), copyExtensionAssets()],
  build: {
    target: 'chrome112',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'sidepanel.html'),
        background: resolve(__dirname, 'src/background/service-worker.ts'),
        'content-script': resolve(__dirname, 'src/content/content-script.ts'),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === 'background' || chunk.name === 'content-script') {
            return '[name].js'
          }
          return 'assets/[name]-[hash].js'
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, '../shared/src'),
    },
  },
})

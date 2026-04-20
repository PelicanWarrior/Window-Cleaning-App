import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const versionFileName = 'version.txt'
const versionFilePath = resolve(__dirname, versionFileName)

function versionFilePlugin() {
  return {
    name: 'version-file-plugin',
    configureServer(server) {
      server.middlewares.use('/version.txt', (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          next()
          return
        }

        const requestUrl = req.url || ''
        const isViteModuleRequest = requestUrl.includes('?raw') || requestUrl.includes('&raw') || requestUrl.includes('?import') || requestUrl.includes('&import')
        if (isViteModuleRequest) {
          next()
          return
        }

        try {
          const source = readFileSync(versionFilePath, 'utf8')
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          res.setHeader('Cache-Control', 'no-store')
          res.statusCode = 200
          res.end(source)
        } catch {
          next()
        }
      })
    },
    generateBundle() {
      if (!existsSync(versionFilePath)) return

      this.emitFile({
        type: 'asset',
        fileName: versionFileName,
        source: readFileSync(versionFilePath, 'utf8')
      })
    }
  }
}

export default defineConfig({
  plugins: [
    react(),
    versionFilePlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-180.png', 'icon-192.png', 'icon-512.png', 'Logo.png'],
      manifest: false, // Use the public/manifest.json instead
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkOnly',
            options: {
              cacheName: 'supabase-network-only'
            }
          }
        ]
      }
    })
  ],
})

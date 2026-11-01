import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig, type Plugin } from 'vite'
import path from 'path'
import fs from 'fs'

// Central synchronization plugin for multi-device real-time testing across LAN/Wi-Fi
function centralSyncPlugin(): Plugin {
  const dataDir = path.resolve(import.meta.dirname, './data')
  const storeFile = path.resolve(dataDir, 'central-store.json')

  return {
    name: 'central-sync-plugin',
    configureServer(server) {
      server.middlewares.use('/api/sync', (req, res) => {
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true })
        }

        if (req.method === 'GET') {
          if (fs.existsSync(storeFile)) {
            try {
              const content = fs.readFileSync(storeFile, 'utf-8')
              res.setHeader('Content-Type', 'application/json')
              res.end(content || '{}')
              return
            } catch {
              // fallback
            }
          }
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ bookings: [], occupancies: [], payments: [] }))
          return
        }

        if (req.method === 'POST') {
          let body = ''
          req.on('data', (chunk: Buffer) => {
            body += chunk.toString()
          })
          req.on('end', () => {
            try {
              const data = JSON.parse(body)
              let current: { bookings?: unknown[]; occupancies?: unknown[]; payments?: unknown[] } = {
                bookings: [],
                occupancies: [],
                payments: [],
              }
              if (fs.existsSync(storeFile)) {
                try {
                  current = JSON.parse(fs.readFileSync(storeFile, 'utf-8'))
                } catch {
                  // ignore
                }
              }

              if (Array.isArray(data.bookings)) current.bookings = data.bookings
              if (Array.isArray(data.occupancies)) current.occupancies = data.occupancies
              if (Array.isArray(data.payments)) current.payments = data.payments

              fs.writeFileSync(storeFile, JSON.stringify(current, null, 2), 'utf-8')
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: true, timestamp: Date.now() }))
            } catch (err: unknown) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Invalid JSON' }))
            }
          })
          return
        }

        res.statusCode = 405
        res.end('Method Not Allowed')
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    centralSyncPlugin(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})

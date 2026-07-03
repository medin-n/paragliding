import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { spawn } from 'node:child_process'
import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(import.meta.url), '..')

// Re-run the IGC parser whenever anything in data/ changes, then reload the page
function flightData() {
  return {
    name: 'flight-data-watcher',
    configureServer(server) {
      const dataDir = resolve(root, 'data') + sep
      server.watcher.add(dataDir)
      let timer
      let running = false
      const rebuild = (file) => {
        if (!resolve(file).startsWith(dataDir)) return
        clearTimeout(timer)
        timer = setTimeout(() => {
          if (running) return
          running = true
          const p = spawn(process.execPath, [resolve(root, 'scripts', 'build-flights.mjs')], {
            stdio: 'inherit',
          })
          p.on('exit', (code) => {
            running = false
            if (code === 0) server.ws.send({ type: 'full-reload' })
          })
        }, 300)
      }
      for (const ev of ['add', 'change', 'unlink']) server.watcher.on(ev, rebuild)
    },
  }
}

export default defineConfig({
  plugins: [react(), flightData()],
})

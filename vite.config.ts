import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { execSync } from 'child_process'

function gitHashPlugin(): Plugin {
  const virtualId = 'virtual:git-hash'
  const resolvedId = '\0' + virtualId
  return {
    name: 'git-hash',
    resolveId(id) {
      if (id === virtualId) return resolvedId
    },
    load(id) {
      if (id !== resolvedId) return
      const hash = (() => {
        try { return execSync('git rev-parse --short HEAD').toString().trim() }
        catch { return 'dev' }
      })()
      return `export default ${JSON.stringify(hash)}`
    },
    handleHotUpdate({ server }) {
      const mod = server.moduleGraph.getModuleById(resolvedId)
      if (mod) server.moduleGraph.invalidateModule(mod)
    },
  }
}

export default defineConfig({
  plugins: [vue(), gitHashPlugin()],
  server: {
    port: 8080,
  },
})

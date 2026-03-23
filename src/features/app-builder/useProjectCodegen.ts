/**
 * Generates a complete, runnable Vite + Vue 3 + TypeScript project
 * from an AppProject definition.
 *
 * Output: Record<string, string>  (relative path → file content)
 *
 * Generated structure:
 *   package.json
 *   vite.config.ts
 *   tsconfig.json
 *   index.html
 *   src/main.ts
 *   src/App.vue
 *   src/lib/plexus.ts        ← typed streaming WebSocket client
 *   src/router/index.ts
 *   src/pages/{Name}.vue     ← one per page, real typed API calls
 *   src/style.css
 */

import type { AppProject, AppPage, AppBlock } from './types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function indent(s: string, n = 2): string {
  return s.split('\n').map(l => ' '.repeat(n) + l).join('\n')
}

function q(s: string): string { return `'${s}'` }

/** "myVar" → "my-var" */
function kebab(s: string): string {
  return s.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '')
}

// ─── package.json ─────────────────────────────────────────────────────────────

function genPackageJson(project: AppProject): string {
  return JSON.stringify({
    name:    project.packageName || 'my-app',
    private: true,
    version: '0.0.0',
    type:    'module',
    scripts: {
      dev:     'vite',
      build:   'vue-tsc -b && vite build',
      preview: 'vite preview',
    },
    dependencies: {
      vue:          '^3.5.13',
      'vue-router': '^4.5.0',
    },
    devDependencies: {
      '@vitejs/plugin-vue': '^5.2.1',
      typescript:           '^5.7.2',
      vite:                 '^7.0.0',
      'vue-tsc':            '^2.2.0',
    },
  }, null, 2)
}

// ─── vite.config.ts ───────────────────────────────────────────────────────────

function genViteConfig(): string {
  return `import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
})
`
}

// ─── tsconfig.json ────────────────────────────────────────────────────────────

function genTsConfig(): string {
  return JSON.stringify({
    files: [],
    references: [
      { path: './tsconfig.app.json' },
      { path: './tsconfig.node.json' },
    ],
  }, null, 2)
}

function genTsConfigApp(): string {
  return JSON.stringify({
    extends:         '@vue/tsconfig/tsconfig.dom.json',
    include:         ['env.d.ts', 'src/**/*', 'src/**/*.vue'],
    exclude:         ['src/**/__tests__/*'],
    compilerOptions: {
      tsBuildInfoFile: './node_modules/.tmp/tsconfig.app.tsbuildinfo',
      paths:           { '@/*': ['./src/*'] },
    },
  }, null, 2)
}

function genTsConfigNode(): string {
  return JSON.stringify({
    extends: '@tsconfig/node22/tsconfig.json',
    include: ['vite.config.*'],
    compilerOptions: {
      tsBuildInfoFile: './node_modules/.tmp/tsconfig.node.tsbuildinfo',
      module:          'ESNext',
      moduleResolution: 'Bundler',
    },
  }, null, 2)
}

// ─── index.html ───────────────────────────────────────────────────────────────

function genIndexHtml(project: AppProject): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${project.name}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`
}

// ─── src/main.ts ──────────────────────────────────────────────────────────────

function genMain(): string {
  return `import { createApp } from 'vue'
import { router } from './router'
import App from './App.vue'
import './style.css'

createApp(App).use(router).mount('#app')
`
}

// ─── src/style.css ────────────────────────────────────────────────────────────

function genStyleCss(): string {
  return `*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; background: #fff; color: #111827; }
a { color: inherit; text-decoration: none; }
`
}

// ─── src/App.vue ──────────────────────────────────────────────────────────────

function genAppVue(project: AppProject): string {
  const links = project.pages.map(p =>
    `    <RouterLink to="${p.route}">${p.title}</RouterLink>`
  ).join('\n')

  return `<template>
  <nav class="app-nav">
${links}
  </nav>
  <RouterView />
</template>

<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<style>
.app-nav {
  display: flex;
  gap: 20px;
  padding: 12px 24px;
  border-bottom: 1px solid #e5e7eb;
  font-size: 14px;
  font-weight: 500;
  background: #fff;
}
.app-nav a { color: #374151; }
.app-nav a:hover, .app-nav a.router-link-active { color: #2563eb; }
</style>
`
}

// ─── src/router/index.ts ──────────────────────────────────────────────────────

function genRouter(project: AppProject): string {
  const imports = project.pages.map(p =>
    `import ${p.name} from '../pages/${p.name}.vue'`
  ).join('\n')

  const routes = project.pages.map(p =>
    `  { path: ${q(p.route)}, component: ${p.name} },`
  ).join('\n')

  return `import { createRouter, createWebHistory } from 'vue-router'
${imports}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
${routes}
  ],
})
`
}

// ─── src/lib/plexus.ts ────────────────────────────────────────────────────────
// A minimal typed streaming WebSocket client — no deps required.

function genPlexusClient(): string {
  return `/**
 * Plexus RPC client — minimal streaming WebSocket transport.
 * Drop-in for projects generated by synapse-cc / plexus-gamma.
 */

export interface StreamItem<T = unknown> {
  type:    'data' | 'done' | 'error'
  content: T
}

type Waiter = {
  notify: () => void
  reject: (e: Error) => void
}

export class PlexusClient {
  private ws: WebSocket | null = null
  private queue: StreamItem<unknown>[][] = []
  private waiters: Array<Waiter | null> = []
  private closing = new Map<string, (() => void)>()
  private errors  = new Map<string, Error>()
  private msgId   = 0
  private _connected = false

  constructor(
    public readonly name: string,
    public readonly url:  string,
  ) {}

  connect(): Promise<void> {
    if (this._connected) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url)
      ws.onopen = () => {
        this.ws = ws
        this._connected = true
        resolve()
      }
      ws.onerror = () => reject(new Error(\`[plexus] connect failed: \${this.url}\`))
      ws.onmessage = ({ data }) => {
        try {
          const msg = JSON.parse(data as string)
          const { id, result, error } = msg
          const idx = Number(id) - 1
          const items  = this.queue[idx]
          const waiter = this.waiters[idx]
          if (!items) return
          if (error) {
            this.errors.set(id, new Error(error.message || 'RPC error'))
            this.closing.get(id)?.()
            return
          }
          if (result) {
            const { type, content } = result as StreamItem
            if (type === 'data') {
              items.push({ type: 'data', content })
              waiter?.notify()
            } else if (type === 'end' || type === 'done') {
              this.closing.get(id)?.()
            } else if (type === 'error') {
              this.errors.set(id, new Error(JSON.stringify(content)))
              this.closing.get(id)?.()
            }
          }
        } catch { /* ignore parse errors */ }
      }
    })
  }

  async *call<T = unknown>(method: string, params: Record<string, unknown> = {}): AsyncGenerator<StreamItem<T>> {
    await this.connect()
    const id  = String(++this.msgId)
    const idx = this.msgId - 1
    const buf: StreamItem<unknown>[] = []
    this.queue[idx]   = buf
    this.waiters[idx] = null
    let done = false

    this.closing.set(id, () => { done = true; this.waiters[idx]?.notify() })
    this.ws!.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))

    while (true) {
      if (buf.length > 0) {
        yield buf.shift() as StreamItem<T>
        continue
      }
      if (done) break
      const err = this.errors.get(id)
      if (err) throw err
      await new Promise<void>((res, rej) => {
        this.waiters[idx] = { notify: res, reject: rej }
      })
    }

    this.queue.splice(idx, 1)
    this.waiters.splice(idx, 1)
    this.closing.delete(id)
    this.errors.delete(id)
  }
}

const registry = new Map<string, PlexusClient>()

/** Get (or create) a shared client for a named backend. */
export function getClient(name: string, url: string): PlexusClient {
  if (!registry.has(name)) registry.set(name, new PlexusClient(name, url))
  return registry.get(name)!
}
`
}

// ─── Per-page Vue SFC ─────────────────────────────────────────────────────────

function varDecl(block: AppBlock): string {
  const v = block.varName
  switch (block.type) {
    case 'list':   return `const ${v} = ref<unknown[] | null>(null)`
    case 'stream': return `const ${v} = ref('')`
    case 'json':   return `const ${v} = ref<unknown>(null)`
    case 'button': return `const ${v}Loading = ref(false)\nconst ${v}Result = ref<unknown>(null)`
    case 'form':   return `const ${v}Params = ref('')\nconst ${v}Loading = ref(false)\nconst ${v}Result = ref<unknown>(null)`
    default:       return `const ${v} = ref<string | null>(null)`
  }
}

function mountCode(block: AppBlock): string {
  if (!block.binding) return ''
  const { backend, method, params } = block.binding
  const clientVar = `${backend}Client`
  const v = block.varName
  const paramsStr = Object.keys(params).length ? JSON.stringify(params) : '{}'

  switch (block.type) {
    case 'heading':
    case 'text':
    case 'json':
      return `  for await (const msg of ${clientVar}.call(${q(method)}, ${paramsStr})) {
    if (msg.type === 'data') ${v}.value = msg.content${block.type === 'json' ? '' : ' as string'}
    if (msg.type === 'done') break
  }`
    case 'list':
      return `  for await (const msg of ${clientVar}.call(${q(method)}, ${paramsStr})) {
    if (msg.type === 'data') {
      const data = msg.content
      ${v}.value = Array.isArray(data) ? data : (data as Record<string, unknown[]>).items ?? [data]
    }
    if (msg.type === 'done') break
  }`
    case 'stream':
      return `  ${v}.value = ''\n  for await (const msg of ${clientVar}.call(${q(method)}, ${paramsStr})) {
    if (msg.type === 'data') {
      const chunk = msg.content
      ${v}.value += typeof chunk === 'string' ? chunk : JSON.stringify(chunk)
    }
    if (msg.type === 'done') break
  }`
    default:
      return ''
  }
}

function templateBlock(block: AppBlock): string {
  const v = block.varName
  switch (block.type) {
    case 'heading': {
      const level = block.props.level ?? 2
      const align = block.props.align ? ` style="text-align:${block.props.align}"` : ''
      const content = block.binding ? `{{ ${v} ?? '' }}` : (block.props.label ?? 'Heading')
      return `    <h${level}${align}>${content}</h${level}>`
    }
    case 'text': {
      const align = block.props.align ? ` style="text-align:${block.props.align}"` : ''
      const content = block.binding ? `{{ ${v} ?? '' }}` : (block.props.label ?? '')
      return `    <p${align}>${content}</p>`
    }
    case 'list': {
      const field = block.props.listField as string | undefined
      const display = field
        ? `{{ typeof item === 'object' && item !== null ? (item as Record<string, unknown>).${field} ?? item : item }}`
        : `{{ item }}`
      return `    <ul v-if="${v}" class="plx-list">
      <li v-for="(item, i) in ${v}" :key="i" class="plx-list-item">${display}</li>
    </ul>
    <p v-else class="plx-loading">Loading…</p>`
    }
    case 'button': {
      const label = block.props.label ?? 'Click me'
      return `    <div>
      <button class="plx-btn" :disabled="${v}Loading" @click="${v}Click">
        {{ ${v}Loading ? 'Running…' : '${label}' }}
      </button>
      <pre v-if="${v}Result !== null" class="plx-result">{{ JSON.stringify(${v}Result, null, 2) }}</pre>
    </div>`
    }
    case 'form': {
      const label = block.props.label ?? 'Submit'
      return `    <form class="plx-form" @submit.prevent="${v}Submit">
      <textarea v-model="${v}Params" class="plx-form-ta" rows="3" placeholder="JSON params…" />
      <button class="plx-btn" type="submit" :disabled="${v}Loading">${label}</button>
      <pre v-if="${v}Result !== null" class="plx-result">{{ JSON.stringify(${v}Result, null, 2) }}</pre>
    </form>`
    }
    case 'stream': {
      const placeholder = block.props.placeholder ?? 'Waiting for stream…'
      return `    <div class="plx-stream">{{ ${v} || '${placeholder}' }}</div>`
    }
    case 'json': {
      return `    <pre v-if="${v} !== null" class="plx-json">{{ JSON.stringify(${v}, null, 2) }}</pre>
    <p v-else class="plx-loading">Loading…</p>`
    }
  }
}

/** Handler code for button/form click/submit — lives outside onMounted */
function handlerCode(block: AppBlock, project: AppProject): string {
  if (!block.binding) return ''
  const { backend, method, params } = block.binding
  const v = block.varName
  const paramsStr = Object.keys(params).length ? JSON.stringify(params) : '{}'
  const url = project.backends[backend] ?? 'ws://127.0.0.1:4444'

  if (block.type === 'button') {
    return `
async function ${v}Click() {
  ${v}Loading.value = true
  try {
    const client = getClient(${q(backend)}, ${q(url)})
    for await (const msg of client.call(${q(method)}, ${paramsStr})) {
      if (msg.type === 'data') { ${v}Result.value = msg.content; break }
      if (msg.type === 'done') break
    }
  } catch (e) { ${v}Result.value = String(e) }
  finally { ${v}Loading.value = false }
}`
  }
  if (block.type === 'form') {
    return `
async function ${v}Submit() {
  ${v}Loading.value = true
  try {
    let p: Record<string, unknown> = ${paramsStr}
    try { p = { ...p, ...JSON.parse(${v}Params.value || '{}') } } catch { /* ignore */ }
    const client = getClient(${q(backend)}, ${q(url)})
    for await (const msg of client.call(${q(method)}, p)) {
      if (msg.type === 'data') { ${v}Result.value = msg.content; break }
      if (msg.type === 'done') break
    }
  } catch (e) { ${v}Result.value = String(e) }
  finally { ${v}Loading.value = false }
}`
  }
  return ''
}

function genPageVue(page: AppPage, project: AppProject): string {
  // Which backends are needed for onMounted calls (non-interactive blocks)
  const mountBackends = new Set<string>()
  const allBackends   = new Set<string>()
  for (const b of page.blocks) {
    if (!b.binding) continue
    allBackends.add(b.binding.backend)
    if (b.type !== 'button' && b.type !== 'form') mountBackends.add(b.binding.backend)
  }

  // Client declarations (all backends used on this page)
  const clientDecls = [...allBackends].map(bk => {
    const url = project.backends[bk] ?? 'ws://127.0.0.1:4444'
    return `const ${bk}Client = getClient(${q(bk)}, ${q(url)})`
  })

  // Reactive variable declarations
  const reactiveDecls = page.blocks.map(varDecl).filter(Boolean)

  // onMounted body
  const mountLines = page.blocks
    .map(b => mountCode(b))
    .filter(Boolean)

  // Handler functions (button/form)
  const handlers = page.blocks
    .map(b => handlerCode(b, project))
    .filter(Boolean)

  // Template body
  const tmplBlocks = page.blocks.map(templateBlock)

  const needsOnMounted = mountLines.length > 0
  const hasHandlers    = handlers.length > 0
  const needsImports   = reactiveDecls.length > 0 || needsOnMounted

  const scriptParts: string[] = []
  if (needsImports || allBackends.size > 0) {
    const vueImports: string[] = []
    if (reactiveDecls.length) vueImports.push('ref')
    if (needsOnMounted)       vueImports.push('onMounted')
    const imports: string[] = []
    if (vueImports.length) imports.push(`import { ${vueImports.join(', ')} } from 'vue'`)
    if (allBackends.size)  imports.push(`import { getClient } from '../lib/plexus'`)
    scriptParts.push(imports.join('\n'))
  }

  if (clientDecls.length) scriptParts.push(clientDecls.join('\n'))
  if (reactiveDecls.length) scriptParts.push(reactiveDecls.join('\n'))
  if (hasHandlers) scriptParts.push(...handlers)

  if (needsOnMounted) {
    scriptParts.push(`onMounted(async () => {\n${mountLines.map(l => indent(l, 0)).join('\n')}\n})`)
  }

  return `<template>
  <div class="${kebab(page.name)}-page page">
    <h1 class="page-title">${page.title}</h1>

${tmplBlocks.map(b => indent(b, 2)).join('\n\n')}
  </div>
</template>

<script setup lang="ts">
${scriptParts.join('\n\n')}
</script>

<style scoped>
.page { max-width: 1024px; margin: 0 auto; padding: 32px 24px; }
.page-title { font-size: 2rem; font-weight: 700; margin: 0 0 32px; color: #111; }
.plx-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.plx-list-item { padding: 12px 16px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 14px; }
.plx-btn { cursor: pointer; background: #2563eb; color: #fff; border: none; border-radius: 6px; padding: 10px 24px; font-size: 14px; font-weight: 600; font-family: inherit; }
.plx-btn:hover:not(:disabled) { background: #1d4ed8; }
.plx-btn:disabled { opacity: 0.5; cursor: default; }
.plx-form { display: flex; flex-direction: column; gap: 8px; max-width: 480px; }
.plx-form-ta { font-family: monospace; font-size: 13px; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; resize: vertical; }
.plx-result { font-family: monospace; font-size: 12px; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; overflow: auto; white-space: pre-wrap; }
.plx-stream { font-size: 14px; line-height: 1.7; white-space: pre-wrap; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; min-height: 80px; }
.plx-json { font-family: monospace; font-size: 12px; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; overflow: auto; }
.plx-loading { color: #9ca3af; font-size: 14px; }
</style>
`
}

// ─── Main entry ───────────────────────────────────────────────────────────────

export function generateProject(project: AppProject): Record<string, string> {
  const files: Record<string, string> = {}

  files['package.json']      = genPackageJson(project)
  files['vite.config.ts']    = genViteConfig()
  files['tsconfig.json']     = genTsConfig()
  files['tsconfig.app.json'] = genTsConfigApp()
  files['tsconfig.node.json']= genTsConfigNode()
  files['index.html']        = genIndexHtml(project)
  files['src/main.ts']       = genMain()
  files['src/style.css']     = genStyleCss()
  files['src/App.vue']       = genAppVue(project)
  files['src/router/index.ts']  = genRouter(project)
  files['src/lib/plexus.ts'] = genPlexusClient()

  for (const page of project.pages) {
    files[`src/pages/${page.name}.vue`] = genPageVue(page, project)
  }

  return files
}

// ─── Write to disk via File System Access API ─────────────────────────────────

export async function writeProjectToDisk(project: AppProject): Promise<void> {
  if (!('showDirectoryPicker' in window)) {
    downloadProjectJson(project)
    return
  }
  const files = generateProject(project)
  // @ts-expect-error — File System Access API not yet in all TS libs
  const dir: FileSystemDirectoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' })

  for (const [path, content] of Object.entries(files)) {
    const parts = path.split('/')
    let cur = dir
    for (const part of parts.slice(0, -1)) {
      cur = await cur.getDirectoryHandle(part, { create: true })
    }
    const name = parts[parts.length - 1]!
    const fh = await cur.getFileHandle(name, { create: true })
    const w  = await fh.createWritable()
    await w.write(content)
    await w.close()
  }
}

/** Fallback: download a JSON manifest; user can restore with a script */
export function downloadProjectJson(project: AppProject): void {
  const files = generateProject(project)
  const blob  = new Blob([JSON.stringify({ project, files }, null, 2)], { type: 'application/json' })
  const url   = URL.createObjectURL(blob)
  const a     = document.createElement('a')
  a.href     = url
  a.download = (project.packageName || 'app') + '-project.json'
  a.click()
  URL.revokeObjectURL(url)
}

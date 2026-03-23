<template>
  <div class="claude-chat">

    <!-- Session setup (no session yet) -->
    <div v-if="!state.sessionId && !initializing" class="cc-setup">
      <div class="cc-setup-icon">✦</div>
      <div class="cc-setup-title">Claude Code</div>
      <div class="cc-setup-desc">
        Talk to Claude to build your Vue app. Claude will write real
        <code>.vue</code> files in a working directory using your connected backends.
      </div>

      <div class="cc-setup-field">
        <label>Working directory</label>
        <input
          v-model="workingDirInput"
          class="cc-input"
          placeholder="/tmp/my-app"
          @keydown.enter="startSession"
        />
        <div class="cc-setup-hint">
          Claude writes files here. Run <code>cd ~/.plexus/apps/… && bun install && bun run dev</code> after.
        </div>
      </div>

      <div class="cc-setup-field">
        <label>Backend</label>
        <select v-model="selectedBackendName" class="cc-select">
          <option v-for="c in connections" :key="c.name" :value="c.name">
            {{ c.name }} ({{ c.url }})
          </option>
        </select>
        <div v-if="!connections.length" class="cc-setup-hint cc-warn">
          No backends connected — connect to a substrate first
        </div>
      </div>

      <button
        class="cc-start-btn"
        :disabled="!workingDirInput || !selectedBackendName"
        @click="startSession"
      >
        Start session
      </button>
      <div v-if="state.error" class="cc-error">{{ state.error }}</div>
    </div>

    <!-- Initializing -->
    <div v-else-if="initializing" class="cc-init">
      <span class="cc-spinner">⊙</span> Starting Claude Code session…
    </div>

    <!-- Active chat -->
    <template v-else>
      <!-- Header -->
      <div class="cc-header">
        <span class="cc-header-label">✦ Claude Code</span>
        <span class="cc-header-dir" :title="state.workingDir">{{ shortDir(state.workingDir) }}</span>
        <div class="cc-header-spacer" />
        <button class="cc-icon-btn" title="New session" @click="newSession">↺</button>
      </div>

      <!-- Messages -->
      <div class="cc-messages" ref="messagesEl">
        <div
          v-for="msg in state.messages"
          :key="msg.id"
          class="cc-msg"
          :class="msg.role"
        >
          <!-- User message -->
          <template v-if="msg.role === 'user'">
            <div class="cc-bubble cc-user-bubble">{{ msg.text }}</div>
          </template>

          <!-- Assistant message -->
          <template v-else>
            <!-- Thinking block -->
            <details v-if="msg.thinking" class="cc-thinking">
              <summary class="cc-thinking-summary">
                <span class="cc-thinking-icon">◎</span> Thinking
              </summary>
              <pre class="cc-thinking-body">{{ msg.thinking }}</pre>
            </details>

            <!-- Tool calls -->
            <div
              v-for="tool in msg.tools"
              :key="tool.id"
              class="cc-tool"
              :class="{ done: tool.done, error: tool.isError }"
            >
              <div class="cc-tool-header">
                <span class="cc-tool-icon">{{ tool.done ? (tool.isError ? '✗' : '✓') : '⋯' }}</span>
                <span class="cc-tool-name">{{ formatToolName(tool.name) }}</span>
                <span v-if="tool.name === 'Write' || tool.name === 'Edit'" class="cc-tool-path">
                  {{ extractPath(tool.input) }}
                </span>
              </div>
              <details v-if="showToolDetail(tool)" class="cc-tool-detail">
                <summary class="cc-tool-detail-sum">input</summary>
                <pre class="cc-tool-detail-pre">{{ JSON.stringify(tool.input, null, 2) }}</pre>
              </details>
              <div v-if="tool.isError && tool.output" class="cc-tool-error">{{ tool.output }}</div>
            </div>

            <!-- Text content -->
            <div v-if="msg.text" class="cc-bubble cc-assistant-bubble">
              <MarkdownText :text="msg.text" />
              <span v-if="!msg.done" class="cc-cursor">▌</span>
            </div>

            <div v-else-if="!msg.done && !msg.tools.length" class="cc-bubble cc-assistant-bubble cc-thinking-pulse">
              <span class="cc-cursor">▌</span>
            </div>
          </template>
        </div>

        <div v-if="state.error" class="cc-error-msg">{{ state.error }}</div>
      </div>

      <!-- Input -->
      <div class="cc-input-bar">
        <textarea
          ref="inputEl"
          v-model="inputText"
          class="cc-textarea"
          :placeholder="state.streaming ? 'Claude is thinking…' : 'Describe what to build…'"
          :disabled="state.streaming"
          rows="1"
          @keydown="onKey"
          @input="autoResize"
        />
        <button
          class="cc-send-btn"
          :disabled="!inputText.trim() || state.streaming"
          @click="send"
        >
          {{ state.streaming ? '…' : '↑' }}
        </button>
      </div>
    </template>

  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, h, defineComponent } from 'vue'
import { useClaudeChat } from './useClaudeChat'
import { useBackends } from '../../lib/useBackends'
import type { AppProject } from './types'
import type { MethodEntry } from '../../components/CommandPalette.vue'
import type { ToolCall } from './useClaudeChat'

const props = defineProps<{
  project:     AppProject
  methods:     MethodEntry[]
}>()

const { state, createSession, sendMessage, clearChat } = useClaudeChat()
const { connections } = useBackends()

const initializing       = ref(false)
const workingDirInput    = ref(`~/.plexus/apps/${props.project.packageName || 'my-app'}`)
const selectedBackendName = ref(connections.value[0]?.name ?? 'substrate')
const inputText          = ref('')
const messagesEl         = ref<HTMLElement | null>(null)
const inputEl            = ref<HTMLTextAreaElement | null>(null)

// Auto-scroll to bottom on new message content
watch(
  () => state.messages.map(m => m.text + m.tools.length).join(''),
  () => nextTick(() => {
    if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight
  })
)

// Update workingDir when project name changes
watch(() => props.project.packageName, pkg => {
  if (!state.sessionId) workingDirInput.value = `/tmp/${pkg || 'my-app'}`
})

async function startSession() {
  if (!workingDirInput.value || !selectedBackendName.value) return
  initializing.value = true

  const conn = connections.value.find(c => c.name === selectedBackendName.value)
  if (!conn) { initializing.value = false; return }

  await createSession(conn.url, workingDirInput.value, props.project, props.methods, conn.name)
  initializing.value = false
}

function newSession() {
  clearChat()
  workingDirInput.value = `~/.plexus/apps/${props.project.packageName || 'my-app'}`
}

async function send() {
  const text = inputText.value.trim()
  if (!text || state.streaming) return
  inputText.value = ''
  await nextTick(() => { if (inputEl.value) { inputEl.value.style.height = 'auto' } })

  const conn = connections.value.find(c => c.name === selectedBackendName.value)
               ?? connections.value[0]
  if (!conn) return

  await sendMessage(text, conn.url, conn.name)
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

function autoResize(e: Event) {
  const ta = e.target as HTMLTextAreaElement
  ta.style.height = 'auto'
  ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'
}

// ─── Display helpers ──────────────────────────────────────────────────────────

function shortDir(path: string): string {
  const parts = path.split('/')
  return parts.slice(-2).join('/')
}

function formatToolName(name: string): string {
  const map: Record<string, string> = {
    Write:       '📝 Write',
    Edit:        '✏️  Edit',
    Bash:        '$ Bash',
    Read:        '👁 Read',
    Glob:        '🔍 Glob',
    Grep:        '🔍 Grep',
    WebFetch:    '🌐 Fetch',
    WebSearch:   '🌐 Search',
    TodoRead:    '📋 Todos',
    TodoWrite:   '📋 Update todos',
  }
  return map[name] ?? `⚙ ${name}`
}

function extractPath(input: unknown): string {
  if (typeof input === 'object' && input !== null) {
    const obj = input as Record<string, unknown>
    return (obj['file_path'] ?? obj['path'] ?? '') as string
  }
  return ''
}

function showToolDetail(tool: ToolCall): boolean {
  if (!tool.done) return false
  const noDetail = ['Write', 'Edit', 'Read', 'Glob', 'Grep']
  return !noDetail.includes(tool.name)
}

// ─── Minimal markdown renderer (code blocks + bold + inline code) ─────────────

const MarkdownText = defineComponent({
  props: { text: { type: String, required: true } },
  render() {
    return h('div', { class: 'cc-markdown' }, renderMarkdown(this.text))
  },
})

function renderMarkdown(text: string): ReturnType<typeof h>[] {
  const parts: ReturnType<typeof h>[] = []
  const codeBlockRe = /```(\w*)\n?([\s\S]*?)```/g
  let last = 0, m: RegExpExecArray | null
  while ((m = codeBlockRe.exec(text)) !== null) {
    if (m.index > last) parts.push(...renderInline(text.slice(last, m.index)))
    parts.push(h('pre', { class: 'cc-code-block' }, [
      h('code', { class: m[1] ? `language-${m[1]}` : '' }, m[2]?.trimEnd() ?? '')
    ]))
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(...renderInline(text.slice(last)))
  return parts
}

function renderInline(text: string): ReturnType<typeof h>[] {
  const parts: ReturnType<typeof h>[] = []
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\n)/g
  let last = 0, m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(h('span', text.slice(last, m.index)))
    if (m[0] === '\n') parts.push(h('br'))
    else if (m[0].startsWith('`'))  parts.push(h('code',   { class: 'cc-inline-code' }, m[0].slice(1, -1)))
    else if (m[0].startsWith('**')) parts.push(h('strong', {}, m[0].slice(2, -2)))
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(h('span', text.slice(last)))
  return parts
}
</script>

<style scoped>
.claude-chat {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-0);
  font-family: 'Berkeley Mono', 'Fira Code', ui-monospace, monospace;
  font-size: 12px;
}

/* ── Setup screen ─────────────────────────────────────────────── */
.cc-setup {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 24px;
  gap: 16px;
  max-width: 400px;
  margin: 0 auto;
  width: 100%;
}
.cc-setup-icon  { font-size: 28px; color: var(--accent); }
.cc-setup-title { font-size: 16px; font-weight: 700; color: var(--text-2); font-family: system-ui; }
.cc-setup-desc  { font-size: 12px; color: var(--text-muted); text-align: center; line-height: 1.6; font-family: system-ui; }
.cc-setup-desc code { background: var(--bg-3); padding: 1px 5px; border-radius: 3px; font-family: monospace; }
.cc-setup-field { display: flex; flex-direction: column; gap: 4px; width: 100%; }
.cc-setup-field label { font-size: 10px; font-weight: 600; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.06em; }
.cc-setup-hint { font-size: 10px; color: var(--text-dim); font-family: system-ui; }
.cc-setup-hint code { font-family: monospace; background: var(--bg-3); padding: 1px 4px; border-radius: 3px; }
.cc-warn { color: var(--yellow) !important; }
.cc-input, .cc-select {
  background: var(--bg-2); border: 1px solid var(--border-2); border-radius: 6px;
  color: var(--text-2); font-size: 12px; padding: 8px 10px; outline: none; font-family: monospace;
  width: 100%; box-sizing: border-box;
}
.cc-select { font-family: system-ui; }
.cc-input:focus, .cc-select:focus { border-color: var(--accent); }
.cc-start-btn {
  background: var(--accent); color: #fff; border: none; border-radius: 6px;
  padding: 9px 20px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: system-ui;
  width: 100%;
}
.cc-start-btn:hover:not(:disabled) { opacity: 0.88; }
.cc-start-btn:disabled { opacity: 0.4; cursor: default; }
.cc-error { color: var(--red); font-size: 11px; font-family: system-ui; text-align: center; }

/* ── Initializing ─────────────────────────────────────────────── */
.cc-init {
  flex: 1; display: flex; align-items: center; justify-content: center;
  color: var(--text-dim); gap: 8px; font-family: system-ui;
}
.cc-spinner { animation: spin 1.2s linear infinite; display: inline-block; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Header ───────────────────────────────────────────────────── */
.cc-header {
  display: flex; align-items: center; gap: 8px; padding: 8px 12px;
  border-bottom: 1px solid var(--border); background: var(--bg-1); flex-shrink: 0;
}
.cc-header-label { font-size: 11px; font-weight: 700; color: var(--accent); }
.cc-header-dir   { font-size: 10px; color: var(--text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; }
.cc-header-spacer { flex: 1; }
.cc-icon-btn { background: none; border: none; color: var(--text-dim); cursor: pointer; font-size: 14px; padding: 2px 5px; border-radius: 3px; }
.cc-icon-btn:hover { background: var(--bg-3); color: var(--text-2); }

/* ── Messages ─────────────────────────────────────────────────── */
.cc-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cc-msg { display: flex; flex-direction: column; gap: 6px; }
.cc-msg.user  { align-items: flex-end; }
.cc-msg.assistant { align-items: flex-start; }

.cc-bubble {
  max-width: 85%;
  padding: 10px 13px;
  border-radius: 10px;
  font-size: 12px;
  line-height: 1.65;
  word-break: break-word;
}
.cc-user-bubble {
  background: var(--accent);
  color: #fff;
  border-radius: 10px 10px 2px 10px;
  font-family: system-ui;
}
.cc-assistant-bubble {
  background: var(--bg-2);
  border: 1px solid var(--border);
  color: var(--text-2);
  border-radius: 10px 10px 10px 2px;
  font-family: system-ui;
}
.cc-thinking-pulse { min-width: 40px; }

/* Thinking block */
.cc-thinking {
  max-width: 85%;
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  font-size: 11px;
}
.cc-thinking-summary {
  display: flex; align-items: center; gap: 5px; padding: 6px 10px;
  cursor: pointer; color: var(--text-dim); list-style: none; user-select: none;
}
.cc-thinking-summary::-webkit-details-marker { display: none; }
.cc-thinking-summary:hover { color: var(--text-2); }
.cc-thinking-icon { color: var(--accent); }
.cc-thinking-body { margin: 0; padding: 8px 12px; font-size: 11px; color: var(--text-dim); white-space: pre-wrap; line-height: 1.5; }

/* Tool calls */
.cc-tool {
  max-width: 85%;
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  font-size: 11px;
}
.cc-tool.done    { border-color: var(--border); }
.cc-tool.error   { border-color: var(--red); }
.cc-tool-header  { display: flex; align-items: center; gap: 6px; padding: 6px 10px; background: var(--bg-2); }
.cc-tool-icon    { font-size: 12px; }
.cc-tool.done:not(.error) .cc-tool-icon { color: var(--green); }
.cc-tool.error .cc-tool-icon { color: var(--red); }
.cc-tool-name    { font-weight: 600; color: var(--text-2); }
.cc-tool-path    { color: var(--accent); font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.cc-tool-error   { padding: 4px 10px 6px; color: var(--red); font-size: 10px; white-space: pre-wrap; }
.cc-tool-detail  { }
.cc-tool-detail-sum { padding: 4px 10px; cursor: pointer; color: var(--text-dim); font-size: 10px; list-style: none; }
.cc-tool-detail-sum::-webkit-details-marker { display: none; }
.cc-tool-detail-pre { margin: 0; padding: 6px 12px 8px; font-size: 10px; color: var(--text-dim); white-space: pre-wrap; overflow: auto; max-height: 200px; }

.cc-cursor { animation: blink 1s step-end infinite; color: var(--accent); }
@keyframes blink { 50% { opacity: 0; } }

.cc-error-msg { color: var(--red); font-size: 11px; padding: 6px 0; font-family: system-ui; }

/* ── Input bar ─────────────────────────────────────────────────── */
.cc-input-bar {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  padding: 10px 12px;
  border-top: 1px solid var(--border);
  background: var(--bg-1);
  flex-shrink: 0;
}
.cc-textarea {
  flex: 1;
  background: var(--bg-2);
  border: 1px solid var(--border-2);
  border-radius: 8px;
  color: var(--text-2);
  font-size: 12px;
  padding: 8px 10px;
  outline: none;
  font-family: system-ui;
  resize: none;
  line-height: 1.5;
  min-height: 36px;
  max-height: 140px;
  overflow-y: auto;
  box-sizing: border-box;
}
.cc-textarea:focus { border-color: var(--accent); }
.cc-textarea::placeholder { color: var(--text-dim); }
.cc-textarea:disabled { opacity: 0.5; }
.cc-send-btn {
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 8px;
  width: 34px;
  height: 34px;
  font-size: 16px;
  cursor: pointer;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cc-send-btn:hover:not(:disabled) { opacity: 0.85; }
.cc-send-btn:disabled { opacity: 0.35; cursor: default; }

/* ── Markdown in assistant bubbles ─────────────────────────────── */
:deep(.cc-markdown) { font-family: system-ui; }
:deep(.cc-code-block) {
  background: var(--bg-0);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 10px 12px;
  overflow-x: auto;
  font-family: monospace;
  font-size: 11px;
  line-height: 1.5;
  margin: 6px 0;
  white-space: pre;
}
:deep(.cc-inline-code) {
  background: var(--bg-3);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 11px;
  font-family: monospace;
}
</style>

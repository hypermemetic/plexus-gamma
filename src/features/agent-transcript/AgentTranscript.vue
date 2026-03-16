<template>
  <div v-if="props.method.name === 'chat'" class="agent-transcript">
    <!-- Toggle button -->
    <button class="chat-toggle" :class="{ open: panelOpen }" @click="panelOpen = !panelOpen">
      Chat {{ panelOpen ? '▾' : '▸' }}
    </button>

    <div v-if="panelOpen" class="chat-panel">
      <!-- Session bar -->
      <div class="session-bar">
        <label class="session-label" for="at-session-name">session:</label>
        <input
          id="at-session-name"
          v-model="sessionName"
          class="session-input"
          placeholder="gamma-test"
          spellcheck="false"
        />
        <button class="new-session-btn" @click="newSession" title="Start new session">new</button>
      </div>

      <!-- Message thread -->
      <div class="thread" ref="threadRef">
        <div v-if="messages.length === 0 && !thinking" class="thread-empty">
          No messages yet. Send a prompt to begin.
        </div>

        <template v-for="(msg, i) in messages" :key="i">
          <!-- User bubble -->
          <div v-if="msg.role === 'user'" class="bubble-row user-row">
            <div class="bubble user-bubble">
              <div class="bubble-text">{{ msg.text }}</div>
              <button class="raw-toggle" @click="msg.showRaw = !msg.showRaw">
                {{ msg.showRaw ? 'text' : 'raw' }}
              </button>
              <pre v-if="msg.showRaw" class="raw-json">{{ JSON.stringify(msg.rawContent, null, 2) }}</pre>
            </div>
          </div>

          <!-- Assistant bubble -->
          <div v-else-if="msg.role === 'assistant'" class="bubble-row assistant-row">
            <div class="bubble assistant-bubble">
              <div class="bubble-text">{{ msg.text }}</div>
              <button class="raw-toggle" @click="msg.showRaw = !msg.showRaw">
                {{ msg.showRaw ? 'text' : 'raw' }}
              </button>
              <pre v-if="msg.showRaw" class="raw-json">{{ JSON.stringify(msg.rawContent, null, 2) }}</pre>
            </div>
          </div>

          <!-- Tool-use block -->
          <div v-else-if="msg.role === 'tool_use'" class="tool-block">
            <button class="tool-header" @click="msg.expanded = !msg.expanded">
              <span class="tool-icon">⚙</span>
              <code class="tool-name">{{ msg.toolName }}</code>
              <span class="tool-chevron">{{ msg.expanded ? '▾' : '▸' }}</span>
            </button>
            <div v-if="msg.expanded" class="tool-body">
              <pre class="tool-json">{{ JSON.stringify(msg.toolInput, null, 2) }}</pre>
            </div>
          </div>

          <!-- Progress line -->
          <div v-else-if="msg.role === 'progress'" class="progress-line">
            {{ msg.text }}
          </div>

          <!-- Error bubble -->
          <div v-else-if="msg.role === 'error'" class="error-bubble">
            {{ msg.text }}
          </div>

          <!-- Done marker -->
          <div v-else-if="msg.role === 'done'" class="done-marker">&#10003;</div>
        </template>

        <!-- Thinking indicator -->
        <div v-if="thinking" class="thinking-row">
          <div class="thinking-bubble">
            <span class="thinking-spinner">◌</span>
            <span class="thinking-label">{{ sessionId ? `[${sessionId}] ` : '' }}thinking…</span>
          </div>
        </div>

        <!-- Usage footer -->
        <div v-if="usageText" class="usage-footer">{{ usageText }}</div>
      </div>

      <!-- Input bar -->
      <div class="input-bar">
        <textarea
          v-model="promptInput"
          class="prompt-input"
          placeholder="Type a prompt…"
          rows="2"
          spellcheck="false"
          :disabled="running"
          @keydown.ctrl.enter.prevent="send"
        />
        <div class="input-actions">
          <button
            class="send-btn"
            :class="{ running }"
            :disabled="running || promptInput.trim() === ''"
            @click="send"
            title="Send (Ctrl+Enter)"
          >
            <span v-if="running">◌</span>
            <span v-else>&#9658;</span>
            Send
          </button>
          <button v-if="running" class="cancel-btn" @click="cancelFlag = true" title="Stop">&#9632;</button>
          <button class="clear-btn" @click="clearThread" title="Clear thread">clear</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, nextTick } from 'vue'
import type { PlexusRpcClient } from '../../lib/plexus/transport'
import type { MethodSchema } from '../../plexus-schema'

// ─── Props ──────────────────────────────────────────────────────────────────

const props = defineProps<{
  method: MethodSchema
  namespace: string
  backendName: string
}>()

// ─── Injected RPC client ────────────────────────────────────────────────────

const rpc = inject<PlexusRpcClient>('rpc')!

// ─── Agent content payload types ─────────────────────────────────────────────

interface AgentContentText {
  type: 'text'
  text?: string
}

interface AgentContentChunk {
  type: 'chunk'
  text?: string
}

interface AgentContentStart {
  type: 'start'
  id?: string
}

interface AgentContentComplete {
  type: 'complete'
  usage?: {
    input_tokens?: number
    output_tokens?: number
  }
}

interface AgentContentError {
  type: 'error'
  message?: string
}

interface AgentContentToolUse {
  type: 'tool_use'
  name?: string
  input?: unknown
}

type AgentContent =
  | AgentContentText
  | AgentContentChunk
  | AgentContentStart
  | AgentContentComplete
  | AgentContentError
  | AgentContentToolUse
  | Record<string, unknown>

// ─── Message types ─────────────────────────────────────────────────────────

interface UserMessage {
  role: 'user'
  text: string
  rawContent: unknown
  showRaw: boolean
}

interface AssistantMessage {
  role: 'assistant'
  text: string
  rawContent: unknown
  showRaw: boolean
}

interface ToolUseMessage {
  role: 'tool_use'
  toolName: string
  toolInput: unknown
  expanded: boolean
}

interface ProgressMessage {
  role: 'progress'
  text: string
}

interface ErrorMessage {
  role: 'error'
  text: string
}

interface DoneMessage {
  role: 'done'
}

type ChatMessage =
  | UserMessage
  | AssistantMessage
  | ToolUseMessage
  | ProgressMessage
  | ErrorMessage
  | DoneMessage

// ─── State ─────────────────────────────────────────────────────────────────

const panelOpen    = ref(false)
const sessionName  = ref('gamma-test')
const promptInput  = ref('')
const running      = ref(false)
const cancelFlag   = ref(false)
const thinking     = ref(false)
const sessionId    = ref<string | null>(null)
const usageText    = ref<string | null>(null)
const messages     = ref<ChatMessage[]>([])
const threadRef    = ref<HTMLElement | null>(null)

// ─── Computed ───────────────────────────────────────────────────────────────

const fullPath = computed(() => {
  const ns = props.namespace === '' ? props.backendName : props.namespace
  return `${ns}.${props.method.name}`
})

// ─── Helpers ────────────────────────────────────────────────────────────────

function scrollToBottom(): void {
  nextTick(() => {
    if (threadRef.value) {
      threadRef.value.scrollTop = threadRef.value.scrollHeight
    }
  })
}

function newSession(): void {
  // Generate a short random suffix
  const suffix = Math.random().toString(36).slice(2, 7)
  sessionName.value = `session-${suffix}`
  clearThread()
}

function clearThread(): void {
  messages.value = []
  sessionId.value = null
  usageText.value = null
  thinking.value = false
}

// Get the last assistant message, creating one if the last message is not assistant
function ensureAssistantBubble(): AssistantMessage {
  const last = messages.value[messages.value.length - 1]
  if (last !== undefined && last.role === 'assistant') {
    return last as AssistantMessage
  }
  const bubble: AssistantMessage = {
    role: 'assistant',
    text: '',
    rawContent: null,
    showRaw: false,
  }
  messages.value.push(bubble)
  return bubble
}

function coerceAgentContent(raw: unknown): AgentContent {
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as AgentContent
  }
  return { type: 'unknown' }
}

// ─── Send ───────────────────────────────────────────────────────────────────

async function send(): Promise<void> {
  const prompt = promptInput.value.trim()
  if (!prompt || running.value) return

  const name = sessionName.value.trim() || 'gamma-test'

  // Push user bubble
  const userMsg: UserMessage = {
    role: 'user',
    text: prompt,
    rawContent: { name, prompt },
    showRaw: false,
  }
  messages.value.push(userMsg)
  promptInput.value = ''
  usageText.value = null
  scrollToBottom()

  running.value = true
  cancelFlag.value = false
  thinking.value = true

  try {
    for await (const item of rpc.call(fullPath.value, { name, prompt })) {
      if (cancelFlag.value) break

      if (item.type === 'data') {
        const content = coerceAgentContent(item.content)
        const contentType = (content as Record<string, unknown>)['type'] as string | undefined

        if (contentType === 'start') {
          const startContent = content as AgentContentStart
          sessionId.value = startContent.id ?? null
          thinking.value = true
          scrollToBottom()
        } else if (contentType === 'text' || contentType === 'chunk') {
          thinking.value = false
          const textContent = content as AgentContentText | AgentContentChunk
          const bubble = ensureAssistantBubble()
          bubble.text += textContent.text ?? ''
          bubble.rawContent = item.content
          scrollToBottom()
        } else if (contentType === 'complete') {
          thinking.value = false
          const completeContent = content as AgentContentComplete
          if (completeContent.usage) {
            const inp = completeContent.usage.input_tokens
            const out = completeContent.usage.output_tokens
            const parts: string[] = []
            if (inp !== undefined) parts.push(`${inp} in`)
            if (out !== undefined) parts.push(`${out} out`)
            if (parts.length > 0) {
              usageText.value = `tokens: ${parts.join(', ')}`
            }
          }
          scrollToBottom()
        } else if (contentType === 'error') {
          thinking.value = false
          const errContent = content as AgentContentError
          const errMsg: ErrorMessage = {
            role: 'error',
            text: errContent.message ?? 'Unknown error',
          }
          messages.value.push(errMsg)
          scrollToBottom()
        } else if (contentType === 'tool_use') {
          thinking.value = false
          const toolContent = content as AgentContentToolUse
          const toolMsg: ToolUseMessage = {
            role: 'tool_use',
            toolName: toolContent.name ?? 'unknown_tool',
            toolInput: toolContent.input ?? null,
            expanded: false,
          }
          messages.value.push(toolMsg)
          scrollToBottom()
        } else {
          // Unknown data — show as assistant text fallback
          thinking.value = false
          const bubble = ensureAssistantBubble()
          bubble.rawContent = item.content
          scrollToBottom()
        }
      } else if (item.type === 'progress') {
        const progMsg: ProgressMessage = {
          role: 'progress',
          text: item.message,
        }
        messages.value.push(progMsg)
        scrollToBottom()
      } else if (item.type === 'error') {
        thinking.value = false
        const errMsg: ErrorMessage = {
          role: 'error',
          text: item.message,
        }
        messages.value.push(errMsg)
        scrollToBottom()
        break
      } else if (item.type === 'done') {
        thinking.value = false
        const doneMsg: DoneMessage = { role: 'done' }
        messages.value.push(doneMsg)
        scrollToBottom()
        break
      }
    }
  } catch (e) {
    const errMsg: ErrorMessage = {
      role: 'error',
      text: e instanceof Error ? e.message : String(e),
    }
    messages.value.push(errMsg)
    scrollToBottom()
  } finally {
    running.value = false
    cancelFlag.value = false
    thinking.value = false
  }
}
</script>

<style scoped>
/* ── Wrapper ─────────────────────────────────────────────────────────────── */
.agent-transcript {
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* ── Toggle button ───────────────────────────────────────────────────────── */
.chat-toggle {
  align-self: flex-start;
  background: var(--bg-3);
  border: 1px solid var(--border-2);
  color: var(--accent-2);
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 5px;
  cursor: pointer;
  letter-spacing: 0.04em;
  transition: background 0.1s, border-color 0.1s;
}
.chat-toggle:hover {
  background: var(--accent-bg);
  border-color: var(--accent);
}
.chat-toggle.open {
  background: var(--accent-bg);
  border-color: var(--accent);
  color: var(--accent);
}

/* ── Panel ───────────────────────────────────────────────────────────────── */
.chat-panel {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-2);
  overflow: hidden;
  margin-top: 6px;
}

/* ── Session bar ─────────────────────────────────────────────────────────── */
.session-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-1);
}

.session-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-dim);
  flex-shrink: 0;
}

.session-input {
  background: var(--bg-2);
  border: 1px solid var(--border-2);
  border-radius: 4px;
  color: var(--text);
  font-family: inherit;
  font-size: 11px;
  padding: 3px 7px;
  outline: none;
  flex: 1;
  min-width: 0;
}
.session-input:focus {
  border-color: var(--accent);
}

.new-session-btn {
  background: none;
  border: 1px solid var(--border-2);
  color: var(--text-dim);
  font-family: inherit;
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  flex-shrink: 0;
}
.new-session-btn:hover {
  border-color: var(--text-muted);
  color: var(--text-muted);
}

/* ── Thread ──────────────────────────────────────────────────────────────── */
.thread {
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 200px;
  max-height: 480px;
  background: var(--bg-2);
}

.thread-empty {
  color: var(--text-dim);
  font-size: 12px;
  font-style: italic;
  text-align: center;
  margin-top: 24px;
}

/* ── Bubble rows ─────────────────────────────────────────────────────────── */
.bubble-row {
  display: flex;
}

.user-row {
  justify-content: flex-end;
}

.assistant-row {
  justify-content: flex-start;
}

/* ── Bubbles ─────────────────────────────────────────────────────────────── */
.bubble {
  max-width: 78%;
  border-radius: 8px;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  word-break: break-word;
}

.user-bubble {
  background: var(--accent-bg);
  border: 1px solid var(--accent-bg-2);
  color: var(--accent-2);
  border-bottom-right-radius: 2px;
}

.assistant-bubble {
  background: var(--bg-3);
  border: 1px solid var(--border);
  color: var(--text);
  border-bottom-left-radius: 2px;
}

.bubble-text {
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
}

/* ── Raw toggle ──────────────────────────────────────────────────────────── */
.raw-toggle {
  align-self: flex-end;
  background: none;
  border: 1px solid var(--border-2);
  color: var(--text-dim);
  font-family: inherit;
  font-size: 9px;
  padding: 0px 5px;
  border-radius: 3px;
  cursor: pointer;
  letter-spacing: 0.04em;
}
.raw-toggle:hover {
  border-color: var(--text-muted);
  color: var(--text-muted);
}

.raw-json {
  margin: 2px 0 0;
  color: var(--text-muted);
  font-size: 10px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 6px 8px;
  max-height: 200px;
  overflow-y: auto;
}

/* ── Tool-use block ──────────────────────────────────────────────────────── */
.tool-block {
  background: var(--bg-3);
  border: 1px solid #1f3048;
  border-radius: 6px;
  overflow: hidden;
  align-self: flex-start;
  max-width: 90%;
}

.tool-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  background: var(--bg-3);
  border: none;
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  color: var(--text-muted);
  width: 100%;
  text-align: left;
}
.tool-header:hover {
  background: #111a28;
}

.tool-icon {
  font-size: 11px;
  color: var(--accent);
}

.tool-name {
  color: var(--accent-2);
  font-size: 11px;
  flex: 1;
}

.tool-chevron {
  color: var(--text-dim);
  font-size: 10px;
}

.tool-body {
  border-top: 1px solid #1f3048;
  padding: 8px 10px;
}

.tool-json {
  margin: 0;
  color: var(--text);
  font-size: 10px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}

/* ── Progress line ───────────────────────────────────────────────────────── */
.progress-line {
  font-size: 11px;
  color: var(--text-dim);
  padding: 1px 4px;
  font-style: italic;
}

/* ── Error bubble ────────────────────────────────────────────────────────── */
.error-bubble {
  background: var(--red-bg);
  border: 1px solid var(--red-bg);
  border-radius: 6px;
  color: var(--red);
  font-size: 12px;
  padding: 7px 11px;
  line-height: 1.5;
  word-break: break-word;
}

/* ── Done marker ─────────────────────────────────────────────────────────── */
.done-marker {
  font-size: 11px;
  color: var(--green);
  text-align: center;
  opacity: 0.7;
  padding: 2px 0;
}

/* ── Thinking indicator ──────────────────────────────────────────────────── */
.thinking-row {
  display: flex;
  justify-content: flex-start;
}

.thinking-bubble {
  background: var(--bg-3);
  border: 1px solid var(--border);
  border-radius: 8px;
  border-bottom-left-radius: 2px;
  padding: 7px 12px;
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--text-muted);
  font-size: 12px;
}

@keyframes spin-pulse {
  0%, 100% { opacity: 0.3; }
  50%       { opacity: 1; }
}

.thinking-spinner {
  animation: spin-pulse 1.2s ease-in-out infinite;
  color: var(--accent);
}

.thinking-label {
  color: var(--text-muted);
  font-style: italic;
}

/* ── Usage footer ────────────────────────────────────────────────────────── */
.usage-footer {
  font-size: 10px;
  color: var(--text-dim);
  text-align: right;
  padding: 0 4px;
}

/* ── Input bar ───────────────────────────────────────────────────────────── */
.input-bar {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 12px 10px;
  border-top: 1px solid var(--border);
  background: var(--bg-1);
}

.prompt-input {
  width: 100%;
  background: var(--bg-2);
  border: 1px solid var(--border-2);
  border-radius: 4px;
  color: var(--text);
  font-family: inherit;
  font-size: 12px;
  padding: 6px 9px;
  resize: vertical;
  box-sizing: border-box;
  outline: none;
  line-height: 1.5;
}
.prompt-input:focus {
  border-color: var(--accent);
}
.prompt-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.input-actions {
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: flex-end;
}

.send-btn {
  background: var(--accent-bg);
  border: 1px solid var(--accent-bg-2);
  color: var(--accent);
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  padding: 5px 12px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
  transition: background 0.1s;
}
.send-btn:hover:not(:disabled) {
  background: var(--accent-bg-2);
}
.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.send-btn.running {
  color: var(--text-muted);
  border-color: var(--border-2);
  background: var(--bg-3);
}

.cancel-btn {
  background: var(--red-bg);
  border: 1px solid var(--red-bg);
  color: var(--red);
  font-family: inherit;
  font-size: 11px;
  padding: 5px 9px;
  border-radius: 4px;
  cursor: pointer;
}
.cancel-btn:hover {
  background: var(--red-bg);
}

.clear-btn {
  background: none;
  border: 1px solid var(--border-2);
  color: var(--text-dim);
  font-family: inherit;
  font-size: 10px;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
}
.clear-btn:hover {
  border-color: var(--text-dim);
  color: var(--text-muted);
}
</style>

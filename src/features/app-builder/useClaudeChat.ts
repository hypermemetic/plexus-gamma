/**
 * Claude Code chat integration for the app builder.
 *
 * Connects to substrate's `claudecode` plugin to run real Claude Code sessions
 * with a working directory. Claude can write Vue SFCs, read the project state,
 * and mutate files directly. Chat events (content, tool_use, thinking, complete)
 * stream back to the UI in real time.
 */

import { reactive } from 'vue'
import { getSharedClient } from '../../lib/plexus/clientRegistry'
import { collectOne } from '../../lib/plexus/rpc'
import type { AppProject } from './types'
import type { MethodEntry } from '../../components/CommandPalette.vue'

// ─── Types ────────────────────────────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant'

export interface ToolCall {
  id:       string
  name:     string
  input:    unknown
  output?:  string
  isError?: boolean
  done:     boolean
}

export interface ChatMessage {
  id:       string
  role:     MessageRole
  text:     string             // streamed text (assistant) or sent text (user)
  thinking: string             // extended thinking content
  tools:    ToolCall[]         // tool_use / tool_result pairs
  done:     boolean
}

export interface ClaudeChatState {
  sessionId:   string | null
  workingDir:  string
  messages:    ChatMessage[]
  streaming:   boolean
  error:       string | null
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(project: AppProject, methods: MethodEntry[]): string {
  const backendList = Object.entries(project.backends)
    .map(([name, url]) => `  ${name}: ${url}`)
    .join('\n')

  const methodList = methods
    .slice(0, 120)
    .map(m => `  ${m.fullPath}${m.method.description ? ' — ' + m.method.description : ''}`)
    .join('\n')

  const pageList = project.pages
    .map(p => `  ${p.route} → ${p.name} (${p.blocks.length} blocks)`)
    .join('\n')

  return `You are an expert Vue 3 developer building a web application connected to plexus-rpc microservice backends.

## Project
Name: ${project.name}
Package: ${project.packageName}

## Backends
${backendList || '  (none connected yet)'}

## Available backend methods
${methodList || '  (none available)'}

## Current pages
${pageList || '  (no pages yet)'}

## Working directory structure
The project scaffold already exists in the working directory:
  src/lib/plexus.ts        — typed streaming WebSocket RPC client
  src/pages/               — your Vue SFCs go here
  src/router/index.ts      — vue-router (import and register new pages here)
  src/App.vue              — root component with nav links
  src/main.ts              — entry point
  package.json             — dependencies (vue, vue-router)
  vite.config.ts, tsconfig.json, index.html

## plexus client pattern
\`\`\`ts
import { getClient } from '../lib/plexus'
const client = getClient('backendName', 'ws://127.0.0.1:4444')

// Single response
for await (const msg of client.call('method.name', { param: value })) {
  if (msg.type === 'data') result.value = msg.content
  if (msg.type === 'done') break
}

// Array response (list methods)
for await (const msg of client.call('things.list', {})) {
  if (msg.type === 'data') {
    const data = msg.content
    items.value = Array.isArray(data) ? data : data.items ?? [data]
  }
  if (msg.type === 'done') break
}
\`\`\`

## Instructions
- Write real, runnable Vue 3 SFCs using <script setup lang="ts">
- Use the plexus client pattern above for every backend method call
- After creating a page, update src/router/index.ts and src/App.vue to include it
- Keep components clean — no unnecessary complexity
- Use scoped CSS in <style scoped> for component styles
- Always use onMounted for data fetching, not top-level await`
}

// ─── State (module-level singleton per session) ────────────────────────────────

const state = reactive<ClaudeChatState>({
  sessionId:  null,
  workingDir: '',
  messages:   [],
  streaming:  false,
  error:      null,
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function newMessage(role: MessageRole, text = ''): ChatMessage {
  return { id: crypto.randomUUID(), role, text, thinking: '', tools: [], done: false }
}

function getSubstrateClient(backendUrl: string, backendName = 'substrate') {
  return getSharedClient(backendName, backendUrl)
}

// ─── Session management ───────────────────────────────────────────────────────

export async function createSession(
  backendUrl:  string,
  workingDir:  string,
  project:     AppProject,
  methods:     MethodEntry[],
  backendName = 'substrate',
): Promise<string | null> {
  const client = getSubstrateClient(backendUrl, backendName)
  state.error = null

  try {
    await client.connect()
    const result = await collectOne<{ type: string; id?: string; message?: string }>(
      client.call('claudecode.create', {
        name:          `app-builder-${project.packageName}`,
        working_dir:   workingDir,
        model:         'sonnet',
        system_prompt: buildSystemPrompt(project, methods),
      })
    )

    if (result.type === 'created' && result.id) {
      state.sessionId  = result.id
      state.workingDir = workingDir
      state.messages   = []
      return result.id
    } else {
      state.error = result.message ?? 'Failed to create session'
      return null
    }
  } catch (e) {
    state.error = e instanceof Error ? e.message : String(e)
    return null
  }
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export async function sendMessage(
  text:        string,
  backendUrl:  string,
  backendName = 'substrate',
): Promise<void> {
  if (!state.sessionId || state.streaming) return

  // Add user message
  const userMsg = newMessage('user', text)
  userMsg.done = true
  state.messages.push(userMsg)

  // Add assistant message placeholder
  const assistantMsg = newMessage('assistant')
  state.messages.push(assistantMsg)

  state.streaming = true
  state.error     = null

  const client = getSubstrateClient(backendUrl, backendName)

  try {
    await client.connect()
    const stream = client.call('claudecode.chat', {
      session_id: state.sessionId,
      message:    text,
    })

    for await (const item of stream) {
      if (item.type !== 'data') continue
      const event = item.content as Record<string, unknown>

      switch (event['type']) {
        case 'content': {
          assistantMsg.text += (event['text'] as string) ?? ''
          break
        }

        case 'thinking': {
          assistantMsg.thinking += (event['thinking'] as string) ?? ''
          break
        }

        case 'tool_use': {
          const tool: ToolCall = {
            id:    event['tool_use_id'] as string,
            name:  event['tool_name']  as string,
            input: event['input'],
            done:  false,
          }
          assistantMsg.tools.push(tool)
          break
        }

        case 'tool_result': {
          const id   = event['tool_use_id'] as string
          const tool = assistantMsg.tools.find(t => t.id === id)
          if (tool) {
            tool.output  = event['output'] as string
            tool.isError = event['is_error'] as boolean
            tool.done    = true
          }
          break
        }

        case 'complete': {
          assistantMsg.done = true
          break
        }

        case 'error': {
          state.error = event['message'] as string
          assistantMsg.done = true
          break
        }
      }
    }
  } catch (e) {
    state.error = e instanceof Error ? e.message : String(e)
    assistantMsg.done = true
  } finally {
    assistantMsg.done = true
    state.streaming   = false
  }
}

// ─── Reset session ────────────────────────────────────────────────────────────

export function clearChat(): void {
  state.sessionId = null
  state.messages  = []
  state.error     = null
  state.streaming = false
}

// ─── Composable ───────────────────────────────────────────────────────────────

export function useClaudeChat() {
  return {
    state,
    createSession,
    sendMessage,
    clearChat,
  }
}

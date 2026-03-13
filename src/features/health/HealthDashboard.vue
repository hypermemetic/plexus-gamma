<template>
  <!-- ── Health strip ──────────────────────────────────────────────────────── -->
  <div class="health-strip">
    <button
      v-for="h in health"
      :key="h.name"
      class="health-chip"
      :class="[`status-${h.status}`, { 'hash-pulsed': isHashRecent(h) }]"
      :title="`${h.name} — ${h.status.toUpperCase()}${h.lastSeenAt ? ` • last seen ${formatAgo(h.lastSeenAt)}` : ''}`"
      @click="open = true"
    >
      <span class="status-dot" :class="`dot-${h.status}`">●</span>
      <span class="chip-name">{{ h.name }}</span>
      <span v-if="h.status !== 'down' && avgLatency(h) > 0" class="chip-latency">
        {{ avgLatency(h) }}ms
      </span>
      <span v-else-if="h.status === 'down'" class="chip-down">✗</span>
      <span v-if="isHashRecent(h)" class="chip-pulse" title="Schema hash changed">⚡</span>
    </button>

    <button class="expand-btn" @click="open = true" title="Open health dashboard">
      <span class="expand-icon">⊕</span>
    </button>
  </div>

  <!-- ── Expanded dashboard overlay ────────────────────────────────────────── -->
  <Teleport to="body">
    <div v-if="open" class="dashboard-backdrop" @click.self="open = false">
      <div class="dashboard-panel">
        <!-- Header -->
        <div class="dashboard-header">
          <span class="dashboard-title">Backend Health</span>
          <button class="close-btn" @click="open = false" title="Close">✕</button>
        </div>

        <!-- Backend cards -->
        <div class="dashboard-body">
          <div
            v-for="h in health"
            :key="h.name"
            class="backend-card"
          >
            <!-- Card header row -->
            <div class="card-header-row">
              <span class="card-status-dot" :class="`dot-${h.status}`">●</span>
              <span class="card-name">{{ h.name }}</span>
              <span class="card-url">{{ h.url }}</span>
              <span class="card-status-label" :class="`label-${h.status}`">{{ h.status }}</span>
              <span class="card-last-seen">
                {{ h.lastSeenAt ? `last: ${formatAgo(h.lastSeenAt)}` : 'never seen' }}
              </span>
            </div>

            <!-- Hash row -->
            <div class="card-row">
              <span class="row-label">hash:</span>
              <span
                v-if="h.hashCurrent"
                class="hash-badge"
                :class="{ 'hash-flash': isHashRecent(h) }"
              >{{ h.hashCurrent.slice(0, 8) }}</span>
              <span v-else class="muted">—</span>
              <span v-if="h.hashChangedAt" class="hash-changed">
                <span v-if="isHashRecent(h)" class="pulse-icon">⚡</span>
                changed {{ formatAgo(h.hashChangedAt) }}
              </span>
              <span v-else class="muted">never changed</span>
            </div>

            <!-- Latency row -->
            <div v-if="h.status !== 'down' && h.latencies.length > 0" class="card-row">
              <span class="row-label">latency:</span>
              <span class="lat-stat">avg <strong>{{ latencyStats(h).avg }}ms</strong></span>
              <span class="lat-stat">p50 <strong>{{ latencyStats(h).p50 }}ms</strong></span>
              <span class="lat-stat">p95 <strong>{{ latencyStats(h).p95 }}ms</strong></span>
            </div>
            <div v-else-if="h.status === 'down'" class="card-row">
              <span class="row-label">latency:</span>
              <span class="muted">—</span>
            </div>

            <!-- Calls row -->
            <div class="card-row">
              <span class="row-label">calls:</span>
              <span>{{ h.callCount }}</span>
              <span class="row-sep">errors:</span>
              <span :class="h.errorCount > 0 ? 'error-count' : ''">{{ h.errorCount }}</span>
              <span class="row-sep">error rate:</span>
              <span :class="errorRate(h) > 0 ? 'error-count' : ''">{{ errorRateStr(h) }}</span>
            </div>

            <!-- Sparkline -->
            <div v-if="h.latencies.length > 0" class="sparkline-row">
              <span class="row-label">history:</span>
              <svg
                class="sparkline"
                :width="sparklineWidth(h)"
                height="20"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect
                  v-for="(bar, i) in sparklineBars(h)"
                  :key="i"
                  :x="bar.x"
                  :y="bar.y"
                  :width="bar.w"
                  :height="bar.h"
                  fill="#58a6ff"
                  rx="1"
                />
              </svg>
            </div>
          </div>

          <div v-if="health.length === 0" class="no-backends">
            No backends configured.
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, provide } from 'vue'
import type { Ref } from 'vue'
import { useBackendHealth, computeLatencyStats } from './useBackendHealth'
import type { BackendHealth } from './useBackendHealth'

// ─── Props ────────────────────────────────────────────────────────────────────

const props = defineProps<{
  connections: { name: string; url: string }[]
}>()

// ─── State ────────────────────────────────────────────────────────────────────

const open = ref(false)

// Cast computed to Ref so useBackendHealth receives a reactive Ref<...[]>
const connectionsRef = computed(() => props.connections) as unknown as Ref<{ name: string; url: string }[]>

const { health, recordCall } = useBackendHealth(connectionsRef)

// Expose recordCall via provide so MethodInvoker can use it
provide('recordCall', recordCall)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function avgLatency(h: BackendHealth): number {
  return computeLatencyStats(h.latencies).avg
}

function latencyStats(h: BackendHealth): { avg: number; p50: number; p95: number } {
  return computeLatencyStats(h.latencies)
}

function isHashRecent(h: BackendHealth): boolean {
  if (!h.hashChangedAt) return false
  return (Date.now() - h.hashChangedAt) < 30_000
}

function formatAgo(ts: number): string {
  const diffMs = Date.now() - ts
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return `${diffSec}s`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  return `${diffHr}h ago`
}

function errorRate(h: BackendHealth): number {
  if (h.callCount === 0) return 0
  return h.errorCount / h.callCount
}

function errorRateStr(h: BackendHealth): string {
  return `${Math.round(errorRate(h) * 100)}%`
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

const BAR_W = 4
const BAR_GAP = 1
const SPARKLINE_H = 20

interface SparkBar {
  x: number
  y: number
  w: number
  h: number
}

function sparklineBars(h: BackendHealth): SparkBar[] {
  const lats = h.latencies
  if (lats.length === 0) return []
  const maxVal = Math.max(...lats, 1)
  return lats.map((lat, i) => {
    const barH = Math.max(2, Math.round((lat / maxVal) * SPARKLINE_H))
    return {
      x: i * (BAR_W + BAR_GAP),
      y: SPARKLINE_H - barH,
      w: BAR_W,
      h: barH,
    }
  })
}

function sparklineWidth(h: BackendHealth): number {
  const count = h.latencies.length
  return count * (BAR_W + BAR_GAP)
}
</script>

<style scoped>
/* ── Health strip ─────────────────────────────────────────────────────────── */

.health-strip {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 4px;
}

.health-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 7px 2px 5px;
  border-radius: 10px;
  border: 1px solid #30363d;
  background: none;
  font-family: inherit;
  font-size: 10px;
  color: #8b949e;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 0.2s, background 0.2s;
}

.health-chip:hover {
  background: #161b22;
  border-color: #484f58;
}

.health-chip.hash-pulsed {
  border-color: #e3b341;
}

.status-dot {
  font-size: 8px;
  line-height: 1;
}

.dot-ok      { color: #3fb950; }
.dot-degraded { color: #e3b341; }
.dot-down    { color: #f85149; }

.chip-name {
  color: #c9d1d9;
  font-weight: 500;
}

.chip-latency {
  color: #58a6ff;
  font-size: 9px;
}

.chip-down {
  color: #f85149;
  font-size: 9px;
}

.chip-pulse {
  font-size: 9px;
  animation: chipPulse 1s ease-in-out 3;
}

@keyframes chipPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.expand-btn {
  background: none;
  border: 1px solid #30363d;
  color: #484f58;
  font-size: 12px;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  padding: 0;
  transition: color 0.2s, border-color 0.2s;
}

.expand-btn:hover {
  color: #58a6ff;
  border-color: #58a6ff;
}

.expand-icon {
  font-size: 11px;
}

/* ── Dashboard overlay ───────────────────────────────────────────────────── */

.dashboard-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9000;
}

.dashboard-panel {
  width: 700px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 64px);
  background: #0d1117;
  border: 1px solid #21262d;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: 'Berkeley Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace;
  font-size: 12px;
  color: #c9d1d9;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5);
}

.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #21262d;
  flex-shrink: 0;
}

.dashboard-title {
  font-size: 13px;
  font-weight: 600;
  color: #e6edf3;
  letter-spacing: 0.02em;
}

.close-btn {
  background: none;
  border: none;
  color: #484f58;
  font-size: 14px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  line-height: 1;
  transition: color 0.15s, background 0.15s;
}

.close-btn:hover {
  color: #c9d1d9;
  background: #21262d;
}

.dashboard-body {
  overflow-y: auto;
  padding: 8px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ── Backend card ─────────────────────────────────────────────────────────── */

.backend-card {
  background: #111114;
  border: 1px solid #21262d;
  border-radius: 6px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.card-header-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 3px;
}

.card-status-dot {
  font-size: 10px;
  flex-shrink: 0;
}

.card-name {
  font-weight: 600;
  color: #e6edf3;
  font-size: 13px;
}

.card-url {
  color: #484f58;
  font-size: 10px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-status-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 2px 6px;
  border-radius: 3px;
  flex-shrink: 0;
}

.label-ok       { color: #3fb950; background: rgba(63, 185, 80, 0.1); }
.label-degraded { color: #e3b341; background: rgba(227, 179, 65, 0.1); }
.label-down     { color: #f85149; background: rgba(248, 81, 73, 0.1); }

.card-last-seen {
  color: #484f58;
  font-size: 10px;
  flex-shrink: 0;
}

.card-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: #8b949e;
}

.row-label {
  color: #484f58;
  min-width: 52px;
  flex-shrink: 0;
}

.row-sep {
  color: #30363d;
}

.muted {
  color: #484f58;
}

/* ── Hash badge ───────────────────────────────────────────────────────────── */

.hash-badge {
  font-family: inherit;
  font-size: 11px;
  color: #8b949e;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 3px;
  padding: 1px 5px;
  letter-spacing: 0.04em;
}

@keyframes hashFlash {
  0%   { background: rgba(227, 179, 65, 0.4); border-color: #e3b341; color: #e3b341; }
  60%  { background: rgba(227, 179, 65, 0.15); border-color: #e3b341; color: #e3b341; }
  100% { background: #161b22; border-color: #30363d; color: #8b949e; }
}

.hash-badge.hash-flash {
  animation: hashFlash 2s ease-out forwards;
}

.hash-changed {
  color: #8b949e;
  font-size: 10px;
  display: flex;
  align-items: center;
  gap: 3px;
}

.pulse-icon {
  color: #e3b341;
  animation: pulseIcon 1.5s ease-in-out 3;
}

@keyframes pulseIcon {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

/* ── Latency stats ────────────────────────────────────────────────────────── */

.lat-stat {
  color: #8b949e;
  font-size: 11px;
}

.lat-stat strong {
  color: #c9d1d9;
}

/* ── Error rate ───────────────────────────────────────────────────────────── */

.error-count {
  color: #f85149;
}

/* ── Sparkline ────────────────────────────────────────────────────────────── */

.sparkline-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin-top: 2px;
}

.sparkline {
  display: block;
  flex-shrink: 0;
}

/* ── No backends ──────────────────────────────────────────────────────────── */

.no-backends {
  color: #484f58;
  font-size: 12px;
  text-align: center;
  padding: 24px;
}
</style>

<template>
  <!-- ── Health strip ──────────────────────────────────────────────────────── -->
  <div class="health-strip">
    <button
      v-for="h in health"
      :key="h.name"
      class="health-chip"
      :class="[`status-${h.status}`, { 'hash-pulsed': isHashRecent(h), active: h.name === activeConn?.name }]"
      :title="`${h.url} — ${h.status.toUpperCase()}${h.lastSeenAt ? ` • last seen ${formatAgo(h.lastSeenAt)}` : ''}`"
      @click="$emit('select', h.name)"
    >
      <span class="status-dot" :class="`dot-${h.status}`">●</span>
      <span class="chip-name">{{ h.name }}</span>
      <span v-if="h.status !== 'down' && avgLatency(h) > 0" class="chip-latency">
        {{ avgLatency(h) }}ms
      </span>
      <span v-else-if="h.status === 'down'" class="chip-down">✗</span>
      <span v-if="isHashRecent(h)" class="chip-pulse" title="Schema hash changed">⚡</span>
    </button>

    <span v-if="scanning" class="chip-scanning" title="Scanning ports…">
      <span class="scan-dot">◌</span>
    </span>

    <button class="expand-btn" @click="panelOpen = true" title="Backend health details">
      <span class="expand-icon">⊕</span>
    </button>
  </div>

  <!-- ── Expanded dashboard overlay ────────────────────────────────────────── -->
  <Teleport to="body">
    <div v-if="panelOpen" class="dashboard-backdrop" @click.self="closePanel">
      <div class="dashboard-panel">
        <!-- Header -->
        <div class="dashboard-header">
          <span class="dashboard-title">Backend Health</span>
          <button class="close-btn" @click="closePanel" title="Close">✕</button>
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
                  fill="var(--accent)"
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
import { ref, watch } from 'vue'
import { useBackends, computeLatencyStats } from '../../lib/useBackends'
import type { BackendHealth } from '../../lib/useBackends'

const props = defineProps<{
  open?: boolean
}>()

const emit = defineEmits<{ select: [name: string]; close: [] }>()

const { health, scanning, activeConn } = useBackends()

// ─── State ────────────────────────────────────────────────────────────────────

const panelOpen = ref(false)

watch(() => props.open, (v) => { if (v) panelOpen.value = true })

function closePanel() {
  panelOpen.value = false
  emit('close')
}

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
  border: 1px solid var(--border-2);
  background: none;
  font-family: inherit;
  font-size: 10px;
  color: var(--text-muted);
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 0.2s, background 0.2s;
}

.health-chip:hover {
  background: var(--bg-3);
  border-color: var(--text-dim);
}

.health-chip.active {
  background: var(--accent-bg);
  border-color: #1f5a8a;
}

.health-chip.active .chip-name {
  color: var(--accent);
}

.health-chip.hash-pulsed {
  border-color: var(--yellow);
}

.chip-scanning {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  font-size: 10px;
  color: var(--text-dim);
}

@keyframes scanPulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
.scan-dot { animation: scanPulse 1.2s ease-in-out infinite; }

.status-dot {
  font-size: 8px;
  line-height: 1;
}

.dot-ok      { color: var(--green); }
.dot-degraded { color: var(--yellow); }
.dot-down    { color: var(--red); }

.chip-name {
  color: var(--text);
  font-weight: 500;
}

.chip-latency {
  color: var(--accent);
  font-size: 9px;
}

.chip-down {
  color: var(--red);
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
  border: 1px solid var(--border-2);
  color: var(--text-dim);
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
  color: var(--accent);
  border-color: var(--accent);
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
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: 'Berkeley Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace;
  font-size: 12px;
  color: var(--text);
  box-shadow: var(--shadow-xl);
}

.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.dashboard-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-2);
  letter-spacing: 0.02em;
}

.close-btn {
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 14px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  line-height: 1;
  transition: color 0.15s, background 0.15s;
}

.close-btn:hover {
  color: var(--text);
  background: var(--border);
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
  background: var(--bg-1);
  border: 1px solid var(--border);
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
  color: var(--text-2);
  font-size: 13px;
}

.card-url {
  color: var(--text-dim);
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

.label-ok       { color: var(--green); background: rgba(63, 185, 80, 0.1); }
.label-degraded { color: var(--yellow); background: rgba(227, 179, 65, 0.1); }
.label-down     { color: var(--red); background: rgba(248, 81, 73, 0.1); }

.card-last-seen {
  color: var(--text-dim);
  font-size: 10px;
  flex-shrink: 0;
}

.card-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--text-muted);
}

.row-label {
  color: var(--text-dim);
  min-width: 52px;
  flex-shrink: 0;
}

.row-sep {
  color: var(--border-2);
}

.muted {
  color: var(--text-dim);
}

/* ── Hash badge ───────────────────────────────────────────────────────────── */

.hash-badge {
  font-family: inherit;
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-3);
  border: 1px solid var(--border-2);
  border-radius: 3px;
  padding: 1px 5px;
  letter-spacing: 0.04em;
}

@keyframes hashFlash {
  0%   { background: rgba(227, 179, 65, 0.4); border-color: var(--yellow); color: var(--yellow); }
  60%  { background: rgba(227, 179, 65, 0.15); border-color: var(--yellow); color: var(--yellow); }
  100% { background: var(--bg-3); border-color: var(--border-2); color: var(--text-muted); }
}

.hash-badge.hash-flash {
  animation: hashFlash 2s ease-out forwards;
}

.hash-changed {
  color: var(--text-muted);
  font-size: 10px;
  display: flex;
  align-items: center;
  gap: 3px;
}

.pulse-icon {
  color: var(--yellow);
  animation: pulseIcon 1.5s ease-in-out 3;
}

@keyframes pulseIcon {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

/* ── Latency stats ────────────────────────────────────────────────────────── */

.lat-stat {
  color: var(--text-muted);
  font-size: 11px;
}

.lat-stat strong {
  color: var(--text);
}

/* ── Error rate ───────────────────────────────────────────────────────────── */

.error-count {
  color: var(--red);
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
  color: var(--text-dim);
  font-size: 12px;
  text-align: center;
  padding: 24px;
}
</style>

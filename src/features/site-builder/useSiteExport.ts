/**
 * Export a Site to a deployable single-file HTML artifact.
 *
 * Output: one self-contained index.html that:
 *   1. Embeds the site definition as JSON
 *   2. Includes the plexus runtime (minimal WS client + component renderer)
 *   3. Connects to the configured backendUrl on load
 *   4. Renders all components with live data from their bindings
 */

import type { Site, Page } from './types'

// ─── CSS ─────────────────────────────────────────────────────────────────────

function buildCSS(site: Site): string {
  return `
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; font-family: system-ui, sans-serif; background: #0d1117; color: #e6edf3; }
.site-page { position: relative; min-height: 100vh; }
.site-component { position: absolute; overflow: hidden; }
.plx-text { font-size: 14px; line-height: 1.6; }
.plx-heading-1 { font-size: 2rem; font-weight: 700; margin: 0; }
.plx-heading-2 { font-size: 1.5rem; font-weight: 600; margin: 0; }
.plx-heading-3 { font-size: 1.25rem; font-weight: 500; margin: 0; }
.plx-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; overflow-y: auto; height: 100%; }
.plx-list-item { padding: 8px 12px; background: rgba(255,255,255,0.05); border-radius: 6px; font-size: 13px; }
.plx-button { cursor: pointer; border: none; border-radius: 6px; padding: 10px 20px; font-size: 14px; font-weight: 500; transition: opacity 0.15s; }
.plx-button:hover { opacity: 0.85; }
.plx-button.primary { background: #2f81f7; color: #fff; }
.plx-button.secondary { background: rgba(255,255,255,0.1); color: #e6edf3; }
.plx-button.ghost { background: transparent; border: 1px solid rgba(255,255,255,0.2); color: #e6edf3; }
.plx-form { display: flex; flex-direction: column; gap: 10px; height: 100%; }
.plx-form label { font-size: 12px; color: rgba(255,255,255,0.6); display: flex; flex-direction: column; gap: 4px; }
.plx-form input, .plx-form textarea { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; color: #e6edf3; font-size: 13px; padding: 6px 10px; outline: none; }
.plx-form input:focus, .plx-form textarea:focus { border-color: #2f81f7; }
.plx-stream { font-size: 13px; line-height: 1.7; overflow-y: auto; height: 100%; white-space: pre-wrap; padding: 8px; background: rgba(0,0,0,0.3); border-radius: 4px; }
.plx-json { font-family: monospace; font-size: 12px; overflow: auto; height: 100%; white-space: pre; padding: 8px; background: rgba(0,0,0,0.3); border-radius: 4px; }
.plx-result { margin-top: 8px; font-size: 12px; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 4px; white-space: pre-wrap; font-family: monospace; overflow: auto; }
.plx-loading { opacity: 0.5; font-size: 12px; }
${site.globalStyles}
`.trim()
}

// ─── Runtime JS ──────────────────────────────────────────────────────────────

const RUNTIME_JS = `
// plexus-gamma site runtime
// Minimal plexus-rpc client + component renderer

let ws, msgId = 1;
const pending = new Map();

function connect(url) {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(url);
    ws.onopen = () => resolve();
    ws.onerror = (e) => reject(new Error('WebSocket error'));
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        const id = msg.id;
        if (!id || !pending.has(id)) return;
        const { resolve: res, reject: rej, stream } = pending.get(id);
        if (msg.error) { pending.delete(id); rej(new Error(msg.error.message || 'RPC error')); return; }
        if (msg.result) {
          const item = msg.result;
          if (item.type === 'data')       { if (stream) { stream(item.content); } else { pending.delete(id); res(item.content); } }
          else if (item.type === 'end')   { pending.delete(id); res(null); }
          else if (item.type === 'error') { pending.delete(id); rej(new Error(JSON.stringify(item.content))); }
        }
      } catch {}
    };
  });
}

function call(method, params) {
  return new Promise((resolve, reject) => {
    const id = String(msgId++);
    pending.set(id, { resolve, reject, stream: null });
    ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params: params ?? {} }));
  });
}

function callStream(method, params, onData) {
  return new Promise((resolve, reject) => {
    const id = String(msgId++);
    pending.set(id, { resolve, reject, stream: onData });
    ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params: params ?? {} }));
  });
}

async function renderComponent(el, comp) {
  const b = comp.binding;
  switch (comp.type) {
    case 'text': {
      const div = document.createElement('div');
      div.className = 'plx-text';
      div.style.fontSize = (comp.props.fontSize || 14) + 'px';
      div.style.textAlign = comp.props.align || 'left';
      div.style.color = comp.props.color || 'inherit';
      if (b) {
        div.textContent = 'Loading…';
        div.classList.add('plx-loading');
        try {
          const result = await call(b.method, b.staticParams || {});
          div.classList.remove('plx-loading');
          div.textContent = typeof result === 'string' ? result : JSON.stringify(result);
        } catch (e) { div.textContent = 'Error: ' + e.message; }
      } else {
        div.textContent = comp.props.content || '';
      }
      el.appendChild(div);
      break;
    }
    case 'heading': {
      const level = comp.props.level || 1;
      const h = document.createElement('h' + level);
      h.className = 'plx-heading-' + level;
      h.style.textAlign = comp.props.align || 'left';
      h.style.color = comp.props.color || 'inherit';
      if (b) {
        h.textContent = 'Loading…';
        try {
          const result = await call(b.method, b.staticParams || {});
          h.textContent = typeof result === 'string' ? result : JSON.stringify(result);
        } catch (e) { h.textContent = 'Error: ' + e.message; }
      } else {
        h.textContent = comp.props.content || 'Heading';
      }
      el.appendChild(h);
      break;
    }
    case 'list': {
      const ul = document.createElement('ul');
      ul.className = 'plx-list';
      el.appendChild(ul);
      if (b) {
        ul.innerHTML = '<li class="plx-list-item plx-loading">Loading…</li>';
        try {
          const result = await call(b.method, b.staticParams || {});
          ul.innerHTML = '';
          const items = Array.isArray(result) ? result : (result?.items ?? result?.data ?? []);
          const labelField = comp.props.labelField || 'name';
          if (items.length === 0) {
            const li = document.createElement('li');
            li.className = 'plx-list-item';
            li.textContent = comp.props.emptyText || 'No items';
            ul.appendChild(li);
          }
          for (const item of items) {
            const li = document.createElement('li');
            li.className = 'plx-list-item';
            li.textContent = typeof item === 'object' ? (item[labelField] ?? JSON.stringify(item)) : String(item);
            ul.appendChild(li);
          }
        } catch (e) {
          ul.innerHTML = '<li class="plx-list-item">Error: ' + e.message + '</li>';
        }
      }
      break;
    }
    case 'button': {
      const btn = document.createElement('button');
      btn.className = 'plx-button ' + (comp.props.variant || 'primary');
      btn.textContent = comp.props.label || 'Click me';
      const resultDiv = document.createElement('div');
      resultDiv.className = 'plx-result';
      resultDiv.style.display = 'none';
      el.appendChild(btn);
      el.appendChild(resultDiv);
      if (b) {
        btn.onclick = async () => {
          btn.disabled = true;
          btn.textContent = 'Running…';
          try {
            const result = await call(b.method, b.staticParams || {});
            resultDiv.style.display = 'block';
            resultDiv.textContent = JSON.stringify(result, null, 2);
          } catch (e) {
            resultDiv.style.display = 'block';
            resultDiv.textContent = 'Error: ' + e.message;
          } finally {
            btn.disabled = false;
            btn.textContent = comp.props.label || 'Click me';
          }
        };
      }
      break;
    }
    case 'stream': {
      const pre = document.createElement('div');
      pre.className = 'plx-stream';
      pre.textContent = comp.props.placeholder || '';
      el.appendChild(pre);
      if (b) {
        pre.textContent = '';
        callStream(b.method, b.staticParams || {}, (chunk) => {
          const text = typeof chunk === 'string' ? chunk : (chunk.content || chunk.message || JSON.stringify(chunk));
          pre.textContent += text;
          pre.scrollTop = pre.scrollHeight;
        }).catch(e => { pre.textContent += '\\nError: ' + e.message; });
      }
      break;
    }
    case 'json': {
      const pre = document.createElement('pre');
      pre.className = 'plx-json';
      el.appendChild(pre);
      if (b) {
        pre.textContent = 'Loading…';
        try {
          const result = await call(b.method, b.staticParams || {});
          pre.textContent = JSON.stringify(result, null, 2);
        } catch (e) { pre.textContent = 'Error: ' + e.message; }
      } else {
        pre.textContent = '{}';
      }
      break;
    }
    case 'form': {
      const form = document.createElement('form');
      form.className = 'plx-form';
      el.appendChild(form);
      if (b) {
        // TODO: introspect method schema to render param fields
        const textarea = document.createElement('textarea');
        textarea.placeholder = 'JSON params (e.g. {"message":"hello"})';
        textarea.rows = 3;
        form.appendChild(textarea);
        const btn = document.createElement('button');
        btn.type = 'submit';
        btn.className = 'plx-button primary';
        btn.textContent = comp.props.submitLabel || 'Submit';
        form.appendChild(btn);
        const result = document.createElement('div');
        result.className = 'plx-result';
        form.appendChild(result);
        form.onsubmit = async (e) => {
          e.preventDefault();
          let params = b.staticParams || {};
          try { params = { ...params, ...JSON.parse(textarea.value || '{}') }; } catch {}
          btn.disabled = true;
          try {
            const res = await call(b.method, params);
            if (comp.props.showResult !== false) {
              result.textContent = JSON.stringify(res, null, 2);
              result.style.display = 'block';
            }
          } catch (err) {
            result.textContent = 'Error: ' + err.message;
            result.style.display = 'block';
          } finally { btn.disabled = false; }
        };
      }
      break;
    }
  }
}

async function boot(site) {
  try {
    await connect(site.backendUrl);
  } catch (e) {
    console.warn('[plexus] Could not connect to', site.backendUrl, e.message);
  }
  for (const page of site.pages) {
    const pageEl = document.getElementById('page-' + page.id);
    if (!pageEl) continue;
    for (const comp of page.components) {
      const el = document.getElementById('comp-' + comp.id);
      if (!el) continue;
      await renderComponent(el, comp);
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const siteEl = document.getElementById('__site_data__');
  if (!siteEl) return;
  const site = JSON.parse(siteEl.textContent);
  boot(site);
});
`.trim()

// ─── HTML builder ─────────────────────────────────────────────────────────────

function buildPageHTML(page: Page): string {
  const comps = page.components.map(c => `
    <div id="comp-${c.id}" class="site-component" style="left:${c.x}px;top:${c.y}px;width:${c.width}px;height:${c.height}px;"></div>
  `.trim()).join('\n    ')

  return `
  <div id="page-${page.id}" class="site-page" style="background:${page.background};">
    ${comps}
  </div>`.trim()
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function exportSiteHTML(site: Site): string {
  const css   = buildCSS(site)
  const pages = site.pages.map(buildPageHTML).join('\n  ')
  const json  = JSON.stringify(site)

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHTML(site.name)}</title>
  <style>${css}</style>
</head>
<body>
  ${pages}
  <script id="__site_data__" type="application/json">${json}<\/script>
  <script>${RUNTIME_JS}<\/script>
</body>
</html>`
}

function escapeHTML(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function downloadHTML(site: Site): void {
  const html = exportSiteHTML(site)
  const blob = new Blob([html], { type: 'text/html' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = (site.name.toLowerCase().replace(/\s+/g, '-') || 'site') + '.html'
  a.click()
  URL.revokeObjectURL(url)
}

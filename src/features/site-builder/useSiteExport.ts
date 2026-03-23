/**
 * Export a Site to a deployable single-file HTML artifact.
 *
 * Section → Column (CSS grid) → Element layout.
 * Embeds a minimal plexus-rpc WebSocket client + component renderer.
 */

import type { Site, Page, SiteSection, SiteColumn, SiteElement } from './types'

// ─── CSS ─────────────────────────────────────────────────────────────────────

function buildCSS(site: Site): string {
  return `
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; color: #111827; }
a { color: inherit; }

/* Layout */
.plx-section { width: 100%; }
.plx-section-inner { max-width: 1024px; margin: 0 auto; padding: 0 24px; }
.plx-columns { display: grid; gap: 24px; }
.plx-col { min-width: 0; display: flex; flex-direction: column; gap: 16px; }

/* Text & Heading */
.plx-text { margin: 0; font-size: 16px; line-height: 1.65; color: #374151; }
.plx-h1   { margin: 0; font-size: 2.25rem; font-weight: 700; line-height: 1.2; color: #111; }
.plx-h2   { margin: 0; font-size: 1.6rem;  font-weight: 700; line-height: 1.2; color: #111; }
.plx-h3   { margin: 0; font-size: 1.25rem; font-weight: 600; line-height: 1.3; color: #111; }

/* List */
.plx-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.plx-list-item { padding: 10px 14px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 14px; color: #374151; }

/* Button */
.plx-btn-wrap { display: flex; }
.plx-btn {
  cursor: pointer; border: none; border-radius: 6px; padding: 10px 22px;
  font-size: 14px; font-weight: 600; transition: opacity 0.15s; font-family: inherit;
}
.plx-btn:hover { opacity: 0.85; }
.plx-btn.primary   { background: #2563eb; color: #fff; }
.plx-btn.secondary { background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; }
.plx-btn.ghost     { background: transparent; color: #2563eb; border: 1px solid #2563eb; }

/* Form */
.plx-form { display: flex; flex-direction: column; gap: 10px; }
.plx-form-label { font-size: 12px; font-weight: 500; color: #6b7280; display: flex; flex-direction: column; gap: 4px; }
.plx-form input, .plx-form textarea {
  background: #fff; border: 1px solid #d1d5db; border-radius: 6px;
  color: #111; font-size: 14px; padding: 8px 12px; outline: none; font-family: inherit;
}
.plx-form input:focus, .plx-form textarea:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.15); }

/* Stream */
.plx-stream {
  font-size: 14px; line-height: 1.7; white-space: pre-wrap;
  padding: 12px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;
  min-height: 80px;
}

/* JSON */
.plx-json {
  font-family: monospace; font-size: 13px; overflow: auto; white-space: pre;
  padding: 12px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;
}

/* Divider */
.plx-divider { border: none; border-top-style: solid; }

/* Result / loading */
.plx-result { margin-top: 8px; font-size: 13px; padding: 10px 14px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; white-space: pre-wrap; font-family: monospace; }
.plx-loading { opacity: 0.5; }

${site.globalStyles}
`.trim()
}

// ─── Runtime JS ──────────────────────────────────────────────────────────────

const RUNTIME_JS = `
let ws, msgId = 1;
const pending = new Map();

function connect(url) {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(url);
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error('WebSocket error'));
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        const id = msg.id; if (!id || !pending.has(id)) return;
        const { resolve: res, reject: rej, stream } = pending.get(id);
        if (msg.error) { pending.delete(id); rej(new Error(msg.error.message || 'RPC error')); return; }
        if (msg.result) {
          const item = msg.result;
          if (item.type === 'data')       { if (stream) stream(item.content); else { pending.delete(id); res(item.content); } }
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

async function renderElement(el, elem) {
  const b = elem.binding;
  switch (elem.type) {
    case 'heading': {
      const level = elem.props.level || 2;
      const h = document.createElement('h' + level);
      h.className = 'plx-h' + level;
      h.style.textAlign = elem.props.align || 'left';
      h.style.color     = (elem.props.color && elem.props.color !== 'inherit') ? elem.props.color : '';
      if (b) { try { h.textContent = String(await call(b.method, b.staticParams||{})); } catch(e){ h.textContent='Error: '+e.message; } }
      else h.textContent = elem.props.content || 'Heading';
      el.appendChild(h); break;
    }
    case 'text': {
      const p = document.createElement('p');
      p.className = 'plx-text';
      p.style.fontSize  = (elem.props.fontSize || 16) + 'px';
      p.style.textAlign = elem.props.align || 'left';
      p.style.color     = (elem.props.color && elem.props.color !== 'inherit') ? elem.props.color : '';
      if (b) { try { p.textContent = String(await call(b.method, b.staticParams||{})); } catch(e){ p.textContent='Error: '+e.message; } }
      else p.textContent = elem.props.content || '';
      el.appendChild(p); break;
    }
    case 'list': {
      const ul = document.createElement('ul'); ul.className = 'plx-list'; el.appendChild(ul);
      if (b) {
        ul.innerHTML = '<li class="plx-list-item plx-loading">Loading…</li>';
        try {
          const result = await call(b.method, b.staticParams||{});
          ul.innerHTML = '';
          const items = Array.isArray(result) ? result : (result?.items ?? result?.data ?? []);
          const lf = elem.props.labelField || 'name';
          if (!items.length) { const li = document.createElement('li'); li.className='plx-list-item'; li.textContent=elem.props.emptyText||'No items'; ul.appendChild(li); }
          for (const item of items) { const li = document.createElement('li'); li.className='plx-list-item'; li.textContent=typeof item==='object'?(item[lf]??JSON.stringify(item)):String(item); ul.appendChild(li); }
        } catch(e) { ul.innerHTML='<li class="plx-list-item">Error: '+e.message+'</li>'; }
      } break;
    }
    case 'button': {
      const wrap = document.createElement('div'); wrap.className = 'plx-btn-wrap'; el.appendChild(wrap);
      const btn = document.createElement('button');
      btn.className = 'plx-btn ' + (elem.props.variant || 'primary');
      btn.textContent = elem.props.label || 'Click me';
      wrap.appendChild(btn);
      const resultDiv = document.createElement('div'); resultDiv.className='plx-result'; resultDiv.style.display='none'; el.appendChild(resultDiv);
      if (b) btn.onclick = async () => {
        btn.disabled=true; btn.textContent='Running…';
        try { const r=await call(b.method,b.staticParams||{}); resultDiv.style.display='block'; resultDiv.textContent=JSON.stringify(r,null,2); }
        catch(e){ resultDiv.style.display='block'; resultDiv.textContent='Error: '+e.message; }
        finally { btn.disabled=false; btn.textContent=elem.props.label||'Click me'; }
      }; break;
    }
    case 'form': {
      const form = document.createElement('form'); form.className='plx-form'; el.appendChild(form);
      if (b) {
        const ta = document.createElement('textarea'); ta.className='plx-form-textarea'; ta.placeholder='JSON params'; ta.rows=3; form.appendChild(ta);
        const btn = document.createElement('button'); btn.type='submit'; btn.className='plx-btn primary'; btn.textContent=elem.props.submitLabel||'Submit'; form.appendChild(btn);
        const result = document.createElement('div'); result.className='plx-result'; result.style.display='none'; form.appendChild(result);
        form.onsubmit = async (e) => { e.preventDefault(); btn.disabled=true; let p=b.staticParams||{}; try{p={...p,...JSON.parse(ta.value||'{}')};}catch{} try{const r=await call(b.method,p); if(elem.props.showResult!==false){result.style.display='block';result.textContent=JSON.stringify(r,null,2);}}catch(err){result.style.display='block';result.textContent='Error: '+err.message;}finally{btn.disabled=false;} };
      } break;
    }
    case 'stream': {
      const pre = document.createElement('div'); pre.className='plx-stream'; pre.textContent=elem.props.placeholder||''; el.appendChild(pre);
      if (b) { pre.textContent=''; callStream(b.method,b.staticParams||{},(chunk)=>{ const t=typeof chunk==='string'?chunk:(chunk.content||chunk.message||JSON.stringify(chunk)); pre.textContent+=t; pre.scrollTop=pre.scrollHeight; }).catch(e=>{ pre.textContent+='\\nError: '+e.message; }); }
      break;
    }
    case 'json': {
      const pre = document.createElement('pre'); pre.className='plx-json'; el.appendChild(pre);
      if (b) { pre.textContent='Loading…'; try{pre.textContent=JSON.stringify(await call(b.method,b.staticParams||{}),null,2);}catch(e){pre.textContent='Error: '+e.message;} }
      else pre.textContent='{}';
      break;
    }
    case 'divider': {
      const hr = document.createElement('hr'); hr.className='plx-divider';
      hr.style.borderColor = elem.props.color || '#e5e7eb';
      hr.style.borderTopWidth = (elem.props.thickness||1) + 'px';
      hr.style.margin = (elem.props.margin||8) + 'px 0';
      el.appendChild(hr); break;
    }
    case 'spacer': {
      const div = document.createElement('div'); div.style.height=(elem.props.height||48)+'px'; el.appendChild(div); break;
    }
  }
}

async function boot(site) {
  try { await connect(site.backendUrl); } catch(e) { console.warn('[plexus] connect failed:', e.message); }
  const all = document.querySelectorAll('[data-elem]');
  for (const el of all) {
    const id = el.dataset.elem;
    let elem = null;
    for (const page of site.pages) for (const sec of page.sections) for (const col of sec.columns) { const e = col.elements.find(e=>e.id===id); if(e){elem=e;break;} }
    if (elem) await renderElement(el, elem);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('__site_data__');
  if (el) boot(JSON.parse(el.textContent));
});
`.trim()

// ─── HTML builder ─────────────────────────────────────────────────────────────

function renderElement(el: SiteElement): string {
  return `<div data-elem="${el.id}"></div>`
}

function renderColumn(col: SiteColumn): string {
  return `<div class="plx-col">${col.elements.map(renderElement).join('\n')}</div>`
}

function renderSection(sec: SiteSection): string {
  const bg      = sec.background && sec.background !== 'transparent' ? ` style="background:${sec.background};"` : ''
  const padding = `style="padding:${sec.paddingY}px 0;"`
  const cols    = sec.columns.map(c => `${c.span}fr`).join(' ')
  return `<section class="plx-section"${bg}>
  <div class="plx-section-inner" ${padding}>
    <div class="plx-columns" style="grid-template-columns:${cols};">
      ${sec.columns.map(renderColumn).join('\n      ')}
    </div>
  </div>
</section>`
}

function renderPage(page: Page): string {
  return `<main id="page-${page.id}">\n${page.sections.map(renderSection).join('\n')}\n</main>`
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function exportSiteHTML(site: Site): string {
  const css   = buildCSS(site)
  const pages = site.pages.map(renderPage).join('\n')
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

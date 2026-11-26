// Code Buddy prototype. Reads data/content.json (built by tools/build-content.mjs).
// Renders only what is in the content packs; never fills in missing values.

const CRITERIA_TAB = '__criteria';
const DEFAULT_PHASE = 'framing-and-structural'; // Phase 2
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STATUS_LABEL = { ok: 'OK', verify: 'Verify', 'confirm-locally': 'Confirm locally' };

let D = null;               // bundle
let state = { phase: null, open: new Set(), q: '' };

const jurLabel = (id) => (id.length <= 3 ? id.toUpperCase() : id[0].toUpperCase() + id.slice(1));
const ownerOf = (id) => D.jurisdictions.find((j) => j.id === id)?.owner || 'unassigned';
const humanize = (id) => id.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
const cite = (c) => c ? esc([c.code, c.edition, c.section && (/^§/.test(c.section.trim()) ? c.section : `§ ${c.section}`)].filter(Boolean).join(' ')) : '';

function resolvePhaseId(id) {
  if (!id) return id;
  const aliases = D?.phaseAliases || {
    framing: 'framing-and-structural',
    'framing-structure': 'framing-and-structural',
    footing: 'foundations',
    foundation: 'foundations',
    'foundation-slab': 'foundations',
    general: 'site-work-and-drainage',
    'pre-permit-site': 'site-work-and-drainage',
  };
  if (D?.phases?.some((p) => p.id === id) || id === CRITERIA_TAB) return id;
  return aliases[id] || id;
}

// Packs that create checklist items (statewide). Local packs = everything else.
let basePacks = [], localPacks = [];

function indexBundle() {
  const withItems = new Set(D.items.map((i) => i.jurisdiction));
  basePacks = D.jurisdictions.filter((j) => withItems.has(j.id)).map((j) => j.id);
  if (!basePacks.length && D.jurisdictions.length) basePacks = [D.jurisdictions.find((j) => j.id === 'nys')?.id || D.jurisdictions[0].id];
  localPacks = D.jurisdictions.map((j) => j.id).filter((j) => !basePacks.includes(j));
}

function navPhases() {
  return D.phases.filter((p) => p.canonical !== false);
}

// Items for a phase: real items plus stubs for local notes whose item has no statewide entry yet.
function itemsFor(phaseId) {
  const real = D.items.filter((i) => i.phase === phaseId);
  const known = new Set(real.map((i) => i.id));
  const stubs = new Map();
  for (const n of D.localNotes) {
    if (n.phase !== phaseId || known.has(n.itemId) || stubs.has(n.itemId)) continue;
    stubs.set(n.itemId, { id: n.itemId, phase: phaseId, title: humanize(n.itemId), summary: '', stub: true, requirementRefs: [], tableRefs: [], criteriaRefs: [] });
  }
  return [...real, ...stubs.values()];
}
const notesFor = (it) => D.localNotes.filter((n) => n.phase === it.phase && n.itemId === it.id);

function badge(status, reason) {
  if (!status) return '';
  return `<span class="badge ${esc(status)}">${esc(STATUS_LABEL[status] || status)}</span>` +
    (reason ? `<div class="reason ${esc(status)}">${esc(reason)}</div>` : '');
}
const emptyBox = (what, jur) => `<p class="empty">No ${esc(jurLabel(jur))} ${what} yet for this item. <b>Owner: ${esc(ownerOf(jur))}</b></p>`;

function renderRequirement(r, id) {
  if (!r) return `<p class="empty">Missing requirement <code>${esc(id)}</code> (referenced but not in any loaded file).</p>`;
  return `<div class="card">${badge(r.status)}<p>${esc(r.text)}</p><div class="cite">${cite(r.citation)}</div>` +
    (r.status !== 'ok' && r.statusReason ? `<div class="reason ${esc(r.status)}">${esc(r.statusReason)}</div>` : '') +
    (r.callouts?.length ? `<ul class="callouts">${r.callouts.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : '') + `</div>`;
}

function renderTable(t, id) {
  if (!t) return `<p class="empty">Missing table <code>${esc(id)}</code> (referenced but not in any loaded file).</p>`;
  const head = t.columns.map((c) => `<th scope="col">${esc(c)}</th>`).join('');
  const body = t.rows.map((row) => `<tr>${row.map((cell, i) => i === 0 ? `<th scope="row">${esc(cell)}</th>` : `<td>${esc(cell)}</td>`).join('')}</tr>`).join('');
  return `<div class="card">${badge(t.status)}
    <p class="tbl-title">${esc(t.title)}</p>
    <div class="cite">Table ${esc(t.sourceTable)} · ${cite(t.citation)}</div>
    ${t.units ? `<p class="cite">Units: ${esc(t.units)}</p>` : ''}
    ${t.status !== 'ok' && t.statusReason ? `<div class="reason ${esc(t.status)}">${esc(t.statusReason)}</div>` : ''}
    <div class="tbl-wrap" tabindex="0" role="region" aria-label="Table ${esc(t.sourceTable)}, scrolls sideways"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>
    ${t.footnotes?.length ? `<ol class="foot-notes">${t.footnotes.map((f) => `<li>${esc(f)}</li>`).join('')}</ol>` : ''}
  </div>`;
}

function renderNote(n) {
  return `<div class="card"><span class="jur">${esc(jurLabel(n.jurisdiction))}</span> ${badge(n.status)}
    <p>${esc(n.text)}</p><div class="cite">${cite(n.source)}</div>
    ${n.status && n.status !== 'ok' && n.statusReason ? `<div class="reason ${esc(n.status)}">${esc(n.statusReason)}</div>` : ''}</div>`;
}

function renderCriterion(c, id) {
  if (!c) return `<p class="empty">Missing design criterion <code>${esc(id)}</code> (referenced but not in any loaded file).</p>`;
  return `<div class="card"><span class="jur">${esc(jurLabel(c.jurisdiction))}</span> ${badge(c.status)}
    <div class="crit-row"><span>${esc(c.name)}</span><span class="crit-val">${esc(c.value)}${c.unit ? ' ' + esc(c.unit) : ''}</span></div>
    <div class="cite">${cite(c.citation)}</div>
    ${c.status !== 'ok' && c.statusReason ? `<div class="reason ${esc(c.status)}">${esc(c.statusReason)}</div>` : ''}</div>`;
}

function renderDetail(it) {
  const base = it.jurisdiction || basePacks[0];
  const notes = notesFor(it);
  let h = '<div class="detail">';
  h += '<h3>Requirements</h3>';
  h += it.requirementRefs.length ? it.requirementRefs.map((id) => renderRequirement(D.requirements[id], id)).join('') : emptyBox('requirements', base);
  h += '<h3>Tables</h3>';
  h += it.tableRefs.length ? it.tableRefs.map((id) => renderTable(D.tables[id], id)).join('') : (it.stub ? emptyBox('tables', base) : '<p class="empty">No tables for this item.</p>');
  h += '<h3>Local notes</h3>';
  const packs = localPacks.length ? localPacks : [];
  if (!packs.length) h += '<p class="empty">No local packs loaded.</p>';
  for (const j of packs) {
    const mine = notes.filter((n) => n.jurisdiction === j);
    h += mine.length ? mine.map(renderNote).join('') : `<p class="empty">No ${esc(jurLabel(j))} notes yet for this item. <b>Owner: ${esc(ownerOf(j))}</b></p>`;
  }
  h += '<h3>Design criteria</h3>';
  h += it.criteriaRefs.length ? it.criteriaRefs.map((id) => renderCriterion(D.criteria[id], id)).join('')
    : `<p class="empty">No design criteria linked to this item yet (item owner: ${esc(ownerOf(base))}). All criteria are under the “Design criteria” tab.</p>`;
  return h + '</div>';
}

function itemRow(it) {
  const key = `${it.phase}/${it.id}`;
  const open = state.open.has(key);
  const nNotes = notesFor(it).length;
  const chips = [
    it.stub ? `<span class="chip stub">No ${esc(jurLabel(basePacks[0] || 'nys'))} item yet</span>` : '',
    it.tableRefs.length ? `<span class="chip">${it.tableRefs.length} table${it.tableRefs.length > 1 ? 's' : ''}</span>` : '',
    nNotes ? `<span class="chip loc">${nNotes} local note${nNotes > 1 ? 's' : ''}</span>` : '',
  ].join('');
  return `<li class="item" data-open="${open}" id="i-${esc(it.phase)}--${esc(it.id)}">
    <button type="button" aria-expanded="${open}" data-key="${esc(key)}">
      <span class="chev" aria-hidden="true">▸</span>
      <span><span class="t">${esc(it.title)}</span>${it.summary ? `<span class="s">${esc(it.summary)}</span>` : ''}${chips ? `<span class="meta">${chips}</span>` : ''}</span>
    </button>${open ? renderDetail(it) : ''}</li>`;
}

function matches(it, q) {
  const hay = [it.title, it.summary, ...it.requirementRefs.map((r) => D.requirements[r]?.text), ...notesFor(it).map((n) => n.text)].join(' \n ').toLowerCase();
  return q.split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

function countLabel(n) {
  return `${n} item${n === 1 ? '' : 's'}`;
}

function renderNav() {
  const tabs = navPhases().map((p) => {
    const n = itemsFor(p.id).length;
    const on = !state.q && state.phase === p.id;
    return `<button type="button" data-phase="${esc(p.id)}" aria-pressed="${on}" aria-label="Phase ${p.order}: ${esc(p.title)}">
      <span class="num" aria-hidden="true">${p.order}</span>
      <span class="ph-text"><span class="ph-title">${esc(p.title)}</span><span class="count">${esc(countLabel(n))}</span></span>
    </button>`;
  });
  $('#phases').innerHTML = tabs.join('');

  const nCrit = Object.keys(D.criteria).length;
  if (nCrit) {
    const on = !state.q && state.phase === CRITERIA_TAB;
    $('#aux-nav').innerHTML = `<button type="button" class="criteria-tab" data-phase="${CRITERIA_TAB}" aria-pressed="${on}">Design criteria<span class="count">${nCrit}</span></button>`;
  } else {
    $('#aux-nav').innerHTML = '';
  }
}

function emptyPhaseState(p) {
  const list = itemsFor(p.id);
  const real = list.filter((i) => !i.stub);
  const notes = D.localNotes.filter((n) => n.phase === p.id);
  if (real.length) return '';
  const base = basePacks[0] || 'nys';
  const locals = localPacks.length ? localPacks : D.jurisdictions.filter((j) => j.id !== base).map((j) => j.id);
  let h = `<p class="empty">No ${esc(jurLabel(base))} checklist items yet for this phase. <b>Owner: ${esc(ownerOf(base))}</b></p>`;
  if (!notes.length) {
    if (!locals.length) h += `<p class="empty">No local notes yet.</p>`;
    for (const j of locals) {
      h += `<p class="empty">No local notes yet. <b>Owner: ${esc(ownerOf(j))}</b></p>`;
    }
  }
  return h;
}

function render() {
  renderNav();

  let h = '';
  if (state.q) {
    let total = 0;
    for (const p of navPhases()) {
      const hits = itemsFor(p.id).filter((it) => matches(it, state.q.toLowerCase()));
      total += hits.length;
      if (hits.length) h += `<h2 class="phase-head">${esc(p.title)} · ${hits.length}</h2><ul class="list">${hits.map(itemRow).join('')}</ul>`;
    }
    if (!total) h = `<p class="empty">No items match “${esc(state.q)}”.</p>`;
  } else if (state.phase === CRITERIA_TAB) {
    for (const j of D.jurisdictions) {
      const list = Object.values(D.criteria).filter((c) => c.jurisdiction === j.id);
      h += `<h2 class="phase-head">${esc(jurLabel(j.id))} design criteria</h2><div class="detail" style="border:0;padding-top:8px">` +
        (list.length ? list.map((c) => renderCriterion(c, c.id)).join('') : `<p class="empty">No ${esc(jurLabel(j.id))} design criteria yet. <b>Owner: ${esc(j.owner)}</b></p>`) + '</div>';
    }
  } else {
    const p = D.phases.find((x) => x.id === state.phase);
    if (!p) h = `<p class="empty">No phases in the content yet. <b>Owner: ${esc(ownerOf(basePacks[0] || 'nys'))}</b></p>`;
    else {
      const list = itemsFor(p.id);
      h += `<h2 class="phase-head">${esc(p.title)} · ${esc(countLabel(list.length))}</h2>`;
      h += emptyPhaseState(p);
      if (list.length) h += `<ul class="list">${list.map(itemRow).join('')}</ul>`;
    }
  }
  $('#main').innerHTML = h;
}

function renderFooter() {
  const r = D.report;
  const bad = r.files.filter((f) => !f.ok);
  $('#packs').textContent = 'Packs: ' + D.jurisdictions.map((j) => `${jurLabel(j.id)} (${j.owner})`).join(' · ');
  $('#foot').innerHTML = `<div>Content built ${esc(new Date(D.generatedAt).toLocaleString())} · ${r.files.filter((f) => f.ok).length}/${r.files.length} files loaded · ${esc(D.contentHash || '')}</div>
    ${bad.length ? `<div class="bad">${bad.length} file(s) failed validation and were skipped: ${bad.map((f) => `${esc(f.file)} (owner: ${esc(f.owner)})`).join(', ')}</div>` : ''}
    <details><summary>Validation report</summary><ul>${r.files.map((f) => `<li>${f.ok ? 'PASS' : '<span class="bad">FAIL</span>'} ${esc(f.file)} · owner: ${esc(f.owner)}${f.errors.length ? '<ul>' + f.errors.map((e) => `<li>${esc(e)}</li>`).join('') + '</ul>' : ''}</li>`).join('')}
    ${r.warnings.map((w) => `<li>WARN · owner: ${esc(w.owner)} · ${esc(w.message)}</li>`).join('')}</ul></details>
    <p>Reference aid only. Statuses “Verify” and “Confirm locally” are not confirmed values; check the cited source.</p>`;
}

function setNet() {
  const el = $('#net');
  el.textContent = navigator.onLine ? '' : 'Offline';
  el.className = 'net' + (navigator.onLine ? '' : ' off');
}

function readHash() {
  const raw = decodeURIComponent(location.hash.slice(1));
  if (!raw) return;
  const [phRaw, item] = raw.split('/');
  const ph = resolvePhaseId(phRaw);
  if (ph && (D.phases.some((p) => p.id === ph) || ph === CRITERIA_TAB)) state.phase = ph;
  if (ph && item) state.open.add(`${ph}/${item}`);
}

document.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-phase]');
  if (tab) {
    state.phase = tab.dataset.phase; state.q = ''; $('#q').value = '';
    localStorage.setItem('cb.phase', state.phase);
    history.replaceState(null, '', '#' + state.phase);
    render(); window.scrollTo(0, 0); return;
  }
  const row = e.target.closest('button[data-key]');
  if (row) {
    const k = row.dataset.key;
    state.open.has(k) ? state.open.delete(k) : state.open.add(k);
    render();
    if (state.open.has(k)) document.getElementById('i-' + k.replace('/', '--'))?.scrollIntoView({ block: 'start' });
  }
});
let t;
$('#q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value.trim(); render(); }, 120); });
addEventListener('online', setNet); addEventListener('offline', setNet);

async function boot() {
  setNet();
  try {
    const res = await fetch('data/content.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    D = await res.json();
  } catch (err) {
    $('#main').innerHTML = `<p class="empty">Could not load content (${esc(err.message)}). Run <code>node tools/build-content.mjs</code> and reload.</p>`;
    return;
  }
  indexBundle();
  state.phase = D.phases.find((p) => p.id === DEFAULT_PHASE)?.id || D.phases.find((p) => p.order === 2)?.id || D.phases[0]?.id || null;
  const saved = resolvePhaseId(localStorage.getItem('cb.phase'));
  if (saved && (D.phases.some((p) => p.id === saved) || saved === CRITERIA_TAB)) state.phase = saved;
  readHash();
  renderFooter();
  render();
  if (location.hash.split('/')[1]) {
    const [phRaw, item] = decodeURIComponent(location.hash.slice(1)).split('/');
    const ph = resolvePhaseId(phRaw);
    if (item) document.getElementById('i-' + `${ph}--${item}`)?.scrollIntoView();
  }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW registration failed', e));
}
boot();

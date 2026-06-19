'use strict';

// ─── Estado global ────────────────────────────────────────────────────────────

const state = {
  username: '',
  thresholds: {...DEFAULT_THRESHOLDS},
  activeProfile: 'P1',
  activeHouseholdIndex: 0,
  showReferenceLabels: false,
  hasGT: true,
  datasetLabel: 'Demo · 10 hogares',
  searchText: '',
  filteredIndices: HOUSEHOLDS.map((_, i) => i),
  profiles: Object.fromEntries(
    Object.keys(PROFILES).map(p => [p, {
      phase: 1,
      expertLabels: {},
      optimizedWeights: null,
      liveWeights: null,
    }])
  ),
  _autoTimer: null,
};

const ps  = () => state.profiles[state.activeProfile];
const pd  = () => PROFILES[state.activeProfile];
const T   = () => state.thresholds;
const hhA = () => HOUSEHOLDS[state.activeHouseholdIndex];

function currentWeights() {
  const s   = ps();
  const base = s.liveWeights || s.optimizedWeights || {...pd().init_weights};
  const raw  = {};
  for (const k of pd().weight_keys) raw[k] = Math.max(0.001, base[k] || 0.001);
  const sum = Object.values(raw).reduce((a, b) => a + b, 0);
  if (sum > 0) for (const k in raw) raw[k] /= sum;
  return raw;
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

const tipEl = document.getElementById('tooltip');
function showTip(anchor, html) {
  tipEl.innerHTML = html;
  tipEl.removeAttribute('hidden');
  const r = anchor.getBoundingClientRect();
  let left = r.right + 8, top = r.top;
  tipEl.style.left = left + 'px';
  tipEl.style.top  = top  + 'px';
  requestAnimationFrame(() => {
    const tr = tipEl.getBoundingClientRect();
    if (tr.right  > window.innerWidth  - 8) tipEl.style.left = (r.left - tr.width - 8) + 'px';
    if (tr.bottom > window.innerHeight - 8) tipEl.style.top  = (window.innerHeight - tr.height - 8) + 'px';
  });
}
function hideTip() { tipEl.setAttribute('hidden', ''); }

// ─── Login ────────────────────────────────────────────────────────────────────

function showLoginScreen() {
  document.getElementById('login-screen').removeAttribute('hidden');
  document.getElementById('main-screen').setAttribute('hidden', '');
  const saved = localStorage.getItem('sociarem_username');
  const inp   = document.getElementById('login-username');
  if (saved && inp) inp.value = saved;
  if (inp) inp.focus();
}

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  if (!el) return;
  el.textContent = msg;
  el.removeAttribute('hidden');
}

function hideLoginError() {
  const el = document.getElementById('login-error');
  if (el) el.setAttribute('hidden', '');
}

function enterApp() {
  const inp      = document.getElementById('login-username');
  const passInp  = document.getElementById('login-password');
  const username = inp ? inp.value.trim() : '';
  const password = passInp ? passInp.value : '';

  if (!username) {
    showLoginError('Introduce un nombre de evaluador.');
    if (inp) inp.focus();
    return;
  }
  if (password !== APP_PASSWORD) {
    showLoginError('Contraseña incorrecta.');
    if (passInp) { passInp.focus(); passInp.select(); }
    return;
  }
  hideLoginError();
  state.username = username;
  localStorage.setItem('sociarem_username', username);
  if (passInp) passInp.value = '';
  document.getElementById('login-screen').setAttribute('hidden', '');
  document.getElementById('main-screen').removeAttribute('hidden');
  buildMainScreen();
  runParityTests();
}

function changeUser() {
  document.getElementById('main-screen').setAttribute('hidden', '');
  document.getElementById('login-screen').removeAttribute('hidden');
  hideLoginError();
  const inp = document.getElementById('login-username');
  const passInp = document.getElementById('login-password');
  if (inp) { inp.value = state.username || localStorage.getItem('sociarem_username') || ''; }
  if (passInp) passInp.value = '';
  if (passInp) passInp.focus(); else if (inp) inp.focus();
}

// ─── Construcción principal ───────────────────────────────────────────────────

function buildMainScreen() {
  renderTopbar();
  renderDataPanel();
  renderSidebar();
  renderAll();
}

function renderAll() {
  applySearch();
  renderSidebar();
  renderHouseholdHeader();
  renderContentArea();
}

// ─── Topbar ───────────────────────────────────────────────────────────────────

function renderTopbar() {
  const wrap = document.getElementById('profile-buttons');
  if (wrap) {
    wrap.innerHTML = Object.entries(PROFILES).map(([pid, def]) => `
      <button class="profile-btn ${state.activeProfile === pid ? 'active' : ''}"
              style="${state.activeProfile === pid ? `background:${def.color}` : ''}"
              onclick="switchProfile('${pid}')">${pid} · ${def.short}</button>
    `).join('');
  }
  const userEl = document.getElementById('topbar-user');
  if (userEl) userEl.textContent = state.username;
}

function switchProfile(pid) {
  state.activeProfile = pid;
  renderTopbar();
  renderSidebar();
  renderHouseholdHeader();
  renderContentArea();
}

function toggleRefLabels() {
  if (!state.hasGT) {
    document.getElementById('ref-toggle-check').checked = false;
    return;
  }
  state.showReferenceLabels = document.getElementById('ref-toggle-check').checked;
  renderSidebar();
  renderHouseholdHeader();
  if (ps().phase === 1) renderContentArea();
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function applySearch() {
  const q = state.searchText.trim().toLowerCase();
  state.filteredIndices = HOUSEHOLDS.reduce((arr, hh, i) => {
    if (!q || hh.nombre.toLowerCase().includes(q) || hh.id.toLowerCase().includes(q)) arr.push(i);
    return arr;
  }, []);
}

function onSearch(val) {
  state.searchText = val;
  applySearch();
  renderSidebar();
}

function renderSidebar() {
  const el = document.getElementById('sidebar-profile-info');
  if (el) { el.style.color = pd().color; el.textContent = `${state.activeProfile} · ${pd().short}`; }

  const list = document.getElementById('sidebar-list');
  if (!list) return;
  const labeled = ps().expertLabels;

  list.innerHTML = state.filteredIndices.map(i => {
    const hh  = HOUSEHOLDS[i];
    const lbl = labeled[hh.id];
    const lvl = lbl !== undefined ? VULNERABILITY_LEVELS[lbl] : null;
    const dotColor = lvl ? lvl.color : '#D1D5DB';
    const levelTag = lvl
      ? `<span class="sidebar-level-tag" style="background:${lvl.color}20;color:${lvl.color}">${lvl.short}</span>`
      : '';

    let refTag = '';
    if (state.showReferenceLabels && hh.gt) {
      const g = hh.gt[state.activeProfile];
      if (g !== undefined) {
        const gv = VULNERABILITY_LEVELS[g];
        refTag = `<span class="sidebar-ref-tag">(${gv.short})</span>`;
      }
    }

    return `<button class="sidebar-item ${i === state.activeHouseholdIndex ? 'active' : ''}"
                onclick="selectHousehold(${i})">
        <span class="sidebar-dot" style="color:${dotColor}">⬤</span>
        <span class="sidebar-item-name">${hh.nombre}</span>
        ${levelTag}${refTag}
      </button>`;
  }).join('');

  renderSidebarBottom();
}

function renderSidebarBottom() {
  const el = document.getElementById('sidebar-bottom');
  if (!el) return;
  const nLabeled = Object.keys(ps().expertLabels).length;
  const nTotal   = HOUSEHOLDS.length;
  const pct      = Math.round(nLabeled / nTotal * 100);
  const canOpt   = nLabeled >= 3 && ps().phase === 1;
  const inPhase2 = ps().phase === 2;

  el.innerHTML = `
    <div class="sidebar-progress ${nLabeled === nTotal ? 'ok' : ''}">
      ${nLabeled}/${nTotal} etiquetados (${pct}%)
    </div>
    ${inPhase2 ? `
      <button class="btn btn-secondary btn-sm btn-full mb-1" onclick="backToPhase1()">← Volver a fase 1</button>
    ` : `
      ${state.hasGT ? `
        <button class="btn btn-secondary btn-sm btn-full mb-1" onclick="autoAssign(true)">▷ Auto-demo</button>
        <button class="btn btn-secondary btn-sm btn-full mb-1"
                title="Copia las etiquetas de referencia a los 6 perfiles, para los 10 hogares"
                onclick="autoAssignAllProfiles()">⚡ Asignar todo (6 perfiles)</button>
      ` : ''}
      ${canOpt
        ? `<button class="btn btn-accent2 btn-sm btn-full" onclick="runOptimization()">⟳ Optimizar pesos</button>`
        : `<button class="btn btn-secondary btn-sm btn-full" disabled title="Necesitas ≥3 etiquetas">⟳ Optimizar pesos</button>`}
    `}
  `;
}

function backToPhase1() {
  ps().phase = 1;
  ps().liveWeights = null;
  renderSidebar();
  renderHouseholdHeader();
  renderContentArea();
}

// ─── Cabecera del hogar ───────────────────────────────────────────────────────

function renderHouseholdHeader() {
  const hh  = hhA();
  const el  = document.getElementById('household-header');
  if (!el) return;
  const pos   = state.filteredIndices.indexOf(state.activeHouseholdIndex);
  const total = state.filteredIndices.length;

  let refLine = '';
  if (state.showReferenceLabels && hh.gt) {
    const g = hh.gt[state.activeProfile];
    if (g !== undefined) {
      const gv = VULNERABILITY_LEVELS[g];
      refLine = `<span class="hh-ref-badge" style="color:${gv.color};border-color:${gv.color}">${gv.value} · ${gv.label}</span>`;
    }
  }

  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <div>
        <div class="hh-id">${hh.id}</div>
        <div class="hh-name">${hh.nombre}</div>
      </div>
      ${refLine}
      <div class="hh-nav" style="margin-left:auto">
        <button class="nav-btn" onclick="navHousehold(-1)" ${pos <= 0 ? 'disabled' : ''}>‹</button>
        <span class="nav-counter">${pos >= 0 ? pos+1 : '?'}/${total}</span>
        <button class="nav-btn" onclick="navHousehold(1)" ${pos >= total-1 ? 'disabled' : ''}>›</button>
      </div>
    </div>
  `;
}

function navHousehold(dir) {
  const fi  = state.filteredIndices;
  const pos = fi.indexOf(state.activeHouseholdIndex);
  const nxt = pos + dir;
  if (nxt >= 0 && nxt < fi.length) selectHousehold(fi[nxt]);
}

function selectHousehold(idx) {
  state.activeHouseholdIndex = idx;
  renderSidebar();
  renderHouseholdHeader();
  renderContentArea();
}

// ─── Zona de contenido ────────────────────────────────────────────────────────

function renderContentArea() {
  const area = document.getElementById('content-area');
  if (!area) return;
  area.className = '';
  if (ps().phase === 2) renderPhase2(area);
  else                  renderPhase1(area);
}

// ─── Fase 1 ───────────────────────────────────────────────────────────────────

function renderPhase1(area) {
  const hh      = hhA();
  const profDef = pd();

  const progressHtml = Object.entries(PROFILES).map(([pid, def]) => {
    const n = Object.keys(state.profiles[pid].expertLabels).length;
    return `<div class="profile-progress-cell">
      <div class="profile-progress-count" style="color:${def.color}">${n}</div>
      <div class="profile-progress-label">${pid}</div>
    </div>`;
  }).join('');

  const cards = profDef.display_keys.map(k => indicatorCard(k, hh)).join('');

  const lbl       = ps().expertLabels[hh.id];
  const lblStatus = lbl !== undefined
    ? `<span style="color:${VULNERABILITY_LEVELS[lbl].color};font-weight:700">✓ Nivel ${lbl} · ${VULNERABILITY_LEVELS[lbl].label}</span>`
    : '<span class="text-muted">Sin etiquetar</span>';

  const ordinalBtns = VULNERABILITY_LEVELS.map(lvl => {
    const isActive = lbl === lvl.value;
    return `<button class="ordinal-btn ${isActive ? 'ordinal-active' : ''}"
                    style="${isActive ? `background:${lvl.color};border-color:${lvl.color};color:#fff` : ''}"
                    onclick="setExpertLabel('${hh.id}',${lvl.value})">
              <span class="ordinal-num">${lvl.value}</span>
              <span class="ordinal-lbl">${lvl.short}</span>
            </button>`;
  }).join('');

  area.innerHTML = `
    <div class="progress-card">
      <div class="section-heading" style="margin-bottom:6px">Progreso de etiquetado</div>
      <div class="progress-grid">${progressHtml}</div>
    </div>

    <div class="section-heading mb-2">${state.activeProfile} · ${profDef.short}</div>
    <div class="indicator-grid mb-3">${cards}</div>

    <div class="validation-card">
      <div class="validation-question">${profDef.question}</div>
      <div class="validation-hint">Evalúa los indicadores del perfil. Tu criterio prima sobre los datos.</div>
      <div class="ordinal-buttons">${ordinalBtns}</div>
      <div class="validation-status">${lblStatus}</div>
    </div>
  `;
}

function indicatorCard(k, hh) {
  const def        = INDICATOR_DEFS[k];
  const badgeClass = def.role === 'pri' ? 'badge-pri' : 'badge-sec';
  const roleLabel  = def.role === 'pri' ? 'PRI' : 'SEC';
  const derivedTag = def.derived ? '<span class="derived-tag">derivado</span>' : '';
  const tipHtml    = `<b>${def.long}</b><br><br>${def.definition}<br><br><i>${def.source}</i>`;

  return `<div class="indicator-card">
    <div class="card-top">
      <span class="badge ${badgeClass}">${k}</span>
      <span class="role-label">${roleLabel}</span>
      ${derivedTag}
      <button class="info-btn" data-tip="${escHtml(tipHtml)}"
              onmouseenter="showTip(this,this.dataset.tip)"
              onmouseleave="hideTip()">ⓘ</button>
    </div>
    <div class="indicator-name">${def.name}</div>
    <div class="indicator-value">${def.display(hh, T())}</div>
    <div class="indicator-note">${def.note(T())}</div>
  </div>`;
}

// ─── Etiquetado ordinal ───────────────────────────────────────────────────────

function setExpertLabel(hhId, level) {
  const wasUnlabeled = ps().expertLabels[hhId] === undefined;
  ps().expertLabels[hhId] = level;

  if (wasUnlabeled) {
    const fi  = state.filteredIndices;
    const pos = fi.indexOf(state.activeHouseholdIndex);
    if (pos >= 0 && pos < fi.length - 1) { selectHousehold(fi[pos + 1]); return; }
  }
  renderSidebar();
  renderContentArea();
}

// ─── Auto-asignación ─────────────────────────────────────────────────────────

function autoAssign(animated) {
  if (!state.hasGT) { alert('El dataset actual no tiene etiquetas de referencia.'); return; }
  if (state._autoTimer) { clearTimeout(state._autoTimer); state._autoTimer = null; }
  if (animated) {
    _autoStep(0);
  } else {
    for (const hh of HOUSEHOLDS) ps().expertLabels[hh.id] = hh.gt[state.activeProfile];
    renderAll();
  }
}

// Asigna las etiquetas de referencia a TODOS los perfiles (P1–P6), no solo
// al perfil activo. Pensado para preparar la demo de un solo golpe.
function autoAssignAllProfiles() {
  if (!state.hasGT) { alert('El dataset actual no tiene etiquetas de referencia.'); return; }
  if (state._autoTimer) { clearTimeout(state._autoTimer); state._autoTimer = null; }
  for (const pid of Object.keys(state.profiles)) {
    for (const hh of HOUSEHOLDS) {
      state.profiles[pid].expertLabels[hh.id] = hh.gt[pid];
    }
  }
  renderAll();
  showNotification('Etiquetas de referencia asignadas en los 6 perfiles.');
}

function _autoStep(i) {
  if (i >= HOUSEHOLDS.length) { renderAll(); return; }
  const hh = HOUSEHOLDS[i];
  ps().expertLabels[hh.id] = hh.gt[state.activeProfile];
  state.activeHouseholdIndex = i;
  renderSidebar();
  renderHouseholdHeader();
  renderContentArea();
  state._autoTimer = setTimeout(() => _autoStep(i + 1), 170);
}

// ─── Optimización ─────────────────────────────────────────────────────────────

function runOptimization() {
  if (Object.keys(ps().expertLabels).length < 3) {
    alert('Necesitas al menos 3 hogares etiquetados para optimizar.');
    return;
  }
  const btn = document.querySelector('[onclick="runOptimization()"]');
  if (btn) { btn.textContent = '⟳ Optimizando…'; btn.disabled = true; }
  setTimeout(() => {
    const w = optimizeWeights(state.activeProfile, ps().expertLabels, T());
    ps().optimizedWeights = w;
    ps().liveWeights = Object.fromEntries(pd().weight_keys.map(k => [k, (w[k] || 0) * 100]));
    ps().phase = 2;
    renderSidebar();
    renderHouseholdHeader();
    renderContentArea();
  }, 30);
}

// ─── Fase 2 · Layout compacto 2 columnas ─────────────────────────────────────

function renderPhase2(area) {
  const hh      = hhA();
  const w       = currentWeights();
  const profDef = pd();
  const color   = profDef.color;
  const metrics = computeOrdinalMetrics(w, state.activeProfile, ps().expertLabels, T());

  // Score del hogar activo
  const sc        = scoreHousehold(hh, w, state.activeProfile, T());
  const predLevel = scoreToLevel(sc);
  const predDef   = VULNERABILITY_LEVELS[predLevel];
  const expLabel  = ps().expertLabels[hh.id];

  // Sliders de pesos
  const sliderRows = profDef.weight_keys.map(k => {
    const def      = INDICATOR_DEFS[k];
    const curW     = w[k] || 0;
    const initW    = profDef.init_weights[k];
    const liveRaw  = ps().liveWeights ? ps().liveWeights[k] : curW * 100;
    const sliderVal = Math.max(0.1, Math.round(liveRaw * 10) / 10);
    const delta    = curW - initW;
    const deltaStr = delta >= 0 ? `+${(delta*100).toFixed(1)}%` : `${(delta*100).toFixed(1)}%`;
    const dColor   = Math.abs(delta) < 0.005 ? '#9CA3AF' : delta > 0 ? '#D97706' : '#6B7280';
    return `<div class="weight-row-c">
      <span class="badge badge-sec wk">${k}</span>
      <span class="wname">${def.name}</span>
      <input type="range" class="weight-slider wslider" data-key="${k}"
             min="0.1" max="100" step="0.1" value="${sliderVal}" oninput="onWeightChange()">
      <span class="wval" id="wval-${k}">${(curW*100).toFixed(1)}%</span>
      <span class="wdelta" id="wdelta-${k}" style="color:${dColor}">${deltaStr}</span>
    </div>`;
  }).join('');

  // Tabla compacta
  const tableRows = HOUSEHOLDS.map(h => compactTableRow(h, w)).join('');

  // Panel de versiones
  const versionsHtml = buildWeightVersionPanel();

  area.innerHTML = `
    <div class="phase2-layout">

      <!-- Panel izquierdo -->
      <div class="phase2-left">

        <!-- Score hogar activo -->
        <div class="score-compact" id="score-compact" style="border-left-color:${predDef.color}">
          <div class="sc-label">${hh.nombre} · ${state.activeProfile}</div>
          <div class="sc-row">
            <span class="sc-pct" id="sc-pct" style="color:${predDef.color}">${(sc*100).toFixed(1)}%</span>
            <span class="sc-level" id="sc-level" style="color:${predDef.color}">${predLevel} · ${predDef.label}</span>
          </div>
          ${expLabel !== undefined
            ? `<div class="sc-exp">Experto: <b id="sc-exp-val" style="color:${VULNERABILITY_LEVELS[expLabel].color}">${expLabel} · ${VULNERABILITY_LEVELS[expLabel].label}</b></div>`
            : `<div class="sc-exp text-muted" id="sc-exp-val">Sin etiquetar</div>`}
        </div>

        <!-- Métricas compactas -->
        <div class="metrics-compact">
          <span class="mc-item">MAE <b id="met-mae">${metrics.mae.toFixed(2)}</b></span>
          <span class="mc-item">RMSE <b id="met-rmse">${metrics.rmse.toFixed(2)}</b></span>
          <span class="mc-item">Exactas <b id="met-exact">${(metrics.exactAccuracy*100).toFixed(0)}%</b></span>
          <span class="mc-item">±1 <b id="met-within1">${(metrics.withinOneAccuracy*100).toFixed(0)}%</b></span>
          <span class="mc-item text-muted">n=${metrics.n}</span>
        </div>

        <!-- Sliders de pesos -->
        <div class="weights-compact-card">
          <div class="wc-header">
            <span style="font-size:0.82rem;font-weight:700;color:var(--accent2)">Pesos · ${state.activeProfile}</span>
            <div style="display:flex;gap:4px">
              <button class="btn btn-secondary btn-sm" style="font-size:0.7rem;padding:2px 6px" onclick="resetToOptimized()">↩ opt</button>
              <button class="btn btn-secondary btn-sm" style="font-size:0.7rem;padding:2px 6px" onclick="resetToInit()">↩ ini</button>
              <button class="btn btn-secondary btn-sm" style="font-size:0.7rem;padding:2px 6px" onclick="exportWeightsJson()">↓ JSON</button>
              <button class="btn btn-secondary btn-sm" style="font-size:0.7rem;padding:2px 6px" onclick="document.getElementById('import-weights-input').click()">↑ JSON</button>
            </div>
          </div>
          <div id="weight-rows-wrap">${sliderRows}</div>
        </div>

        <!-- Versiones de pesos -->
        ${versionsHtml}

        <!-- Exportación -->
        <div class="export-row">
          <button class="btn btn-secondary btn-sm" onclick="exportResults('json')">↓ JSON</button>
          <button class="btn btn-secondary btn-sm" onclick="exportResults('csv')">↓ CSV</button>
          <label class="export-gt-label">
            <input type="checkbox" id="export-gt"> Incluir ref.
          </label>
        </div>

      </div>

      <!-- Panel derecho: tabla de hogares -->
      <div class="phase2-right">
        <div class="ct-header">
          <span style="color:${color};font-weight:700;font-size:0.82rem">${profDef.name}</span>
        </div>
        <div class="compact-table-header">
          <span>Hogar</span>
          <span>Score</span>
          <span>Nivel</span>
          <span>Experto</span>
          <span>Error</span>
        </div>
        <div class="compact-table" id="compact-table">${tableRows}</div>
      </div>

    </div>
  `;
}

function compactTableRow(hh, w) {
  const sc     = scoreHousehold(hh, w, state.activeProfile, T());
  const pred   = scoreToLevel(sc);
  const pDef   = VULNERABILITY_LEVELS[pred];
  const lbl    = ps().expertLabels[hh.id];
  const isCur  = hh.id === hhA().id;

  let lblCell = '<span class="text-muted cr-dash">—</span>';
  let errCell = '<span class="text-muted cr-dash">—</span>';
  if (lbl !== undefined) {
    const lvDef  = VULNERABILITY_LEVELS[lbl];
    lblCell = `<span style="color:${lvDef.color};font-weight:700">${lbl}</span>`;
    const err    = pred - lbl;
    const eColor = err === 0 ? '#16A34A' : Math.abs(err) === 1 ? '#D97706' : '#DC2626';
    errCell = `<span style="color:${eColor};font-weight:700">${err > 0 ? '+' : ''}${err}</span>`;
  }

  return `<div class="compact-row ${isCur ? 'current' : ''}" id="trow-${hh.id}"
               onclick="selectHousehold(${HOUSEHOLDS.indexOf(hh)})">
    <span class="cr-name">${hh.nombre}</span>
    <span class="cr-score" style="color:${pDef.color}">${(sc*100).toFixed(0)}%</span>
    <span class="cr-level" style="color:${pDef.color}">${pred} <span class="cr-lt">${pDef.short}</span></span>
    <span class="cr-expert">${lblCell}</span>
    <span class="cr-err">${errCell}</span>
  </div>`;
}

// ─── Versiones de pesos ───────────────────────────────────────────────────────

const WEIGHT_VERSIONS_KEY = 'sociarem_weight_versions_v1';

function getWeightVersions() {
  try { return JSON.parse(localStorage.getItem(WEIGHT_VERSIONS_KEY) || '{}'); } catch (e) { return {}; }
}
function persistWeightVersions(data) {
  localStorage.setItem(WEIGHT_VERSIONS_KEY, JSON.stringify(data));
}

function buildWeightVersionPanel() {
  const pvs = ((getWeightVersions()[state.username] || {})[state.activeProfile]) || [];
  const opts = pvs.length
    ? pvs.map(v => `<option value="${v.id}">${v.name}</option>`).join('')
    : '<option disabled value="">Sin versiones guardadas</option>';
  return `<div class="versions-card">
    <div class="vc-header">💾 Versiones · ${state.activeProfile} · ${state.username}</div>
    <div class="vc-save-row">
      <input type="text" id="version-name-input" class="vc-name-input" placeholder="Nombre (opcional)">
      <button class="btn btn-accent2 btn-sm" onclick="saveWeightVersion()">Guardar</button>
    </div>
    <div class="vc-load-row">
      <select id="version-select" class="vc-select">${opts}</select>
    </div>
    <div class="vc-actions">
      <button class="btn btn-secondary btn-sm" onclick="loadSelectedVersion()">↑ Cargar</button>
      <button class="btn btn-secondary btn-sm" onclick="deleteSelectedVersion()">✕ Eliminar</button>
      <button class="btn btn-secondary btn-sm" onclick="exportWeightVersions()">↓ Exportar</button>
    </div>
  </div>`;
}

function saveWeightVersion() {
  const p       = state.activeProfile;
  const user    = state.username;
  const w       = currentWeights();
  const inp     = document.getElementById('version-name-input');
  const now     = new Date();
  const name    = (inp ? inp.value.trim() : '') ||
    `${p} · ${now.toLocaleDateString()} ${now.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`;
  const id      = `w_${Date.now()}`;

  const all = getWeightVersions();
  if (!all[user])    all[user] = {};
  if (!all[user][p]) all[user][p] = [];
  all[user][p].push({id, name, createdAt: now.toISOString(), datasetLabel: state.datasetLabel, weights: w, levelThresholds: [...LEVEL_THRESHOLDS]});
  persistWeightVersions(all);
  if (inp) inp.value = '';
  showNotification(`Versión guardada: ${name}`);
  renderContentArea();
}

function loadSelectedVersion() {
  const sel  = document.getElementById('version-select');
  if (!sel || !sel.value) { showNotification('Selecciona una versión.'); return; }
  const pvs = ((getWeightVersions()[state.username] || {})[state.activeProfile]) || [];
  const v   = pvs.find(v => v.id === sel.value);
  if (!v) { showNotification('Versión no encontrada.'); return; }
  ps().liveWeights = Object.fromEntries(pd().weight_keys.map(k => [k, (v.weights[k] || 0) * 100]));
  renderContentArea();
  showNotification(`Cargados: ${v.name}`);
}

function deleteSelectedVersion() {
  const sel  = document.getElementById('version-select');
  if (!sel || !sel.value) { showNotification('Selecciona una versión.'); return; }
  const user = state.username, p = state.activeProfile;
  const all  = getWeightVersions();
  if (all[user]?.[p]) all[user][p] = all[user][p].filter(v => v.id !== sel.value);
  persistWeightVersions(all);
  showNotification('Versión eliminada.');
  renderContentArea();
}

function exportWeightVersions() {
  const pvs = ((getWeightVersions()[state.username] || {})[state.activeProfile]) || [];
  if (!pvs.length) { showNotification(`No hay versiones para ${state.activeProfile}.`); return; }
  download(`sociarem_pesos_${state.username}_${state.activeProfile}.json`, JSON.stringify(pvs, null, 2), 'application/json');
}

// ─── Actualizaciones en vivo (sliders) ───────────────────────────────────────

function onWeightChange() {
  const sliders = document.querySelectorAll('.weight-slider');
  if (!sliders.length) return;
  const raw = {};
  sliders.forEach(s => raw[s.dataset.key] = parseFloat(s.value) || 0.1);
  const sum  = Object.values(raw).reduce((a, b) => a + b, 0) || 1;
  const norm = {};
  for (const k in raw) norm[k] = raw[k] / sum;
  ps().liveWeights = raw;
  updateLiveElements(norm);
}

function updateLiveElements(w) {
  const hh       = hhA();
  const sc       = scoreHousehold(hh, w, state.activeProfile, T());
  const pred     = scoreToLevel(sc);
  const pDef     = VULNERABILITY_LEVELS[pred];
  const expLabel = ps().expertLabels[hh.id];

  // Score compact
  const scEl = document.getElementById('sc-pct');
  if (scEl) { scEl.textContent = (sc*100).toFixed(1) + '%'; scEl.style.color = pDef.color; }
  const slEl = document.getElementById('sc-level');
  if (slEl) { slEl.textContent = `${pred} · ${pDef.label}`; slEl.style.color = pDef.color; }
  const scCompact = document.getElementById('score-compact');
  if (scCompact) scCompact.style.borderLeftColor = pDef.color;

  // Métricas
  const m = computeOrdinalMetrics(w, state.activeProfile, ps().expertLabels, T());
  const upd = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  upd('met-mae',    m.mae.toFixed(2));
  upd('met-rmse',   m.rmse.toFixed(2));
  upd('met-exact',  (m.exactAccuracy * 100).toFixed(0) + '%');
  upd('met-within1',(m.withinOneAccuracy * 100).toFixed(0) + '%');

  // Pesos labels
  for (const k of pd().weight_keys) {
    const curW     = w[k] || 0;
    const delta    = curW - pd().init_weights[k];
    const dStr     = delta >= 0 ? `+${(delta*100).toFixed(1)}%` : `${(delta*100).toFixed(1)}%`;
    const dColor   = Math.abs(delta) < 0.005 ? '#9CA3AF' : delta > 0 ? '#D97706' : '#6B7280';
    const wv = document.getElementById(`wval-${k}`);
    if (wv) wv.textContent = (curW * 100).toFixed(1) + '%';
    const wd = document.getElementById(`wdelta-${k}`);
    if (wd) { wd.textContent = dStr; wd.style.color = dColor; }
  }

  // Tabla compacta
  for (const h of HOUSEHOLDS) {
    const row = document.getElementById(`trow-${h.id}`);
    if (!row) continue;
    const hs   = scoreHousehold(h, w, state.activeProfile, T());
    const hp   = scoreToLevel(hs);
    const hpD  = VULNERABILITY_LEVELS[hp];
    const hl   = ps().expertLabels[h.id];

    const sEl  = row.querySelector('.cr-score');
    if (sEl) { sEl.textContent = (hs*100).toFixed(0) + '%'; sEl.style.color = hpD.color; }
    const lEl  = row.querySelector('.cr-level');
    if (lEl) { lEl.style.color = hpD.color; lEl.innerHTML = `${hp} <span class="cr-lt">${hpD.short}</span>`; }
    const xEl  = row.querySelector('.cr-expert');
    if (xEl && hl !== undefined) xEl.innerHTML = `<span style="color:${VULNERABILITY_LEVELS[hl].color};font-weight:700">${hl}</span>`;
    const eEl  = row.querySelector('.cr-err');
    if (eEl && hl !== undefined) {
      const err = hp - hl;
      const eC  = err === 0 ? '#16A34A' : Math.abs(err) === 1 ? '#D97706' : '#DC2626';
      eEl.innerHTML = `<span style="color:${eC};font-weight:700">${err > 0 ? '+' : ''}${err}</span>`;
    }
    row.className = `compact-row ${h.id === hhA().id ? 'current' : ''}`;
  }
}

function resetToOptimized() {
  if (ps().optimizedWeights) {
    ps().liveWeights = Object.fromEntries(pd().weight_keys.map(k => [k, (ps().optimizedWeights[k] || 0) * 100]));
    renderContentArea();
  }
}
function resetToInit() {
  ps().liveWeights = Object.fromEntries(pd().weight_keys.map(k => [k, (pd().init_weights[k] || 0) * 100]));
  renderContentArea();
}

// ─── Exportación ──────────────────────────────────────────────────────────────

function exportResults(format) {
  const w         = currentWeights();
  const m         = computeOrdinalMetrics(w, state.activeProfile, ps().expertLabels, T());
  const includeGt = document.getElementById('export-gt')?.checked || false;

  const households = HOUSEHOLDS.map(hh => {
    const sc   = scoreHousehold(hh, w, state.activeProfile, T());
    const pred = scoreToLevel(sc);
    const lbl  = ps().expertLabels[hh.id];
    const entry = {
      id: hh.id, nombre: hh.nombre,
      expert_label:       lbl !== undefined ? lbl : null,
      expert_label_text:  lbl !== undefined ? VULNERABILITY_LEVELS[lbl].label : null,
      score:              parseFloat(sc.toFixed(4)),
      predicted_level:    pred,
      predicted_level_text: VULNERABILITY_LEVELS[pred].label,
      ordinal_error:      lbl !== undefined ? pred - lbl : null,
    };
    for (const k of pd().display_keys) entry[k] = hh[k] !== undefined ? hh[k] : null;
    if (includeGt && hh.gt) entry.reference_label = hh.gt[state.activeProfile];
    return entry;
  });

  const data = {
    profile: state.activeProfile, profile_name: pd().name,
    username: state.username, thresholds: {...T()},
    weights: w, init_weights: pd().init_weights,
    metrics: m, households,
    exportedAt: new Date().toISOString(),
  };

  if (format === 'json') {
    download(`sociarem_${state.activeProfile}.json`, JSON.stringify(data, null, 2), 'application/json');
  } else {
    const cols = ['id','nombre','expert_label','expert_label_text','score','predicted_level','predicted_level_text','ordinal_error',...pd().display_keys,...(includeGt?['reference_label']:[])];
    const rows = [cols.join(','), ...households.map(h => cols.map(c => JSON.stringify(h[c] ?? '')).join(','))];
    download(`sociarem_${state.activeProfile}.csv`, rows.join('\n'), 'text/csv');
  }
}

function download(filename, content, mime) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], {type: mime}));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ─── Gestión del dataset ──────────────────────────────────────────────────────

function renderDataPanel() {
  const el = document.getElementById('data-panel');
  if (!el) return;
  el.innerHTML = `
    <div class="data-panel-header"><span class="data-panel-title">Datos</span></div>
    <div class="data-panel-info">${state.datasetLabel}</div>
    ${state.hasGT ? '' : '<div class="data-no-gt">Sin etiquetas de referencia</div>'}
    <div class="data-panel-btns">
      <button class="btn btn-secondary btn-sm btn-full mb-1" onclick="useDemoData()">↺ Datos demo</button>
      <button class="btn btn-secondary btn-sm btn-full mb-1" onclick="openXlsxDialog()">↑ Subir XLSX</button>
      <button class="btn btn-secondary btn-sm btn-full" onclick="downloadTemplate()">↓ Descargar plantilla</button>
    </div>
  `;
  const refWrap = document.getElementById('ref-toggle-wrap');
  if (refWrap) {
    refWrap.style.opacity       = state.hasGT ? '1' : '0.4';
    refWrap.style.pointerEvents = state.hasGT ? '' : 'none';
  }
}

function useDemoData() {
  HOUSEHOLDS = JSON.parse(JSON.stringify(DEMO_HOUSEHOLDS));
  state.hasGT = true;
  state.datasetLabel = `Demo · ${HOUSEHOLDS.length} hogares`;
  resetAppForNewDataset();
}

function openXlsxDialog() {
  document.getElementById('xlsx-input').click();
}

function handleXlsxUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const wb  = XLSX.read(e.target.result, {type: 'array'});
      const ws  = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, {defval: ''});
      const res  = parseHouseholdsFromRows(rows);
      if (res.error) { alert(res.error); return; }
      HOUSEHOLDS = res.households;
      state.hasGT = res.hasGT;
      state.datasetLabel = `${file.name} · ${HOUSEHOLDS.length} hogares`;
      if (res.binaryGtWarning) showNotification(res.binaryGtWarning);
      resetAppForNewDataset();
    } catch (err) {
      alert('Error al leer el archivo XLSX: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
  event.target.value = '';
}

const REQUIRED_COLUMNS = [
  'id','nombre','edad','composicion','desc',
  'I1','I3','I4','I5','I6','I7','I9','I10',
  'I11','I12','I15','I16','I17','I18','I19',
  'I20','I21','I22','I23','I24','I25',
];
const GT_COLUMNS = ['gt_P1','gt_P2','gt_P3','gt_P4','gt_P5','gt_P6'];

function parseHouseholdsFromRows(rows) {
  if (!rows.length) return {error: 'El XLSX está vacío.'};
  const cols    = Object.keys(rows[0]);
  const missing = REQUIRED_COLUMNS.filter(c => !cols.includes(c));
  if (missing.length) return {error: `El XLSX no es válido. Faltan columnas: ${missing.join(', ')}`};
  const hasGT = GT_COLUMNS.every(c => cols.includes(c));

  let binaryGtWarning = null;
  if (hasGT) {
    const vals = rows.flatMap(r => GT_COLUMNS.map(c => Number(r[c])));
    if (vals.every(v => v === 0 || v === 1) && vals.some(v => v === 1))
      binaryGtWarning = 'Etiquetas binarias detectadas. Se interpretará 1 como Muy vulnerable (4).';
  }

  const mapGt = (v, binary) => {
    const n = Number(v);
    if (binary && n === 1) return 4;
    return Math.min(4, Math.max(0, Math.round(n)));
  };
  const isBinary = !!binaryGtWarning;

  const households = rows.map((row, idx) => ({
    id:          String(row.id   || `HOG-${String(idx+1).padStart(2,'0')}`),
    nombre:      String(row.nombre || `Hogar ${idx+1}`),
    edad:        Number(row.edad) || 0,
    composicion: String(row.composicion || ''),
    desc:        String(row.desc || ''),
    I1:  Number(row.I1),  I3:  Number(row.I3),  I4:  Number(row.I4),
    I5:  Number(row.I5),  I6:  Number(row.I6),  I7:  Number(row.I7),
    I9:  Number(row.I9),  I10: Number(row.I10), I11: Number(row.I11),
    I12: Number(row.I12), I15: Number(row.I15), I16: Number(row.I16),
    I17: Number(row.I17), I18: Number(row.I18), I19: Number(row.I19),
    I20: Number(row.I20), I21: Number(row.I21), I22: Number(row.I22),
    I23: Number(row.I23), I24: Number(row.I24), I25: Number(row.I25),
    gt: hasGT
      ? {P1:mapGt(row.gt_P1,isBinary), P2:mapGt(row.gt_P2,isBinary), P3:mapGt(row.gt_P3,isBinary),
         P4:mapGt(row.gt_P4,isBinary), P5:mapGt(row.gt_P5,isBinary), P6:mapGt(row.gt_P6,isBinary)}
      : {P1:0,P2:0,P3:0,P4:0,P5:0,P6:0},
  }));
  return {households, hasGT, binaryGtWarning};
}

function resetAppForNewDataset() {
  state.activeHouseholdIndex = 0;
  state.searchText = '';
  const si = document.getElementById('search-input');
  if (si) si.value = '';
  state.filteredIndices = HOUSEHOLDS.map((_, i) => i);
  for (const p of Object.keys(state.profiles)) {
    state.profiles[p].expertLabels    = {};
    state.profiles[p].optimizedWeights = null;
    state.profiles[p].liveWeights      = null;
    state.profiles[p].phase            = 1;
  }
  if (!state.hasGT) {
    state.showReferenceLabels = false;
    const cb = document.getElementById('ref-toggle-check');
    if (cb) cb.checked = false;
  }
  renderDataPanel();
  renderAll();
}

function downloadTemplate() {
  const rows = [
    {id:'HOG-01',nombre:'Hogar 1',edad:67,composicion:'Composición 1',desc:'Descripción 1',
     I1:530,I3:18.2,I4:1,I5:145,I6:78,I7:2,I9:2,I10:2,I11:1,I12:0,I15:1,I16:1,
     I17:3,I18:35,I19:12,I20:1,I21:0,I22:1,I23:1,I24:0,I25:12,
     gt_P1:4,gt_P2:3,gt_P3:3,gt_P4:4,gt_P5:1,gt_P6:1},
    {id:'HOG-02',nombre:'Hogar 2',edad:45,composicion:'Composición 2',desc:'Descripción 2',
     I1:1200,I3:6.0,I4:0,I5:280,I6:150,I7:1,I9:0,I10:0,I11:0,I12:1,I15:0,I16:0,
     I17:0,I18:25,I19:10,I20:0,I21:4,I22:0,I23:1,I24:0,I25:8,
     gt_P1:0,gt_P2:0,gt_P3:0,gt_P4:0,gt_P5:0,gt_P6:0},
  ];
  const legendRows = VULNERABILITY_LEVELS.map(l => ({valor: l.value, significado: l.label}));
  const ws1 = XLSX.utils.json_to_sheet(rows);
  const ws2 = XLSX.utils.json_to_sheet(legendRows);
  const wb  = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, 'hogares');
  XLSX.utils.book_append_sheet(wb, ws2, 'leyenda');
  XLSX.writeFile(wb, 'plantilla_sociarem_hogares.xlsx');
}

// ─── Importar pesos JSON (legacy) ────────────────────────────────────────────

function exportWeightsJson() {
  const data = {};
  for (const pid of Object.keys(PROFILES)) {
    const pS = state.profiles[pid], pD = PROFILES[pid];
    const base = pS.liveWeights || pS.optimizedWeights || {...pD.init_weights};
    const raw  = {};
    for (const k of pD.weight_keys) raw[k] = Math.max(0.001, base[k] || 0.001);
    const sum  = Object.values(raw).reduce((a, b) => a + b, 0);
    const wn   = {};
    for (const k in raw) wn[k] = raw[k] / sum;
    data[pid] = {weights: wn, createdAt: new Date().toISOString()};
  }
  download('sociarem_pesos_todos.json', JSON.stringify(data, null, 2), 'application/json');
}

function importWeightsJson(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      const apply = (pid, entry) => {
        if (!PROFILES[pid] || !entry.weights) return;
        state.profiles[pid].liveWeights = Object.fromEntries(
          PROFILES[pid].weight_keys.map(k => [k, (entry.weights[k] || 0) * 100])
        );
      };
      if (Array.isArray(data)) {
        if (data.length) apply(state.activeProfile, data[data.length - 1]);
      } else {
        for (const pid of Object.keys(data)) apply(pid, data[pid]);
      }
      if (ps().phase === 2) renderContentArea();
      showNotification('Pesos importados correctamente.');
    } catch (err) {
      alert('Error al importar pesos: ' + err.message);
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function showNotification(msg) {
  let el = document.getElementById('notification');
  if (!el) {
    el = document.createElement('div');
    el.id = 'notification';
    el.className = 'notification';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ─── Inicialización ───────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  state.thresholds = {...DEFAULT_THRESHOLDS};
  const savedUser = localStorage.getItem('sociarem_username') || '';
  const inp = document.getElementById('login-username');
  if (inp) inp.value = savedUser;
  document.getElementById('login-screen').removeAttribute('hidden');
  document.getElementById('main-screen').setAttribute('hidden', '');
  if (inp) inp.focus();
});

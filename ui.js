// ============================================================================
// SHELL DE INTERFAZ — hojas inferiores, FAB, menús y navegación
// ============================================================================
// Toda la reorganización visual vive aquí. Ningún módulo pierde funciones: lo
// que antes estaba permanentemente en pantalla ahora se abre bajo demanda.
//
// Piezas reutilizables (las usan TOM, Luna, Inventario, Ajustes y las futuras
// funciones sin escribir estructura nueva):
//   Sheet.open(...)        -> hoja inferior genérica
//   Sheet.menu(...)        -> lista de opciones (menú/desplegable/contextual)
//   Sheet.form(...)        -> presta un formulario ya existente del DOM
//   attachLongPress(...)   -> pulsación prolongada

const UI_ANIM = 240; // ms — dentro del rango 200-300 pedido

// --- Hoja inferior genérica --------------------------------------------------
const Sheet = {
  _backdrop: null, _el: null, _body: null, _title: null,
  _borrowed: null, _borrowedHome: null, _onClose: null, _open: false,

  init(){
    this._backdrop = document.getElementById('sheetBackdrop');
    this._el = document.getElementById('sheet');
    this._body = document.getElementById('sheetBody');
    this._title = document.getElementById('sheetTitle');
    document.getElementById('sheetClose').addEventListener('click', ()=> this.close());
    this._backdrop.addEventListener('click', (e)=>{ if(e.target === this._backdrop) this.close(); });
    // Arrastrar la hoja hacia abajo para cerrarla.
    let startY = null, dy = 0;
    const grip = this._el.querySelector('.sheet-grip');
    grip.addEventListener('pointerdown', (e)=>{ startY = e.clientY; dy = 0; grip.setPointerCapture(e.pointerId); });
    grip.addEventListener('pointermove', (e)=>{
      if(startY === null) return;
      dy = Math.max(0, e.clientY - startY);
      this._el.style.transform = `translateY(${dy}px)`;
    });
    const end = ()=>{
      if(startY === null) return;
      this._el.style.transform = '';
      if(dy > 70) this.close();
      startY = null;
    };
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
  },

  isOpen(){ return this._open; },

  open(title, opts){
    opts = opts || {};
    this._title.textContent = title || '';
    this._body.innerHTML = '';
    this._onClose = opts.onClose || null;
    if(opts.node){
      // Presta un nodo que ya existe en la página (p. ej. el formulario) para
      // no duplicar HTML ni volver a cablear eventos.
      this._borrowed = opts.node;
      this._borrowedHome = opts.node.parentNode;
      opts.node.removeAttribute('hidden');
      this._body.appendChild(opts.node);
    } else if(opts.html){
      this._body.innerHTML = opts.html;
    }
    this._backdrop.classList.add('open');
    this._open = true;
    document.body.classList.add('sheet-lock');
    if(opts.onOpen) opts.onOpen(this._body);
    return this._body;
  },

  close(){
    if(!this._open) return;
    this._open = false;
    this._backdrop.classList.remove('closing');
    this._backdrop.classList.add('closing');
    const cb = this._onClose; this._onClose = null;
    setTimeout(()=>{
      this._backdrop.classList.remove('open','closing');
      document.body.classList.remove('sheet-lock');
      if(this._borrowed && this._borrowedHome){
        this._borrowed.setAttribute('hidden','');
        this._borrowedHome.appendChild(this._borrowed);
      }
      this._borrowed = null; this._borrowedHome = null;
      this._body.innerHTML = '';
      if(cb) cb();
    }, UI_ANIM);
  },

  // Menú de opciones: sirve de desplegable, menú contextual y submenú.
  menu(title, items){
    const html = `<div class="sheet-menu">` + items.map((it,i)=>{
      if(it.divider) return `<div class="sheet-divider">${escapeHtml(it.label || '')}</div>`;
      return `<button type="button" class="sheet-item${it.active?' active':''}${it.danger?' danger':''}" data-i="${i}">
        ${it.icon ? `<span class="sheet-item-icon">${it.icon}</span>` : ''}
        <span class="sheet-item-label">${escapeHtml(it.label)}${it.sub ? `<small>${escapeHtml(it.sub)}</small>` : ''}</span>
        ${it.badge ? `<span class="sheet-item-badge">${escapeHtml(String(it.badge))}</span>` : ''}
      </button>`;
    }).join('') + `</div>`;
    this.open(title, { html, onOpen: (body)=>{
      body.querySelectorAll('.sheet-item').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const it = items[parseInt(btn.dataset.i,10)];
          if(!it || !it.onSelect) return;
          if(it.keepOpen){ it.onSelect(); return; }
          this.close();
          setTimeout(()=> it.onSelect(), UI_ANIM * 0.6);
        });
      });
    }});
  }
};

// --- Pulsación prolongada ----------------------------------------------------
function attachLongPress(el, fn, ms){
  ms = ms || 550;
  let timer = null, moved = false, sx = 0, sy = 0;
  const clear = ()=>{ if(timer){ clearTimeout(timer); timer = null; } };
  el.addEventListener('pointerdown', (e)=>{
    moved = false; sx = e.clientX; sy = e.clientY;
    clear();
    timer = setTimeout(()=>{ if(!moved) fn(e); timer = null; }, ms);
  });
  el.addEventListener('pointermove', (e)=>{
    if(Math.abs(e.clientX-sx) > 8 || Math.abs(e.clientY-sy) > 8){ moved = true; clear(); }
  });
  el.addEventListener('pointerup', clear);
  el.addEventListener('pointercancel', clear);
  el.addEventListener('contextmenu', (e)=> e.preventDefault());
}

// --- Navegación superior -----------------------------------------------------
function uiSyncNav(){
  document.querySelectorAll('.seg-btn').forEach(b=>{
    b.classList.toggle('active', b.dataset.mode === appMode);
  });
  // El FAB solo tiene sentido donde se registra información.
  const wrap = document.getElementById('fabWrap');
  wrap.style.display = (appMode === 'tom' || appMode === 'luna' || appMode === 'inventario') ? '' : 'none';
}

// Ajustes: lista declarativa, así agregar una función futura es una línea.
function uiSettingsItems(){
  return [
    { label:'Inventario', icon:'📦', sub:'Productos, categorías y compras', onSelect: ()=> goToMode('inventario') },
    { label:'Estadísticas', icon:'📊', sub:'18 vistas de análisis', onSelect: ()=> goToMode('stats') },
    { label:'Hábitos inteligentes', icon:'🧠', sub:'Patrones detectados en tus gastos', onSelect: ()=> uiOpenHabits() },
    { label:'Diario financiero', icon:'📔', sub:'Todo lo registrado, día por día', onSelect: ()=> uiOpenJournal() },
    { label:'Metas y presupuesto', icon:'🎯', sub:'Ahorro y límite mensual', onSelect: ()=> uiOpenGoals() },
    { divider:true, label:'Personalización' },
    { label:'Apariencia', icon:'🎨', sub:'Colores y tema', onSelect: ()=> goToMode('apariencia') },
    { label:'Configuración', icon:'⚙️', sub:'Recordatorios e inventario', onSelect: ()=> uiOpenConfig() },
    { divider:true, label:'Datos' },
    { label:'Exportar', icon:'⬇️', sub:'CSV o PDF', onSelect: ()=> uiOpenExport() },
    { label:'Importar', icon:'⬆️', sub:'Inventario desde CSV', onSelect: ()=>{
        goToMode('inventario');
        setTimeout(()=> document.getElementById('invImportFile').click(), 260);
      } },
    { label:'Copia de seguridad', icon:'💾', sub:'Guardar o restaurar todo', onSelect: ()=> uiOpenBackup() }
  ];
}

// --- Vistas que viven dentro de una hoja (no son pantallas nuevas) ----------
function uiOpenGoals(){
  const esAhorro = currentTab === 'ahorro';
  const monthKey = fMonth.value || todayStr().slice(0,7);
  const gastado = data[currentTab].filter(m=>m.type==='out' && m.date.slice(0,7)===monthKey).reduce((s,m)=>s+m.amount,0);
  const pres = monthlyBudget[currentTab] || 0;
  const ahorroActual = Math.max(0, computeTabBalance('ahorro'));
  const pctP = pres > 0 ? Math.min(100, Math.round(gastado/pres*100)) : 0;
  const pctM = savingsGoal > 0 ? Math.min(100, Math.round(ahorroActual/savingsGoal*100)) : 0;

  Sheet.open('Metas y presupuesto', { html: `
    <div class="goal-edit">
      <div class="goal-edit-row">
        <span>🎯 Meta de ahorro</span>
        <input type="number" min="0" step="0.01" id="goalInput" value="${savingsGoal || ''}" placeholder="0">
      </div>
      <div class="goal-bar-track"><div class="goal-bar-fill" style="width:${pctM}%"></div></div>
      <div class="goal-pct">${fmt(ahorroActual)} de ${fmt(savingsGoal)} · ${pctM}%</div>
    </div>
    <div class="goal-edit">
      <div class="goal-edit-row">
        <span>📌 Presupuesto de ${escapeHtml(currentTab)}</span>
        <input type="number" min="0" step="0.01" id="budgetInput" value="${pres || ''}" placeholder="0">
      </div>
      <div class="goal-bar-track"><div class="goal-bar-fill${pres>0&&gastado>=pres?' danger':(pres>0&&gastado/pres>=0.8?' warn':'')}" style="width:${pctP}%"></div></div>
      <div class="goal-pct">${fmt(gastado)} de ${fmt(pres)} · ${pctP}%</div>
    </div>
    <div class="debt-modal-actions">
      <button type="button" class="btn-secondary" id="goalCancel">Cancelar</button>
      <button type="button" id="goalSave">Guardar</button>
    </div>`,
    onOpen: (body)=>{
      body.querySelector('#goalCancel').addEventListener('click', ()=> Sheet.close());
      body.querySelector('#goalSave').addEventListener('click', async ()=>{
        savingsGoal = Math.max(0, parseFloat(body.querySelector('#goalInput').value) || 0);
        monthlyBudget[currentTab] = Math.max(0, parseFloat(body.querySelector('#budgetInput').value) || 0);
        await saveSavingsGoal();
        await saveBudget(currentTab);
        Sheet.close();
        render();
      });
    }});
}

// Hábitos inteligentes: reutiliza el motor de insights + la detección de
// gastos recurrentes que ya existían, sin recalcular nada nuevo.
function uiOpenHabits(){
  const monthKey = todayStr().slice(0,7);
  const outs = data[currentTab].filter(m=>m.type==='out');
  const recurrentes = [...new Set(outs.map(m=>m.desc))].filter(d=>isRecurring(d));
  const porDesc = new Map();
  outs.filter(m=>m.date.slice(0,7)===monthKey).forEach(m=> porDesc.set(m.desc,(porDesc.get(m.desc)||0)+m.amount));
  const top = [...porDesc.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5);
  const avisos = computeInsights();

  let html = '';
  if(avisos.length){
    html += `<div class="habit-group">` + avisos.map(a=>`<div class="insight-chip ${a.level}">${escapeHtml(a.text)}</div>`).join('') + `</div>`;
  }
  if(recurrentes.length){
    html += `<div class="habit-group"><div class="habit-title">Gastos que se repiten</div>` +
      recurrentes.map(d=>`<div class="habit-row">${getIcon(d, itemIcons[currentTab][d])}<span>${escapeHtml(d)}</span></div>`).join('') + `</div>`;
  }
  if(top.length){
    html += `<div class="habit-group"><div class="habit-title">Dónde se va tu dinero este mes</div>` +
      top.map(([d,v])=>`<div class="habit-row">${getIcon(d, itemIcons[currentTab][d])}<span>${escapeHtml(d)}</span><b>${fmt(v)}</b></div>`).join('') + `</div>`;
  }
  if(!html) html = '<div class="empty">Todavía no hay suficiente historial para detectar hábitos.</div>';
  Sheet.open('Hábitos inteligentes', { html });
}

// Diario financiero: la misma información, ordenada como una bitácora.
function uiOpenJournal(){
  const movs = data[currentTab].slice().sort((a,b)=> b.date.localeCompare(a.date));
  if(!movs.length){ Sheet.open('Diario financiero', { html:'<div class="empty">Aún no hay movimientos registrados.</div>' }); return; }
  const porDia = new Map();
  movs.forEach(m=>{ if(!porDia.has(m.date)) porDia.set(m.date, []); porDia.get(m.date).push(m); });
  let html = '';
  [...porDia.entries()].slice(0, 40).forEach(([fecha, lista])=>{
    const d = new Date(fecha+'T00:00');
    const neto = lista.reduce((s,m)=> s + (m.type==='in'? m.amount : -m.amount), 0);
    html += `<div class="journal-day">
      <div class="journal-head">
        <span>${d.toLocaleDateString('es-ES',{weekday:'long', day:'numeric', month:'long'})}</span>
        <b class="${neto>=0?'pos':'neg'}">${neto>=0?'+':'−'}${fmt(Math.abs(neto))}</b>
      </div>` +
      lista.map(m=>{
        const iconMap = m.type==='in' ? incomeItemIcons[currentTab] : itemIcons[currentTab];
        return `<div class="journal-row">${getIcon(m.desc, iconMap[m.desc])}
          <span class="journal-desc">${escapeHtml(m.desc)}${m.note?`<small>${escapeHtml(m.note)}</small>`:''}</span>
          <span class="mov-amount ${m.type}">${m.type==='in'?'+':'−'}${fmt(m.amount)}</span></div>`;
      }).join('') + `</div>`;
  });
  Sheet.open('Diario financiero', { html });
}

function uiOpenConfig(){
  Sheet.menu('Configuración', [
    { label:'Ajustes de inventario', icon:'📦', sub:'Aviso de poco stock y lista de compras',
      onSelect: ()=>{ goToMode('inventario'); setTimeout(()=> document.getElementById('invSettingsBtn').click(), 260); } },
    { label:'Permisos de recordatorios', icon:'🔔', sub:'Notificaciones y alarmas exactas',
      onSelect: ()=>{
        if(window.Android && window.Android.requestNotificationPermission){
          window.Android.requestNotificationPermission();
          if(window.Android.canScheduleExactAlarms && !window.Android.canScheduleExactAlarms()){
            window.Android.openExactAlarmSettings();
          }
        } else {
          showAlert('Los permisos de notificación solo existen en la app instalada en Android.');
        }
      } },
    { label:'Restablecer colores', icon:'🎨', sub:'Volver a la paleta original',
      onSelect: ()=> document.getElementById('themeResetBtn').click() }
  ]);
}

function uiOpenExport(){
  Sheet.menu('Exportar', [
    { label:'Movimientos en CSV', icon:'⬇️', onSelect: ()=> document.getElementById('exportCsvBtn').click() },
    { label:'Inventario en CSV', icon:'📦', onSelect: ()=> document.getElementById('invExportBtn').click() },
    { label:'Imprimir o guardar en PDF', icon:'🖨️', onSelect: ()=> document.getElementById('printPdfBtn').click() }
  ]);
}

function uiOpenBackup(){
  Sheet.menu('Copia de seguridad', [
    { label:'Guardar copia', icon:'💾', sub:'Descarga todos tus datos', onSelect: ()=> document.getElementById('backupBtn').click() },
    { label:'Restaurar copia', icon:'♻️', sub:'Reemplaza los datos actuales', danger:true, onSelect: ()=> document.getElementById('restoreBtn').click() }
  ]);
}

// --- Selector de ámbito (Gastos / Entretenimiento / Ahorro) ------------------
const SCOPE_LABELS = { gastos:'Gastos', entretenimiento:'Entretenimiento', ahorro:'Ahorro' };

function uiSyncScope(){
  const el = document.getElementById('scopeLabel');
  if(el) el.textContent = SCOPE_LABELS[currentTab] || currentTab;
}

function uiOpenScope(){
  Sheet.menu('Ver', TABS.map(t=>({
    label: SCOPE_LABELS[t], active: t === currentTab,
    onSelect: ()=> uiSetScope(t)
  })));
}

// Cambiar de ámbito sin cambiar de pantalla ni perder filtros.
function uiSetScope(t){
  currentTab = t;
  document.getElementById('selectBtnInner').textContent = 'Elegir ítem';
  uiSyncScope();
  populateFilters();
  renderMenu();
  render();
  if(typeof renderStats === 'function' && appMode === 'stats') renderStats();
  document.querySelectorAll('#statsTabs .tab').forEach(x=> x.classList.toggle('active', x.dataset.tab === t));
}

// --- Resumen Financiero ------------------------------------------------------
const SUMMARY_VIEWS = [
  { key:'saldo',       label:'Saldo' },
  { key:'total',       label:'Total (3 listas)' },
  { key:'dia',         label:'Gastos del día' },
  { key:'entradas',    label:'Entradas' },
  { key:'gastos',      label:'Gastos' },
  { key:'balance',     label:'Balance' },
  { key:'presupuesto', label:'Presupuesto del mes' },
  { key:'meta',        label:'Meta de ahorro' }
];

function uiOpenSummaryMenu(){
  Sheet.menu('Resumen financiero', SUMMARY_VIEWS.map(v=>({
    label: v.label, active: v.key === balanceMode,
    onSelect: ()=>{ balanceMode = v.key; uiSyncSummaryLabel(); render(); }
  })));
}

function uiSyncSummaryLabel(){
  const v = SUMMARY_VIEWS.find(x=>x.key === balanceMode) || SUMMARY_VIEWS[0];
  const el = document.getElementById('summarySelLabel');
  if(el) el.textContent = v.label;
}

// --- FAB ---------------------------------------------------------------------
let fabOpen = false;

function uiFabItems(){
  const items = [
    { label:'Nuevo gasto', icon:'💰', onSelect: ()=> uiOpenEntryForm('out') },
    { label:'Nuevo ingreso', icon:'💵', onSelect: ()=> uiOpenEntryForm('in') },
    { label:'Inventario', icon:'📦', onSelect: ()=>{
        goToMode('inventario');
        setTimeout(()=> document.getElementById('invAddBtn').click(), 260);
      } },
    { label:'Luna', icon:'🌙', onSelect: ()=>{
        goToMode('luna');
        setTimeout(()=> document.getElementById('debtAddRow').click(), 260);
      } },
    { label:'Registrar por voz', icon:'🎤', onSelect: ()=>{
        if(typeof VoiceSession !== 'undefined') VoiceSession.open('movimiento');
      } }
  ];
  return items;
}

function uiToggleFab(force){
  const menu = document.getElementById('fabMenu');
  const fab = document.getElementById('fab');
  fabOpen = (force === undefined) ? !fabOpen : force;
  if(fabOpen){
    const items = uiFabItems();
    menu.innerHTML = items.map((it,i)=>
      `<button type="button" class="fab-item" data-i="${i}" style="--d:${i*28}ms">
         <span class="fab-item-label">${escapeHtml(it.label)}</span>
         <span class="fab-item-icon">${it.icon}</span>
       </button>`).join('');
    menu.querySelectorAll('.fab-item').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const it = items[parseInt(btn.dataset.i,10)];
        uiToggleFab(false);
        setTimeout(()=> it.onSelect(), 120);
      });
    });
    menu.classList.add('open');
    fab.classList.add('open');
  } else {
    menu.classList.remove('open');
    fab.classList.remove('open');
    setTimeout(()=>{ if(!fabOpen) menu.innerHTML = ''; }, UI_ANIM);
  }
}

// Abre el formulario de movimiento en una hoja, tomando prestado el que ya
// existe en el DOM (conserva lista de ítems, voz y validación).
function uiOpenEntryForm(tipo){
  const host = document.getElementById('entryFormHost');
  document.getElementById('f-type').value = tipo;
  document.getElementById('f-type').dispatchEvent(new Event('change'));
  Sheet.open(tipo === 'in' ? 'Nuevo ingreso' : 'Nuevo gasto', {
    node: host,
    onOpen: ()=>{ setTimeout(()=> document.getElementById('f-desc').focus(), 60); }
  });
}

// --- Accesos rápidos inteligentes (mantener pulsado el FAB) -----------------
// Aprenden solos del historial: los ítems más usados suben. El usuario puede
// fijar, ocultar y reordenar; sus preferencias mandan sobre el aprendizaje.
let quickPinned = [], quickHidden = [], quickOrder = [];

async function uiLoadQuick(){
  quickPinned = await storageGetJSON('quick:pinned', []);
  quickHidden = await storageGetJSON('quick:hidden', []);
  quickOrder  = await storageGetJSON('quick:order', []);
}
async function uiSaveQuick(){
  await storageSetJSON('quick:pinned', quickPinned, 'Error guardando accesos');
  await storageSetJSON('quick:hidden', quickHidden, 'Error guardando accesos');
  await storageSetJSON('quick:order', quickOrder, 'Error guardando accesos');
}

function uiQuickCandidates(){
  const uso = new Map();
  TABS.forEach(t=>{
    data[t].forEach(m=>{
      const k = m.desc + ' ' + m.type + ' ' + t;
      if(!uso.has(k)) uso.set(k, { desc:m.desc, type:m.type, tab:t, n:0, last:'', total:0 });
      const e = uso.get(k);
      e.n++; e.total += m.amount;
      if(m.date > e.last) e.last = m.date;
    });
  });
  let lista = [...uso.values()]
    .filter(e => !quickHidden.includes(e.desc + ' ' + e.type + ' ' + e.tab))
    .map(e => Object.assign(e, { key: e.desc + ' ' + e.type + ' ' + e.tab, avg: Math.round(e.total/e.n) }));

  lista.sort((a,b)=>{
    const pa = quickPinned.indexOf(a.key), pb = quickPinned.indexOf(b.key);
    if(pa !== -1 || pb !== -1){
      if(pa === -1) return 1;
      if(pb === -1) return -1;
      return pa - pb;
    }
    const oa = quickOrder.indexOf(a.key), ob = quickOrder.indexOf(b.key);
    if(oa !== -1 || ob !== -1){
      if(oa === -1) return 1;
      if(ob === -1) return -1;
      return oa - ob;
    }
    return (b.n - a.n) || b.last.localeCompare(a.last);   // aprendizaje por uso
  });
  return lista.slice(0, 12);
}

function uiOpenQuickActions(){
  const lista = uiQuickCandidates();
  if(!lista.length){
    Sheet.open('Accesos rápidos', { html:'<div class="empty">Registra algunos movimientos y aparecerán aquí automáticamente.</div>' });
    return;
  }
  const html = `<div class="quick-hint">Toca para registrar al instante · mantén pulsado para opciones</div>
    <div class="quick-grid" id="quickGrid">` + lista.map((e,i)=>{
      const iconMap = e.type === 'in' ? incomeItemIcons[e.tab] : itemIcons[e.tab];
      const fijado = quickPinned.includes(e.key);
      return `<button type="button" class="quick-item${fijado?' pinned':''}" data-i="${i}">
        ${getIcon(e.desc, iconMap[e.desc])}
        <span class="quick-name">${escapeHtml(e.desc)}</span>
        <span class="quick-meta">${fmt(e.avg)}${fijado?' ★':''}</span>
      </button>`;
    }).join('') + `</div>`;

  Sheet.open('Accesos rápidos', { html, onOpen: (body)=>{
    body.querySelectorAll('.quick-item').forEach(btn=>{
      const e = lista[parseInt(btn.dataset.i,10)];
      btn.addEventListener('click', ()=>{
        Sheet.close();
        setTimeout(()=> uiQuickRegister(e), UI_ANIM * 0.6);
      });
      attachLongPress(btn, ()=> uiQuickOptions(e, lista));
    });
  }});
}

// Registrar desde un acceso rápido: abre el formulario ya rellenado, para que
// el usuario solo confirme o ajuste el monto (nunca guarda a ciegas).
function uiQuickRegister(e){
  currentTab = e.tab;
  uiSyncScope();
  populateFilters();
  renderMenu();
  render();
  uiOpenEntryForm(e.type);
  setTimeout(()=>{
    document.getElementById('f-desc').value = e.desc;
    const iconMap = e.type === 'in' ? incomeItemIcons[e.tab] : itemIcons[e.tab];
    document.getElementById('selectBtnInner').innerHTML =
      getIcon(e.desc, iconMap[e.desc]) + `<span>${escapeHtml(e.desc)}</span>`;
    const amt = document.getElementById('f-amount');
    amt.value = e.avg || '';
    amt.focus(); amt.select();
  }, 80);
}

function uiQuickOptions(e, lista){
  const fijado = quickPinned.includes(e.key);
  Sheet.menu(e.desc, [
    { label: fijado ? 'Quitar de favoritos' : 'Fijar como favorito', icon: fijado ? '☆' : '★',
      onSelect: async ()=>{
        if(fijado) quickPinned = quickPinned.filter(k=>k!==e.key);
        else quickPinned.push(e.key);
        await uiSaveQuick(); uiOpenQuickActions();
      } },
    { label:'Subir', icon:'↑', onSelect: async ()=>{
        const keys = lista.map(x=>x.key);
        const i = keys.indexOf(e.key);
        if(i > 0){ keys.splice(i,1); keys.splice(i-1,0,e.key); quickOrder = keys; await uiSaveQuick(); }
        uiOpenQuickActions();
      } },
    { label:'Bajar', icon:'↓', onSelect: async ()=>{
        const keys = lista.map(x=>x.key);
        const i = keys.indexOf(e.key);
        if(i !== -1 && i < keys.length-1){ keys.splice(i,1); keys.splice(i+1,0,e.key); quickOrder = keys; await uiSaveQuick(); }
        uiOpenQuickActions();
      } },
    { label:'Quitar de accesos rápidos', icon:'🗑', danger:true, onSelect: async ()=>{
        quickHidden.push(e.key);
        quickPinned = quickPinned.filter(k=>k!==e.key);
        await uiSaveQuick(); uiOpenQuickActions();
      } }
  ]);
}

// --- Menú contextual de un movimiento (sustituye a los botones fijos) -------
function uiMovContext(id){
  const m = data[currentTab].find(x=>x.id===id);
  if(!m) return;
  Sheet.menu(m.desc, [
    { label:'Editar', icon:'✏️', onSelect: ()=> openMovModal(id) },
    { label:'Duplicar con fecha de hoy', icon:'⎘', onSelect: ()=> duplicateMov(id) },
    { label:'Eliminar', icon:'🗑', danger:true, onSelect: ()=>{
        showConfirm(`¿Eliminar "${m.desc}"?`, ()=> deleteMov(id));
      } }
  ]);
}

// --- Arranque ----------------------------------------------------------------
function initUI(){
  Sheet.init();

  document.querySelectorAll('.seg-btn').forEach(b=>{
    b.addEventListener('click', ()=> goToMode(b.dataset.mode));
  });
  document.getElementById('settingsBtn').addEventListener('click', ()=>{
    Sheet.menu('Ajustes', uiSettingsItems());
  });

  document.getElementById('scopeBtn').addEventListener('click', uiOpenScope);
  document.getElementById('summarySelBtn').addEventListener('click', uiOpenSummaryMenu);

  document.getElementById('searchToggleBtn').addEventListener('click', ()=>{
    const row = document.getElementById('searchRow');
    const visible = row.style.display !== 'none';
    row.style.display = visible ? 'none' : '';
    document.getElementById('searchToggleBtn').classList.toggle('active', !visible);
    if(!visible) document.getElementById('searchInput').focus();
    else { document.getElementById('searchInput').value = ''; render(); }
  });

  const fab = document.getElementById('fab');
  fab.addEventListener('click', ()=> uiToggleFab());
  attachLongPress(fab, ()=>{ uiToggleFab(false); uiOpenQuickActions(); });
  document.addEventListener('click', (e)=>{
    if(fabOpen && !e.target.closest('#fabWrap')) uiToggleFab(false);
  });

  uiSyncScope();
  uiSyncSummaryLabel();
  uiSyncNav();
  uiLoadQuick();
}

// Aplica el tema guardado de inmediato (antes de cualquier otra cosa)
// para que no se vea un parpadeo con los colores por defecto.
const THEME_KEYS = ['bg','panel','border','gold','gold-dim','accent','text','text-dim','green','red'];
const DEFAULT_THEME = {
  bg:'#14120f', panel:'#1c1a16', border:'#3a3226', gold:'#e8b13d', 'gold-dim':'#a87a24',
  accent:'#e87b3e', text:'#f3efe4', 'text-dim':'#a39d8c', green:'#3fc481', red:'#e2503e'
};
const THEME_PRESETS = {
  default: Object.assign({ name: 'Oscuro Dorado' }, DEFAULT_THEME),
  tomEdition: {
    name: 'TOM Edition',
    bg:'#111111', panel:'#1b1b1b', border:'#313131', gold:'#f97316', 'gold-dim':'#f8923c',
    accent:'#fdba74', text:'#ffffff', 'text-dim':'#b0b0b0', green:'#22c55e', red:'#ef4444'
  }
};

function applyTheme(vars){
  THEME_KEYS.forEach(k=>{
    if(vars[k]) document.documentElement.style.setProperty('--'+k, vars[k]);
  });
  if(vars.gold) document.documentElement.style.setProperty('--amber', vars.gold);
  if(vars.panel) document.documentElement.style.setProperty('--panel-2', vars.panel);
}

(function applySavedThemeEarly(){
  try{
    const saved = localStorage.getItem('theme:custom');
    if(saved) applyTheme(JSON.parse(saved));
  }catch(e){}
})();

// Guardado real en el celular (localStorage), para que la app funcione
// instalada y sin internet, fuera de Claude.ai.
if (!window.storage) {
  window.storage = {
    async get(key) {
      const v = localStorage.getItem(key);
      return v === null ? null : { key, value: v, shared: false };
    },
    async set(key, value) {
      localStorage.setItem(key, value);
      return { key, value, shared: false };
    }
  };
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

const TABS = ['gastos','entretenimiento','ahorro'];
let currentTab = 'gastos';
let data = { gastos: [], entretenimiento: [], ahorro: [] };

const DEFAULT_ITEMS = {
  gastos: ['Gasolina','Arriendo','Comida para gatos','Arena para gatos','Comida Diaria','Mercado','Aceite para la moto','Productos de aseo','Lichigo','Prestamos','Tarjeta de credito','Kiosko'],
  entretenimiento: ['Helado','Hamburguesas o perro','Arepas','Viajes','dulces'],
  ahorro: []
};
let items = { gastos: [], entretenimiento: [], ahorro: [] };
let itemIcons = { gastos: {}, entretenimiento: {}, ahorro: {} }; // name -> "iconKey|color"

const DEFAULT_INCOME_ITEMS = {
  gastos: ['Sueldo','Emprendimiento'],
  entretenimiento: ['Sueldo','Emprendimiento'],
  ahorro: ['Sueldo','Emprendimiento']
};
let incomeItems = { gastos: [], entretenimiento: [], ahorro: [] };
let incomeItemIcons = { gastos: {}, entretenimiento: {}, ahorro: {} }; // name -> "iconKey|color"

let initialBalance = { gastos: 0, entretenimiento: 0, ahorro: 0 };
let balanceMode = 'saldo';
let showChart = false;

let appMode = 'tom';
const DEBT_DEFAULT_ITEMS = ['Mama','Tarjeta','Prestamos','Parqueadero','Servicio','Arriendo'];
let debtItems = [...DEBT_DEFAULT_ITEMS];
let debtData = {}; // { [name]: { totalDebt: number, payments: { 'YYYY-MM': number } } }
let debtIcons = {}; // name -> "iconKey|color"
let editingDebtName = null;
let showLunaChart = false;

function todayStr(){
  return new Date().toISOString().slice(0,10);
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Cablea el cierre de un modal: cualquiera de los botones dados lo cierra,
// y también tocar fuera del cuadro (el fondo oscuro) lo cierra.
function bindModalClose(backdropEl, closeFn, ...triggerEls){
  triggerEls.forEach(el => el && el.addEventListener('click', closeFn));
  backdropEl.addEventListener('click', (e)=>{ if(e.target === backdropEl) closeFn(); });
}

// Confirmación propia (visto bueno / X) en vez de confirm() nativo,
// que el WebView de Android no muestra.
const confirmModalBackdrop = document.getElementById('confirmModalBackdrop');
let confirmModalCallback = null;

function showConfirm(message, onYes){
  document.getElementById('confirmModalMessage').textContent = message;
  confirmModalCallback = onYes;
  confirmModalBackdrop.classList.add('open');
}

function hideConfirm(){
  confirmModalBackdrop.classList.remove('open');
  confirmModalCallback = null;
}

document.getElementById('confirmModalYes').addEventListener('click', async ()=>{
  const cb = confirmModalCallback;
  hideConfirm();
  if(cb) await cb();
});
bindModalClose(confirmModalBackdrop, hideConfirm, document.getElementById('confirmModalNo'));

function computeTotal(){
  let total = 0;
  TABS.forEach(t=>{
    total += initialBalance[t];
    data[t].forEach(m=>{ total += m.type==='in' ? m.amount : -m.amount; });
  });
  return total;
}

function computeTodayExpenses(){
  const today = todayStr();
  return data[currentTab]
    .filter(m => m.type === 'out' && m.date === today)
    .reduce((sum, m) => sum + m.amount, 0);
}

// --- Iconos de línea (SVG) por ítem, con color temático ---
const ICON_PATHS = {
  house: '<path d="M3 9 L10 3 L17 9 M5 8 V17 H15 V8 M8 17 V12 H12 V17"/>',
  gas: '<path d="M5 17V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v12 M5 17h6 M11 9h2a2 2 0 0 1 2 2v3a1.5 1.5 0 0 0 3 0V8l-2-2"/>',
  cat: '<path d="M4 8 L6 3 L8 7 M16 8 L14 3 L12 7 M4 8a6 6 0 1 0 12 0a6 6 0 1 0-12 0"/>',
  tray: '<path d="M3 13h14v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3 M3 13l2-6h10l2 6"/>',
  bowl: '<path d="M3 10a7 4 0 0 0 14 0 M3 10h14"/>',
  cart: '<path d="M3 4h2l2 10h9l2-7H6 M8 17a1 1 0 1 0 0.01 0 M14 17a1 1 0 1 0 0.01 0"/>',
  oil: '<path d="M10 3C6 8 5 11 5 13a5 5 0 0 0 10 0c0-2-1-5-5-10z"/>',
  spray: '<path d="M7 8h4v9a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V8z M8 8V5h2v3 M13 6l3-1 M13 8h3 M13 10l3 1"/>',
  tag: '<path d="M4 4h6l7 7-8 8-7-7V4z M8 8a1 1 0 1 0 0.01 0"/>',
  coin: '<path d="M10 3a7 7 0 1 0 0.01 0 M10 6v8 M8 8h3.5a1.5 1.5 0 0 1 0 3H8.5 M8 13h3.5"/>',
  card: '<path d="M3 6h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z M2 9h16"/>',
  store: '<path d="M3 8l1-4h12l1 4 M3 8v8h14V8 M7 8a2 2 0 0 0 4 0 M11 8a2 2 0 0 0 4 0"/>',
  icecream: '<path d="M10 3a4 4 0 0 1 4 4H6a4 4 0 0 1 4-4z M7 7l3 10 3-10"/>',
  burger: '<path d="M3 8a7 3 0 0 1 14 0z M3 8h14 M3 11h14 M3 14h14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
  plate: '<path d="M10 3a7 7 0 1 0 0.01 0 M10 6a4 4 0 1 0 0.01 0"/>',
  suitcase: '<path d="M4 8h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z M7 8V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  candy: '<path d="M6 10 L3 7 V13 Z M14 10 L17 7 V13 Z M8 10a2 2 0 1 0 4 0a2 2 0 1 0-4 0"/>'
};

const ITEM_ICON_MAP = {
  'gasolina': ['gas','coral'],
  'arriendo': ['house','amber'],
  'comida para gatos': ['cat','teal'],
  'arena para gatos': ['tray','teal'],
  'comida diaria': ['bowl','green'],
  'mercado': ['cart','green'],
  'aceite para la moto': ['oil','coral'],
  'productos de aseo': ['spray','blue'],
  'lichigo': ['tag','text-dim'],
  'prestamos': ['coin','amber'],
  'tarjeta de credito': ['card','blue'],
  'kiosko': ['store','purple'],
  'helado': ['icecream','pink'],
  'hamburguesas o perro': ['burger','coral'],
  'arepas': ['plate','amber'],
  'viajes': ['suitcase','teal'],
  'dulces': ['candy','pink'],
  'mama': ['tag','pink'],
  'tarjeta': ['card','blue'],
  'parqueadero': ['suitcase','coral'],
  'servicio': ['spray','teal'],
  'sueldo': ['coin','green'],
  'emprendimiento': ['store','green']
};

function getIcon(name, overrideKey){
  let iconKey, color;
  if(overrideKey && overrideKey.includes('|')){
    [iconKey, color] = overrideKey.split('|');
  } else {
    const key = name.trim().toLowerCase();
    [iconKey, color] = ITEM_ICON_MAP[key] || ['tag','text-dim'];
  }
  const path = ICON_PATHS[iconKey] || ICON_PATHS.tag;
  const colorVar = color === 'text-dim' ? 'var(--text-dim)' : `var(--${color})`;
  const bg = color === 'text-dim' ? 'rgba(155,149,133,0.12)' : `color-mix(in srgb, ${colorVar} 18%, transparent)`;
  const svg = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
  return `<span class="icon-wrap" style="background:${bg}; color:${colorVar};">${svg}</span>`;
}

// Pequeño "baúl" de íconos de línea para elegir manualmente al crear/editar un ítem
const ICON_CHOICES = [
  ['house','amber'], ['gas','coral'], ['cat','teal'], ['tray','teal'], ['bowl','green'],
  ['cart','green'], ['oil','coral'], ['spray','blue'], ['tag','text-dim'], ['coin','amber'],
  ['card','blue'], ['store','purple'], ['icecream','pink'], ['burger','coral'], ['plate','amber'],
  ['suitcase','teal'], ['candy','pink']
];

function buildIconPickerHTML(currentOverride){
  return `<div class="icon-picker">` + ICON_CHOICES.map(([iconKey,color])=>{
    const key = iconKey + '|' + color;
    const active = (currentOverride === key) ? ' active' : '';
    const colorVar = color === 'text-dim' ? 'var(--text-dim)' : `var(--${color})`;
    const bg = color === 'text-dim' ? 'rgba(155,149,133,0.12)' : `color-mix(in srgb, ${colorVar} 18%, transparent)`;
    const svg = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[iconKey]}</svg>`;
    return `<button type="button" class="icon-swatch${active}" data-icon="${key}" style="background:${bg}; color:${colorVar};">${svg}</button>`;
  }).join('') + `</div>`;
}

function wireIconPicker(container){
  container.querySelectorAll('.icon-swatch').forEach(btn=>{
    btn.addEventListener('mousedown', e=> e.preventDefault());
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      container.querySelectorAll('.icon-swatch').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

// --- Persistencia genérica: reemplaza los pares load/save casi idénticos
// que había antes para cada lista (items, íconos, ingresos, deudas...). ---
async function storageGetJSON(key, fallback){
  try{
    const r = await window.storage.get(key);
    return r ? JSON.parse(r.value) : fallback;
  }catch(e){ return fallback; }
}

async function storageSetJSON(key, value, errorLabel){
  try{ await window.storage.set(key, JSON.stringify(value)); }
  catch(e){ console.error(errorLabel || ('Error guardando ' + key), e); }
}

async function loadData(){
  for(const t of TABS){
    data[t] = await storageGetJSON('movs:'+t, []);
    items[t] = await storageGetJSON('items:'+t, [...DEFAULT_ITEMS[t]]);
    itemIcons[t] = await storageGetJSON('icons:'+t, {});
    incomeItems[t] = await storageGetJSON('incomeItems:'+t, [...DEFAULT_INCOME_ITEMS[t]]);
    incomeItemIcons[t] = await storageGetJSON('incomeIcons:'+t, {});
    try{
      const r3 = await window.storage.get('initialBalance:'+t);
      initialBalance[t] = r3 ? parseFloat(r3.value) || 0 : 0;
    }catch(e){ initialBalance[t] = 0; }
  }
  populateFilters();
  renderMenu();
  render();
}

async function saveTab(t){
  await storageSetJSON('movs:'+t, data[t], 'Error guardando');
}

async function saveInitialBalance(t){
  try{ await window.storage.set('initialBalance:'+t, String(initialBalance[t])); }
  catch(e){ console.error('Error guardando saldo inicial', e); }
}

async function saveItems(t){
  await storageSetJSON('items:'+t, items[t], 'Error guardando lista');
}

async function saveItemIcons(t){
  await storageSetJSON('icons:'+t, itemIcons[t], 'Error guardando iconos');
}

async function saveIncomeItems(t){
  await storageSetJSON('incomeItems:'+t, incomeItems[t], 'Error guardando ingresos');
}

async function saveIncomeItemIcons(t){
  await storageSetJSON('incomeIcons:'+t, incomeItemIcons[t], 'Error guardando iconos de ingresos');
}

// Devuelve la lista activa (gastos o ingresos) según el tipo elegido en el formulario
function activeListKind(){
  return document.getElementById('f-type').value === 'in' ? 'income' : 'expense';
}
function activeItemsArray(){
  return activeListKind() === 'income' ? incomeItems[currentTab] : items[currentTab];
}
function activeIconsMap(){
  return activeListKind() === 'income' ? incomeItemIcons[currentTab] : itemIcons[currentTab];
}
async function saveActiveItems(){
  if(activeListKind() === 'income') await saveIncomeItems(currentTab);
  else await saveItems(currentTab);
}
async function saveActiveIcons(){
  if(activeListKind() === 'income') await saveIncomeItemIcons(currentTab);
  else await saveItemIcons(currentTab);
}

document.querySelectorAll('.tab').forEach(el=>{
  el.addEventListener('click', ()=>{
    document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
    el.classList.add('active');
    currentTab = el.dataset.tab;
    document.getElementById('selectBtnInner').textContent = 'Elegir ítem';
    populateFilters();
    renderMenu();
    render();
  });
});

const fMonth = document.getElementById('filterMonth');
const filterDayBtn = document.getElementById('filterDayBtn');
const dayModalBackdrop = document.getElementById('dayModalBackdrop');
const dayModalGrid = document.getElementById('dayModalGrid');
const dayModalClose = document.getElementById('dayModalClose');
let selectedDay = '';

fMonth.addEventListener('change', ()=>{ selectedDay=''; populateDays(); render(); });

function openDayModal(){ dayModalBackdrop.classList.add('open'); }
function closeDayModal(){ dayModalBackdrop.classList.remove('open'); }
filterDayBtn.addEventListener('click', openDayModal);
bindModalClose(dayModalBackdrop, closeDayModal, dayModalClose);

const chartToggleBtn = document.getElementById('chartToggleBtn');
chartToggleBtn.addEventListener('click', ()=>{
  showChart = !showChart;
  chartToggleBtn.classList.toggle('active', showChart);
  render();
});

function populateFilters(){
  populateMonths();
  populateDays();
}

function daysInMonth(year, monthIndex){
  return new Date(year, monthIndex+1, 0).getDate();
}

function populateMonths(){
  const year = new Date().getFullYear();
  const monthMap = new Map();
  for(let m=0;m<12;m++){
    const val = `${year}-${String(m+1).padStart(2,'0')}`;
    monthMap.set(val, new Date(year, m, 1).toLocaleDateString('es-ES',{month:'long'}));
  }
  data[currentTab].forEach(mv=>{
    const val = mv.date.slice(0,7);
    if(!monthMap.has(val)){
      const [y,mo] = val.split('-');
      monthMap.set(val, new Date(y, mo-1, 1).toLocaleDateString('es-ES',{month:'long'}));
    }
  });
  fMonth.innerHTML = '<option value="">Mes</option>' +
    [...monthMap.keys()].sort().map(v=>`<option value="${v}">${monthMap.get(v)}</option>`).join('');
}

function populateDays(){
  let year, monthIndex;
  if(fMonth.value){
    const [y,mo] = fMonth.value.split('-');
    year = +y; monthIndex = +mo - 1;
  } else {
    const now = new Date();
    year = now.getFullYear(); monthIndex = now.getMonth();
  }
  const total = daysInMonth(year, monthIndex);
  const list = [];
  for(let d=1; d<=total; d++){
    list.push(`${year}-${String(monthIndex+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
  }
  window.__dayList = list;
  if(selectedDay && !window.__dayList.includes(selectedDay)) selectedDay = '';
  updateDayButtonLabel();
  renderDayModalGrid();
}

function updateDayButtonLabel(){
  if(!selectedDay){ filterDayBtn.textContent = 'Días'; return; }
  filterDayBtn.textContent = new Date(selectedDay+'T00:00').toLocaleDateString('es-ES',{day:'numeric', month:'short'});
}

function renderDayModalGrid(){
  const list = window.__dayList || [];
  let html = `<div class="day-chip all-chip${selectedDay?'':' active'}" data-day="">Todos los días</div>`;
  html += list.map(d=>{
    const dayNum = parseInt(d.slice(-2), 10);
    const active = d===selectedDay ? ' active' : '';
    return `<div class="day-chip${active}" data-day="${d}">${dayNum}</div>`;
  }).join('');
  dayModalGrid.innerHTML = html;
  dayModalGrid.querySelectorAll('.day-chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      selectedDay = chip.dataset.day;
      updateDayButtonLabel();
      renderDayModalGrid();
      closeDayModal();
      render();
    });
  });
}

const balanceModeSelect = document.getElementById('balanceModeSelect');
const balanceEditHint = document.getElementById('balanceEditHint');

function updateBalanceModeUI(){
  if(balanceMode === 'total'){
    balanceEl.style.cursor = 'default';
    balanceEl.classList.add('total-mode');
    balanceEditHint.textContent = 'Vista total de las 3 pestañas (no editable)';
  } else if(balanceMode === 'dia'){
    balanceEl.style.cursor = 'default';
    balanceEl.classList.remove('total-mode');
    balanceEditHint.textContent = 'Total de gastos de hoy (no editable)';
  } else {
    balanceEl.style.cursor = 'pointer';
    balanceEl.classList.remove('total-mode');
    balanceEditHint.textContent = '';
  }
}

balanceModeSelect.addEventListener('change', ()=>{
  balanceMode = balanceModeSelect.value;
  updateBalanceModeUI();
  render();
});

const balanceEl = document.getElementById('balance');
balanceEl.addEventListener('click', ()=>{
  if(balanceMode === 'total' || balanceMode === 'dia') return;
  const input = document.createElement('input');
  input.type = 'number';
  input.step = '0.01';
  input.id = 'balanceInput';
  input.value = initialBalance[currentTab];
  balanceEl.replaceWith(input);
  input.focus();
  input.select();

  async function commit(){
    const val = parseFloat(input.value);
    initialBalance[currentTab] = isNaN(val) ? 0 : val;
    await saveInitialBalance(currentTab);
    input.replaceWith(balanceEl);
    render();
  }
  input.addEventListener('keydown', e=>{
    if(e.key === 'Enter'){ e.preventDefault(); commit(); }
    if(e.key === 'Escape'){ input.replaceWith(balanceEl); }
  });
  input.addEventListener('blur', commit);
});

const selectBtn = document.getElementById('selectBtn');
const selectBtnInner = document.getElementById('selectBtnInner');
const selectMenu = document.getElementById('selectMenu');
const selectWrap = document.getElementById('selectWrap');

selectBtn.addEventListener('click', ()=>{
  const isOpen = selectMenu.classList.toggle('open');
  selectBtn.classList.toggle('open', isOpen);
});

// Cambiar entre Gasto/Ingreso cambia qué lista (items o ingresos) se ve en "Lista"
document.getElementById('f-type').addEventListener('change', ()=>{
  document.getElementById('f-desc').value = '';
  selectBtnInner.textContent = 'Elegir ítem';
  renderMenu();
});

document.addEventListener('click', (e)=>{
  if(!selectWrap.contains(e.target)){
    selectMenu.classList.remove('open');
    selectBtn.classList.remove('open');
  }
});

// Cerrar cualquier selector de íconos abierto si se pincha fuera de él
document.addEventListener('click', (e)=>{
  if(e.target.closest('.icon-picker') || e.target.closest('.icon-picker-btn') || e.target.closest('#debtModalIconBtn')) return;
  document.querySelectorAll('.icon-picker-panel').forEach(p=>p.remove());
  const modalPicker = document.getElementById('debtModalIconPicker');
  if(modalPicker) modalPicker.style.display = 'none';
});

function chooseItem(name){
  document.getElementById('f-desc').value = name;
  selectBtnInner.innerHTML = getIcon(name, activeIconsMap()[name]) + `<span>${escapeHtml(name)}</span>`;
  selectMenu.classList.remove('open');
  selectBtn.classList.remove('open');
  document.getElementById('f-amount').focus();
}

function renderMenu(){
  const listTitle = document.getElementById('listTitle');
  if(listTitle) listTitle.textContent = activeListKind() === 'income' ? 'Lista de ingresos' : 'Lista';

  const list = activeItemsArray();
  const icons = activeIconsMap();
  const rows = list.map(name=>{
    const safe = escapeHtml(name);
    return `<div class="menu-row" data-name="${safe}">
      <div class="menu-row-main" data-name="${safe}">${getIcon(name, icons[name])}<span class="menu-row-label">${safe}</span></div>
      <button type="button" class="menu-icon-btn menu-more-btn" data-name="${safe}" title="Opciones">⋮</button>
    </div>`;
  }).join('');
  selectMenu.innerHTML = rows + `<div class="menu-add-row" id="menuAddRow">+ Agregar nuevo</div>`;

  selectMenu.querySelectorAll('.menu-row-main').forEach(row=>{
    row.addEventListener('click', ()=> chooseItem(row.dataset.name));
  });

  selectMenu.querySelectorAll('.menu-more-btn').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      const row = btn.closest('.menu-row');
      const name = btn.dataset.name;
      const existing = row.querySelector('.icon-picker-panel');
      if(existing){ existing.remove(); return; }
      selectMenu.querySelectorAll('.icon-picker-panel').forEach(p=>p.remove());
      const panel = document.createElement('div');
      panel.className = 'icon-picker-panel';
      panel.innerHTML = buildIconPickerHTML(activeIconsMap()[name] || '') +
        `<div class="row-options-actions">
          <input type="text" class="menu-add-input" id="rowRenameInput" value="${escapeHtml(name)}">
          <button type="button" class="menu-icon-btn row-delete-btn" title="Eliminar">🗑</button>
        </div>`;
      row.insertAdjacentElement('afterend', panel);
      wireIconPicker(panel);
      panel.querySelectorAll('.icon-swatch').forEach(sw=>{
        sw.addEventListener('click', async ()=>{
          activeIconsMap()[name] = sw.dataset.icon;
          await saveActiveIcons();
          renderMenu();
          render();
        });
      });

      const renameInput = panel.querySelector('#rowRenameInput');
      renameInput.addEventListener('click', ev=> ev.stopPropagation());
      async function commitRename(){
        const val = renameInput.value.trim();
        if(val && val !== name){
          const arr = activeItemsArray();
          const icons2 = activeIconsMap();
          const idx = arr.indexOf(name);
          if(idx !== -1) arr[idx] = val;
          const kind = activeListKind();
          data[currentTab].forEach(m=>{
            const movKind = m.type === 'in' ? 'income' : 'expense';
            if(movKind === kind && m.desc === name) m.desc = val;
          });
          if(icons2[name]){
            icons2[val] = icons2[name];
            delete icons2[name];
            await saveActiveIcons();
          }
          await saveActiveItems();
          await saveTab(currentTab);
          if(document.getElementById('f-desc').value === name){
            document.getElementById('f-desc').value = val;
            selectBtnInner.innerHTML = getIcon(val, activeIconsMap()[val]) + `<span>${escapeHtml(val)}</span>`;
          }
          renderMenu();
          render();
        }
      }
      renameInput.addEventListener('keydown', ev=>{
        if(ev.key === 'Enter'){ ev.preventDefault(); commitRename(); }
      });
      renameInput.addEventListener('blur', commitRename);

      panel.querySelector('.row-delete-btn').addEventListener('click', (ev)=>{
        ev.stopPropagation();
        showConfirm(`¿Eliminar "${name}" de la lista?`, async ()=>{
          const arr = activeItemsArray();
          const kept = arr.filter(n=>n!==name);
          arr.length = 0;
          arr.push(...kept);
          delete activeIconsMap()[name];
          await saveActiveItems();
          await saveActiveIcons();
          renderMenu();
        });
      });
    });
  });

  document.getElementById('menuAddRow').addEventListener('click', (e)=>{
    e.stopPropagation();
    const row = document.getElementById('menuAddRow');
    row.innerHTML = `<div style="flex:1; min-width:0;">
      <input type="text" class="menu-add-input" id="menuAddInput" placeholder="Nuevo ítem...">
      ${buildIconPickerHTML('')}
      <div class="debt-modal-actions" style="margin-top:10px;">
        <button type="button" class="btn-secondary" id="menuAddCancel">Cancelar</button>
        <button type="button" id="menuAddConfirm">Guardar</button>
      </div>
    </div>`;
    const input = document.getElementById('menuAddInput');
    input.focus();
    wireIconPicker(row);

    async function commit(){
      const val = input.value.trim();
      if(val){
        activeItemsArray().push(val);
        const chosen = row.querySelector('.icon-swatch.active');
        if(chosen) activeIconsMap()[val] = chosen.dataset.icon;
        await saveActiveItems();
        await saveActiveIcons();
      }
      renderMenu();
    }
    function cancel(){ renderMenu(); }

    input.addEventListener('keydown', ev=>{
      if(ev.key === 'Enter'){ ev.preventDefault(); commit(); }
      if(ev.key === 'Escape'){ cancel(); }
    });
    input.addEventListener('click', ev=> ev.stopPropagation());
    document.getElementById('menuAddConfirm').addEventListener('click', (ev)=>{ ev.stopPropagation(); commit(); });
    document.getElementById('menuAddCancel').addEventListener('click', (ev)=>{ ev.stopPropagation(); cancel(); });
  });
}

document.getElementById('form').addEventListener('submit', async e=>{
  e.preventDefault();
  const desc = document.getElementById('f-desc').value.trim();
  const amount = parseFloat(document.getElementById('f-amount').value);
  const type = document.getElementById('f-type').value;
  const note = document.getElementById('f-note').value.trim();
  // La fecha es automática: el día de hoy, o el día activo en el filtro
  // "Días" si el usuario ya eligió uno (para cargar información pasada).
  const date = selectedDay || todayStr();
  if(!desc || isNaN(amount)) return;

  data[currentTab].push({ id: Date.now().toString(), desc, amount, type, date, note });
  await saveTab(currentTab);
  e.target.reset();
  selectBtnInner.textContent = 'Elegir ítem';
  renderMenu();
  populateFilters();
  render();
});

async function deleteMov(id){
  data[currentTab] = data[currentTab].filter(m=>m.id!==id);
  await saveTab(currentTab);
  populateFilters();
  render();
}

const movModalBackdrop = document.getElementById('movModalBackdrop');
let editingMovId = null;

function openMovModal(id){
  const m = data[currentTab].find(x=>x.id===id);
  if(!m) return;
  editingMovId = id;
  document.getElementById('movModalDesc').value = m.desc;
  document.getElementById('movModalAmount').value = m.amount;
  document.getElementById('movModalType').value = m.type;
  document.getElementById('movModalDate').value = m.date;
  document.getElementById('movModalNote').value = m.note || '';
  movModalBackdrop.classList.add('open');
}

function closeMovModal(){
  movModalBackdrop.classList.remove('open');
  editingMovId = null;
}

bindModalClose(movModalBackdrop, closeMovModal, document.getElementById('movModalClose'), document.getElementById('movModalCancel'));

document.getElementById('movModalSave').addEventListener('click', async ()=>{
  const m = data[currentTab].find(x=>x.id===editingMovId);
  if(!m) return;
  const desc = document.getElementById('movModalDesc').value.trim();
  const amount = parseFloat(document.getElementById('movModalAmount').value);
  const type = document.getElementById('movModalType').value;
  const date = document.getElementById('movModalDate').value;
  const note = document.getElementById('movModalNote').value.trim();
  if(!desc || isNaN(amount) || !date) return;
  m.desc = desc;
  m.amount = amount;
  m.type = type;
  m.date = date;
  m.note = note;
  await saveTab(currentTab);
  closeMovModal();
  populateFilters();
  render();
});

function fmt(n){
  return '$' + Number(n).toLocaleString('es-CO', {maximumFractionDigits:0});
}

function render(){
  const month = fMonth.value;
  const day = selectedDay;
  const list = data[currentTab]
    .filter(m => !month || m.date.slice(0,7) === month)
    .filter(m => !day || m.date === day)
    .sort((a,b)=> b.date.localeCompare(a.date));

  let totalIn=0, totalOut=0;
  list.forEach(m=>{
    if(m.type==='in') totalIn += m.amount; else totalOut += m.amount;
  });

  document.getElementById('balance').textContent = balanceMode === 'total'
    ? fmt(computeTotal())
    : balanceMode === 'dia'
      ? fmt(computeTodayExpenses())
      : fmt(initialBalance[currentTab] + totalIn - totalOut);
  document.getElementById('totalIn').textContent = fmt(totalIn);
  document.getElementById('totalOut').textContent = fmt(totalOut);

  renderChart(list);

  const movsEl = document.getElementById('movs');
  if(!list.length){
    movsEl.innerHTML = '<div class="empty">Sin movimientos en este filtro todavía.</div>';
    return;
  }
  movsEl.innerHTML = list.map(m=>{
    const fecha = new Date(m.date+'T00:00').toLocaleDateString('es-ES',{day:'numeric', month:'short'});
    const iconMap = m.type === 'in' ? incomeItemIcons[currentTab] : itemIcons[currentTab];
    const noteHtml = m.note ? `<div class="mov-note">${escapeHtml(m.note)}</div>` : '';
    return `<div class="mov">
      <div class="mov-left">
        ${getIcon(m.desc, iconMap[m.desc])}
        <div>
          <div class="mov-desc">${escapeHtml(m.desc)}</div>
          <div class="mov-meta">${fecha}</div>
          ${noteHtml}
        </div>
      </div>
      <div style="display:flex; align-items:center;">
        <div class="mov-amount ${m.type}">${m.type==='in'?'+':'-'}${fmt(m.amount)}</div>
        <button class="del" onclick="openMovModal('${m.id}')" title="Editar">&#9998;</button>
        <button class="del" onclick="deleteMov('${m.id}')" title="Eliminar">×</button>
      </div>
    </div>`;
  }).join('');
}

const CHART_COLORS = ['#e8b13d','#3fc481','#e2503e','#2fbfbf','#5089e6','#a86cf0','#e3609e','#e87b3e','#a87a24','#f3efe4'];

// Arma un conic-gradient con una línea divisoria delgada entre cada
// categoría, para que la gráfica se lea más limpia.
function buildConicGradient(entries, total){
  const n = entries.length;
  const gapPct = n > 1 ? 0.9 : 0;
  const scale = n > 1 ? (100 - gapPct * n) / 100 : 1;
  let acc = 0;
  const stops = [];
  entries.forEach(([name, val], i)=>{
    const pct = (total ? (val/total*100) : 0) * scale;
    const start = acc;
    const end = acc + pct;
    stops.push(`${CHART_COLORS[i % CHART_COLORS.length]} ${start}% ${end}%`);
    if(n > 1){
      const gapEnd = end + gapPct;
      stops.push(`var(--bg) ${end}% ${gapEnd}%`);
      acc = gapEnd;
    } else {
      acc = end;
    }
  });
  return `conic-gradient(${stops.join(',')})`;
}

function buildChartLegend(entries, total){
  return entries.map(([name, val], i)=>{
    const pct = total ? Math.round(val/total*100) : 0;
    const color = CHART_COLORS[i % CHART_COLORS.length];
    return `<div class="legend-row">
      <span class="legend-dot" style="background:${color};"></span>
      <span class="legend-name">${escapeHtml(name)}</span>
      <span class="legend-pct">${pct}% · ${fmt(val)}</span>
    </div>`;
  }).join('');
}

function renderChart(list){
  const chartCard = document.getElementById('chartCard');
  if(!showChart){ chartCard.style.display = 'none'; return; }

  const outs = list.filter(m => m.type === 'out');
  if(!outs.length){ chartCard.style.display = 'none'; return; }

  const byDesc = new Map();
  outs.forEach(m => byDesc.set(m.desc, (byDesc.get(m.desc) || 0) + m.amount));
  const total = [...byDesc.values()].reduce((a,b)=>a+b, 0);
  const entries = [...byDesc.entries()].sort((a,b)=> b[1]-a[1]);

  document.getElementById('pieChart').style.background = buildConicGradient(entries, total);
  document.getElementById('chartLegend').innerHTML = buildChartLegend(entries, total);

  chartCard.style.display = '';
}

// --- Luna: pendientes por pagar ---

function currentMonthKey(){ return todayStr().slice(0,7); }

async function loadDebts(){
  debtItems = await storageGetJSON('luna:items', [...DEBT_DEFAULT_ITEMS]);
  debtData = await storageGetJSON('luna:data', {});
  debtIcons = await storageGetJSON('luna:icons', {});
  debtItems.forEach(name=>{ if(!debtData[name]) debtData[name] = { totalDebt: 0, payments: {} }; });
}

async function saveDebtItems(){
  await storageSetJSON('luna:items', debtItems, 'Error guardando pendientes');
}

async function saveDebtData(){
  await storageSetJSON('luna:data', debtData, 'Error guardando datos de pendientes');
}

async function saveDebtIcons(){
  await storageSetJSON('luna:icons', debtIcons, 'Error guardando iconos de pendientes');
}

function populateLunaMonths(selectEl){
  const year = new Date().getFullYear();
  const monthMap = new Map();
  for(let m=0;m<12;m++){
    const val = `${year}-${String(m+1).padStart(2,'0')}`;
    monthMap.set(val, new Date(year, m, 1).toLocaleDateString('es-ES',{month:'long'}));
  }
  Object.values(debtData).forEach(d=>{
    Object.keys(d.payments || {}).forEach(val=>{
      if(!monthMap.has(val)){
        const [y,mo] = val.split('-');
        monthMap.set(val, new Date(y, mo-1, 1).toLocaleDateString('es-ES',{month:'long'}));
      }
    });
  });
  const keys = [...monthMap.keys()].sort();
  selectEl.innerHTML = keys.map(v=>`<option value="${v}">${monthMap.get(v)}</option>`).join('');
  return keys;
}

function renderDebtList(){
  const month = lunaFilterMonth.value || currentMonthKey();
  const listEl = document.getElementById('debtList');
  let totalOwed = 0;
  debtItems.forEach(name=>{
    const d = debtData[name] || { totalDebt: 0, payments: {} };
    const paidTotal = Object.values(d.payments).reduce((a,b)=>a+b, 0);
    totalOwed += Math.max(0, d.totalDebt - paidTotal);
  });
  document.getElementById('lunaTotalSummary').textContent = 'Debes en total: ' + fmt(totalOwed);
  renderLunaChart();

  if(!debtItems.length){
    listEl.innerHTML = '<div class="empty">Aún no hay pendientes agregados.</div>';
    return;
  }
  listEl.innerHTML = debtItems.map(name=>{
    const d = debtData[name] || { totalDebt: 0, payments: {} };
    const paidTotal = Object.values(d.payments).reduce((a,b)=>a+b, 0);
    const pct = d.totalDebt > 0 ? Math.min(1, paidTotal / d.totalDebt) : 0;
    const color = `hsl(${Math.round(pct*120)}, 62%, 45%)`;
    const monthPayment = d.payments[month] || 0;
    const safe = escapeHtml(name);
    const noteHtml = d.note ? `<div class="mov-note">${escapeHtml(d.note)}</div>` : '';
    return `<div class="debt-row" style="border-left-color:${color};" data-name="${safe}">
      <div class="debt-row-main" data-name="${safe}" style="flex:1;">
        ${getIcon(name, debtIcons[name])}
        <div class="debt-info">
          <div class="debt-name">${safe}</div>
          <div class="debt-meta">Deuda: ${fmt(d.totalDebt)} · Abono mes: ${fmt(monthPayment)} · <span class="pct" style="color:${color};">${Math.round(pct*100)}%</span></div>
          ${noteHtml}
        </div>
      </div>
    </div>`;
  }).join('');

  listEl.querySelectorAll('.debt-row-main').forEach(row=>{
    row.addEventListener('click', ()=> openDebtModal(row.dataset.name));
  });
}

function resetDebtAddRow(){
  document.getElementById('debtAddRow').innerHTML = '+ Agregar pendiente';
}

document.getElementById('debtAddRow').addEventListener('click', (e)=>{
  const row = document.getElementById('debtAddRow');
  row.innerHTML = `<div style="flex:1; min-width:0;">
    <input type="text" class="menu-add-input" id="debtAddInput" placeholder="Nuevo pendiente...">
    ${buildIconPickerHTML('')}
    <div class="debt-modal-actions" style="margin-top:10px;">
      <button type="button" class="btn-secondary" id="debtAddCancel">Cancelar</button>
      <button type="button" id="debtAddConfirm">Guardar</button>
    </div>
  </div>`;
  const input = document.getElementById('debtAddInput');
  input.focus();
  wireIconPicker(row);

  async function commit(){
    const val = input.value.trim();
    if(val && !debtItems.includes(val)){
      debtItems.push(val);
      debtData[val] = { totalDebt: 0, payments: {} };
      const chosen = row.querySelector('.icon-swatch.active');
      if(chosen) debtIcons[val] = chosen.dataset.icon;
      await saveDebtItems();
      await saveDebtData();
      await saveDebtIcons();
    }
    resetDebtAddRow();
    renderDebtList();
  }
  function cancel(){ resetDebtAddRow(); }

  input.addEventListener('keydown', ev=>{
    if(ev.key === 'Enter'){ ev.preventDefault(); commit(); }
    if(ev.key === 'Escape'){ cancel(); }
  });
  input.addEventListener('click', ev=> ev.stopPropagation());
  document.getElementById('debtAddConfirm').addEventListener('click', (ev)=>{ ev.stopPropagation(); commit(); });
  document.getElementById('debtAddCancel').addEventListener('click', (ev)=>{ ev.stopPropagation(); cancel(); });
});

const debtModalBackdrop = document.getElementById('debtModalBackdrop');
const debtModalMonth = document.getElementById('debtModalMonth');
const debtModalTotal = document.getElementById('debtModalTotal');
const debtModalPayment = document.getElementById('debtModalPayment');

function openDebtModal(name){
  editingDebtName = name;
  if(!debtData[name]) debtData[name] = { totalDebt: 0, payments: {} };
  document.getElementById('debtModalTitle').textContent = name;
  document.getElementById('debtModalIconPreview').innerHTML = getIcon(name, debtIcons[name]);
  document.getElementById('debtModalIconPicker').style.display = 'none';
  document.getElementById('debtModalNote').value = debtData[name].note || '';
  const monthKeys = populateLunaMonths(debtModalMonth);
  const refMonth = lunaFilterMonth.value || currentMonthKey();
  debtModalMonth.value = monthKeys.includes(refMonth) ? refMonth : monthKeys[0];
  fillDebtModalForMonth();
  debtModalBackdrop.classList.add('open');
}

function closeDebtModal(){
  debtModalBackdrop.classList.remove('open');
  document.getElementById('debtModalIconPicker').style.display = 'none';
  editingDebtName = null;
}

document.getElementById('debtModalIconBtn').addEventListener('click', (e)=>{
  e.stopPropagation();
  const picker = document.getElementById('debtModalIconPicker');
  const isOpen = picker.style.display !== 'none';
  if(isOpen){ picker.style.display = 'none'; return; }
  picker.innerHTML = buildIconPickerHTML(debtIcons[editingDebtName] || '');
  picker.style.display = '';
  wireIconPicker(picker);
  picker.querySelectorAll('.icon-swatch').forEach(sw=>{
    sw.addEventListener('click', async ()=>{
      debtIcons[editingDebtName] = sw.dataset.icon;
      await saveDebtIcons();
      document.getElementById('debtModalIconPreview').innerHTML = getIcon(editingDebtName, debtIcons[editingDebtName]);
      picker.style.display = 'none';
    });
  });
});

document.getElementById('debtModalRenameBtn').addEventListener('click', (e)=>{
  e.stopPropagation();
  const titleEl = document.getElementById('debtModalTitle');
  const oldName = editingDebtName;
  titleEl.outerHTML = `<input type="text" class="menu-add-input" id="debtModalTitleInput" value="${escapeHtml(oldName)}" style="max-width:150px;">`;
  const input = document.getElementById('debtModalTitleInput');
  input.focus();
  input.select();
  input.addEventListener('click', ev=> ev.stopPropagation());
  let cancelled = false;

  async function commit(){
    if(cancelled) return;
    const val = input.value.trim();
    if(val && val !== oldName && !debtItems.includes(val)){
      const idx = debtItems.indexOf(oldName);
      if(idx !== -1) debtItems[idx] = val;
      debtData[val] = debtData[oldName];
      delete debtData[oldName];
      if(debtIcons[oldName]){ debtIcons[val] = debtIcons[oldName]; delete debtIcons[oldName]; }
      await saveDebtItems();
      await saveDebtData();
      await saveDebtIcons();
      editingDebtName = val;
    }
    input.outerHTML = `<span id="debtModalTitle">${escapeHtml(editingDebtName)}</span>`;
    renderDebtList();
  }
  input.addEventListener('keydown', ev=>{
    if(ev.key === 'Enter'){ ev.preventDefault(); commit(); }
    if(ev.key === 'Escape'){
      cancelled = true;
      input.outerHTML = `<span id="debtModalTitle">${escapeHtml(oldName)}</span>`;
    }
  });
  input.addEventListener('blur', commit);
});

document.getElementById('debtModalDeleteBtn').addEventListener('click', (e)=>{
  e.stopPropagation();
  const name = editingDebtName;
  if(!name) return;
  showConfirm(`¿Eliminar "${name}" de los pendientes?`, async ()=>{
    debtItems = debtItems.filter(n=>n!==name);
    delete debtData[name];
    delete debtIcons[name];
    await saveDebtItems();
    await saveDebtData();
    await saveDebtIcons();
    closeDebtModal();
    renderDebtList();
  });
});

function fillDebtModalForMonth(){
  const d = debtData[editingDebtName];
  const month = debtModalMonth.value;
  debtModalTotal.value = d.totalDebt || '';
  debtModalPayment.value = d.payments[month] || '';
  updateDebtModalSummary();
}

function updateDebtModalSummary(){
  const d = debtData[editingDebtName];
  const month = debtModalMonth.value;
  const totalDebt = parseFloat(debtModalTotal.value) || 0;
  const liveMonthVal = parseFloat(debtModalPayment.value) || 0;
  let paidTotal = 0;
  Object.keys(d.payments).forEach(k=>{ paidTotal += (k === month ? 0 : d.payments[k]); });
  paidTotal += liveMonthVal;
  const pct = totalDebt > 0 ? Math.min(100, Math.round(paidTotal / totalDebt * 100)) : 0;
  document.getElementById('debtModalPaidTotal').textContent = fmt(paidTotal);
  document.getElementById('debtModalPct').textContent = pct + '%';
}

debtModalMonth.addEventListener('change', fillDebtModalForMonth);
debtModalTotal.addEventListener('input', updateDebtModalSummary);
debtModalPayment.addEventListener('input', updateDebtModalSummary);

bindModalClose(debtModalBackdrop, closeDebtModal, document.getElementById('debtModalClose'), document.getElementById('debtModalCancel'));

document.getElementById('debtModalSave').addEventListener('click', async ()=>{
  const name = editingDebtName;
  if(!name) return;
  const month = debtModalMonth.value;
  const totalDebt = parseFloat(debtModalTotal.value) || 0;
  const payment = parseFloat(debtModalPayment.value) || 0;
  const note = document.getElementById('debtModalNote').value.trim();
  debtData[name].totalDebt = totalDebt;
  debtData[name].payments[month] = payment;
  debtData[name].note = note;
  await saveDebtData();
  closeDebtModal();
  renderDebtList();
});

const lunaFilterMonth = document.getElementById('lunaFilterMonth');
lunaFilterMonth.addEventListener('change', renderDebtList);

const lunaChartToggleBtn = document.getElementById('lunaChartToggleBtn');
lunaChartToggleBtn.addEventListener('click', ()=>{
  showLunaChart = !showLunaChart;
  lunaChartToggleBtn.classList.toggle('active', showLunaChart);
  renderLunaChart();
});

function renderLunaChart(){
  const chartCard = document.getElementById('lunaChartCard');
  if(!showLunaChart){ chartCard.style.display = 'none'; return; }

  const entries = debtItems.map(name=>{
    const d = debtData[name] || { totalDebt: 0, payments: {} };
    const paidTotal = Object.values(d.payments).reduce((a,b)=>a+b, 0);
    return [name, Math.max(0, d.totalDebt - paidTotal)];
  }).filter(([,val])=> val > 0).sort((a,b)=> b[1]-a[1]);

  if(!entries.length){ chartCard.style.display = 'none'; return; }

  const total = entries.reduce((a,[,v])=>a+v, 0);
  document.getElementById('lunaPieChart').style.background = buildConicGradient(entries, total);
  document.getElementById('lunaChartLegend').innerHTML = buildChartLegend(entries, total);

  chartCard.style.display = '';
}

const appModeSelect = document.getElementById('appModeSelect');
const tomSection = document.getElementById('tomSection');
const lunaSection = document.getElementById('lunaSection');
const aparienciaSection = document.getElementById('aparienciaSection');

// El botón atrás de Android debe regresar primero al menú TOM (si elegiste
// Luna/Apariencia por error) y solo preguntar si salir cuando ya estás en TOM.
let modeHistoryPushed = false;

function goToMode(mode){
  appMode = mode;
  if(appModeSelect.value !== mode) appModeSelect.value = mode;
  tomSection.style.display = mode === 'tom' ? '' : 'none';
  lunaSection.style.display = mode === 'luna' ? '' : 'none';
  aparienciaSection.style.display = mode === 'apariencia' ? '' : 'none';
}

appModeSelect.addEventListener('change', ()=>{
  const newMode = appModeSelect.value;
  if(newMode === 'tom' && modeHistoryPushed){
    history.back();
    return;
  }
  if(newMode !== 'tom'){
    if(!modeHistoryPushed){
      history.pushState({ tomAppMode: newMode }, '', '');
      modeHistoryPushed = true;
    } else {
      history.replaceState({ tomAppMode: newMode }, '', '');
    }
  }
  goToMode(newMode);
});

window.addEventListener('popstate', ()=>{
  modeHistoryPushed = false;
  goToMode('tom');
});

// --- Apariencia: paleta de colores personalizable ---

function currentThemeVars(){
  const styles = getComputedStyle(document.documentElement);
  const vars = {};
  THEME_KEYS.forEach(k=>{ vars[k] = styles.getPropertyValue('--'+k).trim(); });
  return vars;
}

async function saveTheme(vars){
  await storageSetJSON('theme:custom', vars, 'Error guardando tema');
}

function renderThemePreviewIcons(){
  const el = document.getElementById('themePreviewIcons');
  el.innerHTML = getIcon('Gasolina') + getIcon('Arriendo') + getIcon('Helado');
}

function renderPresetGrid(){
  const grid = document.getElementById('presetGrid');
  const current = currentThemeVars();
  grid.innerHTML = Object.entries(THEME_PRESETS).map(([key, preset])=>{
    const isActive = THEME_KEYS.every(k => current[k].toLowerCase() === preset[k].toLowerCase());
    return `<div class="preset-card${isActive ? ' active' : ''}" data-preset="${key}">
      <div class="preset-swatch-row">
        <span class="preset-swatch" style="background:${preset.bg};"></span>
        <span class="preset-swatch" style="background:${preset.gold};"></span>
        <span class="preset-swatch" style="background:${preset.accent};"></span>
        <span class="preset-swatch" style="background:${preset.green};"></span>
      </div>
      <div class="preset-name">${escapeHtml(preset.name)}</div>
    </div>`;
  }).join('');

  grid.querySelectorAll('.preset-card').forEach(card=>{
    card.addEventListener('click', async ()=>{
      const preset = THEME_PRESETS[card.dataset.preset];
      applyTheme(preset);
      await saveTheme(currentThemeVars());
      renderPresetGrid();
      renderThemeColorGrid();
    });
  });
}

function renderThemeColorGrid(){
  const grid = document.getElementById('themeColorGrid');
  const current = currentThemeVars();
  grid.innerHTML = THEME_KEYS.map(k=>{
    return `<div class="theme-color-row">
      <input type="color" id="theme-${k}" value="${current[k]}">
      <label for="theme-${k}">${escapeHtml(THEME_LABELS[k])}</label>
    </div>`;
  }).join('');

  THEME_KEYS.forEach(k=>{
    document.getElementById('theme-'+k).addEventListener('input', async (e)=>{
      applyTheme({ [k]: e.target.value });
      await saveTheme(currentThemeVars());
      renderPresetGrid();
    });
  });
}

document.getElementById('themeResetBtn').addEventListener('click', async ()=>{
  applyTheme(THEME_PRESETS.default);
  await saveTheme(currentThemeVars());
  renderPresetGrid();
  renderThemeColorGrid();
});

const THEME_LABELS = {
  bg:'Fondo', panel:'Tarjetas', border:'Bordes', gold:'Principal', 'gold-dim':'Hover',
  accent:'Acento', text:'Texto', 'text-dim':'Texto gris', green:'Verde', red:'Rojo'
};

renderPresetGrid();
renderThemeColorGrid();
renderThemePreviewIcons();

updateBalanceModeUI();
loadData();
loadDebts().then(()=>{
  populateLunaMonths(lunaFilterMonth);
  lunaFilterMonth.value = currentMonthKey();
  renderDebtList();
});

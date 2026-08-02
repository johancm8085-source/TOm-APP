// Aplica el tema guardado de inmediato (antes de cualquier otra cosa)
// para que no se vea un parpadeo con los colores por defecto.
const THEME_KEYS = ['bg','panel','border','gold','gold-dim','accent','text','text-dim','green','red'];
const DEFAULT_THEME = {
  bg:'#111111', panel:'#1b1b1b', border:'#313131', gold:'#f97316', 'gold-dim':'#fb923c',
  accent:'#fdba74', text:'#ffffff', 'text-dim':'#b0b0b0', green:'#22c55e', red:'#ef4444'
};
const THEME_PRESETS = {
  default: Object.assign({ name: 'TOM Premium' }, DEFAULT_THEME),
  clasico: {
    name: 'Dorado Clásico',
    bg:'#14120f', panel:'#1c1a16', border:'#3a3226', gold:'#e8b13d', 'gold-dim':'#a87a24',
    accent:'#e87b3e', text:'#f3efe4', 'text-dim':'#a39d8c', green:'#3fc481', red:'#e2503e'
  },
  claro: {
    name: 'Claro',
    bg:'#f5f3ef', panel:'#ffffff', border:'#e2ded4', gold:'#d97706', 'gold-dim':'#b45309',
    accent:'#ea580c', text:'#1f1b16', 'text-dim':'#6b6255', green:'#16a34a', red:'#dc2626'
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
let monthlyBudget = { gastos: 0, entretenimiento: 0, ahorro: 0 };
let savingsGoal = 0;

let appMode = 'tom';
const DEBT_DEFAULT_ITEMS = ['Tarjeta','Prestamos','Parqueadero','Servicio','Arriendo'];
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

// Efecto ripple en botones/pestañas/tarjetas, delegado en document para que
// funcione también en elementos que se vuelven a dibujar con innerHTML.
document.addEventListener('pointerdown', (e)=>{
  const target = e.target.closest('button, .tab, .day-filter-btn, .preset-card');
  if(!target) return;
  const rect = target.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const span = document.createElement('span');
  span.className = 'ripple-effect';
  span.style.width = span.style.height = size + 'px';
  span.style.left = (e.clientX - rect.left - size / 2) + 'px';
  span.style.top = (e.clientY - rect.top - size / 2) + 'px';
  target.appendChild(span);
  span.addEventListener('animationend', ()=> span.remove());
});

// Confirmación propia (visto bueno / X) en vez de confirm() nativo,
// que el WebView de Android no muestra.
const confirmModalBackdrop = document.getElementById('confirmModalBackdrop');
let confirmModalCallback = null;

function showConfirm(message, onYes){
  document.getElementById('confirmModalMessage').textContent = message;
  confirmModalCallback = onYes;
  document.getElementById('confirmModalNo').style.display = '';
  document.getElementById('confirmModalYes').textContent = '✓ Confirmar';
  confirmModalBackdrop.classList.add('open');
}

// Aviso de un solo botón, reutilizando el mismo modal de confirmación
// (no hay alert() nativo disponible en el WebView de Android).
function showAlert(message){
  document.getElementById('confirmModalMessage').textContent = message;
  confirmModalCallback = null;
  document.getElementById('confirmModalNo').style.display = 'none';
  document.getElementById('confirmModalYes').textContent = '✓ Entendido';
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
  candy: '<path d="M6 10 L3 7 V13 Z M14 10 L17 7 V13 Z M8 10a2 2 0 1 0 4 0a2 2 0 1 0-4 0"/>',
  phone: '<path d="M6 2h8a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z M9 15h2"/>',
  wifi: '<path d="M3 8a10 8 0 0 1 14 0 M6 11a6 5 0 0 1 8 0 M10 15a1 1 0 1 0 0.01 0"/>',
  book: '<path d="M4 3h10v14H6a2 2 0 0 1-2-2V3z M14 3a2 2 0 0 1 2 2v12h-2"/>',
  heart: '<path d="M10 17S3 12 3 7.5A3.5 3.5 0 0 1 10 6a3.5 3.5 0 0 1 7 1.5C17 12 10 17 10 17z"/>',
  star: '<path d="M10 2l2.2 5.6 6 0.4-4.6 3.8 1.6 5.8L10 14.6 4.8 17.6l1.6-5.8L2 8l6-0.4z"/>',
  car: '<path d="M3 12V8a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v4 M3 12h14v3H3z M5.5 15v1.5 M14.5 15v1.5 M6 9h8"/>',
  plane: '<path d="M10 2v16 M3 8l7-2 7 2 M6 14l4-1 4 1"/>',
  pill: '<path d="M5 9a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v2a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V9z M10 5v10"/>',
  wrench: '<path d="M12 3a4 4 0 0 0-5 5L3 12l2 2 4-4a4 4 0 0 0 5-5l-2 2-2-2z"/>',
  shirt: '<path d="M7 3L4 6l2 2 1-1v9h6V7l1 1 2-2-3-3-2 1h-2z"/>',
  paw: '<path d="M6 8a1.3 1.3 0 1 0 0.01 0 M9 6a1.3 1.3 0 1 0 0.01 0 M12 6a1.3 1.3 0 1 0 0.01 0 M14.5 8.5a1.3 1.3 0 1 0 0.01 0 M10 10a4 3 0 0 0-4 3c0 1.8 2 1.8 4 1.8s4 0 4-1.8a4 3 0 0 0-4-3z"/>',
  plant: '<path d="M10 18v-7 M10 11c-3 0-5-2-5-5 3 0 5 2 5 5z M10 11c3 0 5-2 5-5-3 0-5 2-5 5z M7 18h6"/>',
  coffee: '<path d="M4 8h10v5a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8z M14 9h1.5a2 2 0 0 1 0 4H14"/>',
  pizza: '<path d="M10 3L3 16h14L10 3z M8 12a1 1 0 1 0 0.01 0 M12 12a1 1 0 1 0 0.01 0"/>',
  bank: '<path d="M3 8l7-5 7 5 M4 8v8 M16 8v8 M2 16h16 M7 11v4 M13 11v4"/>',
  wallet: '<path d="M3 6a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6z M14 10h2v4h-2z"/>',
  graph: '<path d="M3 17V3 M3 17h14 M6 14v-4 M9 14V7 M12 14v-6 M15 14v-3"/>',
  bulb: '<path d="M10 2a5 5 0 0 0-3 9c1 0.8 1 1.5 1 2.5h4c0-1 0-1.7 1-2.5a5 5 0 0 0-3-9z M8 16h4"/>',
  trash: '<path d="M4 6h12 M8 6V4h4v2 M6 6l1 11a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1l1-11"/>',
  music: '<path d="M8 15a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M14 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M8 13V4l6-1v8"/>',
  camera: '<path d="M3 7a1 1 0 0 1 1-1h2l1-2h6l1 2h2a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7z M10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>',
  gamepad: '<path d="M5 8h10a3 3 0 0 1 3 3v2a2 2 0 0 1-3.6 1.2L13 13H7l-1.4 1.2A2 2 0 0 1 2 13v-2a3 3 0 0 1 3-3z M6 10v2 M5 11h2 M14 10.5a0.7 0.7 0 1 0 0.01 0 M16 12a0.7 0.7 0 1 0 0.01 0"/>',
  umbrella: '<path d="M3 9c0-3 2-7 7-7s7 4 7 7H3z M10 9v6a2 2 0 0 1-3 1.7"/>',
  key: '<path d="M13 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M9.8 8.2L3 15v2h2v-2h2v-2h2"/>',
  lock: '<path d="M5 9V6a5 5 0 0 1 10 0v3 M4 9h12v8H4z M10 12v3"/>',
  clock: '<path d="M10 3a7 7 0 1 0 0.01 0 M10 6v4l3 2"/>',
  pin: '<path d="M10 2a6 6 0 0 0-6 6c0 5 6 10 6 10s6-5 6-10a6 6 0 0 0-6-6z M10 10.5a2.5 2.5 0 1 0 0.01 0"/>',
  baby: '<path d="M10 3a3 3 0 1 0 0.01 0 M6 10a4 4 0 0 1 8 0v4a4 4 0 0 1-8 0v-4z M8 10a0.6 0.6 0 1 0 0.01 0 M12 10a0.6 0.6 0 1 0 0.01 0"/>',
  laptop: '<path d="M4 5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v7H4V5z M2 15h16l-1.5 2h-13z"/>',
  gift: '<path d="M3 8h14v3H3z M4 11h12v7H4z M10 8v10 M10 8c-1-3-5-4-5-1.5S8 8 10 8 M10 8c1-3 5-4 5-1.5S12 8 10 8"/>',
  moto: '<path d="M4 15a2 2 0 1 0 0.01 0 M16 15a2 2 0 1 0 0.01 0 M4 15h2l2-4h4l2 4h4 M8 11l2-3h3 M11 8h3l2 3"/>',
  bus: '<path d="M3 6a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v8H3V6z M3 14h14v2H3z M5.5 16.5v1.5 M14.5 16.5v1.5 M3 10h14 M6 8h2 M12 8h2"/>',
  drop: '<path d="M10 2c3 4 5 7 5 10a5 5 0 0 1-10 0c0-3 2-6 5-10z"/>',
  bolt: '<path d="M11 2L4 12h5l-1 6 8-11h-5l1-5z"/>',
  flame: '<path d="M10 2c1 3-2 4-2 7a2 2 0 0 0 4 0c0-1-1-2-1-3 2 1 3 3 3 5a4 4 0 0 1-8 0c0-4 3-6 4-9z"/>',
  cap: '<path d="M2 8l8-4 8 4-8 4-8-4z M6 10v4c0 1 2 2 4 2s4-1 4-2v-4 M18 8v5"/>',
  hotelbed: '<path d="M3 17v-7a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1 M11 11v-1a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v7 M3 14h16 M3 17v-3 M17 17v-3 M5 10a1 1 0 1 0 0.01 0"/>',
  dog: '<path d="M4 6l2 3 M16 6l-2 3 M6 9a4 4 0 0 1 8 0v3a4 4 0 0 1-8 0V9z M7.5 10a0.6 0.6 0 1 0 0.01 0 M12.5 10a0.6 0.6 0 1 0 0.01 0 M9 13h2"/>',
  medcross: '<path d="M4 4h12a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z M10 7v6 M7 10h6"/>',
  streaming: '<path d="M5 3.5a1 1 0 0 1 1.5-0.86l9.5 5.5a1 1 0 0 1 0 1.72l-9.5 5.5A1 1 0 0 1 5 14.5v-11z"/>',
  soundwave: '<path d="M4 12V8 M8 15V5 M12 12V8 M16 15V5"/>',
  monitor: '<path d="M3 4h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z M8 17h4 M10 14v3"/>',
  shoe: '<path d="M3 14v-3c2 0 3-1 4-2l2-2 2 2h4a2 2 0 0 1 2 2v3z M3 14h14v2H4a1 1 0 0 1-1-1v-1z M9 7l2 2"/>',
  family: '<path d="M6 9a2 2 0 1 0 0.01 0 M14 9a2 2 0 1 0 0.01 0 M2 17v-2a3 3 0 0 1 3-3h2a3 3 0 0 1 3 3v2 M10 17v-2a3 3 0 0 1 3-3h2a3 3 0 0 1 3 3v2"/>',
  forkknife: '<path d="M5 2v6a1.5 1.5 0 0 0 3 0V2 M6.5 8v10 M13 2c-1 0-2 1.5-2 3.5S12 9 13 9v9"/>',
  cup: '<path d="M5 3h8l-1 12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 3z M13 6h2a2 2 0 0 1 0 4h-2"/>',
  dumbbell: '<path d="M3 9h2v4H3z M15 9h2v4h-2z M6 7v8 M14 7v8 M6 10.5h8"/>',
  shield: '<path d="M10 2l7 3v5c0 5-3.5 7.5-7 8-3.5-0.5-7-3-7-8V5l7-3z M7 10l2 2 4-4"/>',
  receipt: '<path d="M5 2h10v16l-2-1.5L11 18l-2-1.5L7 18l-2-1.5V2z M7 6h6 M7 9h6 M7 12h4"/>',
  piggybank: '<path d="M4 11a5 4 0 0 1 5-4h3a4 4 0 0 1 4 4v1a1 1 0 0 1-1 1h-1v2h-2v-2H8v2H6v-2a3 3 0 0 1-2-2.8z M14 8V6l2 1 M6.5 10a0.6 0.6 0 1 0 0.01 0"/>',
  crypto: '<path d="M10 3a7 7 0 1 0 0.01 0 M8 6v8 M7.5 7h3a1.5 1.5 0 0 1 0 3h-3.5 M7 10h3.5a1.5 1.5 0 0 1 0 3H7.5 M9 5.5V7 M9 13v1.5"/>',
  toolbox: '<path d="M3 8a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8z M7 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2 M3 11h14"/>',
  briefcase: '<path d="M4 7h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z M8 7V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2 M9 10h2v2H9z"/>'
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
  'emprendimiento': ['store','green'],
  'moto': ['moto','coral'],
  'transporte': ['bus','blue'],
  'bus': ['bus','blue'],
  'carro': ['car','purple'],
  'agua': ['drop','blue'],
  'luz': ['bolt','amber'],
  'gas': ['flame','red'],
  'hipoteca': ['house','red'],
  'educacion': ['cap','blue'],
  'educación': ['cap','blue'],
  'hotel': ['hotelbed','purple'],
  'perro': ['dog','coral'],
  'perros': ['dog','coral'],
  'veterinario': ['medcross','teal'],
  'farmacia': ['medcross','green'],
  'salud': ['medcross','red'],
  'netflix': ['streaming','red'],
  'spotify': ['soundwave','green'],
  'steam': ['streaming','blue'],
  'xbox': ['streaming','green'],
  'playstation': ['streaming','purple'],
  'pc': ['monitor','text-dim'],
  'celular': ['phone','purple'],
  'internet': ['wifi','purple'],
  'zapatos': ['shoe','amber'],
  'familia': ['family','teal'],
  'niños': ['baby','blue'],
  'ninos': ['baby','blue'],
  'restaurantes': ['forkknife','coral'],
  'restaurante': ['forkknife','coral'],
  'cafe': ['coffee','amber'],
  'café': ['coffee','amber'],
  'bebidas': ['cup','pink'],
  'gimnasio': ['dumbbell','green'],
  'seguros': ['shield','blue'],
  'seguro': ['shield','blue'],
  'impuestos': ['receipt','text-dim'],
  'inversiones': ['graph','purple'],
  'ahorro': ['piggybank','green'],
  'criptomonedas': ['crypto','amber'],
  'cripto': ['crypto','amber'],
  'banco': ['bank','purple'],
  'tarjetas': ['card','purple'],
  'préstamos': ['coin','coral'],
  'entretenimiento': ['gamepad','coral'],
  'trabajo': ['briefcase','blue'],
  'freelance': ['laptop','coral'],
  'herramientas': ['toolbox','amber']
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
  ['suitcase','teal'], ['candy','pink'],
  ['phone','teal'], ['wifi','blue'], ['book','coral'], ['heart','pink'], ['star','amber'],
  ['car','blue'], ['plane','teal'], ['pill','red'], ['wrench','text-dim'], ['shirt','purple'],
  ['paw','coral'], ['plant','green'], ['coffee','coral'], ['pizza','amber'], ['bank','blue'],
  ['wallet','amber'], ['graph','green'], ['bulb','amber'], ['trash','text-dim'], ['music','purple'],
  ['camera','teal'], ['gamepad','purple'], ['umbrella','blue'], ['key','amber'], ['lock','purple'],
  ['clock','blue'], ['pin','coral'], ['baby','pink'], ['laptop','blue'], ['gift','pink'],
  ['moto','coral'], ['car','purple'], ['bus','blue'], ['drop','blue'], ['bolt','amber'],
  ['flame','red'], ['cap','blue'], ['hotelbed','purple'], ['dog','coral'], ['medcross','red'],
  ['medcross','green'], ['medcross','teal'], ['streaming','red'], ['soundwave','green'], ['streaming','blue'],
  ['streaming','green'], ['streaming','purple'], ['monitor','text-dim'], ['phone','purple'], ['wifi','purple'],
  ['house','red'], ['shoe','amber'], ['family','teal'], ['baby','blue'], ['forkknife','coral'],
  ['coffee','amber'], ['cup','pink'], ['dumbbell','green'], ['shield','blue'], ['receipt','text-dim'],
  ['graph','purple'], ['piggybank','green'], ['crypto','amber'], ['bank','purple'], ['card','purple'],
  ['coin','coral'], ['gamepad','coral'], ['briefcase','blue'], ['laptop','coral'], ['toolbox','amber']
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
    monthlyBudget[t] = await storageGetJSON('budget:'+t, 0);
  }
  savingsGoal = await storageGetJSON('savingsGoal', 0);
  populateFilters();
  renderMenu();
  render();
}

async function saveBudget(t){
  await storageSetJSON('budget:'+t, monthlyBudget[t], 'Error guardando presupuesto');
}

async function saveSavingsGoal(){
  await storageSetJSON('savingsGoal', savingsGoal, 'Error guardando meta de ahorro');
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

// El cambio entre Gastos/Entretenimiento/Ahorro lo maneja ahora el selector
// desplegable del shell (uiSetScope en ui.js). Las pestañas de Estadísticas
// siguen existiendo y se sincronizan con él.

const fMonth = document.getElementById('filterMonth');
const filterDayBtn = document.getElementById('filterDayBtn');
const dayModalBackdrop = document.getElementById('dayModalBackdrop');
const dayModalGrid = document.getElementById('dayModalGrid');
const dayModalClose = document.getElementById('dayModalClose');
// Por defecto se filtra por HOY (cada día es independiente); "Todos los
// días" queda como una opción explícita más en el selector de días.
let selectedDay = todayStr();

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

const WEEKDAY_LETTERS = ['L','M','X','J','V','S','D'];

function renderDayModalGrid(){
  const list = window.__dayList || [];
  let html = WEEKDAY_LETTERS.map(w=>`<div class="day-chip-header">${w}</div>`).join('');
  html += `<div class="day-chip all-chip${selectedDay?'':' active'}" data-day="">Todos los días</div>`;
  if(list.length){
    const [y, mo, d1] = list[0].split('-').map(Number);
    const firstDow = new Date(y, mo-1, d1).getDay(); // 0=domingo..6=sábado
    const leadingBlanks = (firstDow + 6) % 7; // 0=lunes..6=domingo
    for(let i=0;i<leadingBlanks;i++){ html += `<div class="day-chip-blank"></div>`; }
  }
  const daysWithMovs = new Set(data[currentTab].map(m=>m.date));
  html += list.map(d=>{
    const dayNum = parseInt(d.slice(-2), 10);
    const active = d===selectedDay ? ' active' : '';
    const dot = daysWithMovs.has(d) ? '<span class="day-chip-dot"></span>' : '';
    return `<div class="day-chip${active}" data-day="${d}">${dayNum}${dot}</div>`;
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

// Gestión automática del tiempo: si el día cambió mientras la app estaba
// cerrada/en segundo plano, el filtro vuelve solo a "hoy" al reabrir o
// recuperar el foco. Nunca se tocan las fechas ya guardadas en los
// movimientos: solo se mueve el filtro de visualización.
let __lastKnownToday = todayStr();
function checkDateRollover(){
  const now = todayStr();
  if(now === __lastKnownToday) return;
  const wasTrackingToday = (selectedDay === __lastKnownToday);
  __lastKnownToday = now;
  if(wasTrackingToday){
    selectedDay = now;
    populateFilters();
    render();
  }
}
document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) checkDateRollover(); });
window.addEventListener('focus', checkDateRollover);
window.addEventListener('pageshow', checkDateRollover);

// Solo tres vistas del resumen son editables tocando la cifra: el saldo en
// efectivo, el presupuesto del mes y la meta de ahorro. El resto son valores
// calculados, así que no hace falta explicarlo con un texto en pantalla.
const SUMMARY_EDITABLE = { saldo:1, presupuesto:1, meta:1 };

function updateBalanceModeUI(){
  const editable = !!SUMMARY_EDITABLE[balanceMode];
  balanceEl.style.cursor = editable ? 'pointer' : 'default';
  balanceEl.classList.toggle('total-mode', balanceMode === 'total');
}

const balanceEl = document.getElementById('balance');
balanceEl.addEventListener('click', ()=>{
  if(!SUMMARY_EDITABLE[balanceMode]) return;
  const modo = balanceMode;
  const actual = modo === 'saldo' ? initialBalance[currentTab]
               : modo === 'presupuesto' ? (monthlyBudget[currentTab] || '')
               : (savingsGoal || '');
  const input = document.createElement('input');
  input.type = 'number';
  input.step = '0.01';
  input.id = 'balanceInput';
  input.value = actual;
  balanceEl.replaceWith(input);
  input.focus();
  input.select();

  let hecho = false;
  async function commit(){
    if(hecho) return; hecho = true;
    const val = parseFloat(input.value);
    const num = isNaN(val) ? 0 : val;
    if(modo === 'saldo'){ initialBalance[currentTab] = num; await saveInitialBalance(currentTab); }
    else if(modo === 'presupuesto'){ monthlyBudget[currentTab] = Math.max(0, num); await saveBudget(currentTab); }
    else { savingsGoal = Math.max(0, num); await saveSavingsGoal(); }
    input.replaceWith(balanceEl);
    render();
  }
  input.addEventListener('keydown', e=>{
    if(e.key === 'Enter'){ e.preventDefault(); commit(); }
    if(e.key === 'Escape'){ hecho = true; input.replaceWith(balanceEl); }
  });
  input.addEventListener('blur', commit);
});

const selectBtn = document.getElementById('selectBtn');
const selectBtnInner = document.getElementById('selectBtnInner');
const selectMenu = document.getElementById('selectMenu');
const selectWrap = document.getElementById('selectWrap');

// Reordenar arrastrando el asa de cualquier fila de la Lista activa
// (gastos/entretenimiento/ahorro x gastos/ingresos, según la pestaña y el
// tipo elegidos en ese momento). Se engancha una sola vez: el callback
// vuelve a leer el estado actual al soltar, no queda atado al array de hoy.
attachDragReorder(selectMenu, '.menu-row', '.drag-handle', async ()=>{
  const newOrder = [...selectMenu.querySelectorAll('.menu-row')].map(r=>r.dataset.name);
  const arr = activeItemsArray();
  arr.length = 0;
  arr.push(...newOrder);
  await saveActiveItems();
});

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
      <span class="drag-handle" aria-label="Reordenar ${safe}">⠿</span>
      <div class="menu-row-main" data-name="${safe}">${getIcon(name, icons[name])}<span class="menu-row-label">${safe}</span></div>
      <button type="button" class="menu-icon-btn menu-more-btn" data-name="${safe}" title="Opciones" aria-label="Opciones de ${safe}">⋮</button>
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
          <button type="button" class="menu-icon-btn row-delete-btn" title="Eliminar" aria-label="Eliminar">🗑</button>
        </div>`;
      row.insertAdjacentElement('afterend', panel);
      wireIconPicker(panel);
      panel.querySelectorAll('.icon-swatch').forEach(sw=>{
        sw.addEventListener('click', async ()=>{
          activeIconsMap()[name] = sw.dataset.icon;
          await saveActiveIcons();
          renderMenu();
          render();
          playRowConfirm([...selectMenu.querySelectorAll('.menu-row')].find(r=>r.dataset.name===name));
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
          playRowConfirm([...selectMenu.querySelectorAll('.menu-row')].find(r=>r.dataset.name===val));
        }
      }
      renameInput.addEventListener('keydown', ev=>{
        if(ev.key === 'Enter'){ ev.preventDefault(); commitRename(); }
      });
      renameInput.addEventListener('blur', commitRename);

      panel.querySelector('.row-delete-btn').addEventListener('click', (ev)=>{
        ev.stopPropagation();
        showConfirm(`¿Eliminar "${name}" de la lista?`, async ()=>{
          playRowDeleteOut(row, async ()=>{
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
        renderMenu();
        playRowAddIn([...selectMenu.querySelectorAll('.menu-row')].find(r=>r.dataset.name===val));
        return;
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
  if(!desc || isNaN(amount) || amount <= 0) return;

  data[currentTab].push({ id: Date.now().toString(), desc, amount, type, date, note });
  await saveTab(currentTab);
  if(window.onTomReact) window.onTomReact(type === 'in' ? 'happy' : 'down');
  e.target.reset();
  selectBtnInner.textContent = 'Elegir ítem';
  renderMenu();
  populateFilters();
  render();
  // Guardar cierra la hoja y deja la información ya actualizada detrás.
  if(typeof Sheet !== 'undefined' && Sheet.isOpen && Sheet.isOpen()) Sheet.close();
});

async function deleteMov(id){
  data[currentTab] = data[currentTab].filter(m=>m.id!==id);
  await saveTab(currentTab);
  if(window.onTomReact) window.onTomReact('down');
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
  if(!desc || isNaN(amount) || amount <= 0 || !date) return;
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

// Duplicar un movimiento existente con la fecha de hoy: es el mecanismo de
// "reutilizar un gasto repetitivo" que pide el módulo de inteligencia.
async function duplicateMov(id){
  const m = data[currentTab].find(x=>x.id===id);
  if(!m) return;
  data[currentTab].push({ ...m, id: Date.now().toString(), date: todayStr() });
  await saveTab(currentTab);
  if(window.onTomReact) window.onTomReact(m.type === 'in' ? 'happy' : 'down');
  populateFilters();
  render();
}

// Un gasto es "recurrente" si su descripción aparece en al menos 2 meses
// distintos del historial de la pestaña activa.
function isRecurring(desc){
  const months = new Set();
  data[currentTab].forEach(m=>{ if(m.type==='out' && m.desc===desc) months.add(m.date.slice(0,7)); });
  return months.size >= 2;
}

function computeTabBalance(t){
  let total = initialBalance[t];
  data[t].forEach(m=>{ total += m.type==='in' ? m.amount : -m.amount; });
  return total;
}

// Compara el mes activo contra el anterior y contra el presupuesto fijado
// para avisar de gastos anormalmente altos o presupuestos por agotarse.
function computeInsights(){
  const insights = [];
  const monthKey = fMonth.value || todayStr().slice(0,7);
  const [y, mo] = monthKey.split('-').map(Number);
  const thisMonthOut = data[currentTab].filter(m=>m.type==='out' && m.date.slice(0,7)===monthKey).reduce((s,m)=>s+m.amount,0);
  const prevDate = new Date(y, mo-2, 1);
  const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth()+1).padStart(2,'0')}`;
  const prevMonthOut = data[currentTab].filter(m=>m.type==='out' && m.date.slice(0,7)===prevKey).reduce((s,m)=>s+m.amount,0);
  if(prevMonthOut > 0 && thisMonthOut > prevMonthOut * 1.3){
    const pct = Math.round((thisMonthOut/prevMonthOut - 1) * 100);
    insights.push({ level:'warn', text:`📈 Este mes vas ${pct}% más alto en gastos que el mes pasado.` });
  }
  const budget = monthlyBudget[currentTab] || 0;
  if(budget > 0){
    const pct = thisMonthOut / budget;
    if(pct >= 1) insights.push({ level:'danger', text:`🔔 Superaste tu presupuesto del mes: ${fmt(thisMonthOut)} de ${fmt(budget)}.` });
    else if(pct >= 0.8) insights.push({ level:'warn', text:`🔔 Vas en el ${Math.round(pct*100)}% de tu presupuesto del mes.` });
  }
  return insights;
}

function renderInsights(){
  const banner = document.getElementById('insightsBanner');
  const insights = computeInsights();
  if(!insights.length){ banner.style.display = 'none'; banner.innerHTML = ''; return; }
  banner.innerHTML = insights.map(i=>`<div class="insight-chip ${i.level}">${escapeHtml(i.text)}</div>`).join('');
  banner.style.display = 'flex';
}

// Reemplaza un valor mostrado por un input numérico editable in-place
// (mismo patrón que el saldo inicial), para fijar meta de ahorro y presupuesto
// sin depender de prompt()/alert() nativos (no funcionan en el WebView de Android).
function editAmountInline(displayElId, currentVal, onSave){
  const el = document.getElementById(displayElId);
  const input = document.createElement('input');
  input.type = 'number';
  input.step = '0.01';
  input.min = '0';
  input.value = currentVal || '';
  input.className = 'goal-edit-input';
  input.addEventListener('click', e=> e.stopPropagation());
  el.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  async function commit(){
    if(done) return; done = true;
    const val = Math.max(0, parseFloat(input.value) || 0);
    input.replaceWith(el);
    await onSave(val);
  }
  function cancel(){
    if(done) return; done = true;
    input.replaceWith(el);
  }
  input.addEventListener('keydown', e=>{
    if(e.key === 'Enter'){ e.preventDefault(); commit(); }
    if(e.key === 'Escape'){ cancel(); }
  });
  input.addEventListener('blur', commit);
}

let __goalJustReached = false;

// Pinta la tarjeta única de Resumen Financiero según la vista elegida.
// Sustituye a las tres tarjetas separadas sin perder ninguna de sus vistas:
// cada una es ahora una opción del selector.
function renderSummary(totalIn, totalOut){
  const valorEl = document.getElementById('balance');
  const subEl = document.getElementById('summarySub');
  const progEl = document.getElementById('summaryProgress');
  const barEl = document.getElementById('summaryBar');
  const pctEl = document.getElementById('summaryPct');

  let valor = '', sub = '', mostrarBarra = false, pct = 0, claseBarra = '', tono = '';

  if(balanceMode === 'total'){
    valor = fmt(computeTotal());
    sub = 'Suma de Gastos, Entretenimiento y Ahorro';
  } else if(balanceMode === 'dia'){
    valor = fmt(computeTodayExpenses());
    sub = 'Gastado hoy';
    tono = 'neg';
  } else if(balanceMode === 'entradas'){
    valor = fmt(totalIn);
    sub = 'Entradas del filtro activo';
    tono = 'pos';
  } else if(balanceMode === 'gastos'){
    valor = fmt(totalOut);
    sub = 'Gastos del filtro activo';
    tono = 'neg';
  } else if(balanceMode === 'balance'){
    const net = totalIn - totalOut;
    valor = (net >= 0 ? '+' : '−') + fmt(Math.abs(net));
    sub = `Entradas ${fmt(totalIn)} · Gastos ${fmt(totalOut)}`;
    tono = net >= 0 ? 'pos' : 'neg';
  } else if(balanceMode === 'presupuesto'){
    const monthKey = fMonth.value || todayStr().slice(0,7);
    const gastado = data[currentTab].filter(m=>m.type==='out' && m.date.slice(0,7)===monthKey).reduce((s,m)=>s+m.amount,0);
    const pres = monthlyBudget[currentTab] || 0;
    valor = fmt(pres);
    pct = pres > 0 ? Math.min(100, Math.round(gastado/pres*100)) : 0;
    sub = pres > 0 ? `${fmt(gastado)} usados de ${fmt(pres)}` : 'Sin presupuesto fijado';
    mostrarBarra = true;
    claseBarra = pres > 0 && gastado >= pres ? 'danger' : (pres > 0 && gastado/pres >= 0.8 ? 'warn' : '');
  } else if(balanceMode === 'meta'){
    const actual = Math.max(0, computeTabBalance('ahorro'));
    valor = fmt(savingsGoal);
    pct = savingsGoal > 0 ? Math.min(100, Math.round(actual/savingsGoal*100)) : 0;
    sub = savingsGoal > 0 ? `${fmt(actual)} ahorrados de ${fmt(savingsGoal)}` : 'Sin meta fijada';
    mostrarBarra = true;
    const alcanzada = savingsGoal > 0 && actual >= savingsGoal;
    if(alcanzada && !__goalJustReached && window.onTomReact) window.onTomReact('smile');
    __goalJustReached = alcanzada;
  } else {
    valor = fmt(initialBalance[currentTab] + totalIn - totalOut);
    sub = `Entradas ${fmt(totalIn)} · Gastos ${fmt(totalOut)}`;
  }

  valorEl.textContent = valor;
  valorEl.classList.toggle('pos', tono === 'pos');
  valorEl.classList.toggle('neg', tono === 'neg');
  subEl.textContent = sub;
  progEl.style.display = mostrarBarra ? '' : 'none';
  if(mostrarBarra){
    barEl.style.width = pct + '%';
    barEl.className = 'goal-bar-fill' + (claseBarra ? ' ' + claseBarra : '');
    pctEl.textContent = pct + '%';
  }
  updateBalanceModeUI();

  // La meta de ahorro sigue vigilándose aunque no sea la vista activa, para
  // que la reacción de TOM al alcanzarla no dependa de qué estés mirando.
  if(balanceMode !== 'meta'){
    const actual = Math.max(0, computeTabBalance('ahorro'));
    const alcanzada = savingsGoal > 0 && actual >= savingsGoal;
    if(alcanzada && !__goalJustReached && window.onTomReact) window.onTomReact('smile');
    __goalJustReached = alcanzada;
  }
}

const searchInput = document.getElementById('searchInput');
const sortSelect = document.getElementById('sortSelect');
searchInput.addEventListener('input', render);
sortSelect.addEventListener('change', render);

function render(){
  const month = fMonth.value;
  const day = selectedDay;
  const list = data[currentTab]
    .filter(m => !month || m.date.slice(0,7) === month)
    .filter(m => !day || m.date === day);

  let totalIn=0, totalOut=0;
  list.forEach(m=>{
    if(m.type==='in') totalIn += m.amount; else totalOut += m.amount;
  });

  renderSummary(totalIn, totalOut);

  renderChart(list);
  renderInsights();

  const searchQ = (searchInput.value || '').trim().toLowerCase();
  const sortMode = sortSelect.value;
  let displayList = list.filter(m => !searchQ || m.desc.toLowerCase().includes(searchQ) || (m.note||'').toLowerCase().includes(searchQ));
  displayList = displayList.slice().sort((a,b)=>{
    if(sortMode === 'date-asc') return a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
    if(sortMode === 'amount-desc') return b.amount - a.amount;
    if(sortMode === 'amount-asc') return a.amount - b.amount;
    return b.date.localeCompare(a.date) || b.id.localeCompare(a.id);
  });

  const movsEl = document.getElementById('movs');
  if(!displayList.length){
    movsEl.innerHTML = `<div class="empty">${searchQ ? 'Sin resultados para tu búsqueda.' : 'Sin movimientos en este filtro todavía.'}</div>`;
    return;
  }
  const outsForAvg = list.filter(m=>m.type==='out').map(m=>m.amount);
  const avgOut = outsForAvg.length >= 3 ? outsForAvg.reduce((a,b)=>a+b,0)/outsForAvg.length : null;

  movsEl.innerHTML = displayList.map(m=>{
    const fecha = new Date(m.date+'T00:00').toLocaleDateString('es-ES',{day:'numeric', month:'short'});
    const iconMap = m.type === 'in' ? incomeItemIcons[currentTab] : itemIcons[currentTab];
    const noteHtml = m.note ? `<div class="mov-note">${escapeHtml(m.note)}</div>` : '';
    const badges = [];
    if(m.type === 'out' && avgOut && m.amount > avgOut * 1.6) badges.push('<span class="mov-badge high">⚠ Alto</span>');
    if(m.type === 'out' && isRecurring(m.desc)) badges.push('<span class="mov-badge recurring">🔁 Recurrente</span>');
    const badgesHtml = badges.length ? `<div class="mov-badges">${badges.join('')}</div>` : '';
    return `<div class="mov" data-id="${m.id}">
      <div class="mov-left">
        ${getIcon(m.desc, iconMap[m.desc])}
        <div>
          <div class="mov-desc">${escapeHtml(m.desc)}</div>
          <div class="mov-meta">${fecha}</div>
          ${noteHtml}
          ${badgesHtml}
        </div>
      </div>
      <div class="mov-amount ${m.type}">${m.type==='in'?'+':'−'}${fmt(m.amount)}</div>
    </div>`;
  }).join('');

  // Editar, duplicar y eliminar ya no ocupan sitio de forma permanente:
  // se abren con una pulsación prolongada sobre el movimiento.
  movsEl.querySelectorAll('.mov').forEach(row=>{
    if(typeof attachLongPress === 'function'){
      attachLongPress(row, ()=> uiMovContext(row.dataset.id));
    }
    row.addEventListener('click', ()=> openMovModal(row.dataset.id));
  });
}

// Lee los colores del tema activo en vez de usar valores fijos, para que
// la gráfica siempre combine con la paleta elegida en Apariencia.
function getChartColors(){
  const s = getComputedStyle(document.documentElement);
  const v = (k) => (s.getPropertyValue('--'+k).trim() || '#888');
  return [v('gold'), v('green'), v('red'), v('teal'), v('blue'), v('purple'), v('pink'), v('coral'), v('gold-dim'), v('text')];
}

// Arma un conic-gradient con una línea divisoria delgada entre cada
// categoría, para que la gráfica se lea más limpia.
function buildConicGradient(entries, total){
  const colors = getChartColors();
  const n = entries.length;
  const gapPct = n > 1 ? 0.9 : 0;
  const scale = n > 1 ? (100 - gapPct * n) / 100 : 1;
  let acc = 0;
  const stops = [];
  entries.forEach(([name, val], i)=>{
    const pct = (total ? (val/total*100) : 0) * scale;
    const start = acc;
    const end = acc + pct;
    stops.push(`${colors[i % colors.length]} ${start}% ${end}%`);
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
  const colors = getChartColors();
  return entries.map(([name, val], i)=>{
    const pct = total ? Math.round(val/total*100) : 0;
    const color = colors[i % colors.length];
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
    // Si el pendiente tiene recordatorio, el borde izquierdo pasa a indicar la
    // prioridad (verde/amarillo/rojo, gris si ya está realizado) en vez del
    // avance de pago.
    const rem = d.reminder;
    let borde = color, remChip = '';
    if(rem && rem.enabled && rem.date){
      const due = typeof remDueAt === 'function' ? remDueAt(rem) : 0;
      const clase = rem.done ? 'hecho' : rem.priority;
      borde = rem.done ? 'var(--text-dim)'
            : rem.priority === 'alta' ? 'var(--red)'
            : rem.priority === 'media' ? 'var(--accent)' : 'var(--green)';
      const f = new Date(due);
      const cuando = due ? f.toLocaleDateString('es-ES',{day:'numeric', month:'short'}) + ' ' +
                           f.toLocaleTimeString('es-ES',{hour:'2-digit', minute:'2-digit'}) : '';
      const vencido = typeof remIsOverdue === 'function' && remIsOverdue(due, rem.done);
      remChip = `<span class="rem-chip ${clase}${vencido?' vencido':''}">🔔 ${escapeHtml(cuando)}</span>`;
    }
    return `<div class="debt-row" style="border-left-color:${borde};" data-name="${safe}">
      <span class="drag-handle" aria-label="Reordenar ${safe}">⠿</span>
      <div class="debt-row-main" data-name="${safe}" style="flex:1;">
        ${getIcon(name, debtIcons[name])}
        <div class="debt-info">
          <div class="debt-name">${safe}</div>
          <div class="debt-meta">Deuda: ${fmt(d.totalDebt)} · Abono mes: ${fmt(monthPayment)} · <span class="pct" style="color:${color};">${Math.round(pct*100)}%</span></div>
          ${remChip}
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

// Reordenar arrastrando el asa de cualquier pendiente (mismo componente que
// usa la Lista de TOM). Se engancha una sola vez.
attachDragReorder(document.getElementById('debtList'), '.debt-row', '.drag-handle', async ()=>{
  const newOrder = [...document.getElementById('debtList').querySelectorAll('.debt-row')].map(r=>r.dataset.name);
  debtItems = newOrder;
  await saveDebtItems();
});

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
    let added = false;
    if(val && !debtItems.includes(val)){
      debtItems.push(val);
      debtData[val] = { totalDebt: 0, payments: {} };
      const chosen = row.querySelector('.icon-swatch.active');
      if(chosen) debtIcons[val] = chosen.dataset.icon;
      await saveDebtItems();
      await saveDebtData();
      await saveDebtIcons();
      added = true;
    }
    resetDebtAddRow();
    renderDebtList();
    if(added) playRowAddIn([...document.getElementById('debtList').querySelectorAll('.debt-row')].find(r=>r.dataset.name===val));
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
  if(typeof remFillModal === 'function') remFillModal(name);
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
      // La lista de pendientes debajo del modal también debe reflejar el
      // cambio de inmediato (antes se quedaba con el ícono viejo hasta la
      // próxima vez que algo más disparara un renderDebtList()).
      const nameNow = editingDebtName;
      renderDebtList();
      playRowConfirm([...document.getElementById('debtList').querySelectorAll('.debt-row')].find(r=>r.dataset.name===nameNow));
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
    playRowConfirm([...document.getElementById('debtList').querySelectorAll('.debt-row')].find(r=>r.dataset.name===editingDebtName));
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
    closeDebtModal();
    const row = [...document.getElementById('debtList').querySelectorAll('.debt-row')].find(r=>r.dataset.name===name);
    playRowDeleteOut(row, async ()=>{
      debtItems = debtItems.filter(n=>n!==name);
      delete debtData[name];
      delete debtIcons[name];
      await saveDebtItems();
      await saveDebtData();
      await saveDebtIcons();
      // Al borrar el pendiente desaparece de la lista enviada a Android, y
      // con ella su alarma programada.
      if(typeof remSyncNative === 'function') remSyncNative();
      if(typeof remRenderAll === 'function') remRenderAll();
      renderDebtList();
    });
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
  const totalDebt = Math.max(0, parseFloat(debtModalTotal.value) || 0);
  const payment = Math.max(0, parseFloat(debtModalPayment.value) || 0);
  const note = document.getElementById('debtModalNote').value.trim();
  debtData[name].totalDebt = totalDebt;
  debtData[name].payments[month] = payment;
  debtData[name].note = note;
  // Guarda también los campos del recordatorio y reprograma la alarma nativa.
  if(typeof remReadModal === 'function') remReadModal(name);
  await saveDebtData();
  if(typeof remSyncNative === 'function') remSyncNative();
  if(typeof remRenderAll === 'function') remRenderAll();
  if(window.onLunaReact){
    const paidTotal = Object.values(debtData[name].payments).reduce((a,b)=>a+b, 0);
    const paidOff = totalDebt > 0 && paidTotal >= totalDebt;
    if(paidOff) window.onLunaReact('smile');
    else if(payment > 0) window.onLunaReact('happy');
  }
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

// --- Exportar, copia de seguridad y restaurar ---

function csvEscape(v){
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
}

// En el WebView de Android, `<a download>` con un blob: no dispara ninguna
// descarga (limitación conocida). Si MainActivity expuso el puente
// window.Android.saveFile, se usa esa vía nativa; si no (navegador normal,
// pruebas locales), se cae al método estándar del navegador.
function downloadFile(filename, content, mime){
  if(window.Android && window.Android.saveFile){
    try{ window.Android.saveFile(filename, content, mime); return; }catch(e){}
  }
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=> URL.revokeObjectURL(url), 2000);
}

document.getElementById('exportCsvBtn').addEventListener('click', ()=>{
  const header = ['Fecha','Pestaña','Descripción','Tipo','Monto','Nota'];
  const rows = TABS.flatMap(t => data[t].map(m => [m.date, t, m.desc, m.type==='in'?'Ingreso':'Gasto', m.amount, m.note||'']));
  const csv = [header, ...rows].map(r => r.map(csvEscape).join(',')).join('\n');
  downloadFile(`TOM_movimientos_${todayStr()}.csv`, csv, 'text/csv');
});

document.getElementById('printPdfBtn').addEventListener('click', ()=>{
  if(window.Android && window.Android.printPage){
    try{ window.Android.printPage(); return; }catch(e){}
  }
  window.print();
});

document.getElementById('backupBtn').addEventListener('click', ()=>{
  const backup = {};
  for(let i=0;i<localStorage.length;i++){
    const k = localStorage.key(i);
    backup[k] = localStorage.getItem(k);
  }
  downloadFile(`TOM_backup_${todayStr()}.json`, JSON.stringify(backup, null, 2), 'application/json');
});

document.getElementById('restoreBtn').addEventListener('click', ()=>{
  document.getElementById('restoreFileInput').click();
});

document.getElementById('restoreFileInput').addEventListener('change', (e)=>{
  const file = e.target.files[0];
  e.target.value = '';
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    let backup;
    try{ backup = JSON.parse(reader.result); }
    catch(err){ showAlert('El archivo elegido no es una copia de seguridad válida de TOM.'); return; }
    showConfirm('¿Restaurar esta copia de seguridad? Se reemplazarán todos los datos actuales de la app.', async ()=>{
      Object.keys(backup).forEach(k => localStorage.setItem(k, backup[k]));
      location.reload();
    });
  };
  reader.readAsText(file);
});

const tomSection = document.getElementById('tomSection');
const lunaSection = document.getElementById('lunaSection');
const statsSection = document.getElementById('statsSection');
const inventarioSection = document.getElementById('inventarioSection');
const aparienciaSection = document.getElementById('aparienciaSection');

// El botón atrás de Android debe regresar primero a TOM (si entraste a otra
// sección por error) y solo preguntar si salir cuando ya estás en TOM.
let modeHistoryPushed = false;

function goToMode(mode){
  // Si hay una hoja abierta, se cierra al navegar para no dejarla huérfana.
  if(typeof Sheet !== 'undefined' && Sheet.isOpen && Sheet.isOpen()) Sheet.close();

  if(mode === 'tom' && modeHistoryPushed){
    history.back();      // el popstate hará el goToMode('tom') real
    return;
  }
  if(mode !== 'tom' && mode !== appMode){
    if(!modeHistoryPushed){
      history.pushState({ tomAppMode: mode }, '', '');
      modeHistoryPushed = true;
    } else {
      history.replaceState({ tomAppMode: mode }, '', '');
    }
  }
  applyMode(mode);
}

function applyMode(mode){
  appMode = mode;
  tomSection.style.display = mode === 'tom' ? '' : 'none';
  lunaSection.style.display = mode === 'luna' ? '' : 'none';
  statsSection.style.display = mode === 'stats' ? '' : 'none';
  inventarioSection.style.display = mode === 'inventario' ? '' : 'none';
  aparienciaSection.style.display = mode === 'apariencia' ? '' : 'none';
  if(typeof uiSyncNav === 'function') uiSyncNav();
  if(mode === 'stats' && typeof renderStats === 'function') renderStats();
  if(mode === 'inventario' && typeof invRenderAll === 'function') invRenderAll();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.addEventListener('popstate', ()=>{
  modeHistoryPushed = false;
  applyMode('tom');
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

// --- Registro de formularios para el motor de voz ---
// El motor (voice.js) no sabe nada de gastos ni de deudas: aquí solo se
// declara QUÉ campos tiene cada formulario y QUÉ hacer al aceptar. Añadir
// un formulario futuro (inventario, préstamos...) es registrar otro esquema,
// sin tocar el motor.

VoiceForms.register('movimiento', {
  title: 'Registrar movimiento por voz',
  hint: 'Di el ítem, el monto y la nota. Ejemplo: "Gasolina cuarenta mil tanqueo completo".',
  fields: [
    {
      key:'item', label:'Ítem', type:'choice', required:true, article:'el',
      aliases:['item','ítem','categoria','categoría','concepto','producto','descripcion','descripción','nombre'],
      // Se lee en vivo: si el usuario agrega ítems nuevos, la voz los reconoce
      // de inmediato sin tocar nada más.
      choices: ()=> activeItemsArray().slice()
    },
    {
      key:'amount', label:'Monto', type:'number', required:true, article:'el',
      aliases:['monto','valor','precio','cantidad','costo','total','plata'],
      format: (v)=> fmt(v)
    },
    {
      key:'note', label:'Nota', type:'text', required:false, article:'la',
      aliases:['nota','observacion','observación','comentario','detalle']
    }
  ],
  async onAccept(values){
    const type = document.getElementById('f-type').value;
    const date = selectedDay || todayStr();
    data[currentTab].push({
      id: Date.now().toString(),
      desc: values.item,
      amount: values.amount,
      type,
      date,
      note: values.note || ''
    });
    await saveTab(currentTab);
    // Si el ítem dictado no existía en la lista, se agrega para la próxima vez.
    const arr = activeItemsArray();
    if(!arr.some(n => VoiceText.normalize(n) === VoiceText.normalize(values.item))){
      arr.push(values.item);
      await saveActiveItems();
    }
    if(window.onTomReact) window.onTomReact(type === 'in' ? 'happy' : 'down');
    renderMenu();
    populateFilters();
    render();
  }
});

VoiceForms.register('pendiente', {
  title: 'Registrar pendiente por voz',
  hint: 'Di el pendiente, la deuda total y la nota. Ejemplo: "Tarjeta un millón cuota de diciembre".',
  fields: [
    {
      key:'item', label:'Pendiente', type:'choice', required:true, article:'el',
      aliases:['pendiente','deuda','item','ítem','nombre','concepto','categoria','categoría'],
      choices: ()=> debtItems.slice()
    },
    {
      key:'amount', label:'Deuda total', type:'number', required:true, article:'la',
      aliases:['monto','deuda','deuda total','valor','total','cantidad','precio'],
      format: (v)=> fmt(v)
    },
    {
      key:'note', label:'Nota', type:'text', required:false, article:'la',
      aliases:['nota','observacion','observación','comentario','detalle']
    }
  ],
  async onAccept(values){
    const name = values.item;
    if(!debtItems.includes(name)){
      debtItems.push(name);
      await saveDebtItems();
    }
    if(!debtData[name]) debtData[name] = { totalDebt: 0, payments: {} };
    debtData[name].totalDebt = values.amount;
    if(values.note) debtData[name].note = values.note;
    await saveDebtData();
    renderDebtList();
    playRowAddIn([...document.getElementById('debtList').querySelectorAll('.debt-row')].find(r=>r.dataset.name===name));
  }
});

// Comandos globales de navegación. Demuestran (y dejan listo) el registro
// extensible: agregar "muéstrame los gastos de este mes" o "busca arroz" en
// el futuro es registrar otro comando aquí, sin tocar voice.js.
VoiceRouter.register({
  id: 'nav',
  match: /^(abre|abrir|ve a|vete a|muestra|muestrame|mostrar)\s+(las\s+|los\s+|la\s+|el\s+)?(estadisticas|graficas|apariencia|colores|luna|pendientes|tom|gastos)$/,
  handler(groups, session){
    const dest = groups[3];
    const map = {
      estadisticas:'stats', graficas:'stats',
      apariencia:'apariencia', colores:'apariencia',
      luna:'luna', pendientes:'luna',
      tom:'tom', gastos:'tom'
    };
    const mode = map[dest];
    if(!mode) return;
    session.close();
    goToMode(mode);
  }
});

renderPresetGrid();
renderThemeColorGrid();
renderThemePreviewIcons();

initUI();
updateBalanceModeUI();
loadData();
loadDebts().then(()=>{
  populateLunaMonths(lunaFilterMonth);
  lunaFilterMonth.value = currentMonthKey();
  renderDebtList();
});
initVoice();

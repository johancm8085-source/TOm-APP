// ============================================================================
// SALUDO DIARIO DE TOM
// ============================================================================
// Aparece la primera vez que se abre la app cada día, cambia según la hora y
// se va solo. No bloquea nada: es una tarjeta flotante, no un modal, así que
// se puede seguir usando la app mientras está en pantalla.

const GREET_KEY = 'greet:lastShown';
const GREET_NAME_KEY = 'greet:name';
const GREET_MS = 4200;              // dentro del rango de 3 a 5 segundos
let greetTimer = null;

function greetUserName(){
  try{ return localStorage.getItem(GREET_NAME_KEY) || 'Johan'; }
  catch(e){ return 'Johan'; }
}

async function greetSetUserName(nombre){
  const limpio = String(nombre || '').trim();
  try{
    if(limpio) localStorage.setItem(GREET_NAME_KEY, limpio);
    else localStorage.removeItem(GREET_NAME_KEY);
  }catch(e){}
}

// Franja horaria del dispositivo: madrugada y mañana comparten "Buenos días"
// porque a las 5 a.m. nadie espera un "Buenas noches".
function greetPartOfDay(h){
  if(h >= 5 && h < 12) return 'manana';
  if(h >= 12 && h < 19) return 'tarde';
  return 'noche';
}

function greetTexts(){
  const parte = greetPartOfDay(new Date().getHours());
  const nombre = greetUserName();
  const saludo = parte === 'manana' ? 'Buenos días'
               : parte === 'tarde'  ? 'Buenas tardes'
               : 'Buenas noches';
  const deseo = parte === 'manana' ? 'Espero que tengas un excelente día.'
              : parte === 'tarde'  ? 'Espero que estés teniendo un buen día.'
              : 'Espero que hayas tenido un buen día.';
  const cierre = parte === 'noche'
    ? '¿Repasamos las cuentas antes de dormir?'
    : '¿Listo para organizar tus finanzas?';
  return { saludo, nombre, deseo, cierre, parte };
}

function greetAlreadyShownToday(){
  try{ return localStorage.getItem(GREET_KEY) === todayStr(); }
  catch(e){ return false; }
}

function greetMarkShown(){
  try{ localStorage.setItem(GREET_KEY, todayStr()); }catch(e){}
}

function greetHide(){
  const el = document.getElementById('greetCard');
  if(!el) return;
  if(greetTimer){ clearTimeout(greetTimer); greetTimer = null; }
  el.classList.remove('show');
  el.classList.add('out');
  setTimeout(()=>{ if(el.parentNode) el.remove(); }, 380);
}

// force=true lo muestra aunque ya se haya visto hoy (se usa para probarlo
// desde Configuración sin tener que esperar al día siguiente).
function greetShow(force){
  if(!force && greetAlreadyShownToday()) return false;
  if(document.getElementById('greetCard')) return false;

  const t = greetTexts();
  const card = document.createElement('div');
  card.className = 'greet-card';
  card.id = 'greetCard';
  card.setAttribute('role', 'status');
  card.innerHTML = `
    <img class="greet-mascot" src="logo-small.png" alt="">
    <div class="greet-text">
      <div class="greet-hi">${escapeHtml(t.saludo)}, ${escapeHtml(t.nombre)}.</div>
      <div class="greet-sub">${escapeHtml(t.deseo)}</div>
      <div class="greet-ask">${escapeHtml(t.cierre)}</div>
    </div>
    <button type="button" class="greet-close" aria-label="Cerrar saludo">×</button>`;
  // Si la tarjeta de pendientes de Luna está visible, el saludo se coloca
  // justo debajo: si no, ambos caen casi en la misma posición y parece que
  // uno hubiera reemplazado al otro en vez de convivir.
  const luna = document.getElementById('todayCard');
  if(luna && luna.style.display !== 'none'){
    const r = luna.getBoundingClientRect();
    if(r.height > 0) card.style.top = Math.round(r.bottom + 10) + 'px';
  }

  document.body.appendChild(card);

  // Se marca como visto en cuanto se muestra, no al cerrarlo: si el usuario
  // cierra la app antes de que desaparezca, no debe volver a salir hoy.
  greetMarkShown();

  card.querySelector('.greet-close').addEventListener('click', (e)=>{
    e.stopPropagation();
    greetHide();
  });
  // Tocar la tarjeta también la cierra, y de paso hace saludar a TOM.
  card.addEventListener('click', ()=>{
    if(window.onTomReact) window.onTomReact('happy');
    greetHide();
  });

  // Doble arranque (rAF + timeout) porque con la app en segundo plano
  // requestAnimationFrame no se ejecuta y la tarjeta se quedaría invisible.
  requestAnimationFrame(()=> card.classList.add('show'));
  setTimeout(()=> card.classList.add('show'), 40);

  greetTimer = setTimeout(greetHide, GREET_MS);
  return true;
}

// Espera a que los datos estén cargados para no competir con el primer
// render, y respeta la tarjeta de pendientes de Luna si esta ya está visible.
async function initGreeting(){
  await new Promise(r=> setTimeout(r, 700));
  greetShow(false);
}

initGreeting();

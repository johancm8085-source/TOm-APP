// ============================================================================
// RECORDATORIOS DE LUNA — asistente personal
// ============================================================================
// El recordatorio vive DENTRO de cada pendiente de Luna (debtData[nombre].reminder),
// para no crear un sistema paralelo: un pendiente es la misma cosa que ya
// existía, ahora con fecha, hora, repetición, prioridad, categoría y estado.
//
// Reparto de responsabilidades:
//   Aquí (web)  -> editar, calendario, dashboard, tarjeta "Hoy", posponer.
//   Nativo      -> sonar con la app cerrada (AlarmManager + notificación).
// En cada cambio se empuja la lista completa a Android con syncReminders();
// Android la guarda y reprograma sus alarmas. Si no hay capa nativa (navegador
// normal), todo lo demás sigue funcionando salvo la notificación del sistema.

const REM_REPEATS = {
  once:'Una sola vez', daily:'Diario', weekly:'Semanal',
  biweekly:'Quincenal', monthly:'Mensual', yearly:'Anual', custom:'Personalizado'
};
const REM_PRIORITIES = { baja:'Baja', media:'Media', alta:'Alta' };

let remCalMonth = null;      // Date del mes mostrado en el calendario
let remCalSelectedDay = '';
let remSnoozeTarget = null;  // nombre del pendiente que se está posponiendo
let remTodayDismissed = false;

function remHasNative(){
  return !!(window.Android && typeof window.Android.syncReminders === 'function');
}

// --- Modelo ---------------------------------------------------------------
function remDefault(){
  return { enabled:false, date:'', time:'08:00', repeat:'once', customDays:0,
           priority:'media', category:'', done:false };
}
function remOf(name){
  const d = debtData[name];
  if(!d) return null;
  if(!d.reminder) d.reminder = remDefault();
  return d.reminder;
}
function remDueAt(r){
  if(!r || !r.date) return 0;
  const t = (r.time && /^\d{2}:\d{2}$/.test(r.time)) ? r.time : '08:00';
  const ms = new Date(r.date + 'T' + t + ':00').getTime();
  return isNaN(ms) ? 0 : ms;
}
// Misma lógica que Reminders.kt, para que web y nativo nunca discrepen.
function remNextOccurrence(dueAt, repeat, customDays){
  if(!dueAt || repeat === 'once') return null;
  const d = new Date(dueAt);
  const now = Date.now();
  let guard = 0;
  do{
    if(repeat === 'daily') d.setDate(d.getDate() + 1);
    else if(repeat === 'weekly') d.setDate(d.getDate() + 7);
    else if(repeat === 'biweekly') d.setDate(d.getDate() + 14);
    else if(repeat === 'monthly') d.setMonth(d.getMonth() + 1);
    else if(repeat === 'yearly') d.setFullYear(d.getFullYear() + 1);
    else if(repeat === 'custom') d.setDate(d.getDate() + (customDays > 0 ? customDays : 1));
    else return null;
    guard++;
  } while(d.getTime() <= now && guard < 500);
  return d.getTime();
}
function remSetFromMillis(r, ms){
  const d = new Date(ms);
  const p = (n)=> String(n).padStart(2,'0');
  r.date = `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
  r.time = `${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Todos los pendientes con recordatorio activo, ya ordenados por fecha.
function remActive(){
  return debtItems
    .map(name => ({ name, r: remOf(name), due: remDueAt(remOf(name)) }))
    .filter(x => x.r && x.r.enabled && x.due > 0)
    .sort((a,b)=> a.due - b.due);
}

function remIsToday(due){
  const d = new Date(due), n = new Date();
  return d.getFullYear()===n.getFullYear() && d.getMonth()===n.getMonth() && d.getDate()===n.getDate();
}
// Vencido = ya pasó su hora y sigue sin hacerse, AUNQUE sea de hoy: si se te
// pasó el pago de las 8 de la mañana, a las 10 de la noche sigue vencido.
// Por eso un pendiente puede contar a la vez en "Hoy" y en "Vencidos".
function remIsOverdue(due, done){
  return !done && due > 0 && due < Date.now();
}
function remDayKey(ms){
  const d = new Date(ms), p = (n)=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}

// --- Persistencia + sincronización con Android -----------------------------
async function remSave(){
  await saveDebtData();
  remSyncNative();
}

function remSyncNative(){
  if(!remHasNative()) return;
  try{
    const payload = remActive().map(({name, r, due})=>({
      id: 'rem-' + name,
      title: name,
      amount: Number((debtData[name] || {}).totalDebt) || 0,
      dueAt: due,
      repeat: r.repeat,
      customDays: Number(r.customDays) || 0,
      priority: r.priority,
      note: (debtData[name] || {}).note || '',
      done: !!r.done
    }));
    window.Android.syncReminders(JSON.stringify(payload));
  }catch(e){ console.error('No se pudo sincronizar con Android', e); }
}

// Acciones hechas desde la notificación con la app cerrada.
function remApplyPendingNative(){
  if(!(window.Android && typeof window.Android.consumePendingActions === 'function')) return;
  let acciones = [];
  try{ acciones = JSON.parse(window.Android.consumePendingActions() || '[]'); }catch(e){ return; }
  if(!acciones.length) return;
  let cambio = false;
  acciones.forEach(a=>{
    const name = String(a.id || '').replace(/^rem-/, '');
    const r = remOf(name);
    if(!r) return;
    if(a.action === 'done'){
      if(a.dueAt > 0){ remSetFromMillis(r, a.dueAt); r.done = false; }   // recurrente: siguiente fecha
      else { r.done = true; }
      cambio = true;
    } else if(a.action === 'snooze' && a.dueAt > 0){
      remSetFromMillis(r, a.dueAt); r.done = false; cambio = true;
    }
  });
  if(cambio){
    saveDebtData();
    renderDebtList();
    remRenderAll();
  }
}

// --- Dashboard -------------------------------------------------------------
function remStats(){
  const now = Date.now();
  const hoyIni = new Date(); hoyIni.setHours(0,0,0,0);
  const hoyFin = new Date(); hoyFin.setHours(23,59,59,999);
  const semFin = new Date(hoyIni); semFin.setDate(semFin.getDate() + 7);
  const mesFin = new Date(hoyIni.getFullYear(), hoyIni.getMonth() + 1, 0, 23,59,59,999);
  const activos = remActive().filter(x => !x.r.done);
  return {
    hoy: activos.filter(x => x.due >= hoyIni.getTime() && x.due <= hoyFin.getTime()),
    vencidos: activos.filter(x => remIsOverdue(x.due, x.r.done)),
    semana: activos.filter(x => x.due >= hoyIni.getTime() && x.due <= semFin.getTime()),
    mes: activos.filter(x => x.due >= hoyIni.getTime() && x.due <= mesFin.getTime()),
    proximo: activos.filter(x => x.due >= now)[0] || null
  };
}

function remRenderDashboard(){
  const el = document.getElementById('remDashboard');
  if(!el) return;
  const s = remStats();
  el.innerHTML = `
    <div class="rem-stat${s.hoy.length?' hoy':''}" data-filtro="hoy"><div class="rem-stat-value">${s.hoy.length}</div><div class="rem-stat-label">Hoy</div></div>
    <div class="rem-stat${s.vencidos.length?' vencido':''}" data-filtro="vencidos"><div class="rem-stat-value">${s.vencidos.length}</div><div class="rem-stat-label">Vencidos</div></div>
    <div class="rem-stat" data-filtro="semana"><div class="rem-stat-value">${s.semana.length}</div><div class="rem-stat-label">Esta semana</div></div>
    <div class="rem-stat" data-filtro="mes"><div class="rem-stat-value">${s.mes.length}</div><div class="rem-stat-label">Este mes</div></div>`;

  const next = document.getElementById('remNext');
  if(s.proximo){
    const d = new Date(s.proximo.due);
    const cuando = d.toLocaleDateString('es-ES',{weekday:'short', day:'numeric', month:'short'}) +
                   ' · ' + d.toLocaleTimeString('es-ES',{hour:'2-digit', minute:'2-digit'});
    next.innerHTML = `<span class="rem-next-label">Próximo recordatorio</span>
      <span class="rem-next-name prio-${s.proximo.r.priority}">${escapeHtml(s.proximo.name)}</span>
      <span class="rem-next-when">${escapeHtml(cuando)}</span>`;
    next.style.display = '';
    next.onclick = ()=> openDebtModal(s.proximo.name);
  } else {
    next.style.display = 'none';
  }

  el.querySelectorAll('.rem-stat').forEach(card=>{
    card.addEventListener('click', ()=> remShowGroup(card.dataset.filtro));
  });
}

function remShowGroup(filtro){
  const s = remStats();
  const grupo = s[filtro] || [];
  const titulos = { hoy:'Pendientes de hoy', vencidos:'Pendientes vencidos', semana:'Pendientes de esta semana', mes:'Pendientes de este mes' };
  if(!grupo.length){ showAlert('No hay ' + (titulos[filtro] || 'pendientes').toLowerCase() + '.'); return; }
  remOpenDayList(titulos[filtro], grupo);
}

// Reutiliza el modal del calendario para listar cualquier grupo.
function remOpenDayList(titulo, grupo){
  document.getElementById('remCalTitle').textContent = titulo;
  document.getElementById('remCalGrid').style.display = 'none';
  document.getElementById('remCalPrev').style.display = 'none';
  document.getElementById('remCalNext').style.display = 'none';
  document.getElementById('remCalDetail').innerHTML = remListHTML(grupo);
  remWireDetailClicks();
  document.getElementById('remCalendarBackdrop').classList.add('open');
}

function remListHTML(grupo){
  if(!grupo.length) return '<div class="empty">Sin pendientes para esta fecha.</div>';
  return grupo.map(({name, r, due})=>{
    const d = new Date(due);
    const cuando = d.toLocaleDateString('es-ES',{day:'numeric', month:'short'}) + ' · ' +
                   d.toLocaleTimeString('es-ES',{hour:'2-digit', minute:'2-digit'});
    const monto = Number((debtData[name]||{}).totalDebt) > 0 ? ' · ' + fmt(debtData[name].totalDebt) : '';
    const estado = r.done ? ' hecho' : (remIsOverdue(due, r.done) ? ' vencido' : '');
    return `<div class="rem-item prio-${r.priority}${estado}" data-name="${escapeHtml(name)}">
      <div class="rem-item-main">
        <div class="rem-item-name">${escapeHtml(name)}</div>
        <div class="rem-item-meta">${escapeHtml(cuando)}${monto}${r.category ? ' · ' + escapeHtml(r.category) : ''}</div>
      </div>
      <span class="rem-item-flag">${r.done ? '✓' : REM_REPEATS[r.repeat] || ''}</span>
    </div>`;
  }).join('');
}

function remWireDetailClicks(){
  document.querySelectorAll('#remCalDetail .rem-item').forEach(it=>{
    it.addEventListener('click', ()=>{
      document.getElementById('remCalendarBackdrop').classList.remove('open');
      goToMode('luna');
      openDebtModal(it.dataset.name);
    });
  });
}

// --- Calendario ------------------------------------------------------------
function remOpenCalendar(){
  remCalMonth = new Date();
  remCalSelectedDay = remDayKey(Date.now());
  document.getElementById('remCalGrid').style.display = '';
  document.getElementById('remCalPrev').style.display = '';
  document.getElementById('remCalNext').style.display = '';
  remRenderCalendar();
  document.getElementById('remCalendarBackdrop').classList.add('open');
}

function remRenderCalendar(){
  const grid = document.getElementById('remCalGrid');
  const y = remCalMonth.getFullYear(), m = remCalMonth.getMonth();
  document.getElementById('remCalTitle').textContent =
    remCalMonth.toLocaleDateString('es-ES',{month:'long', year:'numeric'});

  const porDia = new Map();
  remActive().forEach(x=>{
    const k = remDayKey(x.due);
    if(!porDia.has(k)) porDia.set(k, []);
    porDia.get(k).push(x);
  });

  let html = ['L','M','X','J','V','S','D'].map(w=>`<div class="day-chip-header">${w}</div>`).join('');
  const primero = new Date(y, m, 1);
  const blancos = (primero.getDay() + 6) % 7;
  for(let i=0;i<blancos;i++) html += '<div class="day-chip-blank"></div>';

  const total = new Date(y, m+1, 0).getDate();
  const p = (n)=>String(n).padStart(2,'0');
  for(let d=1; d<=total; d++){
    const key = `${y}-${p(m+1)}-${p(d)}`;
    const items = porDia.get(key) || [];
    // El punto toma el color de la prioridad más alta de ese día.
    let dot = '';
    if(items.length){
      const prio = items.some(i=>i.r.done && items.every(j=>j.r.done)) ? 'hecho'
                 : items.some(i=>i.r.priority==='alta') ? 'alta'
                 : items.some(i=>i.r.priority==='media') ? 'media' : 'baja';
      dot = `<span class="rem-dot prio-${prio}"></span>`;
    }
    const activo = key === remCalSelectedDay ? ' active' : '';
    html += `<div class="day-chip${activo}" data-day="${key}">${d}${dot}</div>`;
  }
  grid.innerHTML = html;

  grid.querySelectorAll('.day-chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      remCalSelectedDay = chip.dataset.day;
      remRenderCalendar();
    });
  });

  const delDia = porDia.get(remCalSelectedDay) || [];
  const fecha = new Date(remCalSelectedDay + 'T00:00');
  document.getElementById('remCalDetail').innerHTML =
    `<div class="rem-day-title">${fecha.toLocaleDateString('es-ES',{weekday:'long', day:'numeric', month:'long'})}</div>` +
    remListHTML(delDia);
  remWireDetailClicks();
}

// --- Tarjeta "Hoy" ---------------------------------------------------------
function remRenderTodayCard(){
  const card = document.getElementById('todayCard');
  if(!card) return;
  if(remTodayDismissed){ card.style.display = 'none'; return; }
  const s = remStats();
  // Un pendiente de hoy que ya se pasó de hora está en los dos grupos; se
  // deduplica para no listarlo dos veces en la tarjeta.
  const vistos = new Set();
  const lista = s.vencidos.concat(s.hoy).filter(x=>{
    if(vistos.has(x.name)) return false;
    vistos.add(x.name); return true;
  });
  if(!lista.length){ card.style.display = 'none'; return; }
  document.getElementById('todayCount').textContent =
    `Hoy tienes ${lista.length} pendiente${lista.length===1?'':'s'}`;
  document.getElementById('todayList').innerHTML = lista.slice(0,5).map(({name,r,due})=>{
    const tarde = remIsOverdue(due, r.done) ? ' <span class="rem-late">vencido</span>' : '';
    return `<div class="today-item prio-${r.priority}">• ${escapeHtml(name)}${tarde}</div>`;
  }).join('') + (lista.length > 5 ? `<div class="today-item">…y ${lista.length-5} más</div>` : '');
  card.style.display = '';
}

// --- Editor dentro del modal de pendiente ----------------------------------
function remFillModal(name){
  const r = remOf(name);
  if(!r) return;
  document.getElementById('remEnabled').checked = !!r.enabled;
  document.getElementById('remDate').value = r.date || '';
  document.getElementById('remTime').value = r.time || '08:00';
  document.getElementById('remRepeat').value = r.repeat || 'once';
  document.getElementById('remPriority').value = r.priority || 'media';
  document.getElementById('remCustomDays').value = r.customDays || '';
  document.getElementById('remCategory').value = r.category || '';
  document.getElementById('remCustomWrap').style.display = r.repeat === 'custom' ? '' : 'none';
  document.getElementById('remFields').style.display = r.enabled ? '' : 'none';
  remUpdateStateLabel(r);
  // Sugerencias de categoría con las ya usadas
  const usadas = [...new Set(debtItems.map(n=>(remOf(n)||{}).category).filter(Boolean))];
  document.getElementById('remCategoryList').innerHTML = usadas.map(c=>`<option value="${escapeHtml(c)}">`).join('');
}

function remUpdateStateLabel(r){
  const el = document.getElementById('remStateLabel');
  const due = remDueAt(r);
  if(r.done){ el.textContent = 'Realizado'; el.className = 'rem-state-label hecho'; }
  else if(remIsOverdue(due, r.done)){ el.textContent = 'Vencido'; el.className = 'rem-state-label vencido'; }
  else { el.textContent = 'Pendiente'; el.className = 'rem-state-label'; }
  document.getElementById('remToggleDone').textContent = r.done ? '↩ Marcar pendiente' : '✓ Marcar realizado';
}

// Lee los campos del formulario al objeto del recordatorio.
function remReadModal(name){
  const r = remOf(name);
  if(!r) return null;
  r.enabled = document.getElementById('remEnabled').checked;
  r.date = document.getElementById('remDate').value;
  r.time = document.getElementById('remTime').value || '08:00';
  r.repeat = document.getElementById('remRepeat').value;
  r.customDays = Math.max(0, parseInt(document.getElementById('remCustomDays').value, 10) || 0);
  r.priority = document.getElementById('remPriority').value;
  r.category = document.getElementById('remCategory').value.trim();
  if(r.enabled && !r.date) r.date = todayStr();
  return r;
}

// Marcar realizado: si se repite, avanza solo a la siguiente fecha.
async function remToggleDone(name){
  const r = remOf(name);
  if(!r) return;
  if(r.done){
    r.done = false;
  } else {
    const next = remNextOccurrence(remDueAt(r), r.repeat, r.customDays);
    if(next){ remSetFromMillis(r, next); r.done = false; }   // pago recurrente
    else { r.done = true; }
  }
  await remSave();
  remFillModal(name);
  remRenderAll();
  renderDebtList();
  if(window.onLunaReact) window.onLunaReact(r.done ? 'happy' : 'smile');
}

async function remSnooze(name, minutos){
  const r = remOf(name);
  if(!r) return;
  let ms;
  if(minutos === 'tomorrow'){
    const d = new Date(); d.setDate(d.getDate()+1); d.setHours(8,0,0,0);
    ms = d.getTime();
  } else {
    ms = Date.now() + Number(minutos) * 60000;
  }
  remSetFromMillis(r, ms);
  r.done = false;
  r.enabled = true;
  await remSave();
  remRenderAll();
  renderDebtList();
}

function remRenderAll(){
  remRenderDashboard();
  remRenderTodayCard();
  remCheckPermissions();
}

// Avisa si Android tiene las notificaciones apagadas: sin esto los
// recordatorios se programarían "en silencio" y el usuario no sabría por qué.
function remCheckPermissions(){
  const warn = document.getElementById('remPermWarn');
  if(!warn) return;
  if(!remHasNative()){
    const hay = remActive().length > 0;
    warn.innerHTML = hay ? '📱 Las alarmas del sistema solo funcionan en la app instalada en Android.' : '';
    warn.style.display = hay ? '' : 'none';
    return;
  }
  const problemas = [];
  try{
    if(window.Android.notificationsEnabled && !window.Android.notificationsEnabled()){
      problemas.push('<button type="button" class="rem-warn-btn" data-fix="notif">Activar notificaciones</button>');
    }
    if(window.Android.canScheduleExactAlarms && !window.Android.canScheduleExactAlarms()){
      problemas.push('<button type="button" class="rem-warn-btn" data-fix="exact">Permitir alarmas exactas</button>');
    }
  }catch(e){}
  if(!problemas.length){ warn.style.display = 'none'; warn.innerHTML = ''; return; }
  warn.innerHTML = '⚠️ Para que los recordatorios suenen: ' + problemas.join(' ');
  warn.style.display = '';
  warn.querySelectorAll('.rem-warn-btn').forEach(b=>{
    b.addEventListener('click', ()=>{
      if(b.dataset.fix === 'notif') window.Android.requestNotificationPermission();
      else window.Android.openExactAlarmSettings();
    });
  });
}

// --- Puente que llama Android ----------------------------------------------
window.__remindersNative = {
  openReminder(id){
    const name = String(id || '').replace(/^rem-/, '');
    if(!debtData[name]) return;
    goToMode('luna');
    openDebtModal(name);
  },
  syncFromNative(){
    remApplyPendingNative();
  },
  onPermission(){
    remCheckPermissions();
  }
};

// --- Cableado ---------------------------------------------------------------
function remWire(){
  document.getElementById('remEnabled').addEventListener('change', (e)=>{
    document.getElementById('remFields').style.display = e.target.checked ? '' : 'none';
    if(e.target.checked && !document.getElementById('remDate').value){
      document.getElementById('remDate').value = todayStr();
    }
  });
  document.getElementById('remRepeat').addEventListener('change', (e)=>{
    document.getElementById('remCustomWrap').style.display = e.target.value === 'custom' ? '' : 'none';
  });
  document.getElementById('remToggleDone').addEventListener('click', ()=>{
    if(editingDebtName) remToggleDone(editingDebtName);
  });
  document.getElementById('remSnoozeBtn').addEventListener('click', ()=>{
    if(!editingDebtName) return;
    remSnoozeTarget = editingDebtName;
    const d = new Date(); d.setDate(d.getDate()+1);
    document.getElementById('remSnoozeDate').value = remDayKey(d.getTime());
    document.getElementById('remSnoozeBackdrop').classList.add('open');
  });

  document.querySelectorAll('[data-snooze]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const v = btn.dataset.snooze;
      document.getElementById('remSnoozeBackdrop').classList.remove('open');
      if(remSnoozeTarget){
        await remSnooze(remSnoozeTarget, v === 'tomorrow' ? 'tomorrow' : parseInt(v,10));
        if(editingDebtName === remSnoozeTarget) remFillModal(remSnoozeTarget);
      }
    });
  });
  document.getElementById('remSnoozeCustom').addEventListener('click', async ()=>{
    const fecha = document.getElementById('remSnoozeDate').value;
    const hora = document.getElementById('remSnoozeTime').value || '08:00';
    if(!fecha){ showAlert('Elige una fecha para posponer.'); return; }
    const ms = new Date(fecha + 'T' + hora + ':00').getTime();
    document.getElementById('remSnoozeBackdrop').classList.remove('open');
    if(remSnoozeTarget && !isNaN(ms)){
      const r = remOf(remSnoozeTarget);
      remSetFromMillis(r, ms); r.done = false; r.enabled = true;
      await remSave();
      remRenderAll(); renderDebtList();
      if(editingDebtName === remSnoozeTarget) remFillModal(remSnoozeTarget);
    }
  });
  bindModalClose(document.getElementById('remSnoozeBackdrop'),
    ()=> document.getElementById('remSnoozeBackdrop').classList.remove('open'),
    document.getElementById('remSnoozeClose'), document.getElementById('remSnoozeCancel'));

  document.getElementById('lunaCalendarBtn').addEventListener('click', remOpenCalendar);
  document.getElementById('remCalPrev').addEventListener('click', ()=>{
    remCalMonth.setMonth(remCalMonth.getMonth()-1); remRenderCalendar();
  });
  document.getElementById('remCalNext').addEventListener('click', ()=>{
    remCalMonth.setMonth(remCalMonth.getMonth()+1); remRenderCalendar();
  });
  bindModalClose(document.getElementById('remCalendarBackdrop'),
    ()=> document.getElementById('remCalendarBackdrop').classList.remove('open'),
    document.getElementById('remCalClose'));

  document.getElementById('todayGoBtn').addEventListener('click', ()=>{
    remTodayDismissed = true;
    document.getElementById('todayCard').style.display = 'none';
    goToMode('luna');
  });
  document.getElementById('todayLaterBtn').addEventListener('click', ()=>{
    remTodayDismissed = true;
    document.getElementById('todayCard').style.display = 'none';
  });

  // Al volver a la app: aplicar acciones de notificación y refrescar por si
  // cambió el día mientras estaba en segundo plano.
  document.addEventListener('visibilitychange', ()=>{
    if(!document.hidden){ remApplyPendingNative(); remRenderAll(); }
  });

  // --- Voz: "Luna, recuérdame pagar la moto el 15 a las 8 de la mañana" ---
  if(typeof VoiceForms !== 'undefined'){
    VoiceForms.register('recordatorio', {
      title: 'Nuevo recordatorio',
      hint: 'Di qué recordarte y cuándo. Ejemplo: "Pagar la moto el 15 a las 8 de la mañana".',
      fields: [
        { key:'item', label:'Pendiente', type:'choice', required:true, article:'el',
          aliases:['pendiente','recordatorio','tarea','nombre'],
          choices: ()=> debtItems.slice() },
        { key:'amount', label:'Monto', type:'number', required:false, article:'el',
          aliases:['monto','valor','precio','cantidad'], format:(v)=>fmt(v) },
        { key:'note', label:'Nota', type:'text', required:false, article:'la',
          aliases:['nota','observacion','observación','comentario','detalle'] }
      ],
      async onAccept(values){
        const name = values.item;
        if(!debtItems.includes(name)){
          debtItems.push(name);
          debtData[name] = { totalDebt: values.amount || 0, payments: {}, note: values.note || '' };
          await saveDebtItems();
        } else {
          if(values.amount) debtData[name].totalDebt = values.amount;
          if(values.note) debtData[name].note = values.note;
        }
        const r = remOf(name);
        r.enabled = true;
        if(!r.date) r.date = todayStr();
        await remSave();
        renderDebtList();
        remRenderAll();
      }
    });
  }
}

async function initReminders(){
  remWire();
  // Espera a que Luna haya cargado sus datos antes de calcular nada.
  let intentos = 0;
  while(!debtItems.length && intentos < 40){
    await new Promise(r=>setTimeout(r, 50));
    intentos++;
  }
  remApplyPendingNative();
  remSyncNative();
  remRenderAll();
}

initReminders();

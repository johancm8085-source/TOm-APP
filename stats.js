// --- Módulo de Estadísticas avanzadas ---
// Depende de globals definidos en app.js: TABS, data, currentTab, todayStr,
// fmt, escapeHtml, getIcon, itemIcons, incomeItemIcons, initialBalance,
// buildConicGradient, buildChartLegend, populateFilters, renderMenu, render.

const STATS_VIEWS = [
  { key:'categoria', label:'Categorías' },
  { key:'dia', label:'Gastos día' },
  { key:'semana', label:'Gastos semana' },
  { key:'mes', label:'Gastos mes' },
  { key:'anio', label:'Gastos año' },
  { key:'ingdia', label:'Ingresos día' },
  { key:'ingmes', label:'Ingresos mes' },
  { key:'balancemes', label:'Balance mensual' },
  { key:'compmeses', label:'Comparar meses' },
  { key:'compingastos', label:'Ingresos vs gastos' },
  { key:'evolsaldo', label:'Evolución saldo' },
  { key:'topcat', label:'Categoría top' },
  { key:'crecimiento', label:'Mayor crecimiento' },
  { key:'promdia', label:'Promedio diario' },
  { key:'prommes', label:'Promedio mensual' },
  { key:'ahorropct', label:'% de ahorro' },
  { key:'tendencia', label:'Tendencia' },
  { key:'ult12', label:'Últimos 12 meses' }
];
let currentStatsView = 'categoria';

function movsOfTab(){ return data[currentTab]; }
function sumAmount(movs){ return movs.reduce((s,m)=>s+m.amount, 0); }
function filterByType(movs, type){ return movs.filter(m=>m.type===type); }

function lastNMonths(n){
  const arr = [];
  const now = new Date();
  for(let i=n-1;i>=0;i--){
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    arr.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  }
  return arr;
}
function monthShortLabel(key){
  const [y,mo] = key.split('-').map(Number);
  return new Date(y, mo-1, 1).toLocaleDateString('es-ES',{month:'short'});
}

function statsStatCard(label, value, sub, colorClass){
  return `<div class="stats-card"><div class="stats-big-card ${colorClass||''}">
    <div class="stats-big-label">${escapeHtml(label)}</div>
    <div class="stats-big-value">${value}</div>
    ${sub ? `<div class="stats-big-sub">${sub}</div>` : ''}
  </div></div>`;
}

function statsBarChart(entries, colorVar){
  const max = Math.max(1, ...entries.map(e=>e[1]));
  return `<div class="stats-bars">` + entries.map(([label,val],i)=>{
    const h = Math.max(3, Math.round(val/max*100));
    return `<div class="stats-bar-col" data-idx="${i}">
      <div class="stats-bar-value-top">${val>0?fmt(val):''}</div>
      <div class="stats-bar-track"><div class="stats-bar-fill" style="height:${h}%; background:${colorVar};"></div></div>
      <div class="stats-bar-label">${escapeHtml(label)}</div>
    </div>`;
  }).join('') + `</div>`;
}

function statsGroupedBarChart(labels, seriesA, seriesB, colorA, colorB){
  const max = Math.max(1, ...seriesA, ...seriesB);
  return `<div class="stats-bars grouped">` + labels.map((label,i)=>{
    const ha = Math.max(2, Math.round(seriesA[i]/max*100));
    const hb = Math.max(2, Math.round(seriesB[i]/max*100));
    return `<div class="stats-bar-col">
      <div class="stats-bar-track grouped">
        <div class="stats-bar-fill" style="height:${ha}%; background:${colorA};"></div>
        <div class="stats-bar-fill" style="height:${hb}%; background:${colorB};"></div>
      </div>
      <div class="stats-bar-label">${escapeHtml(label)}</div>
    </div>`;
  }).join('') + `</div>`;
}

function statsLineChart(points){
  if(!points.length) return '<div class="empty">Sin datos suficientes.</div>';
  const w = 320, h = 130, pad = 10;
  const vals = points.map(p=>p[1]);
  let min = Math.min(...vals, 0), max = Math.max(...vals, 0);
  if(min === max){ min -= 1; max += 1; }
  const range = max - min;
  const stepX = points.length > 1 ? (w - pad*2) / (points.length - 1) : 0;
  const coords = points.map((p,i)=>{
    const x = pad + i*stepX;
    const y = pad + (h - pad*2) * (1 - (p[1]-min)/range);
    return [x,y];
  });
  const linePath = coords.map((c,i)=> (i===0?'M':'L') + c[0].toFixed(1) + ',' + c[1].toFixed(1)).join(' ');
  const zeroY = (pad + (h - pad*2) * (1 - (0-min)/range)).toFixed(1);
  const areaPath = `${linePath} L${coords[coords.length-1][0].toFixed(1)},${zeroY} L${coords[0][0].toFixed(1)},${zeroY} Z`;
  const labelsHtml = points.map(p=>`<span>${escapeHtml(p[0])}</span>`).join('');
  return `<svg viewBox="0 0 ${w} ${h}" class="stats-line-svg" preserveAspectRatio="none">
      <line x1="${pad}" y1="${zeroY}" x2="${w-pad}" y2="${zeroY}" stroke="var(--border)" stroke-width="1"/>
      <path d="${areaPath}" fill="color-mix(in srgb, var(--gold) 20%, transparent)" stroke="none"/>
      <path d="${linePath}" fill="none" stroke="var(--gold)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>
    <div class="stats-line-labels">${labelsHtml}</div>`;
}

function renderStatsDetailList(containerEl, movs, emptyMsg){
  if(!movs.length){
    containerEl.innerHTML = `<div class="empty">${emptyMsg || 'Sin movimientos.'}</div>`;
    return;
  }
  const sorted = movs.slice().sort((a,b)=> b.date.localeCompare(a.date));
  containerEl.innerHTML = sorted.map(m=>{
    const fecha = new Date(m.date+'T00:00').toLocaleDateString('es-ES',{day:'numeric', month:'short'});
    const iconMap = m.type === 'in' ? incomeItemIcons[currentTab] : itemIcons[currentTab];
    return `<div class="mov">
      <div class="mov-left">
        ${getIcon(m.desc, iconMap[m.desc])}
        <div>
          <div class="mov-desc">${escapeHtml(m.desc)}</div>
          <div class="mov-meta">${fecha}</div>
        </div>
      </div>
      <div class="mov-amount ${m.type}">${m.type==='in'?'+':'-'}${fmt(m.amount)}</div>
    </div>`;
  }).join('');
}

// --- Vistas individuales ---

function renderViewCategoria(body){
  const monthKey = todayStr().slice(0,7);
  const movs = movsOfTab().filter(m=>m.type==='out' && m.date.slice(0,7)===monthKey);
  if(!movs.length){ body.innerHTML = '<div class="empty">Sin gastos este mes todavía.</div>'; return; }
  const byDesc = new Map();
  movs.forEach(m=> byDesc.set(m.desc, (byDesc.get(m.desc)||0) + m.amount));
  const total = [...byDesc.values()].reduce((a,b)=>a+b, 0);
  const entries = [...byDesc.entries()].sort((a,b)=>b[1]-a[1]);
  body.innerHTML = `<div class="stats-card">
    <div class="items-title">Gastos por categoría — este mes</div>
    <div class="chart-body">
      <div class="pie" style="background:${buildConicGradient(entries, total)};"></div>
      <div class="chart-legend" id="statsCatLegend">${buildChartLegend(entries, total)}</div>
    </div>
  </div>
  <div class="stats-card"><div class="items-title" id="statsCatDetailTitle">Toca una categoría para ver el detalle</div><div id="statsCatDetail"></div></div>`;
  body.querySelectorAll('#statsCatLegend .legend-row').forEach((row,i)=>{
    row.classList.add('clickable');
    row.addEventListener('click', ()=>{
      const [name] = entries[i];
      document.getElementById('statsCatDetailTitle').textContent = `Movimientos: ${name}`;
      renderStatsDetailList(document.getElementById('statsCatDetail'), movs.filter(m=>m.desc===name));
    });
  });
}

function renderPeriodExpense(body, period, typeFilter, titleLabel){
  const movs = movsOfTab().filter(m=>m.type===typeFilter);
  const now = new Date();
  let curMovs;
  if(period === 'dia'){
    curMovs = movs.filter(m=>m.date===todayStr());
  } else if(period === 'semana'){
    const diffToMon = (now.getDay() + 6) % 7;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMon);
    const mondayStr = monday.toISOString().slice(0,10);
    curMovs = movs.filter(m=> m.date >= mondayStr && m.date <= todayStr());
  } else if(period === 'mes'){
    const key = todayStr().slice(0,7);
    curMovs = movs.filter(m=>m.date.slice(0,7)===key);
  } else {
    const key = String(now.getFullYear());
    curMovs = movs.filter(m=>m.date.slice(0,4)===key);
  }
  const total = sumAmount(curMovs);
  body.innerHTML = statsStatCard(titleLabel, fmt(total), `${curMovs.length} movimiento${curMovs.length===1?'':'s'}`, typeFilter==='in'?'positive':'negative');

  const byDesc = new Map();
  curMovs.forEach(m=> byDesc.set(m.desc, (byDesc.get(m.desc)||0) + m.amount));
  const entries = [...byDesc.entries()].sort((a,b)=>b[1]-a[1]);
  const breakdownCard = document.createElement('div');
  breakdownCard.className = 'stats-card';
  breakdownCard.innerHTML = entries.length
    ? `<div class="items-title">Desglose</div>${statsBarChart(entries, typeFilter==='in' ? 'var(--green)' : 'var(--gold)')}`
    : '<div class="empty">Sin movimientos en este período.</div>';
  body.appendChild(breakdownCard);

  const listCard = document.createElement('div');
  listCard.className = 'stats-card';
  listCard.innerHTML = `<div class="items-title">Movimientos</div><div id="statsPeriodDetail"></div>`;
  body.appendChild(listCard);
  renderStatsDetailList(document.getElementById('statsPeriodDetail'), curMovs);
}

function renderViewBalanceMes(body){
  const monthKey = todayStr().slice(0,7);
  const movs = movsOfTab().filter(m=>m.date.slice(0,7)===monthKey);
  const totalIn = sumAmount(filterByType(movs,'in'));
  const totalOut = sumAmount(filterByType(movs,'out'));
  const net = totalIn - totalOut;
  body.innerHTML = statsStatCard('Balance de este mes', (net>=0?'+':'-') + fmt(Math.abs(net)), `Entradas ${fmt(totalIn)} · Gastos ${fmt(totalOut)}`, net>=0?'positive':'negative');
}

function renderViewCompMeses(body){
  const months = lastNMonths(6);
  const movs = movsOfTab();
  const entries = months.map(mk=>[monthShortLabel(mk), sumAmount(movs.filter(m=>m.type==='out' && m.date.slice(0,7)===mk))]);
  const card = document.createElement('div');
  card.className = 'stats-card';
  card.innerHTML = `<div class="items-title">Gastos: comparación de los últimos 6 meses</div>${statsBarChart(entries, 'var(--red)')}`;
  body.appendChild(card);
  const detailCard = document.createElement('div');
  detailCard.className = 'stats-card';
  detailCard.innerHTML = `<div class="items-title" id="compMesesDetailTitle">Toca un mes para ver el detalle</div><div id="compMesesDetail"></div>`;
  body.appendChild(detailCard);
  card.querySelectorAll('.stats-bar-col').forEach((col,i)=>{
    col.classList.add('clickable');
    col.addEventListener('click', ()=>{
      const mk = months[i];
      document.getElementById('compMesesDetailTitle').textContent = `Gastos de ${monthShortLabel(mk)}`;
      renderStatsDetailList(document.getElementById('compMesesDetail'), movs.filter(m=>m.type==='out' && m.date.slice(0,7)===mk));
    });
  });
}

function renderViewCompIngastos(body){
  const months = lastNMonths(6);
  const movs = movsOfTab();
  const labels = months.map(monthShortLabel);
  const seriesIn = months.map(mk=> sumAmount(movs.filter(m=>m.type==='in' && m.date.slice(0,7)===mk)));
  const seriesOut = months.map(mk=> sumAmount(movs.filter(m=>m.type==='out' && m.date.slice(0,7)===mk)));
  body.innerHTML = `<div class="stats-card">
    <div class="items-title">Ingresos vs gastos — últimos 6 meses</div>
    <div class="stats-legend-inline"><span><i style="background:var(--green);"></i> Ingresos</span><span><i style="background:var(--red);"></i> Gastos</span></div>
    ${statsGroupedBarChart(labels, seriesIn, seriesOut, 'var(--green)', 'var(--red)')}
  </div>`;
}

function renderViewEvolSaldo(body){
  const months = lastNMonths(12);
  const movs = movsOfTab().slice().sort((a,b)=>a.date.localeCompare(b.date));
  let running = initialBalance[currentTab];
  const beforeFirst = months[0] + '-01';
  movs.filter(m=>m.date < beforeFirst).forEach(m=>{ running += m.type==='in'?m.amount:-m.amount; });
  const points = months.map(mk=>{
    movs.filter(m=>m.date.slice(0,7)===mk).forEach(m=>{ running += m.type==='in'?m.amount:-m.amount; });
    return [monthShortLabel(mk), running];
  });
  body.innerHTML = `<div class="stats-card">
    <div class="items-title">Evolución del saldo — últimos 12 meses</div>
    ${statsLineChart(points)}
  </div>`;
}

function renderViewTopCat(body){
  const monthKey = todayStr().slice(0,7);
  const movs = movsOfTab().filter(m=>m.type==='out' && m.date.slice(0,7)===monthKey);
  if(!movs.length){ body.innerHTML = '<div class="empty">Sin gastos este mes todavía.</div>'; return; }
  const byDesc = new Map();
  movs.forEach(m=> byDesc.set(m.desc, (byDesc.get(m.desc)||0)+m.amount));
  const [topName, topVal] = [...byDesc.entries()].sort((a,b)=>b[1]-a[1])[0];
  const total = sumAmount(movs);
  const pct = Math.round(topVal/total*100);
  body.innerHTML = statsStatCard('Categoría que más consume', escapeHtml(topName), `${fmt(topVal)} · ${pct}% de tus gastos de este mes`, 'negative');
}

function renderViewCrecimiento(body){
  const now = new Date();
  const curKey = todayStr().slice(0,7);
  const prevDate = new Date(now.getFullYear(), now.getMonth()-1, 1);
  const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth()+1).padStart(2,'0')}`;
  const movs = movsOfTab().filter(m=>m.type==='out');
  const curByDesc = new Map(), prevByDesc = new Map();
  movs.filter(m=>m.date.slice(0,7)===curKey).forEach(m=> curByDesc.set(m.desc, (curByDesc.get(m.desc)||0)+m.amount));
  movs.filter(m=>m.date.slice(0,7)===prevKey).forEach(m=> prevByDesc.set(m.desc, (prevByDesc.get(m.desc)||0)+m.amount));
  let best = null;
  curByDesc.forEach((val, name)=>{
    const prevVal = prevByDesc.get(name) || 0;
    if(prevVal > 0){
      const growth = (val - prevVal) / prevVal;
      if(!best || growth > best.growth) best = { name, val, prevVal, growth };
    } else if(val > 0 && !best){
      best = { name, val, prevVal, growth: Infinity };
    }
  });
  if(!best){ body.innerHTML = '<div class="empty">No hay suficiente historial para comparar meses todavía.</div>'; return; }
  const pctText = best.growth === Infinity ? 'nuevo este mes' : `+${Math.round(best.growth*100)}% vs mes anterior`;
  body.innerHTML = statsStatCard('Categoría con mayor crecimiento', escapeHtml(best.name), `${fmt(best.val)} (antes ${fmt(best.prevVal)}) · ${pctText}`, 'negative');
}

function renderViewPromDia(body){
  const monthKey = todayStr().slice(0,7);
  const movs = movsOfTab().filter(m=>m.type==='out' && m.date.slice(0,7)===monthKey);
  const total = sumAmount(movs);
  const dayOfMonth = new Date().getDate();
  const avg = total / dayOfMonth;
  body.innerHTML = statsStatCard('Promedio diario de gastos', fmt(avg), `Basado en ${fmt(total)} gastados en los primeros ${dayOfMonth} días de este mes`, 'negative');
}

function renderViewPromMes(body){
  const movs = movsOfTab().filter(m=>m.type==='out');
  if(!movs.length){ body.innerHTML = '<div class="empty">Todavía no hay gastos registrados.</div>'; return; }
  const byMonth = new Map();
  movs.forEach(m=>{ const k = m.date.slice(0,7); byMonth.set(k, (byMonth.get(k)||0)+m.amount); });
  const total = sumAmount(movs);
  const avg = total / byMonth.size;
  body.innerHTML = statsStatCard('Promedio mensual de gastos', fmt(avg), `Basado en ${byMonth.size} mes${byMonth.size===1?'':'es'} con movimientos`, 'negative');
}

function renderViewAhorroPct(body){
  const monthKey = todayStr().slice(0,7);
  const movs = movsOfTab().filter(m=>m.date.slice(0,7)===monthKey);
  const totalIn = sumAmount(filterByType(movs,'in'));
  const totalOut = sumAmount(filterByType(movs,'out'));
  if(totalIn <= 0){ body.innerHTML = '<div class="empty">Registra ingresos este mes para calcular tu % de ahorro.</div>'; return; }
  const pct = Math.round((totalIn - totalOut) / totalIn * 100);
  body.innerHTML = statsStatCard('% de ahorro este mes', pct + '%', `Ahorraste ${fmt(Math.max(0,totalIn-totalOut))} de ${fmt(totalIn)} ingresados`, pct>=0?'positive':'negative');
}

function renderViewTendencia(body){
  const movs = movsOfTab().filter(m=>m.type==='out');
  const now = new Date();
  const weeks = [];
  for(let i=3;i>=0;i--){
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i*7);
    const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 6);
    const startStr = start.toISOString().slice(0,10);
    const endStr = end.toISOString().slice(0,10);
    weeks.push([`Sem ${4-i}`, sumAmount(movs.filter(m=> m.date >= startStr && m.date <= endStr))]);
  }
  const last = weeks[weeks.length-1][1], prev = weeks[weeks.length-2][1];
  let trendText = 'Sin cambios relevantes frente a la semana pasada.';
  if(prev > 0){
    const delta = Math.round((last/prev - 1)*100);
    if(delta > 5) trendText = `▲ Vas ${delta}% más alto que la semana pasada.`;
    else if(delta < -5) trendText = `▼ Vas ${Math.abs(delta)}% más bajo que la semana pasada.`;
  }
  body.innerHTML = `<div class="stats-card"><div class="items-title">Tendencia de gastos — últimas 4 semanas</div>${statsBarChart(weeks,'var(--gold)')}
  <div class="stats-trend-text">${escapeHtml(trendText)}</div></div>`;
}

function renderViewUlt12(body){
  const months = lastNMonths(12);
  const movs = movsOfTab();
  const entries = months.map(mk=>[monthShortLabel(mk), sumAmount(movs.filter(m=>m.type==='out' && m.date.slice(0,7)===mk))]);
  const card = document.createElement('div');
  card.className = 'stats-card';
  card.innerHTML = `<div class="items-title">Gastos de los últimos 12 meses</div>${statsBarChart(entries,'var(--red)')}`;
  body.appendChild(card);
  const detailCard = document.createElement('div');
  detailCard.className = 'stats-card';
  detailCard.innerHTML = `<div class="items-title" id="ult12DetailTitle">Toca un mes para ver el detalle</div><div id="ult12Detail"></div>`;
  body.appendChild(detailCard);
  card.querySelectorAll('.stats-bar-col').forEach((col,i)=>{
    col.classList.add('clickable');
    col.addEventListener('click', ()=>{
      const mk = months[i];
      document.getElementById('ult12DetailTitle').textContent = `Gastos de ${monthShortLabel(mk)}`;
      renderStatsDetailList(document.getElementById('ult12Detail'), movs.filter(m=>m.type==='out' && m.date.slice(0,7)===mk));
    });
  });
}

const STATS_RENDERERS = {
  categoria: renderViewCategoria,
  dia: (body)=> renderPeriodExpense(body, 'dia', 'out', 'Gastos de hoy'),
  semana: (body)=> renderPeriodExpense(body, 'semana', 'out', 'Gastos de esta semana'),
  mes: (body)=> renderPeriodExpense(body, 'mes', 'out', 'Gastos de este mes'),
  anio: (body)=> renderPeriodExpense(body, 'anio', 'out', 'Gastos de este año'),
  ingdia: (body)=> renderPeriodExpense(body, 'dia', 'in', 'Ingresos de hoy'),
  ingmes: (body)=> renderPeriodExpense(body, 'mes', 'in', 'Ingresos de este mes'),
  balancemes: renderViewBalanceMes,
  compmeses: renderViewCompMeses,
  compingastos: renderViewCompIngastos,
  evolsaldo: renderViewEvolSaldo,
  topcat: renderViewTopCat,
  crecimiento: renderViewCrecimiento,
  promdia: renderViewPromDia,
  prommes: renderViewPromMes,
  ahorropct: renderViewAhorroPct,
  tendencia: renderViewTendencia,
  ult12: renderViewUlt12
};

function renderStatsViewStrip(){
  const strip = document.getElementById('statsViewStrip');
  strip.innerHTML = STATS_VIEWS.map(v=>
    `<div class="stats-view-pill${v.key===currentStatsView?' active':''}" data-view="${v.key}">${v.label}</div>`
  ).join('');
  strip.querySelectorAll('.stats-view-pill').forEach(pill=>{
    pill.addEventListener('click', ()=>{
      currentStatsView = pill.dataset.view;
      renderStats();
    });
  });
}

function renderStats(){
  renderStatsViewStrip();
  const body = document.getElementById('statsBody');
  body.innerHTML = '';
  const fn = STATS_RENDERERS[currentStatsView];
  if(fn) fn(body);
}

document.querySelectorAll('#statsTabs .tab').forEach(el=>{
  el.addEventListener('click', ()=>{
    document.querySelectorAll('#statsTabs .tab').forEach(x=>x.classList.remove('active'));
    el.classList.add('active');
    document.querySelectorAll('.tabs:not(#statsTabs) .tab').forEach(x=>{
      x.classList.toggle('active', x.dataset.tab === el.dataset.tab);
    });
    currentTab = el.dataset.tab;
    populateFilters();
    renderMenu();
    render();
    renderStats();
  });
});

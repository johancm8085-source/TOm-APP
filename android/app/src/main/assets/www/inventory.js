// ============================================================================
// MÓDULO INVENTARIO — integrado con TOM FINANCE
// ============================================================================
// Reutiliza lo que ya existe en la app en vez de duplicarlo:
//   getIcon / buildIconPickerHTML / wireIconPicker  (íconos, app.js)
//   showConfirm / showAlert                         (diálogos propios, app.js)
//   storageGetJSON / storageSetJSON                 (persistencia, app.js)
//   fmt / escapeHtml / bindModalClose               (utilidades, app.js)
//   attachDragReorder / attachSwipeActions          (gestos, dragsort.js)
//   playRowAddIn / playRowConfirm / playRowDeleteOut(animaciones, dragsort.js)
//   VoiceForms                                      (voz, voice.js)
//
// Puntos de extensión ya previstos (ver INV_IMPORT y InventoryScanner al
// final): importar CSV ya funciona; el escaneo de códigos de barras solo
// necesita que alguien registre un proveedor.

const INV_DEFAULT_CATEGORIES = [
  { id:'cat-aseo',    name:'Aseo',    icon:'spray|blue' },
  { id:'cat-granos',  name:'Granos',  icon:'bowl|amber' },
  { id:'cat-lacteos', name:'Lácteos', icon:'cup|teal' }
];
const INV_DEFAULT_UNITS = ['Unidad','Kg','g','Litro','ml','Caja','Bolsa','Paquete','Botella','Docena','Frasco'];
const INV_DEFAULT_SETTINGS = { lowStock: 2, askShopping: true };

let invCategories = [];
let invProducts = [];
let invUnits = [];
let invShopping = [];
let invSettings = Object.assign({}, INV_DEFAULT_SETTINGS);

let invActiveCat = '';     // '' = todas
let invView = 'productos'; // 'productos' | 'compras'
let invEditingId = null;
let invEditingIconOverride = null;
let invEditingFav = false;
let invMovingId = null;
let invSwipe = null;

function invId(){ return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function invNow(){ return new Date().toISOString(); }

// Umbral de "poco inventario": el del producto si lo tiene, si no el global.
function invMinOf(p){
  return (p.min === null || p.min === undefined || p.min === '') ? (invSettings.lowStock || 0) : Number(p.min);
}
function invIsOut(p){ return Number(p.qty) <= 0; }
function invIsLow(p){ const m = invMinOf(p); return Number(p.qty) > 0 && Number(p.qty) <= m; }

// --- Persistencia -----------------------------------------------------------
async function invLoad(){
  invCategories = await storageGetJSON('inv:categories', INV_DEFAULT_CATEGORIES.map(c=>Object.assign({}, c)));
  invProducts   = await storageGetJSON('inv:products', []);
  invUnits      = await storageGetJSON('inv:units', INV_DEFAULT_UNITS.slice());
  invShopping   = await storageGetJSON('inv:shopping', []);
  invSettings   = Object.assign({}, INV_DEFAULT_SETTINGS, await storageGetJSON('inv:settings', {}));
}
async function invSaveCategories(){ await storageSetJSON('inv:categories', invCategories, 'Error guardando categorías'); }
async function invSaveProducts(){ await storageSetJSON('inv:products', invProducts, 'Error guardando productos'); }
async function invSaveUnits(){ await storageSetJSON('inv:units', invUnits, 'Error guardando unidades'); }
async function invSaveShopping(){ await storageSetJSON('inv:shopping', invShopping, 'Error guardando lista de compras'); }
async function invSaveSettings(){ await storageSetJSON('inv:settings', invSettings, 'Error guardando ajustes'); }

// --- Búsqueda: ignora mayúsculas y tildes -----------------------------------
function invNorm(s){
  return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
}

// --- Dashboard --------------------------------------------------------------
function invRenderDashboard(){
  const el = document.getElementById('invDashboard');
  const total = invProducts.length;
  const agotados = invProducts.filter(invIsOut).length;
  const porComprar = invProducts.filter(p => invIsOut(p) || invIsLow(p)).length;
  const valor = invProducts.reduce((s,p)=> s + (Number(p.qty)||0) * (Number(p.price)||0), 0);
  let ultima = '—';
  if(invProducts.length){
    const last = invProducts.reduce((a,b)=> (a.modified || '') > (b.modified || '') ? a : b);
    if(last.modified){
      const d = new Date(last.modified);
      if(!isNaN(d)) ultima = d.toLocaleDateString('es-ES',{day:'numeric', month:'short'}) + ' ' +
                             d.toLocaleTimeString('es-ES',{hour:'2-digit', minute:'2-digit'});
    }
  }
  el.innerHTML = `
    <div class="inv-stat"><div class="inv-stat-value">${total}</div><div class="inv-stat-label">Productos</div></div>
    <div class="inv-stat${agotados ? ' danger' : ''}"><div class="inv-stat-value">${agotados}</div><div class="inv-stat-label">Agotados</div></div>
    <div class="inv-stat${porComprar ? ' warn' : ''}"><div class="inv-stat-value">${porComprar}</div><div class="inv-stat-label">Por comprar</div></div>
    <div class="inv-stat wide"><div class="inv-stat-value">${fmt(valor)}</div><div class="inv-stat-label">Valor aproximado</div></div>
    <div class="inv-stat wide"><div class="inv-stat-value small">${escapeHtml(ultima)}</div><div class="inv-stat-label">Última actualización</div></div>`;
}

// --- Categorías (chips de filtro) -------------------------------------------
function invRenderCatStrip(){
  const strip = document.getElementById('invCatStrip');
  const countAll = invProducts.length;
  let html = `<button type="button" class="inv-cat-chip${invActiveCat===''?' active':''}" data-cat="">Todas <span>${countAll}</span></button>`;
  html += invCategories.map(c=>{
    const n = invProducts.filter(p=>p.catId===c.id).length;
    return `<button type="button" class="inv-cat-chip${invActiveCat===c.id?' active':''}" data-cat="${escapeHtml(c.id)}">${escapeHtml(c.name)} <span>${n}</span></button>`;
  }).join('');
  // Productos cuya categoría fue eliminada quedan visibles en "Sin categoría".
  const huerfanos = invProducts.filter(p => !invCategories.some(c=>c.id===p.catId)).length;
  if(huerfanos){
    html += `<button type="button" class="inv-cat-chip${invActiveCat==='__none'?' active':''}" data-cat="__none">Sin categoría <span>${huerfanos}</span></button>`;
  }
  strip.innerHTML = html;
  strip.querySelectorAll('.inv-cat-chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{ invActiveCat = chip.dataset.cat; invRenderProducts(); invRenderCatStrip(); });
  });
}

// --- Lista de productos -----------------------------------------------------
function invFilteredProducts(){
  const q = invNorm(document.getElementById('invSearch').value);
  const sort = document.getElementById('invSort').value;
  let list = invProducts.slice();

  if(invActiveCat === '__none') list = list.filter(p => !invCategories.some(c=>c.id===p.catId));
  else if(invActiveCat) list = list.filter(p => p.catId === invActiveCat);

  if(q) list = list.filter(p => invNorm(p.name).includes(q) || invNorm(p.note).includes(q) || invNorm(p.unit).includes(q));

  const byName = (a,b)=> invNorm(a.name).localeCompare(invNorm(b.name));
  switch(sort){
    case 'qty-asc':    list.sort((a,b)=> (a.qty-b.qty) || byName(a,b)); break;
    case 'qty-desc':   list.sort((a,b)=> (b.qty-a.qty) || byName(a,b)); break;
    case 'price-asc':  list.sort((a,b)=> ((a.price||0)-(b.price||0)) || byName(a,b)); break;
    case 'price-desc': list.sort((a,b)=> ((b.price||0)-(a.price||0)) || byName(a,b)); break;
    case 'date':       list.sort((a,b)=> String(b.created||'').localeCompare(String(a.created||''))); break;
    case 'fav':        list.sort((a,b)=> (b.fav?1:0)-(a.fav?1:0) || byName(a,b)); break;
    default:           list.sort(byName);
  }
  return list;
}

function invRenderProducts(){
  const el = document.getElementById('invList');
  const list = invFilteredProducts();
  if(!list.length){
    const q = document.getElementById('invSearch').value.trim();
    el.innerHTML = `<div class="empty">${q ? 'Ningún producto coincide con la búsqueda.' : 'Todavía no hay productos. Toca "Agregar producto".'}</div>`;
    return;
  }
  el.innerHTML = list.map(p=>{
    const out = invIsOut(p), low = invIsLow(p);
    const estado = out ? '<span class="inv-flag out">Agotado</span>'
                 : low ? '<span class="inv-flag low">Poco inventario</span>' : '';
    const precio = Number(p.price) > 0 ? `<span class="inv-price">${fmt(p.price)}</span>` : '';
    const nota = p.note ? `<div class="inv-note">${escapeHtml(p.note)}</div>` : '';
    const qtyTxt = (Math.round(Number(p.qty)*100)/100);
    return `<div class="inv-row${out?' is-out':''}" data-id="${p.id}">
      <div class="swipe-actions left">
        <button type="button" class="inv-act restock" data-act="restock" data-id="${p.id}">Reabastecer</button>
        <button type="button" class="inv-act edit" data-act="edit" data-id="${p.id}">Editar</button>
      </div>
      <div class="swipe-actions right">
        <button type="button" class="inv-act consume" data-act="consume" data-id="${p.id}">Consumir</button>
        <button type="button" class="inv-act delete" data-act="delete" data-id="${p.id}">Eliminar</button>
      </div>
      <div class="swipe-content">
        <div class="inv-main">
          ${getIcon(p.name, p.icon)}
          <div class="inv-info">
            <div class="inv-name">${escapeHtml(p.name)}${p.fav ? ' <span class="inv-fav">★</span>' : ''}</div>
            <div class="inv-meta">${qtyTxt} ${escapeHtml(p.unit || 'Unidad')} ${precio} ${estado}</div>
            ${nota}
          </div>
        </div>
        <div class="inv-qty-controls">
          <button type="button" class="inv-qty-btn" data-step="-1" data-id="${p.id}" aria-label="Quitar uno de ${escapeHtml(p.name)}">−</button>
          <span class="inv-qty-value">${qtyTxt}</span>
          <button type="button" class="inv-qty-btn" data-step="1" data-id="${p.id}" aria-label="Agregar uno a ${escapeHtml(p.name)}">+</button>
        </div>
      </div>
    </div>`;
  }).join('');

  el.querySelectorAll('.inv-qty-btn').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      invChangeQty(btn.dataset.id, parseFloat(btn.dataset.step));
    });
  });
  el.querySelectorAll('.inv-act').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      invRowAction(btn.dataset.act, btn.dataset.id);
    });
  });
  el.querySelectorAll('.inv-main').forEach(main=>{
    main.addEventListener('click', ()=>{
      const row = main.closest('.inv-row');
      const content = row.querySelector('.swipe-content');
      if(content && content.dataset.open === '1'){ // si está deslizada, primero cerrar
        content.dataset.open = '0';
        content.style.transform = 'translateX(0px)';
        row.classList.remove('swiped');
        return;
      }
      invOpenProductModal(row.dataset.id);
    });
  });
}

// --- Cantidad: nunca negativa ----------------------------------------------
async function invChangeQty(id, step){
  const p = invProducts.find(x=>x.id===id);
  if(!p) return;
  const before = Number(p.qty) || 0;
  const min = invMinOf(p);
  const after = Math.max(0, Math.round((before + step) * 100) / 100);  // nunca negativo
  if(after === before) return;
  p.qty = after;
  p.modified = invNow();
  await invSaveProducts();
  invRenderProducts();
  invRenderDashboard();
  const row = document.querySelector(`.inv-row[data-id="${id}"]`);
  if(row) playRowConfirm(row);

  // Lista automática de compras: solo al CRUZAR el umbral hacia abajo y si
  // no está ya en la lista, para no preguntar una y otra vez.
  const cruzoUmbral = before > min && after <= min;
  const yaEnLista = invShopping.some(s => s.productId === id && !s.done);
  if(invSettings.askShopping && cruzoUmbral && !yaEnLista){
    const motivo = after <= 0 ? 'se agotó' : 'está en poco inventario';
    showConfirm(`"${p.name}" ${motivo}. ¿Agregarlo a la lista de compras?`, async ()=>{
      await invAddToShopping(p);
    });
  }
}

async function invRowAction(act, id){
  const p = invProducts.find(x=>x.id===id);
  if(!p) return;
  if(invSwipe) invSwipe.closeAll();
  if(act === 'consume') return invChangeQty(id, -1);
  if(act === 'restock') return invChangeQty(id, 1);
  if(act === 'edit')    return invOpenProductModal(id);
  if(act === 'delete'){
    showConfirm(`¿Eliminar "${p.name}" del inventario?`, async ()=>{
      const row = document.querySelector(`.inv-row[data-id="${id}"]`);
      playRowDeleteOut(row, async ()=>{
        invProducts = invProducts.filter(x=>x.id!==id);
        await invSaveProducts();
        invRenderAll();
      });
    });
  }
}

// --- Modal de producto ------------------------------------------------------
function invFillCatSelect(sel, catId){
  sel.innerHTML = invCategories.map(c=>`<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('')
    + `<option value="">Sin categoría</option>`;
  sel.value = invCategories.some(c=>c.id===catId) ? catId : '';
}
function invFillUnitSelect(sel, unit){
  sel.innerHTML = invUnits.map(u=>`<option value="${escapeHtml(u)}">${escapeHtml(u)}</option>`).join('')
    + `<option value="__new">+ Nueva unidad…</option>`;
  sel.value = invUnits.includes(unit) ? unit : (invUnits[0] || 'Unidad');
}

function invOpenProductModal(id){
  const p = id ? invProducts.find(x=>x.id===id) : null;
  invEditingId = p ? p.id : null;
  invEditingIconOverride = p ? (p.icon || null) : null;
  invEditingFav = p ? !!p.fav : false;

  document.getElementById('invProductModalTitle').textContent = p ? p.name : 'Nuevo producto';
  document.getElementById('invProductIconPreview').innerHTML = getIcon(p ? p.name : 'Producto', invEditingIconOverride);
  document.getElementById('invProductIconPicker').style.display = 'none';
  document.getElementById('invProductName').value  = p ? p.name : '';
  document.getElementById('invProductQty').value   = p ? p.qty : '';
  document.getElementById('invProductPrice').value = p && Number(p.price) ? p.price : '';
  document.getElementById('invProductMin').value   = (p && p.min !== null && p.min !== undefined && p.min !== '') ? p.min : '';
  document.getElementById('invProductNote').value  = p ? (p.note || '') : '';
  invFillCatSelect(document.getElementById('invProductCat'), p ? p.catId : (invActiveCat && invActiveCat !== '__none' ? invActiveCat : (invCategories[0] ? invCategories[0].id : '')));
  invFillUnitSelect(document.getElementById('invProductUnit'), p ? p.unit : 'Unidad');
  invUpdateFavBtn();

  const meta = document.getElementById('invProductMeta');
  if(p && p.created){
    const f = (iso)=>{ const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleDateString('es-ES',{day:'numeric',month:'short',year:'numeric'}); };
    meta.textContent = `Creado: ${f(p.created)} · Modificado: ${f(p.modified || p.created)}`;
    meta.style.display = '';
  } else {
    meta.textContent = '';
    meta.style.display = 'none';
  }
  // Duplicar y eliminar solo tienen sentido sobre un producto que ya existe.
  document.getElementById('invProductDuplicateBtn').style.display = p ? '' : 'none';
  document.getElementById('invProductDeleteBtn').style.display = p ? '' : 'none';
  document.getElementById('invProductModalBackdrop').classList.add('open');
}

function invCloseProductModal(){
  document.getElementById('invProductModalBackdrop').classList.remove('open');
  document.getElementById('invProductIconPicker').style.display = 'none';
  invEditingId = null;
}

function invUpdateFavBtn(){
  const btn = document.getElementById('invProductFavBtn');
  btn.textContent = invEditingFav ? '★' : '☆';
  btn.classList.toggle('active', invEditingFav);
}

async function invSaveProductFromModal(){
  const name = document.getElementById('invProductName').value.trim();
  if(!name){ showAlert('El producto necesita un nombre.'); return; }
  const qty = Math.max(0, parseFloat(document.getElementById('invProductQty').value) || 0);
  const price = Math.max(0, parseFloat(document.getElementById('invProductPrice').value) || 0);
  const minRaw = document.getElementById('invProductMin').value;
  const min = minRaw === '' ? null : Math.max(0, parseInt(minRaw, 10) || 0);
  const note = document.getElementById('invProductNote').value.trim();
  const catId = document.getElementById('invProductCat').value;
  const unit = document.getElementById('invProductUnit').value;

  let p = invEditingId ? invProducts.find(x=>x.id===invEditingId) : null;
  const isNew = !p;
  if(isNew){
    p = { id: invId(), created: invNow() };
    invProducts.push(p);
  }
  p.name = name; p.qty = qty; p.price = price; p.min = min;
  p.note = note; p.catId = catId; p.unit = unit;
  p.icon = invEditingIconOverride || p.icon || null;
  p.fav = invEditingFav;
  p.modified = invNow();

  await invSaveProducts();
  invCloseProductModal();
  invRenderAll();
  const row = document.querySelector(`.inv-row[data-id="${p.id}"]`);
  if(row) isNew ? playRowAddIn(row) : playRowConfirm(row);
}

// --- Categorías: crear, renombrar, ícono, eliminar, reordenar ---------------
function invRenderCatManage(){
  const el = document.getElementById('invCatManageList');
  if(!invCategories.length){
    el.innerHTML = '<div class="empty">Aún no hay categorías.</div>';
    return;
  }
  el.innerHTML = invCategories.map(c=>{
    const n = invProducts.filter(p=>p.catId===c.id).length;
    return `<div class="menu-row" data-id="${escapeHtml(c.id)}">
      <span class="drag-handle" aria-label="Reordenar ${escapeHtml(c.name)}">⠿</span>
      <div class="menu-row-main">
        ${getIcon(c.name, c.icon)}
        <span class="menu-row-label">${escapeHtml(c.name)}</span>
        <span class="inv-cat-count">${n}</span>
      </div>
      <button type="button" class="menu-icon-btn" data-act="icon" data-id="${escapeHtml(c.id)}" title="Ícono" aria-label="Cambiar ícono">🎨</button>
      <button type="button" class="menu-icon-btn" data-act="rename" data-id="${escapeHtml(c.id)}" title="Renombrar" aria-label="Renombrar">&#9998;</button>
      <button type="button" class="menu-icon-btn" data-act="del" data-id="${escapeHtml(c.id)}" title="Eliminar" aria-label="Eliminar">🗑</button>
    </div>`;
  }).join('');

  el.querySelectorAll('.menu-icon-btn').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      invCatAction(btn.dataset.act, btn.dataset.id, btn.closest('.menu-row'));
    });
  });
}

function invCatAction(act, id, row){
  const cat = invCategories.find(c=>c.id===id);
  if(!cat) return;

  if(act === 'rename'){
    const label = row.querySelector('.menu-row-label');
    label.outerHTML = `<input type="text" class="menu-add-input" id="invCatRenameInput" value="${escapeHtml(cat.name)}">`;
    const input = document.getElementById('invCatRenameInput');
    input.focus(); input.select();
    let done = false;
    const commit = async ()=>{
      if(done) return; done = true;
      const val = input.value.trim();
      if(val && val !== cat.name){
        cat.name = val;
        await invSaveCategories();
      }
      invRenderCatManage();
      invRenderCatStrip();
      const r = document.querySelector(`#invCatManageList .menu-row[data-id="${id}"]`);
      if(r) playRowConfirm(r);
    };
    input.addEventListener('keydown', ev=>{
      if(ev.key === 'Enter'){ ev.preventDefault(); commit(); }
      if(ev.key === 'Escape'){ done = true; invRenderCatManage(); }
    });
    input.addEventListener('blur', commit);
    return;
  }

  if(act === 'icon'){
    const existing = row.nextElementSibling;
    if(existing && existing.classList.contains('icon-picker-panel')){ existing.remove(); return; }
    document.querySelectorAll('#invCatManageList .icon-picker-panel').forEach(p=>p.remove());
    const panel = document.createElement('div');
    panel.className = 'icon-picker-panel';
    panel.innerHTML = buildIconPickerHTML(cat.icon || '');
    row.insertAdjacentElement('afterend', panel);
    wireIconPicker(panel);
    panel.querySelectorAll('.icon-swatch').forEach(sw=>{
      sw.addEventListener('click', async ()=>{
        cat.icon = sw.dataset.icon;
        await invSaveCategories();
        invRenderCatManage();
        invRenderCatStrip();
        const r = document.querySelector(`#invCatManageList .menu-row[data-id="${id}"]`);
        if(r) playRowConfirm(r);
      });
    });
    return;
  }

  if(act === 'del'){
    const n = invProducts.filter(p=>p.catId===id).length;
    const msg = n
      ? `¿Eliminar la categoría "${cat.name}"? Sus ${n} producto(s) quedarán sin categoría (no se borran).`
      : `¿Eliminar la categoría "${cat.name}"?`;
    showConfirm(msg, async ()=>{
      playRowDeleteOut(row, async ()=>{
        invCategories = invCategories.filter(c=>c.id!==id);
        // Los productos NO se borran: pasan a "Sin categoría".
        invProducts.forEach(p=>{ if(p.catId === id) p.catId = ''; });
        if(invActiveCat === id) invActiveCat = '';
        await invSaveCategories();
        await invSaveProducts();
        invRenderCatManage();
        invRenderAll();
      });
    });
  }
}

// --- Lista de compras -------------------------------------------------------
async function invAddToShopping(p){
  if(invShopping.some(s => s.productId === p.id && !s.done)) return;
  invShopping.push({
    id: invId(), productId: p.id, name: p.name,
    qty: Math.max(1, invMinOf(p) || 1), unit: p.unit || 'Unidad',
    done: false, addedAt: invNow()
  });
  await invSaveShopping();
  invRenderShopBadge();
  if(invView === 'compras') invRenderShopping();
}

function invRenderShopBadge(){
  const pend = invShopping.filter(s=>!s.done).length;
  const badge = document.getElementById('invShopBadge');
  badge.textContent = pend;
  badge.classList.toggle('empty', pend === 0);
}

function invRenderShopping(){
  const el = document.getElementById('invShopList');
  const hint = document.getElementById('invShopHint');
  const pend = invShopping.filter(s=>!s.done).length;
  hint.textContent = invShopping.length
    ? `${pend} por comprar · marca un producto para devolverlo al inventario.`
    : '';
  if(!invShopping.length){
    el.innerHTML = '<div class="empty">La lista de compras está vacía. Se llena sola cuando un producto se agota.</div>';
    return;
  }
  const list = invShopping.slice().sort((a,b)=> (a.done?1:0)-(b.done?1:0));
  el.innerHTML = list.map(s=>`
    <div class="inv-shop-row${s.done?' done':''}" data-id="${s.id}">
      <button type="button" class="inv-check" data-id="${s.id}" aria-label="Marcar ${escapeHtml(s.name)} como comprado">${s.done ? '✓' : ''}</button>
      <div class="inv-shop-info">
        <div class="inv-name">${escapeHtml(s.name)}</div>
        <div class="inv-meta">${s.qty} ${escapeHtml(s.unit)}</div>
      </div>
      <div class="inv-qty-controls">
        <button type="button" class="inv-qty-btn" data-shop-step="-1" data-id="${s.id}" aria-label="Menos">−</button>
        <span class="inv-qty-value">${s.qty}</span>
        <button type="button" class="inv-qty-btn" data-shop-step="1" data-id="${s.id}" aria-label="Más">+</button>
      </div>
      <button type="button" class="menu-icon-btn" data-shop-del="${s.id}" title="Quitar" aria-label="Quitar de la lista">🗑</button>
    </div>`).join('');

  el.querySelectorAll('.inv-check').forEach(btn=>{
    btn.addEventListener('click', ()=> invToggleShopDone(btn.dataset.id));
  });
  el.querySelectorAll('[data-shop-step]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const s = invShopping.find(x=>x.id===btn.dataset.id);
      if(!s) return;
      s.qty = Math.max(1, s.qty + parseInt(btn.dataset.shopStep,10));
      await invSaveShopping();
      invRenderShopping();
    });
  });
  el.querySelectorAll('[data-shop-del]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      invShopping = invShopping.filter(x=>x.id!==btn.dataset.shopDel);
      await invSaveShopping();
      invRenderShopping();
      invRenderShopBadge();
    });
  });
}

// Marcar como comprado devuelve la cantidad al inventario (una sola vez).
async function invToggleShopDone(id){
  const s = invShopping.find(x=>x.id===id);
  if(!s) return;
  s.done = !s.done;
  const p = invProducts.find(x=>x.id===s.productId);
  if(p){
    const delta = s.done ? s.qty : -s.qty;
    p.qty = Math.max(0, (Number(p.qty)||0) + delta);
    p.modified = invNow();
    await invSaveProducts();
  }
  await invSaveShopping();
  invRenderShopping();
  invRenderShopBadge();
  invRenderDashboard();
  if(invView === 'productos') invRenderProducts();
}

// --- CSV: exportar e importar (extensión ya funcional) ----------------------
const INV_CSV_HEADER = ['Nombre','Categoria','Cantidad','Unidad','Precio','Minimo','Nota','Favorito'];

function invExportCSV(){
  const rows = invProducts.map(p=>{
    const cat = invCategories.find(c=>c.id===p.catId);
    return [p.name, cat ? cat.name : '', p.qty, p.unit || 'Unidad', p.price || 0,
            (p.min === null || p.min === undefined) ? '' : p.min, p.note || '', p.fav ? 'si' : 'no'];
  });
  const csv = [INV_CSV_HEADER, ...rows].map(r=> r.map(csvEscape).join(',')).join('\n');
  downloadFile(`TOM_inventario_${todayStr()}.csv`, csv, 'text/csv');
}

// Divide una línea CSV respetando las comillas dobles.
function invParseCSVLine(line){
  const out = []; let cur = ''; let inQ = false;
  for(let i=0;i<line.length;i++){
    const ch = line[i];
    if(inQ){
      if(ch === '"'){
        if(line[i+1] === '"'){ cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else {
      if(ch === '"') inQ = true;
      else if(ch === ','){ out.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

async function invImportCSV(text){
  const lines = String(text).split(/\r?\n/).filter(l => l.trim() !== '');
  if(!lines.length){ showAlert('El archivo está vacío.'); return; }
  // Se salta la cabecera si la primera celda dice "nombre".
  const first = invParseCSVLine(lines[0]);
  const start = invNorm(first[0]) === 'nombre' ? 1 : 0;

  let creados = 0, actualizados = 0;
  for(let i = start; i < lines.length; i++){
    const c = invParseCSVLine(lines[i]);
    const name = (c[0] || '').trim();
    if(!name) continue;
    const catName = (c[1] || '').trim();
    let catId = '';
    if(catName){
      let cat = invCategories.find(x => invNorm(x.name) === invNorm(catName));
      if(!cat){
        cat = { id:'cat-'+invId(), name:catName, icon:'tag|text-dim' };
        invCategories.push(cat);
      }
      catId = cat.id;
    }
    const unit = (c[3] || 'Unidad').trim() || 'Unidad';
    if(!invUnits.includes(unit)) invUnits.push(unit);

    const existing = invProducts.find(p => invNorm(p.name) === invNorm(name) && p.catId === catId);
    const qty = Math.max(0, parseFloat(c[2]) || 0);
    const price = Math.max(0, parseFloat(c[4]) || 0);
    const minRaw = (c[5] || '').trim();
    const min = minRaw === '' ? null : Math.max(0, parseInt(minRaw,10) || 0);
    const note = (c[6] || '').trim();
    const fav = /^(si|sí|yes|true|1)$/i.test((c[7] || '').trim());

    if(existing){
      existing.qty = qty; existing.unit = unit; existing.price = price;
      existing.min = min; existing.note = note; existing.fav = fav;
      existing.modified = invNow();
      actualizados++;
    } else {
      invProducts.push({ id: invId(), name, catId, qty, unit, price, min, note, fav,
                         icon:null, created: invNow(), modified: invNow() });
      creados++;
    }
  }
  await invSaveCategories();
  await invSaveUnits();
  await invSaveProducts();
  invRenderAll();
  showAlert(`Importación lista: ${creados} producto(s) nuevo(s) y ${actualizados} actualizado(s).`);
}

// Punto de extensión para código de barras. Basta con que alguien haga
// InventoryScanner.register(fn) — por ejemplo un puente nativo de Android —
// y el botón de escanear aparecerá donde se llame a InventoryScanner.scan().
const InventoryScanner = {
  _provider: null,
  register(fn){ this._provider = fn; },
  isAvailable(){ return typeof this._provider === 'function'; },
  async scan(){
    if(!this._provider) throw new Error('No hay lector de códigos de barras configurado.');
    return await this._provider();
  },
  // Busca un producto por código guardado en su nota o por nombre.
  findByCode(code){
    const c = invNorm(code);
    return invProducts.find(p => invNorm(p.barcode || '') === c || invNorm(p.name) === c) || null;
  }
};

// --- Render global ----------------------------------------------------------
function invRenderAll(){
  invRenderDashboard();
  invRenderCatStrip();
  invRenderProducts();
  invRenderShopBadge();
  if(invView === 'compras') invRenderShopping();
}

function invSetView(view){
  invView = view;
  document.getElementById('invTabProductos').classList.toggle('active', view === 'productos');
  document.getElementById('invTabCompras').classList.toggle('active', view === 'compras');
  document.getElementById('invProductosView').style.display = view === 'productos' ? '' : 'none';
  document.getElementById('invComprasView').style.display = view === 'compras' ? '' : 'none';
  if(view === 'compras') invRenderShopping();
  else invRenderProducts();
}

// --- Cableado ---------------------------------------------------------------
function invWire(){
  document.getElementById('invTabProductos').addEventListener('click', ()=> invSetView('productos'));
  document.getElementById('invTabCompras').addEventListener('click', ()=> invSetView('compras'));
  document.getElementById('invSearch').addEventListener('input', invRenderProducts);
  document.getElementById('invSort').addEventListener('change', invRenderProducts);
  document.getElementById('invAddBtn').addEventListener('click', ()=> invOpenProductModal(null));

  // Deslizar filas para revelar acciones
  invSwipe = attachSwipeActions(document.getElementById('invList'), '.inv-row', { openWidth: 148 });

  // --- Modal de producto ---
  bindModalClose(document.getElementById('invProductModalBackdrop'), invCloseProductModal,
    document.getElementById('invProductModalClose'), document.getElementById('invProductCancel'));
  document.getElementById('invProductSave').addEventListener('click', invSaveProductFromModal);

  document.getElementById('invProductFavBtn').addEventListener('click', ()=>{
    invEditingFav = !invEditingFav;
    invUpdateFavBtn();
  });

  document.getElementById('invProductIconBtn').addEventListener('click', (e)=>{
    e.stopPropagation();
    const picker = document.getElementById('invProductIconPicker');
    if(picker.style.display !== 'none'){ picker.style.display = 'none'; return; }
    picker.innerHTML = buildIconPickerHTML(invEditingIconOverride || '');
    picker.style.display = '';
    wireIconPicker(picker);
    picker.querySelectorAll('.icon-swatch').forEach(sw=>{
      sw.addEventListener('click', ()=>{
        invEditingIconOverride = sw.dataset.icon;
        const nombre = document.getElementById('invProductName').value.trim() || 'Producto';
        document.getElementById('invProductIconPreview').innerHTML = getIcon(nombre, invEditingIconOverride);
        picker.style.display = 'none';
      });
    });
  });

  document.getElementById('invProductDeleteBtn').addEventListener('click', ()=>{
    const id = invEditingId;
    const p = invProducts.find(x=>x.id===id);
    if(!p) return;
    showConfirm(`¿Eliminar "${p.name}" del inventario?`, async ()=>{
      invCloseProductModal();
      invProducts = invProducts.filter(x=>x.id!==id);
      await invSaveProducts();
      invRenderAll();
    });
  });

  document.getElementById('invProductDuplicateBtn').addEventListener('click', async ()=>{
    const p = invProducts.find(x=>x.id===invEditingId);
    if(!p) return;
    const copia = Object.assign({}, p, {
      id: invId(), name: p.name + ' (copia)', created: invNow(), modified: invNow()
    });
    invProducts.push(copia);
    await invSaveProducts();
    invCloseProductModal();
    invRenderAll();
    const row = document.querySelector(`.inv-row[data-id="${copia.id}"]`);
    if(row) playRowAddIn(row);
  });

  // Unidad: crear una nueva sin salir del formulario
  document.getElementById('invProductUnit').addEventListener('change', async (e)=>{
    if(e.target.value !== '__new') return;
    const sel = e.target;
    const wrap = sel.parentElement;
    const prev = invUnits[0] || 'Unidad';
    sel.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'menu-add-input';
    input.placeholder = 'Nueva unidad…';
    wrap.appendChild(input);
    input.focus();
    let done = false;
    const commit = async ()=>{
      if(done) return; done = true;
      const val = input.value.trim();
      input.remove();
      sel.style.display = '';
      if(val && !invUnits.includes(val)){
        invUnits.push(val);
        await invSaveUnits();
      }
      invFillUnitSelect(sel, val || prev);
    };
    input.addEventListener('keydown', ev=>{
      if(ev.key === 'Enter'){ ev.preventDefault(); commit(); }
      if(ev.key === 'Escape'){ done = true; input.remove(); sel.style.display=''; invFillUnitSelect(sel, prev); }
    });
    input.addEventListener('blur', commit);
  });

  // --- Modal de categorías ---
  document.getElementById('invManageCatsBtn').addEventListener('click', ()=>{
    invRenderCatManage();
    document.getElementById('invCatModalBackdrop').classList.add('open');
  });
  bindModalClose(document.getElementById('invCatModalBackdrop'),
    ()=> document.getElementById('invCatModalBackdrop').classList.remove('open'),
    document.getElementById('invCatModalClose'));

  document.getElementById('invCatAddRow').addEventListener('click', ()=>{
    const row = document.getElementById('invCatAddRow');
    row.innerHTML = `<div style="flex:1; min-width:0;">
      <input type="text" class="menu-add-input" id="invCatAddInput" placeholder="Nueva categoría…">
      ${buildIconPickerHTML('')}
      <div class="debt-modal-actions" style="margin-top:10px;">
        <button type="button" class="btn-secondary" id="invCatAddCancel">Cancelar</button>
        <button type="button" id="invCatAddConfirm">Guardar</button>
      </div>
    </div>`;
    const input = document.getElementById('invCatAddInput');
    input.focus();
    wireIconPicker(row);
    const reset = ()=>{ row.innerHTML = '+ Agregar categoría'; };
    const commit = async ()=>{
      const val = input.value.trim();
      if(val){
        const chosen = row.querySelector('.icon-swatch.active');
        invCategories.push({ id:'cat-'+invId(), name:val, icon: chosen ? chosen.dataset.icon : 'tag|text-dim' });
        await invSaveCategories();
      }
      reset();
      invRenderCatManage();
      invRenderCatStrip();
    };
    input.addEventListener('keydown', ev=>{
      if(ev.key === 'Enter'){ ev.preventDefault(); commit(); }
      if(ev.key === 'Escape'){ reset(); }
    });
    document.getElementById('invCatAddConfirm').addEventListener('click', commit);
    document.getElementById('invCatAddCancel').addEventListener('click', reset);
  });

  // Reordenar categorías arrastrando (mismo componente que el resto de la app)
  attachDragReorder(document.getElementById('invCatManageList'), '.menu-row', '.drag-handle', async ()=>{
    const order = [...document.getElementById('invCatManageList').querySelectorAll('.menu-row')].map(r=>r.dataset.id);
    invCategories.sort((a,b)=> order.indexOf(a.id) - order.indexOf(b.id));
    await invSaveCategories();
    invRenderCatStrip();
  });

  // --- Mover producto a otra categoría ---
  bindModalClose(document.getElementById('invMoveModalBackdrop'),
    ()=> document.getElementById('invMoveModalBackdrop').classList.remove('open'),
    document.getElementById('invMoveModalClose'));

  // --- Lista de compras ---
  document.getElementById('invShopAddBtn').addEventListener('click', ()=>{
    const candidatos = invProducts.filter(p => !invShopping.some(s=>s.productId===p.id && !s.done));
    if(!candidatos.length){ showAlert('Todos los productos ya están en la lista o no hay productos.'); return; }
    invMovingId = null;
    const list = document.getElementById('invMoveList');
    document.querySelector('#invMoveModalBackdrop .modal-header span').textContent = 'Agregar a la lista';
    list.innerHTML = candidatos.map(p=>`
      <button type="button" class="inv-move-opt" data-id="${p.id}">
        ${getIcon(p.name, p.icon)}<span>${escapeHtml(p.name)}</span>
      </button>`).join('');
    list.querySelectorAll('.inv-move-opt').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const p = invProducts.find(x=>x.id===btn.dataset.id);
        if(p) await invAddToShopping(p);
        document.getElementById('invMoveModalBackdrop').classList.remove('open');
        invRenderShopping();
      });
    });
    document.getElementById('invMoveModalBackdrop').classList.add('open');
  });

  document.getElementById('invShopClearBtn').addEventListener('click', ()=>{
    const comprados = invShopping.filter(s=>s.done).length;
    if(!comprados){ showAlert('No hay productos marcados como comprados.'); return; }
    showConfirm(`¿Quitar ${comprados} producto(s) ya comprado(s) de la lista?`, async ()=>{
      invShopping = invShopping.filter(s=>!s.done);
      await invSaveShopping();
      invRenderShopping();
      invRenderShopBadge();
    });
  });

  // --- CSV ---
  document.getElementById('invExportBtn').addEventListener('click', invExportCSV);
  document.getElementById('invImportBtn').addEventListener('click', ()=> document.getElementById('invImportFile').click());
  document.getElementById('invImportFile').addEventListener('change', (e)=>{
    const file = e.target.files[0];
    e.target.value = '';
    if(!file) return;
    const reader = new FileReader();
    reader.onload = ()=> invImportCSV(reader.result);
    reader.onerror = ()=> showAlert('No pude leer el archivo.');
    reader.readAsText(file);
  });

  // --- Ajustes ---
  document.getElementById('invSettingsBtn').addEventListener('click', ()=>{
    document.getElementById('invSettingLowStock').value = invSettings.lowStock;
    document.getElementById('invSettingAskShopping').checked = !!invSettings.askShopping;
    document.getElementById('invSettingsModalBackdrop').classList.add('open');
  });
  bindModalClose(document.getElementById('invSettingsModalBackdrop'),
    ()=> document.getElementById('invSettingsModalBackdrop').classList.remove('open'),
    document.getElementById('invSettingsModalClose'), document.getElementById('invSettingsCancel'));
  document.getElementById('invSettingsSave').addEventListener('click', async ()=>{
    invSettings.lowStock = Math.max(0, parseInt(document.getElementById('invSettingLowStock').value,10) || 0);
    invSettings.askShopping = document.getElementById('invSettingAskShopping').checked;
    await invSaveSettings();
    document.getElementById('invSettingsModalBackdrop').classList.remove('open');
    invRenderAll();
  });

  // --- Voz: mismo motor conversacional, solo se registra el esquema ---
  if(typeof VoiceForms !== 'undefined'){
    VoiceForms.register('producto', {
      title: 'Agregar producto por voz',
      hint: 'Di el producto, la cantidad y la nota. Ejemplo: "Arroz cinco kilos marca preferida".',
      fields: [
        { key:'item', label:'Producto', type:'choice', required:true, article:'el',
          aliases:['producto','item','ítem','nombre','articulo','artículo'],
          choices: ()=> invProducts.map(p=>p.name) },
        { key:'amount', label:'Cantidad', type:'number', required:true, article:'la',
          aliases:['cantidad','monto','unidades','numero','número'],
          format: (v)=> String(v) },
        { key:'note', label:'Nota', type:'text', required:false, article:'la',
          aliases:['nota','observacion','observación','comentario','detalle'] }
      ],
      async onAccept(values){
        const existente = invProducts.find(p => invNorm(p.name) === invNorm(values.item));
        if(existente){
          existente.qty = Math.max(0, (Number(existente.qty)||0) + values.amount);
          if(values.note) existente.note = values.note;
          existente.modified = invNow();
        } else {
          invProducts.push({
            id: invId(), name: values.item,
            catId: (invActiveCat && invActiveCat !== '__none') ? invActiveCat : (invCategories[0] ? invCategories[0].id : ''),
            qty: values.amount, unit: 'Unidad', price: 0, min: null,
            note: values.note || '', fav:false, icon:null,
            created: invNow(), modified: invNow()
          });
        }
        await invSaveProducts();
        invRenderAll();
      }
    });
  }
}

// --- Arranque ---------------------------------------------------------------
async function initInventory(){
  invWire();
  await invLoad();
  invRenderAll();
}

initInventory();

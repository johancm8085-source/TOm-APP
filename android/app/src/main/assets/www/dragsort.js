// --- Reordenar por arrastre: utilidad genérica reutilizada por CUALQUIER
// lista editable de la app (Lista de TOM/ingresos, pendientes de Luna). ---
// Solo se activa desde un "asa" (drag-handle) dedicada dentro de cada fila,
// para no interferir con el toque normal de la fila (seleccionar / abrir).
// Usa Pointer Events (mouse + touch unificados) y solo mueve la fila con
// `transform: translateY()` mientras se arrastra — el resto del layout no
// se recalcula hasta que la fila cruza a la anterior/siguiente.
function attachDragReorder(containerEl, rowSelector, handleSelector, onReorder){
  let dragEl = null, startClientY = 0, pointerId = null;

  function rowsOf(){ return [...containerEl.querySelectorAll(rowSelector)]; }

  function onMove(e){
    if(!dragEl || e.pointerId !== pointerId) return;
    e.preventDefault();
    const dy = e.clientY - startClientY;
    dragEl.style.transform = `translateY(${dy}px)`;

    const rows = rowsOf();
    const idx = rows.indexOf(dragEl);
    const prev = rows[idx - 1];
    const next = rows[idx + 1];

    if(prev){
      const r = prev.getBoundingClientRect();
      if(e.clientY < r.top + r.height / 2){
        containerEl.insertBefore(dragEl, prev);
        startClientY = e.clientY;
        dragEl.style.transform = 'translateY(0px)';
        return;
      }
    }
    if(next){
      const r = next.getBoundingClientRect();
      if(e.clientY > r.top + r.height / 2){
        containerEl.insertBefore(dragEl, next.nextSibling);
        startClientY = e.clientY;
        dragEl.style.transform = 'translateY(0px)';
      }
    }
  }

  function endDrag(e){
    if(!dragEl || (pointerId !== null && e.pointerId !== pointerId)) return;
    dragEl.classList.remove('dragging');
    dragEl.style.transform = '';
    try{ dragEl.releasePointerCapture(pointerId); }catch(err){}
    const moved = dragEl;
    dragEl = null; pointerId = null;
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', endDrag);
    document.removeEventListener('pointercancel', endDrag);
    if(moved) onReorder();
  }

  containerEl.addEventListener('pointerdown', (e)=>{
    const handle = e.target.closest(handleSelector);
    if(!handle) return;
    const row = handle.closest(rowSelector);
    if(!row) return;
    e.preventDefault();
    dragEl = row;
    pointerId = e.pointerId;
    startClientY = e.clientY;
    dragEl.classList.add('dragging');
    try{ dragEl.setPointerCapture(pointerId); }catch(err){}
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', endDrag);
    document.addEventListener('pointercancel', endDrag);
  });
}

// --- Deslizar una fila para revelar acciones ---------------------------------
// Reutilizable por cualquier lista. Cada fila debe tener dentro:
//   .swipe-actions.left   -> se ve al deslizar hacia la DERECHA
//   .swipe-actions.right  -> se ve al deslizar hacia la IZQUIERDA
//   .swipe-content        -> lo que se mueve
// Solo se mueve con `transform`, y el gesto no se activa hasta saber que es
// horizontal, para no robarle el scroll vertical a la página.
function attachSwipeActions(containerEl, rowSelector, opts){
  const openWidth = (opts && opts.openWidth) || 148;
  let row = null, content = null, startX = 0, startY = 0;
  let axis = null, pointerId = null, baseOffset = 0;

  function contentOf(r){ return r.querySelector('.swipe-content'); }

  function closeAll(except){
    containerEl.querySelectorAll(rowSelector).forEach(r=>{
      if(r === except) return;
      const c = contentOf(r);
      if(c && c.dataset.open === '1'){
        c.dataset.open = '0';
        c.style.transform = 'translateX(0px)';
        r.classList.remove('swiped');
      }
    });
  }

  function onMove(e){
    if(!row || e.pointerId !== pointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if(axis === null){
      if(Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if(axis === 'y'){ finish(); return; }   // es scroll: no interferir
      row.classList.add('swiping');
    }
    if(axis !== 'x') return;
    e.preventDefault();
    let next = baseOffset + dx;
    // Solo se permite abrir hasta el ancho de las acciones, con freno suave.
    if(next > openWidth) next = openWidth + (next - openWidth) * 0.25;
    if(next < -openWidth) next = -openWidth + (next + openWidth) * 0.25;
    content.style.transform = 'translateX(' + next + 'px)';
  }

  function finish(e){
    if(!row) return;
    const c = content, r = row;
    if(axis === 'x'){
      const m = /translateX\((-?[\d.]+)px\)/.exec(c.style.transform || '');
      const cur = m ? parseFloat(m[1]) : 0;
      let target = 0;
      if(cur <= -openWidth * 0.45) target = -openWidth;
      else if(cur >= openWidth * 0.45) target = openWidth;
      c.style.transform = 'translateX(' + target + 'px)';
      c.dataset.open = target === 0 ? '0' : '1';
      r.classList.toggle('swiped', target !== 0);
      if(target !== 0) closeAll(r);
    }
    r.classList.remove('swiping');
    try{ r.releasePointerCapture(pointerId); }catch(err){}
    row = null; content = null; axis = null; pointerId = null;
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', finish);
    document.removeEventListener('pointercancel', finish);
  }

  containerEl.addEventListener('pointerdown', (e)=>{
    // Los controles con su propia acción (botones +/-, acciones reveladas)
    // no deben iniciar un deslizamiento.
    if(e.target.closest('button, input, select, a')) return;
    const r = e.target.closest(rowSelector);
    if(!r || !containerEl.contains(r)) return;
    const c = contentOf(r);
    if(!c) return;
    row = r; content = c; pointerId = e.pointerId;
    startX = e.clientX; startY = e.clientY; axis = null;
    const m = /translateX\((-?[\d.]+)px\)/.exec(c.style.transform || '');
    baseOffset = m ? parseFloat(m[1]) : 0;
    try{ r.setPointerCapture(pointerId); }catch(err){}
    document.addEventListener('pointermove', onMove, { passive:false });
    document.addEventListener('pointerup', finish);
    document.addEventListener('pointercancel', finish);
  });

  return { closeAll: ()=> closeAll(null) };
}

// --- Animaciones de confirmación muy suaves para editar/agregar/eliminar,
// reutilizadas por cualquier lista editable. Solo transform/opacity. ---
function playRowConfirm(rowEl){
  if(!rowEl) return;
  rowEl.classList.remove('row-confirm');
  void rowEl.offsetWidth;
  rowEl.classList.add('row-confirm');
  setTimeout(()=> rowEl.classList.remove('row-confirm'), 450);
}

function playRowAddIn(rowEl){
  if(!rowEl) return;
  rowEl.classList.add('row-add-in');
  setTimeout(()=> rowEl.classList.remove('row-add-in'), 350);
}

// Anima la salida y solo entonces ejecuta `afterFn` (para que el usuario
// vea el elemento desaparecer antes de que la lista se vuelva a dibujar).
function playRowDeleteOut(rowEl, afterFn){
  if(!rowEl){ afterFn(); return; }
  rowEl.classList.add('row-delete-out');
  setTimeout(afterFn, 240);
}

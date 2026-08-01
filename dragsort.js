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

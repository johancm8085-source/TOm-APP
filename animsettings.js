// ============================================================================
// AJUSTES → APARIENCIA → ANIMACIONES
// ============================================================================
// Panel para activar/desactivar las animaciones de TOM y Luna y elegir cuál
// se reproduce al tocarlos. Los cambios se aplican y se guardan al instante;
// la vista previa reproduce la animación en el TOM del panel Y en los
// personajes reales, para ver exactamente cómo va a quedar.

function animRenderGrid(){
  const grid = document.getElementById('animGrid');
  if(!grid) return;
  grid.innerHTML = MASCOT_ANIM_KEYS.map(key=>{
    const a = MASCOT_ANIMATIONS[key];
    const activa = key === mascotAnimChoice;
    return `<button type="button" class="anim-card${activa?' active':''}" data-key="${key}">
      <span class="anim-card-check">${activa ? '✓' : ''}</span>
      <span class="anim-card-name">${escapeHtml(a.label)}</span>
      <span class="anim-card-desc">${escapeHtml(a.desc)}</span>
    </button>`;
  }).join('');

  grid.querySelectorAll('.anim-card').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      mascotSetAnimation(btn.dataset.key);   // se guarda de inmediato
      animRenderGrid();
      animUpdateHeader();
      animPreview();                          // y se ve en el acto
    });
  });
}

function animUpdateHeader(){
  const a = MASCOT_ANIMATIONS[mascotAnimChoice] || MASCOT_ANIMATIONS[MASCOT_DEFAULT_ANIM];
  const n = document.getElementById('animPreviewName');
  const d = document.getElementById('animPreviewDesc');
  if(n) n.textContent = a.label;
  if(d) d.textContent = a.desc;
}

function animUpdateEnabledUI(){
  const panel = document.getElementById('animPanel');
  const chk = document.getElementById('animEnabled');
  if(chk) chk.checked = mascotAnimEnabled;
  if(panel) panel.classList.toggle('anim-off', !mascotAnimEnabled);
}

// Reproduce la animación elegida en la vista previa y en los personajes
// reales a la vez. Si las animaciones están apagadas, avisa en vez de no
// hacer nada (un botón que no responde parece roto).
function animPreview(){
  if(!mascotAnimEnabled){
    if(typeof showAlert === 'function'){
      showAlert('Activa las animaciones para ver la vista previa.');
    }
    return;
  }
  if(typeof mascotPlayAll === 'function') mascotPlayAll(mascotAnimChoice);
}

function initAnimSettings(){
  const chk = document.getElementById('animEnabled');
  const btn = document.getElementById('animPreviewBtn');
  if(!chk || !btn) return;

  // La mascota del panel es una instancia más, con las mismas capas, así que
  // reacciona igual que TOM y Luna al tocarla.
  if(typeof initMascot === 'function'){
    previewMascot = initMascot('animPreviewMascot');
  }

  chk.addEventListener('change', ()=>{
    mascotSetEnabled(chk.checked);
    animUpdateEnabledUI();
    if(chk.checked) animPreview();
  });

  btn.addEventListener('click', animPreview);

  animUpdateEnabledUI();
  animUpdateHeader();
  animRenderGrid();
}

initAnimSettings();

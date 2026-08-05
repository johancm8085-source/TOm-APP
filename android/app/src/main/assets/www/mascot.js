// --- Mascotas TOM y Luna: microanimaciones idle + reacciones ---
// Todo el movimiento continuo (parpadeo, inclinar cabeza, orejas) se dispara
// desde aquí con setTimeout de duración aleatoria, para que nunca se sienta
// como un loop mecánico. Las reacciones a eventos (gasto, ingreso, meta) se
// exponen como window.onTomReact/window.onLunaReact y se llaman desde app.js.
//
// Limpieza de cada animación de un solo disparo (clases "mt-*"), con doble
// seguro para que NUNCA quede una animación pegada bloqueando el siguiente
// toque, pase lo que pase:
//   1) `animationend` (vía principal): limpia justo cuando la animación en
//      curso termina de verdad, sin importar cuántas veces se haya reiniciado.
//   2) setTimeout de respaldo con "generación": si por lo que sea el navegador
//      no llega a disparar animationend (pestaña en segundo plano, ahorro de
//      batería, app minimizada en Android), limpia igual pasado su tiempo —
//      pero solo si nadie volvió a tocar el personaje mientras tanto, para
//      no cortar a mitad de camino una animación más nueva.

// --- Catálogo de animaciones al tocar --------------------------------------
// Cada una describe qué clase recibe cada capa y cuánto dura. Las capas son
// independientes para que rotar, escalar y parpadear no se pisen entre sí.
const MASCOT_ANIMATIONS = {
  saludo: {
    label: 'Saludo',
    desc: 'Levanta una pata y sonríe',
    steps: [
      { el:'breathe', cls:'mt-wave-body', ms:1300 },
      { el:'tilt',    cls:'mt-wave-head', ms:1300 },
      { el:'paw',     cls:'mt-wave',      ms:1300 },
      { el:'glow',    cls:'mt-wave-smile',ms:1300 },
      { el:'blink',   cls:'mt-blink',     ms:160, delay:950 }
    ]
  },
  feliz: {
    label: 'Feliz',
    desc: 'Mueve la cabeza, parpadea y agita la cola',
    steps: [
      { el:'tilt',    cls:'mt-happy-head', ms:1100 },
      { el:'breathe', cls:'mt-happy-body', ms:1100 },
      { el:'tail',    cls:'mt-happy-tail', ms:1100 },
      { el:'blink',   cls:'mt-blink',      ms:160, delay:520 }
    ]
  },
  curioso: {
    label: 'Curioso',
    desc: 'Inclina la cabeza, mira a los lados y parpadea',
    steps: [
      { el:'tilt',    cls:'mt-curious-head', ms:1700 },
      { el:'breathe', cls:'mt-curious-body', ms:1700 },
      { el:'blink',   cls:'mt-blink',        ms:160, delay:1380 }
    ]
  },
  estiramiento: {
    label: 'Estiramiento',
    desc: 'Estira las patas y vuelve despacio',
    steps: [
      { el:'breathe', cls:'mt-stretch-body', ms:1800 },
      { el:'tilt',    cls:'mt-stretch-head', ms:1800 },
      { el:'paw',     cls:'mt-stretch-paw',  ms:1800 }
    ]
  },
  carinoso: {
    label: 'Cariñoso',
    desc: 'Cierra los ojos, sonríe y se despide con la pata',
    steps: [
      { el:'blink',   cls:'mt-love-eyes', ms:1600 },
      { el:'glow',    cls:'mt-love-glow', ms:1600 },
      { el:'breathe', cls:'mt-love-body', ms:1600 },
      { el:'tilt',    cls:'mt-love-head', ms:1600 },
      { el:'paw',     cls:'mt-love-paw',  ms:1600 }
    ]
  }
};
const MASCOT_ANIM_KEYS = Object.keys(MASCOT_ANIMATIONS);
const MASCOT_DEFAULT_ANIM = 'saludo';

// Preferencias (se leen de localStorage de forma síncrona para que la primera
// pulsación ya use la animación elegida, sin esperar a nada).
let mascotAnimEnabled = true;
let mascotAnimChoice = MASCOT_DEFAULT_ANIM;

function mascotLoadPrefs(){
  try{
    const en = localStorage.getItem('mascot:enabled');
    mascotAnimEnabled = en === null ? true : en === '1';
    const ch = localStorage.getItem('mascot:animation');
    mascotAnimChoice = MASCOT_ANIMATIONS[ch] ? ch : MASCOT_DEFAULT_ANIM;
  }catch(e){
    mascotAnimEnabled = true;
    mascotAnimChoice = MASCOT_DEFAULT_ANIM;
  }
}

function mascotSavePrefs(){
  try{
    localStorage.setItem('mascot:enabled', mascotAnimEnabled ? '1' : '0');
    localStorage.setItem('mascot:animation', mascotAnimChoice);
  }catch(e){}
}

function mascotSetEnabled(v){ mascotAnimEnabled = !!v; mascotSavePrefs(); }
function mascotSetAnimation(key){
  if(!MASCOT_ANIMATIONS[key]) return;
  mascotAnimChoice = key;
  mascotSavePrefs();
}

mascotLoadPrefs();

function mascotRand(min, max){ return min + Math.random() * (max - min); }

function initMascot(rootId){
  const root = document.getElementById(rootId);
  if(!root) return null;
  const layers = {
    tilt:    root.querySelector('.mascot-tilt'),
    breathe: root.querySelector('.mascot-breathe'),
    blink:   root.querySelector('.mascot-blink'),
    glow:    root.querySelector('.mascot-glow'),
    paw:     root.querySelector('.mascot-paw'),
    tail:    root.querySelector('.mascot-tail')
  };
  const tiltEl = layers.tilt, breatheEl = layers.breathe;
  const blinkEl = layers.blink, glowEl = layers.glow;

  const gen = new WeakMap();
  const pending = [];   // temporizadores de pasos con retraso, cancelables

  Object.values(layers).forEach(el=>{
    if(!el) return;
    el.addEventListener('animationend', (e)=>{
      // animationend BURBUJEA: las capas están anidadas (blink y glow van
      // dentro de breathe, que va dentro de tilt), así que sin este filtro el
      // parpadeo al terminar borraba las clases de sus capas padre y cortaba
      // la animación a media reproducción ("Feliz" moría a los 680 ms de 1100).
      if(e.target !== el) return;
      [...el.classList].forEach(c=>{ if(c.indexOf('mt-') === 0) el.classList.remove(c); });
    });
  });

  function pulse(el, cls, ms){
    if(!el) return;
    // Una capa solo puede llevar una animación a la vez: si ya hay otra clase
    // "mt-" puesta (por ejemplo el giro de cabeza en reposo cayendo encima de
    // una animación de toque), se retira antes. Si no, la vieja se quedaría
    // pegada: su limpieza diferida queda anulada por la nueva generación, y
    // con la app en segundo plano `animationend` tampoco llega a rescatarla.
    [...el.classList].forEach(c=>{ if(c.indexOf('mt-') === 0 && c !== cls) el.classList.remove(c); });
    el.classList.remove(cls);
    void el.offsetWidth; // fuerza reflow para poder re-disparar la misma clase seguida
    el.classList.add(cls);
    const myGen = (gen.get(el) || 0) + 1;
    gen.set(el, myGen);
    if(ms){
      setTimeout(()=>{
        if(gen.get(el) === myGen) el.classList.remove(cls);
      }, ms + 80);
    }
  }

  // Corta cualquier animación de toque en curso: al volver a tocar, la nueva
  // empieza limpia en vez de mezclarse con la anterior.
  function clearTapAnimations(){
    while(pending.length) clearTimeout(pending.pop());
    Object.values(layers).forEach(el=>{
      if(!el) return;
      [...el.classList].forEach(c=>{ if(c.indexOf('mt-') === 0) el.classList.remove(c); });
    });
  }

  let alive = true;
  // Mientras se reproduce una animación de toque, las de reposo se saltan su
  // turno: comparten las mismas capas y la cortarían por la mitad.
  let busyUntil = 0;
  const idle = ()=> Date.now() >= busyUntil;

  function loopBlink(){
    if(!alive) return;
    setTimeout(()=>{
      if(mascotAnimEnabled && idle()) pulse(blinkEl, 'mt-blink', 160);
      loopBlink();
    }, mascotRand(8000, 12000));
  }

  function loopHeadTilt(){
    if(!alive) return;
    setTimeout(()=>{
      if(mascotAnimEnabled && idle()){
        const cls = Math.random() < 0.5 ? 'mt-tilt-l' : 'mt-tilt-r';
        pulse(tiltEl, cls, 1400);
      }
      loopHeadTilt();
    }, mascotRand(10000, 18000));
  }

  function loopEarTwitch(){
    if(!alive) return;
    setTimeout(()=>{
      // La inclinación de cabeza y el twitch de orejas comparten .mascot-tilt;
      // si hay una en curso, se espera al próximo ciclo para no cortarla.
      if(mascotAnimEnabled && idle() &&
         !tiltEl.classList.contains('mt-tilt-l') && !tiltEl.classList.contains('mt-tilt-r')){
        pulse(tiltEl, 'mt-ear', 550);
      }
      loopEarTwitch();
    }, mascotRand(14000, 24000));
  }

  loopBlink();
  loopHeadTilt();
  loopEarTwitch();

  // Reproduce una animación del catálogo. Si no se indica cuál, usa la que el
  // usuario haya elegido en Apariencia.
  function play(key){
    if(!mascotAnimEnabled) return;
    const anim = MASCOT_ANIMATIONS[key] || MASCOT_ANIMATIONS[mascotAnimChoice] || MASCOT_ANIMATIONS[MASCOT_DEFAULT_ANIM];
    clearTapAnimations();
    // Reserva las capas durante toda la animación para que ningún ciclo de
    // reposo se cuele encima.
    const dura = anim.steps.reduce((max, s)=> Math.max(max, (s.delay || 0) + (s.ms || 0)), 0);
    busyUntil = Date.now() + dura + 120;
    anim.steps.forEach(step=>{
      const el = layers[step.el];
      if(!el) return;              // p.ej. una mascota sin cola en el DOM
      if(step.delay){
        pending.push(setTimeout(()=> pulse(el, step.cls, step.ms), step.delay));
      } else {
        pulse(el, step.cls, step.ms);
      }
    });
  }

  function onTap(){ play(null); }
  root.addEventListener('click', onTap);
  root.addEventListener('keydown', (e)=>{
    if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); onTap(); }
  });

  function react(kind){
    if(!mascotAnimEnabled) return;
    if(kind === 'down'){
      pulse(tiltEl, 'mt-react-down', 500);
    } else if(kind === 'happy'){
      pulse(breatheEl, 'mt-react-happy', 550);
    } else if(kind === 'smile'){
      pulse(breatheEl, 'mt-react-smile', 1000);
      pulse(glowEl, 'mt-react-smile', 1000);
    }
  }

  return { react, play, destroy(){ alive = false; } };
}

const tomMascot = initMascot('tomMascot');
const lunaMascot = initMascot('lunaMascot');
let previewMascot = null;   // se crea al abrir Apariencia > Animaciones

// Puente para que app.js dispare reacciones sin acoplarse a los detalles de
// la animación: 'down' (gasto), 'happy' (ingreso/abono), 'smile' (meta/deuda saldada).
window.onTomReact = function(kind){ if(tomMascot) tomMascot.react(kind); };
window.onLunaReact = function(kind){ if(lunaMascot) lunaMascot.react(kind); };

// Reproduce la animación en TOM, Luna y la vista previa a la vez, para que al
// elegirla en Apariencia se vea el efecto real en ambos personajes.
function mascotPlayAll(key){
  [tomMascot, lunaMascot, previewMascot].forEach(m=>{ if(m) m.play(key); });
}

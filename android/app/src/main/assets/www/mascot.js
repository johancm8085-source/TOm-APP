// --- Mascotas TOM y Luna: microanimaciones idle + saludo + reacciones ---
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

function mascotRand(min, max){ return min + Math.random() * (max - min); }

function initMascot(rootId){
  const root = document.getElementById(rootId);
  if(!root) return null;
  const tiltEl = root.querySelector('.mascot-tilt');
  const breatheEl = root.querySelector('.mascot-breathe');
  const blinkEl = root.querySelector('.mascot-blink');
  const glowEl = root.querySelector('.mascot-glow');
  const pawEl = root.querySelector('.mascot-paw');

  const gen = new WeakMap();

  [tiltEl, breatheEl, blinkEl, glowEl, pawEl].forEach(el=>{
    el.addEventListener('animationend', ()=>{
      [...el.classList].forEach(c=>{ if(c.indexOf('mt-') === 0) el.classList.remove(c); });
    });
  });

  function pulse(el, cls, ms){
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

  let alive = true;

  function loopBlink(){
    if(!alive) return;
    setTimeout(()=>{
      pulse(blinkEl, 'mt-blink', 160);
      loopBlink();
    }, mascotRand(8000, 12000));
  }

  function loopHeadTilt(){
    if(!alive) return;
    setTimeout(()=>{
      const cls = Math.random() < 0.5 ? 'mt-tilt-l' : 'mt-tilt-r';
      pulse(tiltEl, cls, 1400);
      loopHeadTilt();
    }, mascotRand(10000, 18000));
  }

  function loopEarTwitch(){
    if(!alive) return;
    setTimeout(()=>{
      // La inclinación de cabeza y el twitch de orejas comparten .mascot-tilt;
      // si hay una en curso, se espera al próximo ciclo para no cortarla.
      if(!tiltEl.classList.contains('mt-tilt-l') && !tiltEl.classList.contains('mt-tilt-r')){
        pulse(tiltEl, 'mt-ear', 550);
      }
      loopEarTwitch();
    }, mascotRand(14000, 24000));
  }

  loopBlink();
  loopHeadTilt();
  loopEarTwitch();

  // Saludo al tocar (~1.3s): levanta la pata y saluda 2-3 veces, sonríe,
  // parpadea una vez cerca del final y todo vuelve suavemente a reposo.
  // Se puede volver a disparar en cualquier momento, incluso a mitad de la
  // animación anterior (pulse() siempre reinicia limpio con remove+reflow+add).
  let blinkTimer = null, blinkGen = 0;
  function onTap(){
    pulse(breatheEl, 'mt-wave-body', 1300);
    pulse(tiltEl, 'mt-wave-head', 1300);
    pulse(pawEl, 'mt-wave', 1300);
    pulse(glowEl, 'mt-wave-smile', 1300);
    if(blinkTimer) clearTimeout(blinkTimer);
    const myBlinkGen = ++blinkGen;
    blinkTimer = setTimeout(()=>{
      if(myBlinkGen === blinkGen) pulse(blinkEl, 'mt-blink', 160);
    }, 950);
  }
  root.addEventListener('click', onTap);
  root.addEventListener('keydown', (e)=>{
    if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); onTap(); }
  });

  function react(kind){
    if(kind === 'down'){
      pulse(tiltEl, 'mt-react-down', 500);
    } else if(kind === 'happy'){
      pulse(breatheEl, 'mt-react-happy', 550);
    } else if(kind === 'smile'){
      pulse(breatheEl, 'mt-react-smile', 1000);
      pulse(glowEl, 'mt-react-smile', 1000);
    }
  }

  return { react, destroy(){ alive = false; } };
}

const tomMascot = initMascot('tomMascot');
const lunaMascot = initMascot('lunaMascot');

// Puente para que app.js dispare reacciones sin acoplarse a los detalles de
// la animación: 'down' (gasto), 'happy' (ingreso/abono), 'smile' (meta/deuda saldada).
window.onTomReact = function(kind){ if(tomMascot) tomMascot.react(kind); };
window.onLunaReact = function(kind){ if(lunaMascot) lunaMascot.react(kind); };

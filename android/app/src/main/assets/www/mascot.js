// --- Mascotas TOM y Luna: microanimaciones idle + reacciones a eventos ---
// Todo el movimiento continuo (parpadeo, inclinar cabeza, orejas) se dispara
// desde aquí con setTimeout de duración aleatoria, para que nunca se sienta
// como un loop mecánico. Las reacciones a eventos (gasto, ingreso, meta) se
// exponen como window.onTomReact/window.onLunaReact y se llaman desde app.js.

function mascotRand(min, max){ return min + Math.random() * (max - min); }

function initMascot(rootId){
  const root = document.getElementById(rootId);
  if(!root) return null;
  const tiltEl = root.querySelector('.mascot-tilt');
  const breatheEl = root.querySelector('.mascot-breathe');
  const blinkEl = root.querySelector('.mascot-blink');
  const glowEl = root.querySelector('.mascot-glow');

  function pulse(el, cls, ms){
    el.classList.remove(cls);
    void el.offsetWidth; // fuerza reflow para poder re-disparar la misma clase seguida
    el.classList.add(cls);
    setTimeout(()=> el.classList.remove(cls), ms);
  }

  // Respiración: sigue con el @keyframes infinito del CSS; aquí solo se
  // gestionan los micro-eventos ocasionales (parpadeo, cabeza, orejas), cada
  // uno reprogramado con un intervalo aleatorio distinto para que no coincidan.
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

  function onTap(){
    pulse(breatheEl, 'mt-tap', 380);
    pulse(tiltEl, 'mt-wiggle', 400);
    pulse(blinkEl, 'mt-blink', 160);
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

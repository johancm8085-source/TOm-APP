// ============================================================================
// ACERCA DE — el cierre de TOM FINANCE
// ============================================================================
// Vive dentro de una hoja inferior, no en una pantalla nueva, siguiendo la
// misma regla del rediseño: si cabe en una hoja, no se crea una pantalla.
// El huevo de pascua sí usa una capa a pantalla completa, porque la animación
// necesita todo el ancho para que TOM y Luna caminen de lado a lado.

const APP_VERSION = '1.0';
const APP_UPDATED = '2026-08-01';

// ~50 frases. Se elige una al azar cada vez que se abre la pantalla, evitando
// repetir la anterior para que nunca se sienta estancada.
const ABOUT_PHRASES = [
  'Los grandes cambios comienzan con pequeños hábitos.',
  'Administrar bien hoy es disfrutar más mañana.',
  'Cada ahorro tiene una historia.',
  'La mejor inversión siempre será el conocimiento.',
  'Organizar tus finanzas también es cuidar tu tranquilidad.',
  'El éxito financiero se construye una decisión a la vez.',
  'Todo gran patrimonio comenzó con un primer ahorro.',
  'No necesitas ser perfecto, solo constante.',
  'Pequeñas decisiones crean grandes resultados.',
  'El control genera tranquilidad.',
  'Saber a dónde va tu dinero ya es ganar la mitad del camino.',
  'Ahorrar no es privarse, es elegir con calma.',
  'El presupuesto no te limita: te da permiso.',
  'La constancia vence al monto.',
  'Un gasto anotado es un gasto entendido.',
  'La claridad es la forma más barata de tranquilidad.',
  'No se trata de cuánto ganas, sino de cuánto conservas.',
  'Cada peso registrado es una decisión consciente.',
  'El orden de hoy es la libertad de mañana.',
  'Las finanzas sanas se parecen mucho a la paciencia.',
  'Revisar tus números no da miedo: da poder.',
  'Un mes ordenado vale más que un año improvisado.',
  'Lo que se mide, mejora.',
  'Gastar bien también es una habilidad.',
  'El dinero rinde más cuando tiene un plan.',
  'Empieza pequeño, pero empieza.',
  'Tu yo del futuro agradecerá lo que anotes hoy.',
  'Ahorrar es pagarte a ti primero.',
  'Las metas claras hacen fáciles las decisiones difíciles.',
  'No hay ahorro pequeño cuando es constante.',
  'Ordenar el dinero es ordenar la cabeza.',
  'La tranquilidad financiera se construye sin prisa.',
  'Cada mes es una oportunidad de ajustar el rumbo.',
  'Los números no juzgan: solo informan.',
  'Un buen registro convierte la incertidumbre en confianza.',
  'La disciplina pesa gramos, el arrepentimiento pesa toneladas.',
  'Gasta en lo que te importa, recorta en lo que no.',
  'La libertad empieza cuando sabes cuánto necesitas.',
  'Ahorrar sin meta es remar sin rumbo.',
  'Lo simple es sostenible; lo complicado se abandona.',
  'Hoy es siempre el mejor día para ordenar tus cuentas.',
  'El progreso silencioso también es progreso.',
  'Controlar tus gastos es una forma de cuidarte.',
  'La calma financiera no se compra: se construye.',
  'Cada registro es una promesa que te haces.',
  'Menos deudas, más noches tranquilas.',
  'La paciencia es el interés compuesto del carácter.',
  'Sabes que vas bien cuando dejas de improvisar.',
  'No compares tu capítulo uno con el diez de alguien más.',
  'Tu dinero trabaja mejor cuando tú lo diriges.',
  'La mejor herramienta financiera es el hábito.'
];

let __lastPhrase = -1;
function aboutPhrase(){
  if(ABOUT_PHRASES.length < 2) return ABOUT_PHRASES[0] || '';
  let i;
  do { i = Math.floor(Math.random() * ABOUT_PHRASES.length); }
  while(i === __lastPhrase);
  __lastPhrase = i;
  return ABOUT_PHRASES[i];
}

function aboutFormattedDate(){
  const d = new Date(APP_UPDATED + 'T00:00');
  if(isNaN(d)) return APP_UPDATED;
  return d.toLocaleDateString('es-ES', { day:'numeric', month:'long', year:'numeric' });
}

function openAbout(){
  const frase = aboutPhrase();
  Sheet.open('Acerca de', { html: `
    <div class="about">

      <div class="about-hero">
        <img src="logo-small.png" alt="" class="about-mascot">
        <img src="luna-logo-small.png" alt="" class="about-mascot">
      </div>
      <div class="about-app">TOM FINANCE</div>
      <div class="about-phrase" id="aboutPhrase">“${escapeHtml(frase)}”</div>

      <div class="about-section">
        <div class="about-title">Filosofía de TOM FINANCE</div>
        <div class="about-rule"></div>
        <p>TOM FINANCE nació con una idea muy sencilla.</p>
        <p>Administrar el dinero no debería ser complicado.</p>
        <p>Cada función, cada pantalla, cada animación y cada detalle fueron diseñados para hacer que el control financiero sea más claro, más rápido y más agradable.</p>
        <p>Esta aplicación no busca impresionar por la cantidad de funciones. Busca destacar por la calidad de la experiencia.</p>
        <p>La simplicidad no significa tener menos opciones. Significa que todo se encuentra exactamente donde debe estar.</p>
        <p>Cada decisión de diseño tiene un propósito. Cada mejora busca ahorrar tiempo. Cada actualización intenta hacer la aplicación un poco mejor que ayer.</p>
        <div class="about-rule"></div>
      </div>

      <div class="signature-card">
        <div class="signature-line"></div>
        <div class="signature-label">Diseñado y desarrollado por</div>
        <button type="button" class="signature-name" id="signatureName">Js.Cortes</button>
        <div class="signature-quote">“Cada detalle de esta aplicación fue creado pensando en la simplicidad, la organización y la mejora continua.”</div>
        <div class="signature-line"></div>
      </div>

      <div class="about-origin">
        <span>Desde Colombia 🇨🇴</span>
        <span>2026</span>
      </div>

      <div class="about-section">
        <div class="about-title">Agradecimientos</div>
        <p>Gracias por utilizar TOM FINANCE.</p>
        <p>Espero que esta aplicación pueda ayudarte a tomar mejores decisiones financieras y hacer que administrar tu dinero sea una tarea más sencilla cada día.</p>
      </div>

      <div class="about-foot">
        <div>Versión ${escapeHtml(APP_VERSION)}</div>
        <div>Última actualización · ${escapeHtml(aboutFormattedDate())}</div>
        <div>© 2026 Js.Cortes · Todos los derechos reservados</div>
      </div>

    </div>`,
    onOpen: (body)=>{
      // Siete toques sobre el nombre despiertan el homenaje. El contador se
      // reinicia si pasan más de 2,5 s entre toques, para que no se dispare
      // por accidente a lo largo de varias visitas.
      const name = body.querySelector('#signatureName');
      let toques = 0, ultimo = 0;
      name.addEventListener('click', ()=>{
        const ahora = Date.now();
        toques = (ahora - ultimo > 2500) ? 1 : toques + 1;
        ultimo = ahora;
        name.classList.remove('tapped');
        void name.offsetWidth;
        name.classList.add('tapped');
        if(toques >= 7){
          toques = 0;
          Sheet.close();
          setTimeout(playCreatorEasterEgg, 260);
        }
      });
    }});
}

// --- Homenaje: TOM y Luna se encuentran y saludan --------------------------
let __eggRunning = false;

function playCreatorEasterEgg(){
  if(__eggRunning) return;
  __eggRunning = true;

  const layer = document.createElement('div');
  layer.className = 'egg-layer';
  layer.innerHTML = `
    <div class="egg-stage">
      <div class="egg-mascot egg-tom">
        <img src="logo-small.png" alt="">
        <span class="egg-paw">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 8a1.3 1.3 0 1 0 0.01 0 M9 6a1.3 1.3 0 1 0 0.01 0 M12 6a1.3 1.3 0 1 0 0.01 0 M14.5 8.5a1.3 1.3 0 1 0 0.01 0 M10 10a4 3 0 0 0-4 3c0 2 2 2 4 2s4 0 4-2a4 3 0 0 0-4-3z"/>
          </svg>
        </span>
      </div>
      <div class="egg-mascot egg-luna">
        <img src="luna-logo-small.png" alt="">
        <span class="egg-paw">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 8a1.3 1.3 0 1 0 0.01 0 M9 6a1.3 1.3 0 1 0 0.01 0 M12 6a1.3 1.3 0 1 0 0.01 0 M14.5 8.5a1.3 1.3 0 1 0 0.01 0 M10 10a4 3 0 0 0-4 3c0 2 2 2 4 2s4 0 4-2a4 3 0 0 0-4-3z"/>
          </svg>
        </span>
      </div>
    </div>
    <div class="egg-message">
      <div>Gracias por conocer TOM FINANCE.</div>
      <div>Cada línea de código fue escrita con dedicación.</div>
    </div>`;
  document.body.appendChild(layer);

  // Línea de tiempo: caminan (1,2 s) · saludan · mensaje visible ~4 s · salen.
  // El arranque no depende solo de requestAnimationFrame: si la app está en
  // segundo plano rAF no se ejecuta y la animación se quedaría congelada e
  // invisible. El setTimeout garantiza que siempre arranque.
  requestAnimationFrame(()=> layer.classList.add('run'));
  setTimeout(()=> layer.classList.add('run'), 40);
  setTimeout(()=> layer.classList.add('wave'), 1250);
  setTimeout(()=> layer.classList.add('msg'), 1500);
  setTimeout(()=> layer.classList.add('out'), 5600);
  setTimeout(()=>{
    layer.remove();
    __eggRunning = false;
  }, 6200);

  // Tocar la pantalla lo salta, sin dejar nada a medias.
  layer.addEventListener('click', ()=>{
    layer.classList.add('out');
    setTimeout(()=>{ if(layer.parentNode) layer.remove(); __eggRunning = false; }, 500);
  });
}

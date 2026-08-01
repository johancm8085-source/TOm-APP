// ============================================================================
// MOTOR CONVERSACIONAL DE VOZ — único para toda la app
// ============================================================================
// Arquitectura en capas, deliberadamente desacoplada de los formularios
// concretos para que Gastos, Ingresos, Luna y cualquier formulario futuro
// usen EXACTAMENTE el mismo motor (solo registran su "esquema"):
//
//   VoiceText     -> normalización de texto (tildes, signos, tokens)
//   VoiceNumbers  -> "cuarenta y cinco mil" -> 45000
//   VoiceMatch    -> emparejar lo dicho con la lista de ítems (+ambigüedad)
//   VoiceIntents  -> interpreta la frase -> intención {tipo, campo, valor}
//   VoiceForms    -> registro de esquemas de formulario (campos + guardado)
//   VoiceRouter   -> registro de comandos globales//futuros (navegar, consultar)
//   VoiceSession  -> máquina de estados de la conversación (nunca guarda sola)
//   VoiceUI       -> tarjeta resumen, transcripción, respuesta y micrófono
//   VoiceInput    -> transporte de reconocimiento (nativo Android / navegador)
//
// TODA la lógica de interpretación son funciones puras que reciben texto y
// devuelven datos: se pueden probar sin micrófono y no dependen del DOM.

// ---------------------------------------------------------------------------
// 1. Texto
// ---------------------------------------------------------------------------
const VoiceText = {
  // Quita tildes/ñ, signos y espacios extra. Antes de quitar los signos une
  // los separadores de miles ("40.000" -> "40000"), porque si no el punto se
  // convertiría en espacio y "40.000" se leería como 40 y 0.
  normalize(s){
    let t = String(s == null ? '' : s).toLowerCase();
    t = t.replace(/(\d)[.,](?=\d{3}\b)/g, '$1');
    t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
    t = t.replace(/[^a-z0-9\s]/g, ' ');
    return t.replace(/\s+/g, ' ').trim();
  },
  tokens(s){
    const n = this.normalize(s);
    return n ? n.split(' ') : [];
  },
  // ¿El texto original traía una coma justo después del "no"? ("No, fueron…")
  hasLeadingComma(raw){
    return /^\s*no\s*,/i.test(String(raw == null ? '' : raw));
  }
};

// ---------------------------------------------------------------------------
// 2. Números en español
// ---------------------------------------------------------------------------
const NUM_WORDS = {
  cero:0, un:1, uno:1, una:1, dos:2, tres:3, cuatro:4, cinco:5, seis:6,
  siete:7, ocho:8, nueve:9, diez:10, once:11, doce:12, trece:13, catorce:14,
  quince:15, dieciseis:16, diecisiete:17, dieciocho:18, diecinueve:19,
  veinte:20, veintiuno:21, veintiun:21, veintiuna:21, veintidos:22,
  veintitres:23, veinticuatro:24, veinticinco:25, veintiseis:26,
  veintisiete:27, veintiocho:28, veintinueve:29,
  treinta:30, cuarenta:40, cincuenta:50, sesenta:60, setenta:70, ochenta:80,
  noventa:90,
  cien:100, ciento:100, doscientos:200, doscientas:200, trescientos:300,
  trescientas:300, cuatrocientos:400, cuatrocientas:400, quinientos:500,
  quinientas:500, seiscientos:600, seiscientas:600, setecientos:700,
  setecientas:700, ochocientos:800, ochocientas:800, novecientos:900,
  novecientas:900
};
const NUM_MULT = { mil:1000, miles:1000, millon:1000000, millones:1000000 };
// Palabras que pueden ir "dentro" del número sin aportar valor.
const NUM_FILLER = { pesos:1, peso:1, lucas:1, luca:1, mil:0 };

const VoiceNumbers = {
  // Intenta leer un número que EMPIECE en tokens[from].
  // Devuelve {value, start, end} o null.
  parseSpan(tokens, from){
    let i = from, total = 0, current = 0, found = false, end = from;
    while(i < tokens.length){
      const t = tokens[i];
      if(t === 'y' && found){ i++; continue; }
      if(/^\d+$/.test(t)){
        current += parseInt(t, 10);
        found = true; end = ++i; continue;
      }
      if(NUM_WORDS[t] !== undefined){
        current += NUM_WORDS[t];
        found = true; end = ++i; continue;
      }
      if(NUM_MULT[t] !== undefined){
        const m = NUM_MULT[t];
        current = (current || 1) * m;
        total += current;
        current = 0;
        found = true; end = ++i; continue;
      }
      // "pesos"/"lucas" solo se absorben si ya venía un número
      if(found && NUM_FILLER[t] !== undefined){ end = ++i; continue; }
      break;
    }
    if(!found) return null;
    return { value: total + current, start: from, end };
  },
  // Busca el primer número en toda la frase.
  find(text){
    const tokens = VoiceText.tokens(text);
    for(let i = 0; i < tokens.length; i++){
      const span = this.parseSpan(tokens, i);
      if(span && span.value > 0) return span;
    }
    return null;
  },
  parse(text){
    const s = this.find(text);
    return s ? s.value : null;
  }
};

// ---------------------------------------------------------------------------
// 3. Emparejar con la lista de ítems (con detección de ambigüedad)
// ---------------------------------------------------------------------------
const VoiceMatch = {
  // Empareja un texto suelto ("gas") contra los ítems disponibles.
  // -> {status:'exact'|'single'|'ambiguous'|'none', value?, options?}
  item(spoken, candidates){
    const n = VoiceText.normalize(spoken);
    if(!n) return { status:'none' };
    const list = (candidates || []).map(c => ({ raw:c, n: VoiceText.normalize(c) })).filter(c => c.n);

    const exact = list.filter(c => c.n === n);
    if(exact.length === 1) return { status:'exact', value: exact[0].raw };
    if(exact.length > 1) return { status:'ambiguous', options: exact.map(c=>c.raw) };

    // Prefijo en cualquiera de los dos sentidos: "gas" ~ "gasolina"
    const pref = list.filter(c => c.n.startsWith(n) || n.startsWith(c.n));
    if(pref.length === 1) return { status:'single', value: pref[0].raw };
    if(pref.length > 1) return { status:'ambiguous', options: pref.map(c=>c.raw) };

    // Contiene la palabra completa
    const contains = list.filter(c => (' '+c.n+' ').includes(' '+n+' ') || (' '+n+' ').includes(' '+c.n+' '));
    if(contains.length === 1) return { status:'single', value: contains[0].raw };
    if(contains.length > 1) return { status:'ambiguous', options: contains.map(c=>c.raw) };

    return { status:'none' };
  },
  // Busca el nombre completo de algún ítem DENTRO de una frase larga.
  // Devuelve el más largo encontrado (para que "comida para gatos" gane
  // frente a "comida").
  findInSentence(text, candidates){
    const hay = ' ' + VoiceText.normalize(text) + ' ';
    let best = null, bestLen = 0;
    (candidates || []).forEach(c => {
      const cn = VoiceText.normalize(c);
      if(cn && hay.includes(' ' + cn + ' ') && cn.length > bestLen){
        best = c; bestLen = cn.length;
      }
    });
    return best;
  }
};

// ---------------------------------------------------------------------------
// 4. Registro de esquemas de formulario
// ---------------------------------------------------------------------------
// Un esquema describe QUÉ campos tiene un formulario y CÓMO se guarda.
// El motor no sabe nada de gastos, ingresos ni deudas: solo lee el esquema.
const VoiceForms = {
  _forms: {},
  register(id, schema){ this._forms[id] = Object.assign({ id }, schema); },
  get(id){ return this._forms[id]; },
  ids(){ return Object.keys(this._forms); }
};

// ---------------------------------------------------------------------------
// 5. Registro de comandos globales / futuros
// ---------------------------------------------------------------------------
// Preparado para "muéstrame los gastos de este mes", "abre estadísticas",
// "busca arroz"… sin tener que tocar el motor: basta registrar el comando.
const VoiceRouter = {
  _cmds: [],
  register(cmd){ this._cmds.push(cmd); },
  // Devuelve el primer comando cuyo patrón coincida, con sus grupos.
  resolve(text){
    const n = VoiceText.normalize(text);
    for(const c of this._cmds){
      const m = n.match(c.match);
      if(m) return { cmd: c, groups: m };
    }
    return null;
  }
};

// ---------------------------------------------------------------------------
// 6. Intenciones
// ---------------------------------------------------------------------------
// Palabras que introducen una orden de cambio.
const RX = {
  save:    /^(guardar|guarda|aceptar|acepta|confirmar|confirma|listo|correcto|si guardalo|guardalo|ok|okey|vale)$/,
  cancel:  /^(cancelar|cancela|olvidalo|olvidal|descartar|descarta|salir|nada)$/,
  edit:    /^(editar|edita|corregir|modificar|cambiar)$/,
  back:    /^(volver|vuelve|atras|regresar|regresa)$/,
  repeat:  /^(repetir|repite|repitelo|que dijiste|como quedo|leelo|lee)$/,
  listen:  /^(escuchar (nuevamente|de nuevo|otra vez)|escucha (nuevamente|de nuevo|otra vez)|te escucho|dictar|dicta|otra vez)$/,
  reset:   /^(borrar todo|borra todo|comenzar de nuevo|empezar de nuevo|empieza de nuevo|comienza de nuevo|reiniciar|reinicia)$/
};

const VoiceIntents = {
  // ctx = { form, values, awaiting }
  // Devuelve una intención:
  //   {type:'global', action}
  //   {type:'set'|'append'|'clear'|'await', field, value?}
  //   {type:'dictation', text}
  //   {type:'unknown'}
  parse(raw, ctx){
    const n = VoiceText.normalize(raw);
    if(!n) return { type:'unknown' };
    const form = ctx.form;

    // --- 6.1 Comandos globales (siempre tienen prioridad) ---
    for(const action of Object.keys(RX)){
      if(RX[action].test(n)) return { type:'global', action };
    }

    // --- 6.2 Comandos registrados (navegación/consultas futuras) ---
    const routed = VoiceRouter.resolve(n);
    if(routed) return { type:'command', cmd: routed.cmd, groups: routed.groups };

    // --- 6.3 Órdenes sobre un campo concreto ---
    const fieldRx = this._fieldPattern(form);

    // "quita la nota" / "borra la nota" / "sin nota"
    let m = n.match(new RegExp('^(?:quita|quitar|quitale|borra|borrar|borrale|elimina|eliminar|sin)\\s+(?:el|la|los|las)?\\s*(' + fieldRx + ')$'));
    if(m){
      const f = this._fieldByAlias(form, m[1]);
      if(f) return { type:'clear', field: f.key };
    }

    // "agrega a la nota X" / "añade a la nota X"
    m = n.match(new RegExp('^(?:agrega|agregar|agregale|anade|anadir|anadele|suma|sumale|añade)\\s+(?:a\\s+)?(?:el|la|los|las)?\\s*(' + fieldRx + ')\\s+(.+)$'));
    if(m){
      const f = this._fieldByAlias(form, m[1]);
      if(f) return { type:'append', field: f.key, value: m[2], rawValue: this._rawTail(raw, m[2]) };
    }

    // "cambia el monto a X" / "cambia la categoría por X" / "pon la nota en X"
    m = n.match(new RegExp('^(?:cambia|cambiar|cambiale|corrige|corregir|corrigele|modifica|modificar|pon|poner|ponle|actualiza|actualizar)\\s+(?:el|la|los|las)?\\s*(' + fieldRx + ')\\s+(?:a|por|en|como)\\s+(.+)$'));
    if(m){
      const f = this._fieldByAlias(form, m[1]);
      if(f) return { type:'set', field: f.key, value: m[2], rawValue: this._rawTail(raw, m[2]) };
    }

    // "corrige el monto" (sin valor) -> queda esperando el valor
    m = n.match(new RegExp('^(?:cambia|cambiar|cambiale|corrige|corregir|modifica|modificar|edita|editar)\\s+(?:el|la|los|las)?\\s*(' + fieldRx + ')$'));
    if(m){
      const f = this._fieldByAlias(form, m[1]);
      if(f) return { type:'await', field: f.key };
    }

    // "el monto correcto es X" / "la nota es X" / "el ítem correcto es X"
    m = n.match(new RegExp('^(?:el|la|los|las)\\s+(' + fieldRx + ')\\s+(?:correcto|correcta|real|verdadero|verdadera)?\\s*(?:es|era|seria|sera|fue|fueron|son)\\s+(.+)$'));
    if(m){
      const f = this._fieldByAlias(form, m[1]);
      if(f) return { type:'set', field: f.key, value: m[2], rawValue: this._rawTail(raw, m[2]) };
    }

    // --- 6.4 Negaciones y correcciones sueltas ---
    // "no fueron treinta mil" / "no era mercado" / "no, fueron cuarenta y ocho mil"
    m = n.match(/^no,?\s*(?:era|eran|es|son|fue|fueron|fui)?\s*(.+)$/);
    if(m){
      const rest = m[1];
      const field = this._guessField(form, rest, ctx);
      if(!field) return { type:'unknown' };
      const parsed = this._coerce(field, rest, ctx);
      if(!parsed.ok) return { type:'await', field: field.key };
      // Distinguir rechazo de corrección. El habla no trae comas fiables,
      // así que la señal robusta es comparar con lo que YA está puesto:
      //   "no fueron treinta mil"  y el monto es 30.000  -> rechaza, espera
      //   "no, fueron cuarenta y ocho mil" (valor distinto) -> corrige
      const sameAsCurrent = this._equals(field, parsed.value, ctx.values[field.key]);
      if(sameAsCurrent) return { type:'await', field: field.key };
      return { type:'set', field: field.key, value: rest };
    }

    // "era farmacia" / "fueron cuarenta y cinco mil" / "es gasolina"
    m = n.match(/^(?:era|eran|es|son|fue|fueron)\s+(.+)$/);
    if(m){
      const rest = m[1];
      const field = this._guessField(form, rest, ctx);
      if(field) return { type:'set', field: field.key, value: rest, rawValue: this._rawTail(raw, rest) };
    }

    // --- 6.5 Si estamos esperando un campo, la frase suelta es su valor ---
    if(ctx.awaiting){
      const f = form.fields.find(x => x.key === ctx.awaiting);
      if(f) return { type:'set', field: f.key, value: n, rawValue: this._rawTail(raw, n) };
    }

    // --- 6.6 Frase suelta durante la revisión ---
    // Si trae varios datos a la vez ("Gasolina treinta mil"), es un dictado
    // completo, no la corrección de un solo campo: si no, se quedaría solo
    // con el monto y descartaría el ítem.
    if(ctx.phase === 'review'){
      if(this._looksLikeDictation(form, n)) return { type:'dictation', text: raw };
      const field = this._guessField(form, n, ctx);
      if(field) return { type:'set', field: field.key, value: n, rawValue: this._rawTail(raw, n) };
    }

    // --- 6.7 Primera frase: dictado completo ---
    return { type:'dictation', text: raw };
  },

  // ¿La frase trae MÁS de un dato (p. ej. ítem + monto)? En ese caso hay que
  // reinterpretarla como dictado completo en vez de tocar un solo campo.
  _looksLikeDictation(form, text){
    const num = VoiceNumbers.find(text);
    if(!num) return false;
    const tokens = VoiceText.tokens(text);
    // Tokens que sobran fuera del número: si no hay ninguno, es solo un monto.
    const extra = tokens.length - (num.end - num.start);
    if(extra <= 0) return false;
    const choiceField = form.fields.find(f => f.type === 'choice');
    if(choiceField){
      const opts = choiceField.choices ? choiceField.choices() : [];
      if(VoiceMatch.findInSentence(text, opts)) return true;
      // Palabras antes del número que no son de relleno -> probable ítem nuevo
      const before = tokens.slice(0, num.start).filter(t => !/^(de|del|en|por|para|con|un|una|el|la|los|las|y|gaste|anota|registra)$/.test(t));
      if(before.length) return true;
    }
    return false;
  },

  // Recupera el trozo FINAL del texto tal como se dijo (con mayúsculas y
  // tildes), a partir del valor ya normalizado. La interpretación trabaja
  // sobre texto normalizado, pero una nota debe guardarse como la dijo el
  // usuario: "comprado en Éxito", no "comprado en exito".
  _rawTail(raw, normValue){
    const n = String(normValue == null ? '' : normValue).trim();
    if(!n) return '';
    const count = n.split(' ').length;
    const rawTokens = String(raw == null ? '' : raw).trim().split(/\s+/);
    if(rawTokens.length < count) return n;
    return rawTokens.slice(rawTokens.length - count).join(' ').replace(/[.,;:!?¡¿]+$/, '');
  },

  // Alternancia regex con todos los alias de todos los campos del esquema.
  _fieldPattern(form){
    const all = [];
    form.fields.forEach(f => f.aliases.forEach(a => all.push(VoiceText.normalize(a))));
    all.sort((a,b) => b.length - a.length); // el alias más largo primero
    return all.map(a => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  },
  _fieldByAlias(form, alias){
    const a = VoiceText.normalize(alias);
    return form.fields.find(f => f.aliases.some(x => VoiceText.normalize(x) === a));
  },
  // Deduce a qué campo se refiere un valor suelto: si es un número, al campo
  // numérico; si coincide con la lista de ítems, al campo de elección.
  _guessField(form, text, ctx){
    if(ctx.awaiting){
      const f = form.fields.find(x => x.key === ctx.awaiting);
      if(f) return f;
    }
    const num = VoiceNumbers.find(text);
    const numField = form.fields.find(f => f.type === 'number');
    if(num && numField){
      const tokens = VoiceText.tokens(text);
      // Solo si el número es prácticamente toda la frase
      if(num.end - num.start >= tokens.length - 1) return numField;
    }
    const choiceField = form.fields.find(f => f.type === 'choice');
    if(choiceField){
      const opts = choiceField.choices ? choiceField.choices() : [];
      const r = VoiceMatch.item(text, opts);
      if(r.status !== 'none') return choiceField;
    }
    if(num && numField) return numField;
    return null;
  },
  // Convierte el texto dicho al valor real del campo.
  _coerce(field, text, ctx){
    if(field.type === 'number'){
      const v = VoiceNumbers.parse(text);
      return v === null ? { ok:false } : { ok:true, value:v };
    }
    if(field.type === 'choice'){
      const opts = field.choices ? field.choices() : [];
      const r = VoiceMatch.item(text, opts);
      if(r.status === 'exact' || r.status === 'single') return { ok:true, value:r.value };
      if(r.status === 'ambiguous') return { ok:false, ambiguous:r.options };
      // Ítem nuevo: se conserva tal como se dijo, con la inicial en mayúscula
      // para que encaje con el resto de la lista.
      const clean = String(text).trim().replace(/[.,;:!?¡¿]+$/, '');
      return { ok:true, value: clean.charAt(0).toUpperCase() + clean.slice(1), isNew:true };
    }
    return { ok:true, value: String(text).trim() };
  },
  _equals(field, a, b){
    if(field.type === 'number') return Number(a) === Number(b);
    return VoiceText.normalize(a) === VoiceText.normalize(b);
  },

  // Primer dictado: "Gasolina cuarenta y cinco mil tanqueo completo"
  // Separa ítem / monto / nota sin borrar lo que no se mencione.
  parseDictation(raw, form){
    const out = {};
    const choiceField = form.fields.find(f => f.type === 'choice');
    const numField = form.fields.find(f => f.type === 'number');
    const textField = form.fields.find(f => f.type === 'text');
    const opts = choiceField && choiceField.choices ? choiceField.choices() : [];

    let tokens = VoiceText.tokens(raw);
    // Muletillas de arranque: "gasté", "anota", "registra un gasto de"…
    while(tokens.length && /^(gaste|gasté|gastar|anota|anotar|apunta|apuntar|registra|registrar|agrega|agregar|nuevo|nueva|un|una|de|en|por|el|la|movimiento|gasto|ingreso|pago)$/.test(tokens[0])){
      tokens.shift();
    }

    // 1) Monto
    let numSpan = null;
    for(let i = 0; i < tokens.length; i++){
      const s = VoiceNumbers.parseSpan(tokens, i);
      if(s && s.value > 0){ numSpan = s; break; }
    }
    if(numSpan && numField) out[numField.key] = numSpan.value;

    // 2) Ítem: lo que va antes del monto; si no hay nada, se busca en el resto
    let before = numSpan ? tokens.slice(0, numSpan.start) : tokens.slice();
    let after  = numSpan ? tokens.slice(numSpan.end) : [];
    const strip = arr => {
      while(arr.length && /^(de|del|en|por|para|con|un|una|el|la|los|las|y)$/.test(arr[0])) arr.shift();
      while(arr.length && /^(de|del|en|por|para|con|y)$/.test(arr[arr.length-1])) arr.pop();
      return arr;
    };
    before = strip(before); after = strip(after);

    let itemText = before.join(' ');
    let noteTokens = after;
    if(!itemText){
      // "cuarenta mil de gasolina" -> el ítem está después del monto
      const found = VoiceMatch.findInSentence(after.join(' '), opts);
      if(found){
        itemText = found;
        const fn = VoiceText.normalize(found).split(' ');
        const joined = after.join(' ');
        const cleaned = (' '+joined+' ').replace(' '+fn.join(' ')+' ', ' ').trim();
        noteTokens = cleaned ? cleaned.split(' ') : [];
      }
    } else {
      // Si en la parte previa hay un nombre de ítem conocido más específico,
      // úsalo y deja el resto como nota.
      const found = VoiceMatch.findInSentence(itemText, opts);
      if(found){
        const fn = VoiceText.normalize(found);
        const rest = (' '+VoiceText.normalize(itemText)+' ').replace(' '+fn+' ', ' ').trim();
        itemText = found;
        if(rest) noteTokens = rest.split(' ').concat(noteTokens);
      }
    }

    if(choiceField && itemText){
      const r = VoiceMatch.item(itemText, opts);
      if(r.status === 'exact' || r.status === 'single') out[choiceField.key] = r.value;
      else if(r.status === 'ambiguous') out.__ambiguous = { field: choiceField.key, options: r.options, spoken: itemText };
      else out[choiceField.key] = itemText;
    }

    // 3) Nota: lo que sobra, quitando el arranque "nota"/"con nota".
    // Se recupera del texto original para conservar tildes y mayúsculas.
    if(textField){
      let note = strip(noteTokens.slice());
      while(note.length && /^(nota|observacion|comentario|con|anota)$/.test(note[0])) note.shift();
      if(note.length) out[textField.key] = this._rawTail(raw, note.join(' ')) || note.join(' ');
    }
    return out;
  }
};

// ---------------------------------------------------------------------------
// 7. Transporte de reconocimiento
// ---------------------------------------------------------------------------
// El WebView de Android NO expone la Web Speech API (a diferencia de Chrome),
// así que el camino real en la app instalada es el puente nativo
// (SpeechRecognizer + TextToSpeech de Android). El reconocimiento del
// navegador queda como alternativa para probar en un navegador normal.
const VoiceInput = {
  mode: 'none',      // 'native' | 'web' | 'none'
  listening: false,
  _rec: null,
  onResult: null,
  onPartial: null,
  onError: null,
  onEnd: null,

  detect(){
    if(window.Android && typeof window.Android.startListening === 'function'){
      this.mode = 'native';
    } else if(window.SpeechRecognition || window.webkitSpeechRecognition){
      this.mode = 'web';
    } else {
      this.mode = 'none';
    }
    return this.mode;
  },
  isSupported(){ return this.detect() !== 'none'; },

  start(){
    if(this.listening) return;
    const mode = this.detect();
    if(mode === 'native'){
      this.listening = true;
      try{ window.Android.startListening(); }
      catch(e){ this.listening = false; this.onError && this.onError('No se pudo abrir el micrófono.'); }
      return;
    }
    if(mode === 'web'){
      const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
      const rec = new Ctor();
      rec.lang = 'es-CO';
      rec.continuous = false;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.onresult = (ev)=>{
        let finalText = '', partial = '';
        for(let i = ev.resultIndex; i < ev.results.length; i++){
          const r = ev.results[i];
          if(r.isFinal) finalText += r[0].transcript;
          else partial += r[0].transcript;
        }
        if(partial && this.onPartial) this.onPartial(partial);
        if(finalText && this.onResult) this.onResult(finalText);
      };
      rec.onerror = (ev)=>{
        this.listening = false;
        if(this.onError) this.onError(this._errorText(ev && ev.error));
      };
      rec.onend = ()=>{ this.listening = false; if(this.onEnd) this.onEnd(); };
      this._rec = rec;
      this.listening = true;
      try{ rec.start(); }
      catch(e){ this.listening = false; this.onError && this.onError('No se pudo abrir el micrófono.'); }
      return;
    }
    this.onError && this.onError('Este dispositivo no tiene reconocimiento de voz disponible.');
  },

  stop(){
    if(!this.listening) return;
    this.listening = false;
    if(this.mode === 'native'){
      try{ window.Android.stopListening(); }catch(e){}
    } else if(this._rec){
      try{ this._rec.stop(); }catch(e){}
    }
  },

  speak(text){
    if(!VoiceUI.ttsEnabled) return;
    if(window.Android && typeof window.Android.speak === 'function'){
      try{ window.Android.speak(text); return; }catch(e){}
    }
    if(window.speechSynthesis){
      try{
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'es-CO';
        u.rate = 1.05;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      }catch(e){}
    }
  },

  _errorText(code){
    const map = {
      'no-speech': 'No escuché nada. Toca el micrófono para intentar de nuevo.',
      'audio-capture': 'No encontré el micrófono.',
      'not-allowed': 'Necesito permiso para usar el micrófono.',
      'service-not-allowed': 'Necesito permiso para usar el micrófono.',
      'network': 'El reconocimiento de voz necesita conexión a internet.'
    };
    return map[code] || 'No pude escuchar bien. Intenta otra vez.';
  }
};

// Callbacks que invoca el código nativo de Android.
window.__voiceNative = {
  onResult(text){ VoiceInput.listening = false; VoiceInput.onResult && VoiceInput.onResult(text); },
  onPartial(text){ VoiceInput.onPartial && VoiceInput.onPartial(text); },
  onError(msg){ VoiceInput.listening = false; VoiceInput.onError && VoiceInput.onError(msg || 'No pude escuchar bien.'); },
  onEnd(){ VoiceInput.listening = false; VoiceInput.onEnd && VoiceInput.onEnd(); }
};

// ---------------------------------------------------------------------------
// 8. Sesión conversacional
// ---------------------------------------------------------------------------
// NUNCA guarda sola: siempre exige que el usuario diga/pulse Aceptar.
const VoiceSession = {
  form: null,
  values: {},
  awaiting: null,       // campo cuyo valor se está esperando
  ambiguous: null,      // {field, options, spoken}
  phase: 'idle',        // idle | listening | review
  lastTranscript: '',

  open(formId){
    const form = VoiceForms.get(formId);
    if(!form){ return; }
    this.form = form;
    this.values = {};
    form.fields.forEach(f => { this.values[f.key] = (f.initial ? f.initial() : (f.type === 'number' ? null : '')); });
    this.awaiting = null;
    this.ambiguous = null;
    this.phase = 'idle';
    this.lastTranscript = '';
    VoiceUI.open(this);
    this.listen();
  },

  close(){
    VoiceInput.stop();
    this.phase = 'idle';
    VoiceUI.close();
  },

  listen(){
    this.phase = 'listening';
    VoiceUI.setStatus('listening', 'Escuchando…');
    VoiceInput.start();
  },

  // ---- Punto único de entrada: se puede llamar directo con texto ----
  handleTranscript(raw){
    if(!this.form) return { type:'unknown' };
    this.lastTranscript = raw;
    VoiceUI.setTranscript(raw);

    // Si hay una ambigüedad pendiente, lo dicho intenta resolverla primero.
    if(this.ambiguous){
      const pick = this._resolveAmbiguity(raw);
      if(pick) return pick;
    }

    const intent = VoiceIntents.parse(raw, {
      form: this.form, values: this.values, awaiting: this.awaiting, phase: this.phase
    });
    this.apply(intent, raw);
    return intent;
  },

  apply(intent, raw){
    const form = this.form;
    switch(intent.type){
      case 'global':
        return this._global(intent.action);

      case 'command':
        try{ intent.cmd.handler(intent.groups, this); }catch(e){}
        return;

      case 'dictation': {
        const parsed = VoiceIntents.parseDictation(intent.text, form);
        let changed = 0;
        Object.keys(parsed).forEach(k => {
          if(k === '__ambiguous') return;
          this.values[k] = parsed[k];
          changed++;
        });
        if(parsed.__ambiguous){
          this.ambiguous = parsed.__ambiguous;
          this.phase = 'review';
          VoiceUI.render(this);
          return this._askAmbiguity();
        }
        if(!changed){
          this.phase = 'review';
          VoiceUI.render(this);
          return this._say('No entendí bien. Puedes decir, por ejemplo: "Gasolina cuarenta mil tanqueo completo".', true);
        }
        this.phase = 'review';
        this.awaiting = null;
        VoiceUI.render(this);
        return this._saySummary();
      }

      case 'set': {
        const f = form.fields.find(x => x.key === intent.field);
        if(!f) return;
        // Se prefiere siempre lo dicho tal cual (con tildes y mayúsculas):
        // el emparejado con la lista y el parser de números normalizan por
        // dentro, así que no se pierde nada, y en cambio una nota o un ítem
        // nuevo conservan su forma real.
        const source = intent.rawValue || intent.value;
        const r = VoiceIntents._coerce(f, source, { values:this.values });
        if(r.ambiguous){
          this.ambiguous = { field: f.key, options: r.ambiguous, spoken: intent.value };
          this.phase = 'review';
          VoiceUI.render(this);
          return this._askAmbiguity();
        }
        if(!r.ok){
          this.awaiting = f.key;
          this.phase = 'review';
          VoiceUI.render(this);
          return this._say('¿Cuál es ' + f.article + ' ' + f.label.toLowerCase() + '?', true);
        }
        // REGLA CLAVE: solo se toca ESTE campo. Los demás quedan intactos.
        this.values[f.key] = r.value;
        this.awaiting = null;
        this.phase = 'review';
        VoiceUI.render(this);
        VoiceUI.flashField(f.key);
        return this._say(f.label + ' actualizado: ' + this._display(f) + '. ¿Guardo el movimiento?', true);
      }

      case 'append': {
        const f = form.fields.find(x => x.key === intent.field);
        if(!f) return;
        const prev = String(this.values[f.key] || '').trim();
        const add = String(intent.rawValue || intent.value || '').trim();
        this.values[f.key] = prev ? (prev + ' ' + add) : add;
        this.awaiting = null;
        this.phase = 'review';
        VoiceUI.render(this);
        VoiceUI.flashField(f.key);
        return this._say(f.label + ': ' + this.values[f.key] + '. ¿Guardo el movimiento?', true);
      }

      case 'clear': {
        const f = form.fields.find(x => x.key === intent.field);
        if(!f) return;
        this.values[f.key] = (f.type === 'number') ? null : '';
        this.awaiting = null;
        this.phase = 'review';
        VoiceUI.render(this);
        VoiceUI.flashField(f.key);
        return this._say(f.label + ' eliminada. ¿Guardo el movimiento?', true);
      }

      case 'await': {
        const f = form.fields.find(x => x.key === intent.field);
        if(!f) return;
        this.awaiting = f.key;
        this.phase = 'review';
        VoiceUI.render(this);
        return this._say('De acuerdo. ¿Cuál es ' + f.article + ' ' + f.label.toLowerCase() + ' correcto?', true);
      }

      default:
        this.phase = 'review';
        VoiceUI.render(this);
        return this._say('No entendí. Puedes decir "cambia el monto a cuarenta mil", "aceptar" o "cancelar".', true);
    }
  },

  _global(action){
    switch(action){
      case 'save':   return this.accept();
      case 'cancel': return this.close();
      case 'edit':   this.phase = 'review'; VoiceUI.render(this); return this._say('Dime qué quieres cambiar.', true);
      case 'back':   this.awaiting = null; this.ambiguous = null; VoiceUI.render(this); return this._say('Listo. ¿Qué quieres cambiar?', true);
      case 'repeat': return this._saySummary();
      case 'listen': VoiceUI.render(this); return this.listen();
      case 'reset': {
        this.form.fields.forEach(f => { this.values[f.key] = (f.type === 'number' ? null : ''); });
        this.awaiting = null; this.ambiguous = null;
        VoiceUI.render(this);
        this._say('Empecemos de nuevo. Te escucho.', false);
        return this.listen();
      }
    }
  },

  _resolveAmbiguity(raw){
    const n = VoiceText.normalize(raw);
    const opts = this.ambiguous.options;
    // "el primero" / "el segundo"
    const ord = { primero:0, primera:0, uno:0, segundo:1, segunda:1, dos:1, tercero:2, tercera:2, tres:2 };
    for(const k of Object.keys(ord)){
      if(n === k || n === 'el ' + k || n === 'la ' + k){
        const pick = opts[ord[k]];
        if(pick) return this._commitAmbiguity(pick);
      }
    }
    const r = VoiceMatch.item(n, opts);
    if(r.status === 'exact' || r.status === 'single') return this._commitAmbiguity(r.value);
    return null;
  },

  _commitAmbiguity(value){
    const key = this.ambiguous.field;
    this.values[key] = value;
    this.ambiguous = null;
    this.awaiting = null;
    this.phase = 'review';
    VoiceUI.render(this);
    VoiceUI.flashField(key);
    this._saySummary();
    return { type:'set', field: key, value };
  },

  _askAmbiguity(){
    const o = this.ambiguous.options;
    const msg = '¿Te refieres a ' + o.slice(0,-1).join(', ') + ' o ' + o[o.length-1] + '?';
    return this._say(msg, true);
  },

  _display(f){
    const v = this.values[f.key];
    if(v === null || v === '' || v === undefined) return '—';
    return f.format ? f.format(v) : String(v);
  },

  _summaryText(){
    const parts = this.form.fields
      .filter(f => this.values[f.key] !== null && this.values[f.key] !== '' && this.values[f.key] !== undefined)
      .map(f => f.label + ': ' + this._display(f));
    return parts.join(', ');
  },

  _saySummary(){
    const s = this._summaryText();
    if(!s) return this._say('Todavía no tengo datos. Te escucho.', true);
    return this._say('He reconocido: ' + s + '. ¿Deseas guardar el movimiento?', true);
  },

  _say(msg, listenAfter){
    VoiceUI.setAssistant(msg);
    VoiceInput.speak(msg);
    if(listenAfter && this.phase === 'review'){
      // Sigue en modo escucha para permitir la conversación continua.
      VoiceUI.setStatus('review', 'Puedes seguir hablando o pulsar Aceptar');
      setTimeout(()=>{ if(this.phase === 'review') this.listen(); }, 350);
    }
    return msg;
  },

  missingRequired(){
    return this.form.fields.filter(f => f.required && (this.values[f.key] === null || this.values[f.key] === '' || this.values[f.key] === undefined));
  },

  async accept(){
    const missing = this.missingRequired();
    if(missing.length){
      const f = missing[0];
      this.awaiting = f.key;
      this.phase = 'review';
      VoiceUI.render(this);
      return this._say('Falta ' + f.article + ' ' + f.label.toLowerCase() + '. ¿Cuál es?', true);
    }
    VoiceInput.stop();
    this.phase = 'idle';
    try{
      await this.form.onAccept(Object.assign({}, this.values));
    }catch(e){
      return this._say('No pude guardar: ' + (e && e.message ? e.message : 'error'), false);
    }
    VoiceUI.close();
    VoiceInput.speak('Guardado.');
  }
};

// ---------------------------------------------------------------------------
// 9. Interfaz
// ---------------------------------------------------------------------------
const VoiceUI = {
  ttsEnabled: false,
  _els: null,

  init(){
    this._els = {
      backdrop:   document.getElementById('voiceModalBackdrop'),
      title:      document.getElementById('voiceModalTitle'),
      status:     document.getElementById('voiceStatus'),
      mic:        document.getElementById('voiceMicRing'),
      transcript: document.getElementById('voiceTranscript'),
      assistant:  document.getElementById('voiceAssistant'),
      choices:    document.getElementById('voiceChoices'),
      summary:    document.getElementById('voiceSummary'),
      accept:     document.getElementById('voiceAcceptBtn'),
      edit:       document.getElementById('voiceEditBtn'),
      cancel:     document.getElementById('voiceCancelBtn'),
      tts:        document.getElementById('voiceTtsToggle'),
      close:      document.getElementById('voiceModalClose')
    };
    const e = this._els;
    if(!e.backdrop) return;

    try{ this.ttsEnabled = localStorage.getItem('voice:tts') === '1'; }catch(err){}
    if(e.tts){
      e.tts.checked = this.ttsEnabled;
      e.tts.addEventListener('change', ()=>{
        this.ttsEnabled = e.tts.checked;
        try{ localStorage.setItem('voice:tts', this.ttsEnabled ? '1' : '0'); }catch(err){}
      });
    }

    e.accept.addEventListener('click', ()=> VoiceSession.accept());
    e.cancel.addEventListener('click', ()=> VoiceSession.close());
    e.close.addEventListener('click', ()=> VoiceSession.close());
    e.edit.addEventListener('click', ()=>{
      VoiceSession.phase = 'review';
      VoiceSession._say('Dime qué quieres cambiar.', true);
    });
    e.mic.addEventListener('click', ()=>{
      if(VoiceInput.listening){ VoiceInput.stop(); this.setStatus('review', 'Micrófono en pausa'); }
      else VoiceSession.listen();
    });
    e.backdrop.addEventListener('click', (ev)=>{ if(ev.target === e.backdrop) VoiceSession.close(); });

    VoiceInput.onResult  = (text)=> VoiceSession.handleTranscript(text);
    VoiceInput.onPartial = (text)=> this.setTranscript(text, true);
    VoiceInput.onError   = (msg)=>{
      this.setStatus('error', 'Micrófono detenido');
      this.setAssistant(msg);
      if(VoiceSession.phase === 'listening') VoiceSession.phase = 'review';
      this.render(VoiceSession);
    };
    VoiceInput.onEnd = ()=>{
      if(VoiceSession.phase === 'listening'){
        this.setStatus('review', 'Toca el micrófono para hablar');
      }
    };
  },

  open(session){
    const e = this._els;
    if(!e || !e.backdrop) return;
    e.title.textContent = session.form.title || 'Registrar por voz';
    this.setTranscript('');
    this.setAssistant(session.form.hint || 'Di el ítem, el monto y la nota. Ejemplo: "Gasolina cuarenta mil tanqueo completo".');
    this.render(session);
    e.backdrop.classList.add('open');
  },

  close(){
    const e = this._els;
    if(e && e.backdrop) e.backdrop.classList.remove('open');
  },

  setStatus(kind, text){
    const e = this._els;
    if(!e || !e.status) return;
    e.status.textContent = text;
    e.mic.classList.toggle('listening', kind === 'listening');
    e.mic.classList.toggle('error', kind === 'error');
  },

  setTranscript(text, partial){
    const e = this._els;
    if(!e || !e.transcript) return;
    e.transcript.textContent = text ? ('“' + text + '”') : '';
    e.transcript.classList.toggle('partial', !!partial);
  },

  setAssistant(msg){
    const e = this._els;
    if(!e || !e.assistant) return;
    e.assistant.textContent = msg || '';
  },

  // Tarjeta resumen: se redibuja tras CADA cambio, nunca guarda sola.
  render(session){
    const e = this._els;
    if(!e || !e.summary || !session.form) return;
    e.summary.innerHTML = session.form.fields.map(f=>{
      const v = session.values[f.key];
      const empty = (v === null || v === '' || v === undefined);
      const shown = empty ? '—' : (f.format ? f.format(v) : String(v));
      const awaiting = session.awaiting === f.key ? ' awaiting' : '';
      return `<div class="voice-field${empty ? ' empty' : ''}${awaiting}" data-field="${f.key}">
        <span class="voice-field-label">${escapeHtml(f.label)}</span>
        <span class="voice-field-value">${escapeHtml(shown)}</span>
      </div>`;
    }).join('');

    // Opciones de desambiguación, tocables además de decibles.
    if(session.ambiguous){
      e.choices.innerHTML = session.ambiguous.options.map(o =>
        `<button type="button" class="voice-choice" data-value="${escapeHtml(o)}">${escapeHtml(o)}</button>`
      ).join('');
      e.choices.style.display = '';
      e.choices.querySelectorAll('.voice-choice').forEach(btn=>{
        btn.addEventListener('click', ()=> session._commitAmbiguity(btn.dataset.value));
      });
    } else {
      e.choices.innerHTML = '';
      e.choices.style.display = 'none';
    }
  },

  flashField(key){
    const e = this._els;
    if(!e || !e.summary) return;
    const el = e.summary.querySelector('[data-field="' + key + '"]');
    if(!el) return;
    el.classList.remove('changed');
    void el.offsetWidth;
    el.classList.add('changed');
    setTimeout(()=> el.classList.remove('changed'), 700);
  }
};

// ---------------------------------------------------------------------------
// 10. Arranque
// ---------------------------------------------------------------------------
function initVoice(){
  VoiceUI.init();
  const supported = VoiceInput.isSupported();
  document.querySelectorAll('.voice-mic-btn').forEach(btn=>{
    if(!supported){
      btn.classList.add('unsupported');
      btn.title = 'El reconocimiento de voz no está disponible en este dispositivo';
    }
    btn.addEventListener('click', (ev)=>{
      ev.preventDefault();
      ev.stopPropagation();
      if(!VoiceInput.isSupported()){
        if(typeof showAlert === 'function'){
          showAlert('Este dispositivo no tiene reconocimiento de voz disponible. En la app de Android se usa el reconocimiento del sistema.');
        }
        return;
      }
      VoiceSession.open(btn.dataset.voiceForm);
    });
  });
}

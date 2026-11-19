
/* ==========================================
   ⚡ MATH BATTLE
   CONEXIÓN SUPABASE
========================================== */
const SUPABASE_URL = "https://hfyxxuwnjdocygmxbhmc.supabase.co";
const SUPABASE_KEY = "sb_publishable_CR5dzRzSf-87shQvPTUS1g_JoqBsqdy";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

// ==========================================
// ESTADO GENERAL
// ==========================================

let estudiante = null;
let codigoEstudiante = sessionStorage.getItem("mathBattleCode") || "";

let preguntasPractica = [];
let preguntaActual = 0;
let puntosPractica = 0;
let temaActual = "";

let preguntasExamen = [];
let respuestasExamen = {};
let examenActual = 0;
let sesionExamen = null;
let temporizador = null;
let fechaLimite = null;

const opcionesMezcladas = new Map();

const temas = {
  lineales: {
    nombre: "Desigualdades lineales",
    rpc: "lineales",
    emoji: "📐"
  },
  cuadraticas: {
    nombre: "Desigualdades cuadráticas",
    rpc: "cuadraticas",
    emoji: "📊"
  },
  racionales: {
    nombre: "Desigualdades racionales",
    rpc: "racionales",
    emoji: "➗"
  },
  logaritmos: {
    nombre: "Logaritmos",
    rpc: "logaritmos",
    emoji: "🔢"
  }
};

// ==========================================
// FUNCIONES GENERALES
// ==========================================

function mostrarVista(nombre) {
  document.querySelectorAll(".view").forEach(v => {
    v.classList.add("hidden");
  });

  const vista = document.getElementById("view-" + nombre);

  if (vista) vista.classList.remove("hidden");

  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.classList.toggle(
      "active",
      btn.dataset.view === nombre
    );
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function escaparHTML(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, letra => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[letra]);
}

function obtenerObjeto(data) {
  return Array.isArray(data) ? data[0] : data;
}

function mensaje(elemento, texto) {
  const el = document.getElementById(elemento);
  if (el) el.textContent = texto;
}

// ==========================================
// 🔐 INICIO DE SESIÓN
// ==========================================

const loginBtn = document.getElementById("loginBtn");

loginBtn.addEventListener("click", iniciarSesion);

document.getElementById("studentCode")
  .addEventListener("keydown", e => {
    if (e.key === "Enter") iniciarSesion();
  });

async function iniciarSesion() {
  const codigo = document.getElementById("studentCode")
    .value.trim();

  if (!codigo) {
    mensaje("loginMessage", "⚠️ Ingresa tu código.");
    return;
  }

  loginBtn.disabled = true;
  mensaje("loginMessage", "⏳ Verificando estudiante...");

  try {
    const { data, error } = await db.rpc(
      "login_estudiante",
      { p_codigo: codigo }
    );

    if (error) throw error;

    estudiante = obtenerObjeto(data);

    if (!estudiante || !estudiante.nombre) {
      throw new Error("Código incorrecto.");
    }

    codigoEstudiante = codigo.toUpperCase();

    sessionStorage.setItem(
      "mathBattleCode",
      codigoEstudiante
    );

    document.getElementById("login").classList.add("hidden");
    document.getElementById("dashboard").classList.remove("hidden");

    document.getElementById("studentName").textContent =
      estudiante.nombre;

    document.getElementById("profileName").textContent =
      estudiante.nombre;

    document.getElementById("profileCode").textContent =
      "Código: " + codigoEstudiante;

    mostrarVista("home");

    cargarRanking();
    cargarPerfil();

  } catch (error) {
    mensaje("loginMessage", "❌ " + error.message);
  } finally {
    loginBtn.disabled = false;
  }
}

// ==========================================
// 🧭 NAVEGACIÓN
// ==========================================

document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    mostrarVista(btn.dataset.view);

    if (btn.dataset.view === "home") cargarRanking();
    if (btn.dataset.view === "profile") cargarPerfil();
  });
});

document.querySelectorAll("[data-go]").forEach(btn => {
  btn.addEventListener("click", () => {
    mostrarVista(btn.dataset.go);
  });
});

document.querySelectorAll("[data-topic]").forEach(btn => {
  btn.addEventListener("click", () => {
    iniciarPractica(btn.dataset.topic);
  });
});

document.getElementById("goExamBtn").addEventListener(
  "click", () => mostrarVista("exam")
);

// ==========================================
// 🎮 MINIJUEGOS
// ==========================================

function construirMinijuegos() {
  const contenedor = document.getElementById("gamesList");

  contenedor.innerHTML = Object.entries(temas).map(([id, tema]) => `
    <button class="game-card" data-topic="${id}">
      <span class="game-icon">${tema.emoji}</span>
      <span class="game-title">${tema.nombre}</span>
      <span class="game-description">Practica y resuelve</span>
      <span class="game-arrow">→</span>
    </button>
  `).join("") + `
    <button class="game-card mixed-card" data-topic="mixto">
      <span class="game-icon">🔥</span>
      <span class="game-title">Desafío mixto</span>
      <span class="game-description">Todos los temas juntos</span>
      <span class="game-arrow">→</span>
    </button>
  `;

  contenedor.querySelectorAll("[data-topic]").forEach(btn => {
    btn.addEventListener("click", () => {
      iniciarPractica(btn.dataset.topic);
    });
  });
}

async function iniciarPractica(tema) {
  temaActual = tema;
  puntosPractica = 0;
  preguntaActual = 0;

  opcionesMezcladas.clear();

  mostrarVista("quiz");

  mensaje("quizTopic", "⏳ Preparando preguntas...");

  try {
    let preguntas = [];

    if (tema === "mixto") {
      const resultados = await Promise.all(
        Object.values(temas).map(t =>
          db.rpc("obtener_preguntas_practica", {
            p_tema: t.rpc
          })
        )
      );

      resultados.forEach(resultado => {
        if (resultado.error) throw resultado.error;
        if (Array.isArray(resultado.data)) {
          preguntas.push(...resultado.data);
        }
      });

      preguntas = mezclar(preguntas);

      const ids = new Set();

      preguntas = preguntas.filter(p => {
        if (ids.has(p.id)) return false;
        ids.add(p.id);
        return true;
      });

    } else {
      const { data, error } = await db.rpc(
        "obtener_preguntas_practica",
        { p_tema: temas[tema].rpc }
      );

      if (error) throw error;

      preguntas = data || [];
    }

    if (!preguntas.length) {
      throw new Error("No hay preguntas disponibles para este tema.");
    }

    preguntasPractica = mezclar(preguntas);

    mensaje("quizTopic", "🎮 " + nombreTema(tema));

    mostrarPreguntaPractica();

  } catch (error) {
    mensaje("quizTopic", "❌ " + error.message);
    console.error("Error al cargar práctica:", error);
  }
}

function nombreTema(id) {
  if (id === "mixto") return "🔥 Desafío mixto";
  return temas[id]?.nombre || id;
}

function mezclar(lista) {
  const copia = [...lista];

  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }

  return copia;
}

// ==========================================
// OPCIONES DE RESPUESTA
// ==========================================

function normalizarOpciones(opciones) {
  if (typeof opciones === "string") {
    try {
      opciones = JSON.parse(opciones);
    } catch {
      opciones = opciones.split("|");
    }
  }

  if (Array.isArray(opciones)) {
    return opciones.map((opcion, i) => {
      if (typeof opcion === "object" && opcion !== null) {
        return {
          valor: String(
            opcion.valor ??
            opcion.value ??
            opcion.texto ??
            opcion.text ??
            i
          ),
          texto: String(
            opcion.texto ??
            opcion.text ??
            opcion.label ??
            opcion.valor ??
            opcion.value ??
            ""
          )
        };
      }

      return {
        valor: String(opcion),
        texto: String(opcion)
      };
    });
  }

  if (opciones && typeof opciones === "object") {
    return Object.entries(opciones).map(([clave, valor]) => ({
      valor: String(clave),
      texto: String(valor)
    }));
  }

  return [];
}

function normalizarTexto(valor) {
  return String(valor ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFC")
    .toLocaleLowerCase();
}

// ==========================================
// 🎲 MEZCLAR OPCIONES DE LOS MINIJUEGOS
// ==========================================

function obtenerOpcionesMezcladas(pregunta) {
  const id = String(pregunta.id);

  if (opcionesMezcladas.has(id)) {
    return opcionesMezcladas.get(id);
  }

  const originales = normalizarOpciones(pregunta.opciones);

  if (originales.length !== 4) {
    console.error(
      "La pregunta no tiene exactamente cuatro opciones:",
      pregunta.id,
      originales
    );

    const mezclaSimple = mezclar(originales);
    opcionesMezcladas.set(id, mezclaSimple);
    return mezclaSimple;
  }

  const correcta = normalizarTexto(
    pregunta.respuesta_correcta
  );

  const indiceCorrecto = originales.findIndex(opcion =>
    normalizarTexto(opcion.texto) === correcta ||
    normalizarTexto(opcion.valor) === correcta
  );

  if (indiceCorrecto === -1) {
    console.error(
      "No coincide respuesta_correcta con ninguna opción.",
      {
        pregunta: pregunta.id,
        respuestaCorrecta: pregunta.respuesta_correcta,
        opciones: originales
      }
    );

    const mezclaSimple = mezclar(originales);
    opcionesMezcladas.set(id, mezclaSimple);
    return mezclaSimple;
  }

  const opcionCorrecta = originales[indiceCorrecto];

  const incorrectas = originales.filter(
    (_, indice) => indice !== indiceCorrecto
  );

  const incorrectasMezcladas = mezclar(incorrectas);

  const posicionCorrecta = Math.floor(Math.random() * 4);

  const resultado = [];
  let indiceIncorrecta = 0;

  for (let posicion = 0; posicion < 4; posicion++) {
    if (posicion === posicionCorrecta) {
      resultado.push(opcionCorrecta);
    } else {
      resultado.push(incorrectasMezcladas[indiceIncorrecta]);
      indiceIncorrecta++;
    }
  }

  opcionesMezcladas.set(id, resultado);

  console.log(
    `Pregunta ${id}: respuesta correcta en ${String.fromCharCode(65 + posicionCorrecta)}`
  );

  return resultado;
}

// ==========================================
// ✅ COMPROBAR RESPUESTA DE MINIJUEGO
// ==========================================

function respuestaEsCorrecta(pregunta, seleccion) {
  const correcta = normalizarTexto(
    pregunta.respuesta_correcta
  );

  const opciones = obtenerOpcionesMezcladas(pregunta);

  const opcionSeleccionada = opciones.find(
    opcion => String(opcion.valor) === String(seleccion)
  );

  if (!opcionSeleccionada) return false;

  return (
    normalizarTexto(opcionSeleccionada.texto) === correcta ||
    normalizarTexto(opcionSeleccionada.valor) === correcta
  );
}

// ==========================================
// MOSTRAR PREGUNTA DE PRÁCTICA
// ==========================================

function mostrarPreguntaPractica() {
  const pregunta = preguntasPractica[preguntaActual];

  if (!pregunta) {
    terminarPractica();
    return;
  }

  document.getElementById("quizCounter").textContent =
    `Pregunta ${preguntaActual + 1} de ${preguntasPractica.length}`;

  document.getElementById("quizScore").textContent =
    "Puntos: " + puntosPractica;

  document.getElementById("quizProgressBar").style.width =
    ((preguntaActual + 1) / preguntasPractica.length * 100) + "%";

  document.getElementById("questionText").textContent =
    pregunta.enunciado || pregunta.pregunta || "Pregunta";

  mensaje("answerFeedback", "");

  const contenedor = document.getElementById("answerOptions");
  contenedor.innerHTML = "";

  const opciones = obtenerOpcionesMezcladas(pregunta);

  opciones.forEach((opcion, indice) => {
    const boton = document.createElement("button");

    boton.className = "answer-btn";
    boton.textContent =
      String.fromCharCode(65 + indice) + ". " + opcion.texto;

    boton.addEventListener("click", () => {
      responderPractica(opcion.valor, boton);
    });

    contenedor.appendChild(boton);
  });

  document.getElementById("nextQuestionBtn").classList.add("hidden");
}

function responderPractica(seleccion, botonElegido) {
  const pregunta = preguntasPractica[preguntaActual];

  const botones = document.querySelectorAll(
    "#answerOptions .answer-btn"
  );

  if (botones[0]?.disabled) return;

  botones.forEach(b => b.disabled = true);

  const correcta = respuestaEsCorrecta(pregunta, seleccion);

  if (correcta) {
    puntosPractica++;
    botonElegido.classList.add("correct");

    mensaje(
      "answerFeedback",
      "✅ ¡Correcto! " + (pregunta.explicacion || "")
    );

  } else {
    botonElegido.classList.add("incorrect");

    botones.forEach(b => {
      if (
        respuestaEsCorrecta(
          pregunta,
          obtenerValorBoton(b, pregunta)
        )
      ) {
        b.classList.add("correct");
      }
    });

    mensaje(
      "answerFeedback",
      "❌ No es correcto. " + (pregunta.explicacion || "")
    );
  }

  document.getElementById("quizScore").textContent =
    "Puntos: " + puntosPractica;

  document.getElementById("nextQuestionBtn").classList.remove("hidden");
}

function obtenerValorBoton(boton, pregunta) {
  const indice = [...boton.parentNode.children].indexOf(boton);
  const opciones = obtenerOpcionesMezcladas(pregunta);

  return opciones[indice]?.valor;
}

document.getElementById("nextQuestionBtn").addEventListener(
  "click", () => {
    preguntaActual++;
    mostrarPreguntaPractica();
  }
);

function terminarPractica() {
  document.getElementById("questionText").textContent =
    "¡Terminaste el minijuego! 🎉";

  document.getElementById("answerOptions").innerHTML = "";

  mensaje(
    "answerFeedback",
    `Tu resultado: ${puntosPractica} de ${preguntasPractica.length} respuestas correctas.`
  );

  document.getElementById("nextQuestionBtn").classList.add("hidden");
}

// ==========================================
// 📝 EXAMEN FINAL
// ==========================================

document.getElementById("startExamBtn").addEventListener(
  "click", iniciarExamen
);

async function iniciarExamen() {
  const boton = document.getElementById("startExamBtn");

  boton.disabled = true;
  mensaje("examMessage", "⏳ Preparando tu examen...");

  try {
    const { data, error } = await db.rpc(
      "iniciar_examen",
      { p_codigo: codigoEstudiante }
    );

    if (error) throw error;

    const sesion = obtenerObjeto(data);

    if (!sesion || !sesion.preguntas || !sesion.sesion_id) {
      throw new Error("No se pudo obtener el examen.");
    }

    sesionExamen = sesion.sesion_id;
    preguntasExamen = sesion.preguntas;
    respuestasExamen = {};
    examenActual = 0;

    if (preguntasExamen.length !== 10) {
      throw new Error("El examen no contiene 10 preguntas.");
    }

    const inicio = new Date(sesion.iniciado_en).getTime();

    if (!Number.isFinite(inicio)) {
      throw new Error("No se pudo verificar la hora de inicio.");
    }

    // ======================================
    // ⏱️ DURACIÓN DEL EXAMEN: 60 MINUTOS
    // ======================================
    fechaLimite = inicio + 60 * 60 * 1000;

    mostrarVista("exam-questions");
    mostrarPreguntaExamen();
    iniciarTemporizador();

  } catch (error) {
    mensaje("examMessage", "❌ " + error.message);
    console.error("Error al iniciar examen:", error);
  } finally {
    boton.disabled = false;
  }
}

// ==========================================
// MOSTRAR PREGUNTAS DEL EXAMEN
// IMPORTANTE: RESPETAR EL ORDEN DE SUPABASE
// ==========================================

function mostrarPreguntaExamen() {
  const pregunta = preguntasExamen[examenActual];

  if (!pregunta) return;

  document.getElementById("examCounter").textContent =
    `Pregunta ${examenActual + 1} de 10`;

  document.getElementById("examAnswered").textContent =
    `Respondidas: ${Object.keys(respuestasExamen).length}/10`;

  document.getElementById("examProgressBar").style.width =
    ((examenActual + 1) / 10 * 100) + "%";

  document.getElementById("examQuestionText").textContent =
    pregunta.enunciado || pregunta.pregunta || "Pregunta";

  const contenedor = document.getElementById("examAnswerOptions");
  contenedor.innerHTML = "";

  const opciones = normalizarOpciones(pregunta.opciones);

  if (opciones.length !== 4) {
    mensaje(
      "examQuestionMessage",
      "⚠️ Esta pregunta no tiene exactamente cuatro opciones."
    );
  } else {
    mensaje("examQuestionMessage", "");
  }

  opciones.forEach((opcion, indice) => {
    const boton = document.createElement("button");

    boton.className = "answer-btn";
    boton.textContent =
      String.fromCharCode(65 + indice) + ". " + opcion.texto;

    if (respuestasExamen[pregunta.id] === opcion.valor) {
      boton.classList.add("selected");
    }

    boton.addEventListener("click", () => {
      respuestasExamen[pregunta.id] = opcion.valor;
      mostrarPreguntaExamen();
    });

    contenedor.appendChild(boton);
  });

  document.getElementById("previousExamBtn").disabled =
    examenActual === 0;

  document.getElementById("nextExamBtn").textContent =
    examenActual === 9 ? "Ver respuestas →" : "Siguiente →";
}

document.getElementById("previousExamBtn").addEventListener(
  "click", () => {
    if (examenActual > 0) {
      examenActual--;
      mostrarPreguntaExamen();
    }
  }
);

document.getElementById("nextExamBtn").addEventListener(
  "click", () => {
    if (examenActual < 9) {
      examenActual++;
      mostrarPreguntaExamen();
    } else {
      mensaje(
        "examQuestionMessage",
        "📋 Has llegado a la última pregunta. Puedes revisar tus respuestas o entregar."
      );
    }
  }
);

// ==========================================
// ⏱️ TEMPORIZADOR DE 60 MINUTOS
// ==========================================

function iniciarTemporizador() {
  clearInterval(temporizador);

  actualizarTemporizador();

  temporizador = setInterval(
    actualizarTemporizador,
    1000
  );
}

function actualizarTemporizador() {
  const restante = Math.max(
    0,
    Math.floor((fechaLimite - Date.now()) / 1000)
  );

  const minutos = Math.floor(restante / 60);
  const segundos = restante % 60;

  document.getElementById("examTimer").textContent =
    `⏱️ ${String(minutos).padStart(2, "0")}:${String(segundos).padStart(2, "0")}`;

  if (restante <= 0) {
    clearInterval(temporizador);
    entregarExamen(true);
  }
}

// ==========================================
// 🏁 ENTREGAR EXAMEN
// ==========================================

document.getElementById("submitExamBtn").addEventListener(
  "click", () => entregarExamen(false)
);

async function entregarExamen(automatico) {
  if (!sesionExamen) return;

  if (!automatico) {
    const confirmar = confirm(
      "¿Seguro que quieres entregar tu examen?"
    );

    if (!confirmar) return;
  }

  clearInterval(temporizador);

  const boton = document.getElementById("submitExamBtn");
  boton.disabled = true;

  mensaje(
    "examQuestionMessage",
    automatico ? "⏱️ Tiempo terminado. Entregando..." : "⏳ Entregando examen..."
  );

  const respuestas = preguntasExamen.map(p => ({
    pregunta_id: p.id,
    respuesta: respuestasExamen[p.id] || ""
  }));

  try {
    const { data, error } = await db.rpc(
      "entregar_examen",
      {
        p_codigo: codigoEstudiante,
        p_sesion: sesionExamen,
        p_respuestas: respuestas
      }
    );

    if (error) throw error;

    const resultado = obtenerObjeto(data);

    if (!resultado) {
      throw new Error("No se recibió el resultado.");
    }

    document.getElementById("finalGrade").textContent =
      `${resultado.nota}/45`;

    mensaje(
      "finalMessage",
      `Respuestas correctas: ${resultado.correctas} de 10. ¡Examen finalizado!`
    );

    sesionExamen = null;
    mostrarVista("result");

    cargarRanking();
    cargarPerfil();

  } catch (error) {
    mensaje(
      "examQuestionMessage",
      "❌ " + error.message
    );

    boton.disabled = false;
    console.error("Error al entregar examen:", error);
  }
}

// ==========================================
// 🏆 RANKING GLOBAL
// ==========================================

document.getElementById("refreshRankingBtn").addEventListener(
  "click", cargarRanking
);

async function cargarRanking() {
  const cuerpo = document.getElementById("rankingBody");

  cuerpo.innerHTML = `
    <tr><td colspan="4">⏳ Actualizando ranking...</td></tr>
  `;

  try {
    const { data, error } = await db.rpc("obtener_ranking");

    if (error) throw error;

    if (!data || data.length === 0) {
      cuerpo.innerHTML = `
        <tr><td colspan="4">Todavía no hay resultados.</td></tr>
      `;
      return;
    }

    cuerpo.innerHTML = data.map((fila, indice) => {
      const fecha = fila.fecha
        ? new Date(fila.fecha).toLocaleDateString("es-BO")
        : "—";

      let puesto = indice + 1;

      if (puesto === 1) puesto = "🥇";
      else if (puesto === 2) puesto = "🥈";
      else if (puesto === 3) puesto = "🥉";

      return `
        <tr>
          <td>${puesto}</td>
          <td>${escaparHTML(fila.nombre)}</td>
          <td><strong>${escaparHTML(fila.nota)}/45</strong></td>
          <td>${escaparHTML(fecha)}</td>
        </tr>
      `;
    }).join("");

  } catch (error) {
    cuerpo.innerHTML = `
      <tr><td colspan="4">❌ No se pudo cargar el ranking.</td></tr>
    `;
    console.error("Error en ranking:", error);
  }
}

// ==========================================
// 👤 PERFIL Y RESULTADO PERSONAL
// ==========================================

async function cargarPerfil() {
  if (!codigoEstudiante) return;

  try {
    const { data, error } = await db.rpc(
      "mi_resultado",
      { p_codigo: codigoEstudiante }
    );

    if (error) throw error;

    const resultado = obtenerObjeto(data);

    if (!resultado || resultado.realizado === false) {
      mensaje(
        "profileResult",
        "📝 Todavía no has completado el examen final."
      );
      return;
    }

    const fecha = resultado.fecha
      ? new Date(resultado.fecha).toLocaleDateString("es-BO")
      : "";

    mensaje(
      "profileResult",
      `🏆 Tu nota: ${resultado.nota}/45 · ${fecha}`
    );

  } catch (error) {
    mensaje("profileResult", "No se pudo consultar tu resultado.");
    console.error(error);
  }
}

// ==========================================
// INICIALIZACIÓN
// ==========================================

construirMinijuegos();

console.log("⚡ MATH BATTLE preparado.");


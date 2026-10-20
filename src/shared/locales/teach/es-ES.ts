import { plural } from "../../plural";
import type { TeachLocaleMessages } from "./en-US";

export const teachEsES: TeachLocaleMessages = {
  menu: {
    title: "Grabar una habilidad",
    hint: "Muestra una tarea al agente una vez",
  },
  pill: {
    recording: "Grabando",
    stop: "Detener",
    stopHint: "Detener la grabación y escribir la habilidad",
  },
  start: {
    title: "Grabar una habilidad",
    description:
      "Haz la tarea tú mismo en esta página y pulsa Detener. La grabación se convierte en una habilidad.",
    purpose: "¿Para qué sirve? (opcional)",
    purposePlaceholder: "Enviar mi hoja de horas semanal",
    varies: "¿Qué cambia cada vez? (opcional)",
    variesPlaceholder: "La semana y el proyecto",
    privacy:
      "Lo que escribes no se graba, solo qué campo usaste. Las contraseñas y los códigos nunca.",
    start: "Empezar a grabar",
    unscriptable:
      "Esta página no se puede grabar. Abre la página donde empieza la tarea.",
    busy: "Hay otra grabación abierta. Guárdala o descártala antes de empezar una nueva.",
    showRecording: "Mostrar la grabación",
  },
  recording: {
    title: "Grabando",
    steps: plural({ one: "{count} paso", other: "{count} pasos" }),
    empty: "Haz la tarea en la página. Cada paso aparece aquí.",
    long: "Las grabaciones largas dan habilidades peores. Detén la grabación al terminar la tarea.",
    full: "La grabación está llena: los pasos siguientes no se graban.",
    unrecorded: plural({
      one: "{count} acción en la página no se pudo grabar. Comprueba que los pasos estén completos.",
      other:
        "{count} acciones en la página no se pudieron grabar. Comprueba que los pasos estén completos.",
    }),
    frames: plural({
      one: "No se grabaron los pasos en {count} marco incrustado.",
      other: "No se grabaron los pasos en {count} marcos incrustados.",
    }),
    stop: "Detener",
    discard: "Descartar",
    deleteStep: "Eliminar paso",
    varies: "Cambia cada vez",
    keepExample: "Guardar lo que escribí como ejemplo",
    dropExample: "No guardar el ejemplo",
    exampleKept: "Ejemplo guardado",
    exampleGone: "La página ya no tiene este valor.",
    secret: "Secreto – nunca se guarda",
  },
  step: {
    click: "Hacer clic en {target}",
    field: "Escribir en {target}",
    fieldSubmitted: "Escribir en {target} y pulsar Intro",
    choose: "Elegir {choice} en {target}",
    chooseSecret: "Elegir una opción en {target}",
    check: "Marcar {target}",
    uncheck: "Desmarcar {target}",
    key: "Pulsar {key}",
    navigate: "Ir a {url}",
    openTab: "Pestaña nueva: {url}",
    switchTab: "Cambio a {site}",
    page: "la página",
  },
  ended: {
    title: "Grabación terminada",
    tabClosed:
      "Se cerró su pestaña. Aún no se ha enviado nada: escribe la habilidad con estos pasos o descártalos.",
    idle: "No pasó nada durante un rato. Aún no se ha enviado nada: escribe la habilidad con estos pasos o descártalos.",
    consent:
      "Se detuvo en la página. Para escribir la habilidad, estos pasos se envían a tu modelo.",
    write: "Escribir la habilidad",
  },
  writing: {
    title: "Escribiendo la habilidad…",
    description: "El modelo convierte los pasos grabados en instrucciones.",
  },
  failed: {
    title: "No se pudo escribir la habilidad",
    retry: "Reintentar",
  },
  save: {
    title: "Guardar la habilidad",
    name: "Nombre",
    description: "Descripción",
    stored:
      "Se guarda como habilidad con sus pasos: qué control en qué página. Lo que escribiste no se guarda. Se sincroniza como tus otras habilidades.",
    check: "Guardar y comprobar",
    checkHint:
      "Ejecuta la habilidad una vez en una pestaña nueva y te pregunta antes del último paso",
    draft: "Omitir, guardar como borrador",
  },
  check: {
    message: "Comprobar la habilidad grabada {name}",
    passed: "Comprobación superada: {name} está verificada.",
    auto: "Dejar que el agente la use automáticamente",
    autoOn: "El agente ahora usa {name} cuando una petición encaja.",
    diverged: "La comprobación fue distinta en el paso {step}.",
    divergedNoStep: "La comprobación fue distinta.",
    fix: "Corregir los pasos",
    fixMessage: "Corregir los pasos de {name} según esta comprobación",
    recordAgain: "Volver a grabar desde aquí",
    keepDraft: "Guardar como borrador",
    done: "Listo",
  },
  status: {
    recorded: "Grabada",
    draft: "Borrador",
    verified: "Verificada",
  },
  skillsHint:
    "Para grabar una habilidad, abre el panel lateral en la página donde empieza la tarea y elige + → Grabar una habilidad.",
  tool: {
    skillCheck: {
      running: "Informando de la comprobación",
      done: "Comprobación informada",
    },
  },
};

import { plural } from "../../plural";
import type { TasksLocaleMessages } from "./en-US";

export const tasksEsES: TasksLocaleMessages = {
  title: "Tareas",
  untitled: "Tarea sin título",
  count: plural({ one: "{count} tarea", other: "{count} tareas" }),
  newTask: "Nueva tarea",
  editTask: "Editar tarea",
  makeTask: "Convertir en tarea",
  empty: "Aún no hay tareas",
  emptyHint:
    "Haz que el agente haga algo más tarde, según un horario o cuando cambie una página.",
  kinds: {
    once: "Una vez",
    interval: "Repetir",
    daily: "Cada día",
    weekly: "Cada semana",
    watch: "Vigilar una página",
  },
  units: {
    minutes: plural({ one: "{count} minuto", other: "{count} minutos" }),
    hours: plural({ one: "{count} hora", other: "{count} horas" }),
    days: plural({ one: "{count} día", other: "{count} días" }),
  },
  unitNames: {
    minutes: "minutos",
    hours: "horas",
    days: "días",
  },
  form: {
    title: "Título",
    prompt: "Qué hacer",
    promptPlaceholder:
      "Revisar las noticias de esta página y resumir lo que haya de nuevo",
    watchPrompt: "Condición y qué informar",
    watchPromptPlaceholder: "Avísame cuando el precio baje de 50",
    kind: "Cuándo",
    at: "Fecha y hora",
    every: "Cada",
    unit: "Unidad",
    time: "Hora",
    days: "Días",
    url: "Dirección de la página",
    part: "Parte de la página",
    partPage: "Contenido principal",
    partElement: "Elemento seleccionado",
    pickElement: "Elegir en la página",
    checkEvery: "Comprobar cada (minutos)",
    watchHint:
      "Cada comprobación lee la página sin el modelo; el agente solo se ejecuta si el texto vigilado cambió.",
    agent: "Agente",
    mayAct:
      "Este agente puede actuar por su cuenta: sus ejecuciones pueden usar las herramientas que hacen clic, escriben o cambian cosas.",
    looksOnly:
      "Las ejecuciones solo miran: leen, buscan e informan, y nunca hacen clic, escriben ni cambian nada.",
    device: "Se ejecuta en",
    thisDevice: "{name} (este dispositivo)",
    save: "Guardar tarea",
    invalidPrompt: "Indica qué debe hacer la tarea.",
    invalidUrl: "Escribe una dirección http o https.",
    invalidAt: "Elige una fecha y una hora.",
  },
  schedule: {
    once: "Una vez, {time}",
    every: "Cada {amount}",
    daily: "Cada día a las {time}",
    weekly: "{days} a las {time}",
    watch: plural({ other: "Vigila {page} cada {count} min" }),
  },
  status: {
    running: "En curso",
    paused: "En pausa",
    pausedFailures: "En pausa tras varios fallos",
    needsUser: "Te necesita",
    allPaused: "Todas las tareas están en pausa",
    otherDevice: "Se ejecuta en {device}",
    done: "Hecha",
  },
  results: {
    reported: "Informó",
    nothing: "Nada nuevo",
    met: "Condición cumplida",
    notMet: "Condición no cumplida",
    unchanged: "Sin cambios",
    answered: "Respondió",
    needsUser: "Te necesita",
    failed: "Falló",
  },
  lastRun: "Última ejecución {time}",
  nextRun: "Próxima ejecución {time}",
  actions: {
    runNow: "Ejecutar ahora",
    pause: "Pausar",
    resume: "Reanudar",
    edit: "Editar",
    delete: "Eliminar tarea",
    deleteConfirm:
      "¿Eliminar esta tarea? Sus resultados anteriores siguen en el historial de chats.",
    openResult: "Abrir resultado",
  },
  notify: {
    titlePrefix: {
      result: "Resultado de tarea",
      met: "Vigilancia",
      needsUser: "Una tarea te necesita",
      paused: "Tarea en pausa",
    },
    finished: "La tarea terminó. Ábrela para ver el resultado.",
    conditionMet: "Se cumple la condición vigilada.",
    needsUser: "La tarea necesita tu respuesta para continuar.",
    paused: "La tarea falló varias veces seguidas y se ha pausado.",
  },
  agentPermission: {
    label: "Actuar por su cuenta",
    description:
      "En tareas programadas y vigilancias, puede usar sus herramientas que hacen clic, escriben, envían o cambian cosas. Desactivado: esas ejecuciones solo miran.",
  },
  settings: {
    title: "Tareas programadas",
    description:
      "Las tareas y vigilancias se ejecutan en segundo plano mientras el navegador está abierto.",
    pauseAll: "Pausar todas las tareas",
    pauseAllDescription:
      "No se ejecuta ninguna tarea programada ni vigilancia hasta que lo desactives, en todos los dispositivos.",
    notificationsUnavailable:
      "Este navegador no tiene notificaciones del sistema: los resultados se muestran en el botón de la barra de herramientas y en la lista de tareas.",
  },
  tool: {
    scheduleTask: {
      running: "Programando una tarea",
      done: "Tarea programada",
    },
    taskResult: {
      running: "Informando del resultado",
      done: "Resultado informado",
    },
  },
};

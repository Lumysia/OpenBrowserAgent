import { plural } from "../../plural";
import type { DisplayMessages } from "./en-US";

export const displayEsES: DisplayMessages = {
  counts: {
    models: plural({ one: "{count} modelo", other: "{count} modelos" }),
    files: plural({ one: "{count} archivo", other: "{count} archivos" }),
    characters: plural({
      one: "{count} carácter",
      other: "{count} caracteres",
    }),
  },
  providerTypes: {
    openai: "Compatible con OpenAI",
    "openai-responses": "OpenAI Responses",
    anthropic: "Compatible con Anthropic",
  },
  builtinMcpServers: {
    exa: "Búsqueda web y extracción del contenido de páginas.",
    parallel: "Búsqueda web con fragmentos y descarga de páginas.",
    tinyfish: "Búsqueda web y de noticias.",
    firecrawl:
      "Búsqueda web, extracción de páginas y análisis de documentos. Límite gratuito de solicitudes bajo.",
  },
  builtinSkills: {
    "fill-form": {
      name: "Rellenar formulario",
      description:
        "Rellena formularios web con los datos o el archivo que le des, revisa cada campo y solo los envía cuando tú lo digas.",
    },
    "tidy-tabs": {
      name: "Ordenar pestañas",
      description:
        "Cierra pestañas duplicadas, agrupa las relacionadas y encuentra las que ya no necesitas.",
    },
    "openbrowseragent-help": {
      name: "Ayuda de OpenBrowserAgent",
      description:
        "Responde preguntas sobre cómo usar y configurar OpenBrowserAgent.",
    },
    "skill-creator": {
      name: "Creador de habilidades",
      description:
        "Crea, guarda o mejora habilidades, por ejemplo a partir de una tarea que acabas de hacer.",
    },
    "local-execution-bridge-setup": {
      name: "Configurar puente de ejecución local",
      description:
        "Configura, prueba, actualiza o elimina un puente de ejecución local para que los agentes puedan ejecutar comandos en tu ordenador.",
    },
  },
  errors: {
    noModel:
      "No hay ningún modelo configurado. Añade un proveedor en «Configuración» → «Proveedores de IA».",
    subAgentStopped: "Se detuvo el subagente.",
    baseUrlRequired: "Introduce una URL base.",
  },
  toolSteps: {
    failed: "Error",
    page: "Página",
    tabs: plural({ one: "{count} pestaña", other: "{count} pestañas" }),
    lines: plural({ one: "{count} línea", other: "{count} líneas" }),
    matchingLines: plural({
      one: "{count} línea coincidente",
      other: "{count} líneas coincidentes",
    }),
    matchingLinesWithOccurrences: plural({
      one: "{count} línea coincidente ({occurrences})",
      other: "{count} líneas coincidentes ({occurrences})",
    }),
    occurrences: plural({
      one: "{count} aparición",
      other: "{count} apariciones",
    }),
    results: plural({ one: "{count} resultado", other: "{count} resultados" }),
    items: plural({ one: "{count} elemento", other: "{count} elementos" }),
    tools: plural({
      one: "{count} herramienta",
      other: "{count} herramientas",
    }),
    editsApplied: plural({
      one: "{applied} de {count} cambio aplicado",
      other: "{applied} de {count} cambios aplicados",
    }),
    actions: {
      open: "Abierta",
      switch: "Cambiado a",
      close: "Cerrada",
      navigate: "Página abierta",
      back: "Página anterior",
      forward: "Página siguiente",
      reload: "Recargada",
      group: "Agrupadas",
      ungroup: "Desagrupadas",
      list: "Listado",
      search: "Búsqueda",
      read: "Lectura",
      write: "Escritura",
      append: "Texto añadido al final",
      replace: "Texto reemplazado",
      delete: "Eliminación",
      create: "Creación",
      patch: "Edición",
      add: "Alta",
      update: "Actualización",
      test: "Prueba",
      status: "Consulta de estado",
      resources: "Recursos de red listados",
      emulate: "Emulación de un dispositivo",
      reset: "Emulación restablecida",
      download: "Descarga",
      save: "Guardado",
      wait: "Espera de una descarga",
      retry: "Reintento",
      images: "Imágenes guardadas",
      run: "Ejecución",
      start: "Inicio",
      cancel: "Cancelación",
    },
    commandStates: {
      running: "En curso",
      done: "Terminado",
      error: "Error",
      canceled: "Cancelado",
      missing: "Tarea no encontrada",
    },
    actStepSeparator: ", ",
    actSteps: {
      click: plural({ one: "{count} clic", other: "{count} clics" }),
      type: plural({
        one: "{count} campo rellenado",
        other: "{count} campos rellenados",
      }),
      press: plural({
        one: "{count} tecla pulsada",
        other: "{count} teclas pulsadas",
      }),
      select: plural({
        one: "{count} opción seleccionada",
        other: "{count} opciones seleccionadas",
      }),
      hover: plural({
        one: "{count} elemento señalado",
        other: "{count} elementos señalados",
      }),
      scroll: plural({
        one: "{count} desplazamiento",
        other: "{count} desplazamientos",
      }),
      wait: plural({ one: "{count} espera", other: "{count} esperas" }),
      drag: plural({
        one: "{count} elemento arrastrado",
        other: "{count} elementos arrastrados",
      }),
      dialog: plural({
        one: "{count} diálogo respondido",
        other: "{count} diálogos respondidos",
      }),
      other: plural({ one: "{count} paso más", other: "{count} pasos más" }),
    },
  },
};

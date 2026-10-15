import type { SetupMessages } from "./en-US";

export const setupEsES: SetupMessages = {
  continueSetup: "Continuar la configuración",
  runAgain: "Volver a ejecutar la configuración",
  progressLabel: "Pasos de la configuración",
  progressStep: "Paso {current} de {total}: {step}",
  steps: {
    language: "Idioma",
    provider: "Proveedor de IA",
    pages: "En las páginas",
    done: "Listo",
  },
  back: "Atrás",
  next: "Siguiente",
  skipStep: "Omitir",
  languageTitle: "Elige tus idiomas",
  languageDescription:
    "El idioma de la extensión y el idioma al que se traducen las páginas. La mayoría deja ambos como están.",
  providerTitle: "Conecta un proveedor de IA",
  providerDescription:
    "El chat y el agente necesitan un proveedor de IA. Elige un servicio o cualquier servidor compatible con OpenAI o Anthropic con su Base URL.",
  providerPlaceholder: "Elige un proveedor de IA",
  providerReady: "{name} está listo. Pulsa «Siguiente» para continuar.",
  testConnection: "Probar conexión",
  testingConnection: "Probando…",
  connectionOk: "Conectado. {model} ha respondido.",
  connectionFailed: "No se pudo conectar con el proveedor de IA",
  modelFailed: "Conectado, pero {model} no ha respondido",
  noModelsListed:
    "Conectado, pero el proveedor de IA no ha listado ningún modelo. Escribe el nombre de un modelo.",
  model: "Modelo",
  modelName: "Nombre del modelo",
  modelNameHint:
    "Si el proveedor de IA no lista sus modelos, escribe uno por su nombre y vuelve a probar.",
  pagesTitle: "En las páginas",
  pagesDescription:
    "Lo que OpenBrowserAgent añade a las páginas que visitas. Puedes cambiarlo más tarde en Configuración → En las páginas.",
  translateButtonDescription:
    "Un pequeño botón en el borde de la página la traduce o muestra el original.",
  smartBarTitle: "Barra inteligente al seleccionar texto",
  smartBarDescription:
    "Acciones rápidas junto al texto que seleccionas. No se envía nada hasta que eliges una.",
  subtitlesDescription:
    "Los vídeos con subtítulos muestran cada línea con su traducción debajo.",
  doneTitle: "Todo listo",
  doneDescription:
    "Abre el panel lateral y pregunta sobre la página en la que estás. Estos atajos funcionan en cualquier página.",
  noProviderNote:
    "El chat necesita un proveedor de IA. La traducción de páginas con el traductor integrado funciona sin él.",
  welcomeTitle: "Te damos la bienvenida a OpenBrowserAgent",
  openPanelDescription:
    "Fija OpenBrowserAgent desde el menú Extensiones del navegador y haz clic en su icono para abrir el panel lateral.",
  openPanel: "Abrir panel lateral",
  joinLink:
    "¿Ya usas OpenBrowserAgent en otro dispositivo? Pega un código de sincronización",
  codeTab: "Pegar código",
  manualTab: "Configuración manual",
  code: "Código de sincronización",
  codeDescription:
    "Cópialo en tu otro dispositivo en Configuración → Sincronización. Las opciones de sincronización del código sustituyen a las de este dispositivo.",
  codeInvalid:
    "No es un código de sincronización válido. Cópialo de nuevo y pega el código completo.",
  connect: "Conectar y sincronizar",
  testing: "Conectando…",
  pulling: "Sincronizando…",
  failed:
    "No se ha podido conectar. Revisa el código o los datos del servidor e inténtalo de nuevo.",
  connected: "Conectado. Tu configuración se está sincronizando.",
  keysLocked:
    "Tus claves API están sincronizadas pero bloqueadas. Introduce tu frase de contraseña de sincronización.",
  unlock: "Desbloquear",
  skip: "Ahora no",
};

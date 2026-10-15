import type { PageTranslateLocaleMessages } from "./en-US";

export const pageTranslateEsES: PageTranslateLocaleMessages = {
  menu: {
    translatePage: "Traducir esta página",
    showOriginal: "Mostrar original",
  },
  menuItemLabel: "Traducir esta página / Mostrar original",
  settingsTitle: "Traducción de páginas",
  settingsDescription:
    "Traduce una página con el botón de su borde, el atajo de teclado o «Traducir esta página» en el menú contextual. Repítelo para volver al original.",
  engine: "Motor de traducción",
  engineDescription: "Elige con qué se traducen las páginas.",
  engines: {
    model: "Modelo de IA",
    browser: "Traductor integrado (en el dispositivo)",
    google: "Google Traductor (gratis)",
    microsoft: "Microsoft Translator (gratis)",
  },
  engineDetails: {
    model:
      "Tu proveedor de IA traduce las páginas con el modelo de traducción elegido en Proveedores de IA y modelos.",
    browser:
      "El navegador traduce en este dispositivo; ningún texto sale de él. Cada idioma se descarga una vez. Cuando no puede traducir una página, la traduce el modelo de IA de abajo.",
    google:
      "Un servicio gratuito no oficial, no una API de Google. Puede dejar de funcionar en cualquier momento.",
    microsoft:
      "Un servicio gratuito no oficial, no una API de Microsoft. Puede dejar de funcionar en cualquier momento.",
  },
  cloudNotice: {
    google:
      "El texto de la página se envía a Google para traducirlo. Si Google falla en una página, Microsoft traduce el resto de la página.",
    microsoft:
      "El texto de la página se envía a Microsoft para traducirlo. Si Microsoft falla en una página, Google traduce el resto de la página.",
  },
  engineNames: {
    model: "el modelo de IA",
    browser: "el traductor integrado",
    google: "Google",
    microsoft: "Microsoft",
  },
  privacyLink: "Política de privacidad",
  modelDescription: "El modelo que traduce las páginas.",
  targetLanguage: "Traducir a",
  targetLanguageDescription:
    "Las páginas, los subtítulos de vídeos y «Traducir» de la barra inteligente usan este idioma. No cambia el idioma de la extensión.",
  followInterface: "Idioma de la extensión ({language})",
  display: "Visualización",
  displayDescription:
    "«Original y traducción» mantiene cada párrafo y añade la traducción debajo.",
  displayModes: {
    bilingual: "Original y traducción",
    translation: "Solo traducción",
  },
  translateMenus: "Traducir también menús y botones",
  translateMenusDescription:
    "Si está desactivado, las etiquetas cortas de la navegación, los menús, los botones, las pestañas y los pies de página no cambian; los títulos, las frases y las preguntas que contienen se traducen igualmente.",
  cache: "Traducciones guardadas",
  cacheDescription:
    "Las traducciones se guardan 30 días en este dispositivo, así que las páginas traducidas vuelven al instante.",
  clearCache: "Borrar traducciones guardadas",
  cacheCleared: "Se han borrado las traducciones guardadas.",
  clearCacheFailed: "No se han podido borrar las traducciones guardadas",
  errors: {
    unavailable:
      "{engine} no está disponible. Revisa la traducción de páginas en la configuración.",
    rateLimited:
      "{engine} está limitando las solicitudes de esta red. Inténtalo más tarde o elige otro motor en la configuración.",
    refused:
      "{engine} ha rechazado la traducción. Elige otro motor en la configuración.",
    network:
      "No se ha podido conectar con {engine}. Comprueba tu conexión e inténtalo de nuevo.",
    failed: "{engine} no ha podido traducir algunos párrafos.",
    allFailed:
      "Ni {engine} ni {fallback} han podido traducir. Inténtalo más tarde o elige otro motor en la configuración.",
  },
  switched: {
    rateLimited:
      "En esta página, {fallback} toma el relevo: {engine} está limitando las solicitudes.",
    failed:
      "En esta página, {fallback} toma el relevo: {engine} no funciona en este momento.",
    unavailable:
      "En esta página, {fallback} toma el relevo: {engine} no puede traducirla aquí.",
  },
  browserMissing:
    "Este navegador no tiene traductor integrado, así que las páginas las traduce el modelo de IA de abajo.",
  notStarted:
    "No se ha podido empezar a traducir esta página. Vuelve a cargar la página e inténtalo de nuevo.",
  unavailablePage:
    "No se puede traducir esta página: el navegador no permite que las extensiones la modifiquen.",
  button: {
    translating: "Traduciendo…",
    hide: "Ocultar el botón de traducir",
    hideOnSite: "Ocultar en {site}",
    hideEverywhere: "Ocultar en todas partes",
    setting: "Botón de traducir en las páginas",
    settingDescription:
      "Un pequeño botón en el borde de las páginas web traduce la página o muestra el original. Arrástralo para moverlo; se queda en el borde más cercano de la ventana. Solo aparece en páginas que no están ya en el idioma de «Traducir a».",
    move: "Las flechas lo mueven a lo largo del borde; E lo lleva al borde siguiente.",
    hiddenSites: "Oculto en estos sitios",
    hiddenSitesDescription:
      "El botón no aparece en estos sitios. Un sitio incluye sus subdominios.",
  },
  subtitles: {
    menu: "Traducir subtítulos",
    menuHide: "Ocultar subtítulos traducidos",
    menuItemLabel: "Traducir subtítulos / Ocultarlos (en vídeos)",
    noCaptions:
      "Aún no se han encontrado subtítulos para este vídeo. Activa los subtítulos en el reproductor: se traducen en cuanto aparecen.",
    liveOnly:
      "Se traducen los subtítulos en pantalla a medida que aparecen. Para traducir por adelantado, desactiva y vuelve a activar los subtítulos del reproductor.",
    noVideo: "Aquí no hay ningún vídeo cuyos subtítulos traducir.",
    // Settings: subtitles start by themselves on every video.
    setting: "Traducir subtítulos de vídeos",
    settingDescription:
      "Los vídeos con subtítulos muestran por sí solos cada línea con su traducción debajo, en todos los sitios. «Traducir subtítulos» en el menú contextual de un vídeo los desactiva o activa para ese vídeo. Si esta opción está desactivada, el menú y «Traducir esta página» siguen traduciéndolos.",
  },
};

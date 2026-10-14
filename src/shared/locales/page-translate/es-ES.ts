import type { PageTranslateLocaleMessages } from "./en-US";

export const pageTranslateEsES: PageTranslateLocaleMessages = {
  menu: {
    translatePage: "Traducir esta página",
    showOriginal: "Mostrar original",
  },
  menuItemLabel: "Traducir esta página / Mostrar original",
  settingsTitle: "Traducción de páginas",
  settingsDescription:
    "Elige «Traducir esta página» en el menú contextual para traducir una página y «Mostrar original» para volver al original.",
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
      "Tu proveedor de IA traduce las páginas con el modelo que elijas abajo.",
    browser:
      "El navegador traduce en este dispositivo; ningún texto sale de él. Cada idioma se descarga una vez.",
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
  freeServices: {
    google: "Google",
    microsoft: "Microsoft",
  },
  privacyLink: "Política de privacidad",
  model: "Modelo",
  modelDescription: "El modelo que traduce las páginas.",
  defaultModel: "El mismo modelo que el chat",
  targetLanguage: "Traducir a",
  targetLanguageDescription:
    "Las páginas se traducen a este idioma. No cambia el idioma de la extensión.",
  followInterface: "Idioma de la extensión ({language})",
  display: "Visualización",
  displayDescription:
    "«Original y traducción» mantiene cada párrafo y añade la traducción debajo.",
  displayModes: {
    bilingual: "Original y traducción",
    translation: "Solo traducción",
  },
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
      "{engine} está limitando las solicitudes; esta página se traduce ahora con {fallback}.",
    failed:
      "{engine} no funciona en este momento; esta página se traduce ahora con {fallback}.",
  },
  browserUnsupported:
    "El traductor integrado no puede traducir esta página a {language}.",
  unavailablePage:
    "No se puede traducir esta página: el navegador no permite que las extensiones la modifiquen.",
};

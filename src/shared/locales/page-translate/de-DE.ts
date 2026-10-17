import type { PageTranslateLocaleMessages } from "./en-US";

export const pageTranslateDeDE: PageTranslateLocaleMessages = {
  menu: {
    translatePage: "Diese Seite übersetzen",
    showOriginal: "Original anzeigen",
  },
  menuItemLabel: "Diese Seite übersetzen / Original anzeigen",
  settingsTitle: "Seitenübersetzung",
  settingsDescription:
    "Übersetzen Sie eine Seite mit der Schaltfläche an ihrem Rand, der Tastenkombination oder „Diese Seite übersetzen“ im Kontextmenü. Dasselbe noch einmal zeigt das Original.",
  engine: "Übersetzungsdienst",
  engineDescription: "Wählen Sie, womit Seiten übersetzt werden.",
  engines: {
    model: "KI-Modell",
    browser: "Integrierter Übersetzer (auf dem Gerät)",
    google: "Google Übersetzer (kostenlos)",
    microsoft: "Microsoft Translator (kostenlos)",
  },
  engineDetails: {
    model:
      "Ihr KI-Anbieter übersetzt Seiten mit dem Übersetzungsmodell aus „KI-Anbieter und Modelle“.",
    browser:
      "Der Browser übersetzt auf diesem Gerät; kein Text verlässt es. Jede Sprache wird einmal heruntergeladen. Wo er eine Seite nicht übersetzen kann, übernimmt das unten gewählte KI-Modell.",
    google:
      "Ein inoffizieller kostenloser Dienst, keine API von Google. Er kann jederzeit aufhören zu funktionieren.",
    microsoft:
      "Ein inoffizieller kostenloser Dienst, keine API von Microsoft. Er kann jederzeit aufhören zu funktionieren.",
  },
  cloudNotice: {
    google:
      "Der Text der Seite wird zum Übersetzen an Google gesendet. Wenn Google auf einer Seite ausfällt, übersetzt Microsoft den Rest der Seite.",
    microsoft:
      "Der Text der Seite wird zum Übersetzen an Microsoft gesendet. Wenn Microsoft auf einer Seite ausfällt, übersetzt Google den Rest der Seite.",
  },
  engineNames: {
    model: "das KI-Modell",
    browser: "der integrierte Übersetzer",
    google: "Google",
    microsoft: "Microsoft",
  },
  privacyLink: "Datenschutzerklärung",
  modelDescription: "Das Modell, das Seiten übersetzt.",
  targetLanguage: "Übersetzen in",
  targetLanguageDescription:
    "Seiten, Video-Untertitel und „Übersetzen“ in der Smart Bar verwenden diese Sprache. Die Sprache der Erweiterung ändert sich nicht.",
  followInterface: "Sprache der Erweiterung ({language})",
  display: "Anzeige",
  displayDescription:
    "„Original und Übersetzung“ behält jeden Absatz und fügt die Übersetzung darunter ein.",
  displayModes: {
    bilingual: "Original und Übersetzung",
    translation: "Nur Übersetzung",
  },
  translateMenus: "Auch Menüs und Schaltflächen übersetzen",
  translateMenusDescription:
    "Wenn aus, bleiben die kurzen Beschriftungen von Navigation, Menüs, Schaltflächen, Tabs und Fußzeilen der Seite unverändert; Überschriften, Sätze und Fragen darin werden trotzdem übersetzt.",
  cache: "Gespeicherte Übersetzungen",
  cacheDescription:
    "Übersetzungen bleiben 30 Tage auf diesem Gerät, damit übersetzte Seiten sofort wieder erscheinen.",
  clearCache: "Gespeicherte Übersetzungen löschen",
  cacheCleared: "Gespeicherte Übersetzungen gelöscht.",
  clearCacheFailed: "Gespeicherte Übersetzungen konnten nicht gelöscht werden",
  errors: {
    unavailable:
      "{engine} ist nicht verfügbar. Prüfen Sie die Seitenübersetzung in den Einstellungen.",
    rateLimited:
      "{engine} begrenzt Anfragen aus diesem Netzwerk. Versuchen Sie es später erneut oder wählen Sie in den Einstellungen einen anderen Dienst.",
    refused:
      "{engine} hat die Übersetzung abgelehnt. Wählen Sie in den Einstellungen einen anderen Dienst.",
    network:
      "{engine} ist nicht erreichbar. Prüfen Sie Ihre Verbindung und versuchen Sie es erneut.",
    failed: "{engine} konnte einige Absätze nicht übersetzen.",
    allFailed:
      "Weder {engine} noch {fallback} konnte übersetzen. Versuchen Sie es später erneut oder wählen Sie in den Einstellungen einen anderen Dienst.",
  },
  switched: {
    rateLimited:
      "Für diese Seite übernimmt jetzt {fallback}: {engine} begrenzt die Anfragen.",
    failed:
      "Für diese Seite übernimmt jetzt {fallback}: {engine} funktioniert gerade nicht.",
    unavailable:
      "Für diese Seite übernimmt jetzt {fallback}: {engine} kann sie hier nicht übersetzen.",
  },
  browserMissing:
    "Dieser Browser hat keinen integrierten Übersetzer; Seiten übersetzt daher das unten gewählte KI-Modell.",
  notStarted:
    "Die Übersetzung dieser Seite konnte nicht gestartet werden. Laden Sie die Seite neu und versuchen Sie es erneut.",
  unavailablePage:
    "Diese Seite kann nicht übersetzt werden: Der Browser lässt Erweiterungen sie nicht ändern.",
  button: {
    translating: "Wird übersetzt…",
    hide: "Übersetzen-Schaltfläche ausblenden",
    hideOnSite: "Auf {site} ausblenden",
    hideEverywhere: "Überall ausblenden",
    setting: "Übersetzen-Schaltfläche auf Seiten",
    settingDescription:
      "Eine kleine Schaltfläche am Rand von Webseiten übersetzt die Seite oder zeigt das Original. Ziehen Sie sie, um sie zu verschieben; sie bleibt am nächsten Fensterrand. Sie erscheint nur auf Seiten, die nicht schon in der Sprache unter „Übersetzen in“ sind.",
    move: "Pfeiltasten verschieben sie am Rand entlang; E setzt sie an den nächsten Rand.",
    hiddenSites: "Auf diesen Websites ausgeblendet",
    hiddenSitesDescription:
      "Die Schaltfläche erscheint auf diesen Websites nicht. Eine Website umfasst ihre Subdomains.",
  },
  subtitles: {
    menu: "Untertitel übersetzen",
    menuHide: "Übersetzte Untertitel ausblenden",
    menuItemLabel: "Untertitel übersetzen / ausblenden (bei Videos)",
    noCaptions:
      "Für dieses Video wurden noch keine Untertitel gefunden. Schalten Sie die Untertitel im Player ein – sie werden übersetzt, sobald sie erscheinen.",
    liveOnly:
      "Die angezeigten Untertitel werden übersetzt, sobald sie erscheinen. Um vorab zu übersetzen, schalten Sie die Untertitel im Player aus und wieder ein.",
    noVideo:
      "Hier gibt es kein Video, dessen Untertitel übersetzt werden können.",
    // Settings: subtitles start by themselves on every video.
    setting: "Video-Untertitel automatisch übersetzen",
    settingDescription:
      "Videos mit Untertiteln zeigen jede Zeile mit ihrer Übersetzung darunter, auf allen Websites. „Untertitel übersetzen“ im Kontextmenü eines Videos schaltet sie für dieses Video aus oder ein. Ist diese Option aus, übersetzen das Menü und „Diese Seite übersetzen“ sie weiterhin.",
    // Settings: how translated subtitles look; the preview's two lines.
    style: {
      title: "Untertitelstil",
      description:
        "So sehen übersetzte Untertitel über Videos aus. Angezeigte Untertitel ändern sich sofort.",
      preview: "Vorschau",
      previewOriginal: "The river was high that spring.",
      previewTranslation: "In jenem Frühling stand der Fluss hoch.",
      background: "Deckkraft des Hintergrunds",
      translationColor: "Farbe der Übersetzung",
      originalColor: "Farbe des Originals",
      colors: {
        yellow: "Gelb",
        white: "Weiß",
        cyan: "Hellblau",
        grey: "Grau",
      },
      font: "Schrift",
      fonts: {
        system: "System",
        serif: "Serifen",
        monospace: "Festbreite",
      },
      size: "Größe",
      showOriginal: "Originalzeile anzeigen",
      showOriginalDescription: "Wenn aus, wird nur die Übersetzung angezeigt.",
    },
  },
};

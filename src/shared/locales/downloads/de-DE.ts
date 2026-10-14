import { plural } from "../../plural";
import type { DownloadsLocaleMessages } from "./en-US";

export const downloadsDeDE: DownloadsLocaleMessages = {
  titles: {
    downloaded: "Heruntergeladen",
    saved: "Gespeichert",
    failed: "Download fehlgeschlagen",
    downloading: "Wird heruntergeladen",
    paused: "Download pausiert",
    waiting: "Wartet auf Sie",
    canceled: "Download abgebrochen",
    listed: "Downloads aufgelistet",
    noneStarted: "Kein Download gestartet",
  },
  running: {
    download: "Wird heruntergeladen",
    save: "Wird gespeichert",
    images: "Bilder werden gespeichert",
    list: "Downloads werden geprüft",
    wait: "Wartet auf einen Download",
    cancel: "Download wird abgebrochen",
    retry: "Download wird wiederholt",
  },
  status: {
    completed: "{name} · {size}",
    failed: "{name}: {reason}",
    canceled: "{name}",
    in_progress: "{name} · {progress}",
    paused: "{name} · {progress}",
    needs_confirmation:
      "Der Browser hält {name} zurück: in der Downloadliste des Browsers behalten",
    choosing_location:
      "Wählen Sie im Speichern-Dialog des Browsers, wo {name} gespeichert wird",
  },
  moved: "{name} wurde verschoben oder gelöscht",
  htmlPage: "{name} ist eine Webseite, nicht die Datei",
  reasons: {
    network: "Netzwerkfehler",
    missing: "die Datei existiert nicht auf dem Server",
    denied: "der Server hat den Zugriff verweigert",
    signIn: "Anmeldung erforderlich",
    disk: "die Datei konnte nicht geschrieben werden",
    blocked: "vom Browser blockiert",
    other: "Downloadfehler",
  },
  listed: plural({ one: "{count} Download", other: "{count} Downloads" }),
  none: "Keine Downloads",
  showFileInFolder: "{name} im Ordner anzeigen",
};

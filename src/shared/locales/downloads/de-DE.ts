import { plural } from "../../plural";
import type { DownloadsLocaleMessages } from "./en-US";

export const downloadsDeDE: DownloadsLocaleMessages = {
  status: {
    completed: "{name} gespeichert · {size}",
    failed: "{name} konnte nicht heruntergeladen werden: {reason}",
    canceled: "{name} abgebrochen",
    in_progress: "{name} wird heruntergeladen · {progress}",
    paused: "{name} pausiert · {progress}",
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

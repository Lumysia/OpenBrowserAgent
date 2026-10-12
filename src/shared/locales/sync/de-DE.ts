import type { SyncMessages } from "./en-US";

export const syncDeDE: SyncMessages = {
  statusTitle: "Synchronisierungsstatus",
  stateOff: "Synchronisierung ist aus",
  stateNeverSynced: "Noch nicht synchronisiert",
  stateSynced: "Auf dem neuesten Stand",
  stateSyncing: "Synchronisiert…",
  statePending: "{count} Änderung(en) warten auf die Synchronisierung",
  statePaused: "Pausiert bis {time}",
  stateError: "Letzte Synchronisierung fehlgeschlagen",
  stateAttention: "Die Synchronisierung braucht Ihre Entscheidung",
  lastSync: "Letzte Synchronisierung: {time}",
  pausedRateLimit:
    "Der Server hat um weniger Anfragen gebeten (HTTP {status}). Die Synchronisierung läuft von selbst weiter.",
  syncNow: "Jetzt synchronisieren",
  webDavOnly:
    "Chats und Anhänge werden nur über WebDAV synchronisiert. Der Sync-Speicher des Browserkontos ist dafür zu klein.",
  warnings: {
    "unreliable-etags":
      "Die Dateiversionen dieses Servers sind unzuverlässig, daher werden Änderungen dieses Geräts nicht hochgeladen. Verwenden Sie einen WebDAV-Server, der starke ETags sendet.",
    "ignores-preconditions":
      "Dieser Server ignoriert Versionsprüfungen beim Hochladen. Änderungen, die zur selben Zeit auf zwei Geräten gespeichert werden, können sich überschreiben.",
    "newer-format":
      "Ein anderes Gerät verwendet ein neueres Synchronisierungsformat. Aktualisieren Sie OpenBrowserAgent auf diesem Gerät, um weiter zu synchronisieren.",
    "missing-content":
      "Ein Teil der synchronisierten Inhalte fehlt auf dem Server. Dieses Gerät behält seine Kopie, bis ein anderes Gerät sie erneut hochlädt.",
    quota:
      "Der Sync-Speicher des Browserkontos ist voll. Schalten Sie einige Sync-Elemente aus oder verwenden Sie WebDAV.",
  },
  massDeleteTitle: "Löschungen von einem anderen Gerät bestätigen",
  massDeleteDescription:
    "Die letzte Synchronisierung würde auf diesem Gerät {count} von {total} Elementen in {collection} löschen.",
  massDeleteApply: "Auf diesem Gerät löschen",
  massDeleteKeep: "Behalten und erneut hochladen",
};

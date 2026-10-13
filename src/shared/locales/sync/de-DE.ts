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
    "Nur über WebDAV: Der Sync-Speicher des Browserkontos ist zu klein.",
  warnings: {
    "unreliable-etags":
      "Auf diesen Server kann nicht sicher geschrieben werden. Verwenden Sie einen WebDAV-Server, der starke ETags sendet.",
    "ignores-preconditions":
      "Dieser Server unterstützt keine Versionsprüfungen; die Synchronisierung gleicht das aus.",
    "newer-format":
      "Ein anderes Gerät verwendet ein neueres Synchronisierungsformat. Aktualisieren Sie OpenBrowserAgent, um weiter zu synchronisieren.",
    "missing-content":
      "Ein Teil der synchronisierten Inhalte fehlt auf dem Server.",
    quota:
      "Der Sync-Speicher des Browserkontos ist voll. Schalten Sie einige Sync-Elemente aus oder verwenden Sie WebDAV.",
    "cloned-device":
      "Dieser Browser synchronisiert jetzt als neues Gerät. Änderungen auf beiden bleiben erhalten.",
  },
  warningDetails: {
    "unreliable-etags":
      "Die Dateiversionen dieses Servers sind unzuverlässig, daher lädt dieses Gerät keine Änderungen hoch. Änderungen anderer Geräte werden weiterhin heruntergeladen.",
    "ignores-preconditions":
      "Speichern zwei Geräte gleichzeitig, kann ein Upload den anderen überschreiben. Jedes Gerät behält seine Änderungen und führt sie bei der nächsten Synchronisierung erneut zusammen. Haben beide denselben Wert geändert, bleibt die neuere Änderung erhalten.",
    "missing-content":
      "Dieses Gerät behält seine Kopie, bis ein anderes Gerät sie erneut hochlädt.",
    "cloned-device":
      "Ein anderer Browser hat als dieses Gerät synchronisiert, etwa ein kopiertes Browserprofil oder eine auf einem anderen Computer wiederhergestellte Sicherung.",
  },
  massDeleteTitle: "Löschungen von einem anderen Gerät bestätigen",
  massDeleteDescription:
    "Die letzte Synchronisierung würde auf diesem Gerät {count} von {total} Elementen in {collection} löschen.",
  massDeleteApply: "Auf diesem Gerät löschen",
  massDeleteKeep: "Behalten und erneut hochladen",
  massDeleteLocalTitle: "Löschungen auf diesem Gerät bestätigen",
  massDeleteLocalDescription:
    "{count} von {total} Elementen in {collection} fehlen auf diesem Gerät. Die Synchronisierung würde sie auf allen Geräten löschen.",
  massDeleteLocalApply: "Auf allen Geräten löschen",
  massDeleteLocalKeep: "Auf diesem Gerät wiederherstellen",
};

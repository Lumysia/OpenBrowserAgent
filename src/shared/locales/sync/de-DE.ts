import { plural } from "../../plural";
import type { SyncMessages } from "./en-US";

export const syncDeDE: SyncMessages = {
  statusTitle: "Synchronisierungsstatus",
  stateOff: "Synchronisierung ist aus",
  stateNeverSynced: "Noch nicht synchronisiert",
  stateSynced: "Auf dem neuesten Stand",
  stateSyncing: "Synchronisiert…",
  statePending: plural({
    one: "{count} Änderung wartet auf die Synchronisierung",
    other: "{count} Änderungen warten auf die Synchronisierung",
  }),
  statePaused: "Pausiert bis {time}",
  stateError: "Letzte Synchronisierung fehlgeschlagen",
  stateAttention: "Die Synchronisierung braucht Ihre Entscheidung",
  lastSync: "Letzte Synchronisierung: {time}",
  pausedRateLimit:
    "Der Server hat um weniger Anfragen gebeten (HTTP {status}). Die Synchronisierung läuft von selbst weiter.",
  syncNow: "Jetzt synchronisieren",
  webDavOnly:
    "Nur über WebDAV: Der Sync-Speicher des Browserkontos ist zu klein.",
  groupSettings: "Einstellungen",
  groupSettingsDescription:
    "Immer synchronisiert: Sprache, Einstellungen, KI-Anbieter und MCP-Server ohne ihre Schlüssel, Agenten mit MEMORY.md und USER.md sowie Skills ohne ihre Dateien.",
  groupAlways: "Immer",
  groupKeys: "Schlüssel",
  groupKeysDescription:
    "API-Schlüssel und MCP-Header, mit Ihrer Sync-Passphrase verschlüsselt, bevor sie dieses Gerät verlassen.",
  groupChats: "Chats",
  groupChatsDescription:
    "Chatverlauf ohne Anhänge. Lassen Sie dies für rein lokale Chats aus.",
  groupFiles: "Dateien",
  groupFilesDescription:
    "Skill-Dateien, Dateien im Arbeitsbereich von Agenten außer MEMORY.md und USER.md sowie Chat-Anhänge (wenn Chats synchronisiert werden).",
  passphrase: "Sync-Passphrase",
  passphraseRepeat: "Passphrase wiederholen",
  passphraseCreate:
    "Legen Sie eine Sync-Passphrase fest. Jedes Gerät, das Schlüssel synchronisiert, fragt einmal danach. Sie lässt sich nicht wiederherstellen: Wenn Sie sie vergessen, legen Sie eine neue fest – Ihre Schlüssel bleiben auf jedem Gerät.",
  passphraseEnter:
    "Schlüssel sind mit einer Sync-Passphrase verschlüsselt, die auf einem anderen Gerät festgelegt wurde. Geben Sie sie einmal ein, um Schlüssel hier zu synchronisieren.",
  passphraseChangeDescription:
    "Legen Sie eine neue Sync-Passphrase fest. Ihre anderen Geräte fragen einmal danach.",
  passphraseTooShort: "Verwenden Sie mindestens {min} Zeichen.",
  passphraseMismatch: "Die Passphrasen stimmen nicht überein.",
  passphraseWrong:
    "Falsche Passphrase. Geben Sie die auf Ihrem anderen Gerät festgelegte ein.",
  passphraseSave: "Passphrase speichern",
  passphraseChange: "Passphrase ändern",
  keysLocked:
    "Geben Sie die Sync-Passphrase ein, um Schlüssel auf diesem Gerät zu synchronisieren.",
  keysUnlocked:
    "Schlüssel werden mit Ihrer Sync-Passphrase verschlüsselt synchronisiert.",
  filesNotSynced:
    "Dateien werden auf diesem Gerät nicht synchronisiert. Auf Ihren anderen Geräten bleiben sie unverändert.",
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
    "recovered-root":
      "Die Synchronisierungsdatei auf dem Server war beschädigt. Sie wurde aus ihrer vorherigen Kopie und den Daten dieses Geräts neu erstellt.",
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
    "recovered-root":
      "Das passiert, wenn ein Upload mittendrin abbricht. Auf Ihren Geräten ging nichts verloren: Jedes lädt seine Änderungen erneut hoch.",
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
  choiceTitle: "Dieses Gerät synchronisieren",
  choiceOff: "Aus",
  choiceBrowser: "Browserkonto",
  choiceWebDav: "WebDAV",
  choiceOffHint: "Alles bleibt auf diesem Gerät.",
  whatSyncs: "Was synchronisiert wird",
  copyCode: "Sync-Code für ein anderes Gerät kopieren",
  codeCopied: "Sync-Code kopiert",
  codeTitle: "Sync-Code",
  pasteCode: "Sync-Code eines anderen Geräts einfügen",
};

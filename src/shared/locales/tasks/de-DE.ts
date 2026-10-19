import { plural } from "../../plural";
import type { TasksLocaleMessages } from "./en-US";

export const tasksDeDE: TasksLocaleMessages = {
  title: "Aufgaben",
  untitled: "Unbenannte Aufgabe",
  count: plural({ one: "{count} Aufgabe", other: "{count} Aufgaben" }),
  newTask: "Neue Aufgabe",
  editTask: "Aufgabe bearbeiten",
  makeTask: "Als Aufgabe planen",
  empty: "Noch keine Aufgaben",
  emptyHint:
    "Lassen Sie den Agenten etwas später, nach Zeitplan oder bei einer Änderung einer Seite erledigen.",
  kinds: {
    once: "Einmal",
    interval: "Wiederholen",
    daily: "Täglich",
    weekly: "Wöchentlich",
    watch: "Seite beobachten",
  },
  units: {
    minutes: plural({ one: "{count} Minute", other: "{count} Minuten" }),
    hours: plural({ one: "{count} Stunde", other: "{count} Stunden" }),
    days: plural({ one: "{count} Tag", other: "{count} Tage" }),
  },
  unitNames: {
    minutes: "Minuten",
    hours: "Stunden",
    days: "Tage",
  },
  form: {
    title: "Titel",
    prompt: "Was zu tun ist",
    promptPlaceholder:
      "Die Nachrichten auf dieser Seite prüfen und Neues zusammenfassen",
    watchPrompt: "Bedingung und was zu melden ist",
    watchPromptPlaceholder: "Sag mir Bescheid, wenn der Preis unter 50 fällt",
    kind: "Wann",
    at: "Datum und Uhrzeit",
    every: "Alle",
    unit: "Einheit",
    time: "Uhrzeit",
    days: "Tage",
    url: "Adresse der Seite",
    part: "Teil der Seite",
    partPage: "Hauptinhalt",
    partElement: "Ausgewähltes Element",
    pickElement: "Auf der Seite wählen",
    checkEvery: "Prüfen alle (Minuten)",
    watchHint:
      "Jede Prüfung liest die Seite ohne das Modell; der Agent läuft nur, wenn sich der beobachtete Text geändert hat.",
    agent: "Agent",
    mayAct:
      "Dieser Agent darf selbstständig handeln: Läufe können seine Werkzeuge nutzen, die klicken, tippen oder etwas ändern.",
    looksOnly:
      "Läufe sehen nur nach: Sie lesen, suchen und berichten und klicken, tippen oder ändern nie etwas.",
    device: "Läuft auf",
    thisDevice: "{name} (dieses Gerät)",
    save: "Aufgabe speichern",
    invalidPrompt: "Geben Sie an, was die Aufgabe tun soll.",
    invalidUrl: "Geben Sie eine http- oder https-Adresse ein.",
    invalidAt: "Wählen Sie Datum und Uhrzeit.",
  },
  schedule: {
    unknown: "Zeitplan aus einer neueren Version",
    once: "Einmal, {time}",
    every: "Alle {amount}",
    daily: "Täglich um {time}",
    weekly: "{days} um {time}",
    watch: plural({ other: "Beobachtet {page} alle {count} Min." }),
  },
  status: {
    unsupported: "Braucht eine neuere Version",
    running: "Läuft",
    paused: "Pausiert",
    pausedFailures: "Nach wiederholten Fehlern pausiert",
    needsUser: "Braucht Sie",
    allPaused: "Alle Aufgaben sind pausiert",
    otherDevice: "Läuft auf {device}",
    done: "Erledigt",
  },
  results: {
    reported: "Gemeldet",
    nothing: "Nichts Neues",
    met: "Bedingung erfüllt",
    notMet: "Bedingung nicht erfüllt",
    unchanged: "Keine Änderung",
    answered: "Beantwortet",
    needsUser: "Braucht Sie",
    failed: "Fehlgeschlagen",
  },
  lastRun: "Zuletzt {time}",
  nextRun: "Nächster Lauf {time}",
  actions: {
    runNow: "Jetzt ausführen",
    pause: "Pausieren",
    resume: "Fortsetzen",
    edit: "Bearbeiten",
    delete: "Aufgabe löschen",
    deleteConfirm:
      "Diese Aufgabe löschen? Ihre bisherigen Ergebnisse bleiben im Chatverlauf.",
    openResult: "Ergebnis öffnen",
  },
  notify: {
    titlePrefix: {
      result: "Aufgabenergebnis",
      met: "Beobachtung",
      needsUser: "Aufgabe braucht Sie",
      paused: "Aufgabe pausiert",
    },
    finished:
      "Die Aufgabe ist fertig. Öffnen Sie sie, um das Ergebnis zu sehen.",
    conditionMet: "Die beobachtete Bedingung ist erfüllt.",
    needsUser: "Die Aufgabe braucht Ihre Antwort, um weiterzumachen.",
    paused:
      "Die Aufgabe ist mehrmals nacheinander fehlgeschlagen und pausiert.",
  },
  agentPermission: {
    label: "Selbstständig handeln",
    description:
      "Darf in geplanten Aufgaben und Beobachtungen seine Werkzeuge nutzen, die klicken, tippen, absenden oder etwas ändern. Aus: Diese Läufe sehen nur nach.",
  },
  settings: {
    title: "Geplante Aufgaben",
    description:
      "Aufgaben und Beobachtungen laufen im Hintergrund, solange der Browser geöffnet ist.",
    pauseAll: "Alle Aufgaben pausieren",
    pauseAllDescription:
      "Keine geplante Aufgabe und keine Beobachtung läuft, bis Sie dies ausschalten – auf allen Geräten.",
    notificationsUnavailable:
      "Dieser Browser hat keine Systembenachrichtigungen: Ergebnisse erscheinen an der Symbolleisten-Schaltfläche und in der Aufgabenliste.",
  },
  tool: {
    scheduleTask: { running: "Plane eine Aufgabe", done: "Aufgabe geplant" },
    taskResult: { running: "Melde das Ergebnis", done: "Ergebnis gemeldet" },
  },
};

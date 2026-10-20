import { plural } from "../../plural";
import type { TeachLocaleMessages } from "./en-US";

export const teachDeDE: TeachLocaleMessages = {
  menu: {
    title: "Skill aufzeichnen",
    hint: "Dem Agenten eine Aufgabe einmal zeigen",
  },
  pill: {
    recording: "Aufzeichnung",
    stop: "Stopp",
    stopHint: "Aufzeichnung beenden und Skill schreiben",
  },
  start: {
    title: "Skill aufzeichnen",
    description:
      "Erledigen Sie die Aufgabe selbst auf dieser Seite und klicken Sie dann auf „Stopp“. Aus der Aufzeichnung wird ein Skill.",
    purpose: "Wofür ist das? (optional)",
    purposePlaceholder: "Meinen Wochenstundenzettel einreichen",
    varies: "Was ändert sich jedes Mal? (optional)",
    variesPlaceholder: "Die Woche und das Projekt",
    privacy:
      "Was Sie eingeben, wird nicht aufgezeichnet, nur welches Feld Sie verwendet haben. Passwörter und Codes nie.",
    start: "Aufzeichnung starten",
    unscriptable:
      "Diese Seite kann nicht aufgezeichnet werden. Öffnen Sie die Seite, auf der die Aufgabe beginnt.",
    busy: "Eine andere Aufzeichnung ist noch offen. Speichern oder verwerfen Sie sie, bevor Sie eine neue starten.",
    showRecording: "Aufzeichnung anzeigen",
  },
  recording: {
    title: "Aufzeichnung",
    steps: plural({ one: "{count} Schritt", other: "{count} Schritte" }),
    empty:
      "Erledigen Sie die Aufgabe auf der Seite. Jeder Schritt erscheint hier.",
    long: "Lange Aufzeichnungen ergeben schwächere Skills. Beenden Sie, sobald die Aufgabe erledigt ist.",
    full: "Die Aufzeichnung ist voll: Weitere Schritte werden nicht aufgezeichnet.",
    unrecorded: plural({
      one: "{count} Aktion auf der Seite konnte nicht aufgezeichnet werden. Prüfen Sie, ob die Schritte vollständig sind.",
      other:
        "{count} Aktionen auf der Seite konnten nicht aufgezeichnet werden. Prüfen Sie, ob die Schritte vollständig sind.",
    }),
    frames: plural({
      one: "Schritte in {count} eingebettetem Frame wurden nicht aufgezeichnet.",
      other:
        "Schritte in {count} eingebetteten Frames wurden nicht aufgezeichnet.",
    }),
    stop: "Stopp",
    discard: "Verwerfen",
    deleteStep: "Schritt löschen",
    varies: "Ändert sich jedes Mal",
    keepExample: "Meine Eingabe als Beispiel behalten",
    dropExample: "Beispiel nicht behalten",
    exampleKept: "Beispiel behalten",
    exampleGone: "Die Seite hat diesen Wert nicht mehr.",
    secret: "Geheim – wird nie gespeichert",
  },
  step: {
    click: "{target} klicken",
    field: "In {target} eingeben",
    fieldSubmitted: "In {target} eingeben und Eingabetaste drücken",
    choose: "{choice} in {target} wählen",
    chooseSecret: "Eine Option in {target} wählen",
    check: "{target} aktivieren",
    uncheck: "{target} deaktivieren",
    key: "{key} drücken",
    navigate: "Zu {url} wechseln",
    openTab: "Neuer Tab: {url}",
    switchTab: "Zu {site} gewechselt",
    page: "die Seite",
  },
  ended: {
    title: "Aufzeichnung beendet",
    tabClosed:
      "Ihr Tab wurde geschlossen. Noch wurde nichts gesendet: Schreiben Sie aus diesen Schritten den Skill oder verwerfen Sie sie.",
    idle: "Eine Weile ist nichts passiert. Noch wurde nichts gesendet: Schreiben Sie aus diesen Schritten den Skill oder verwerfen Sie sie.",
    consent:
      "Auf der Seite beendet. Zum Schreiben des Skills werden diese Schritte an Ihr Modell gesendet.",
    write: "Skill schreiben",
  },
  writing: {
    title: "Skill wird geschrieben…",
    description:
      "Das Modell macht aus den aufgezeichneten Schritten eine Anleitung.",
  },
  failed: {
    title: "Skill konnte nicht geschrieben werden",
    retry: "Erneut versuchen",
  },
  save: {
    title: "Skill speichern",
    name: "Name",
    description: "Beschreibung",
    instructions: "Anweisungen, denen der Agent folgt",
    stored:
      "Wird als Skill mit seinen Schritten gespeichert: welches Element auf welcher Seite. Ihre Eingaben werden nicht gespeichert. Er wird wie Ihre anderen Skills synchronisiert.",
    check: "Speichern und prüfen",
    checkHint:
      "Führt den Skill einmal in einem neuen Tab aus und fragt Sie vor dem letzten Schritt",
    draft: "Überspringen, als Entwurf speichern",
  },
  check: {
    message: "Aufgezeichneten Skill {name} prüfen",
    passed: "Prüfung bestanden: {name} ist geprüft.",
    auto: "Agent darf ihn automatisch verwenden",
    autoOn: "Der Agent verwendet {name} jetzt, wenn eine Anfrage passt.",
    diverged: "Die Prüfung verlief bei Schritt {step} anders.",
    divergedNoStep: "Die Prüfung verlief anders.",
    fix: "Schritte korrigieren",
    fixMessage: "Schritte von {name} anhand dieser Prüfung korrigieren",
    recordAgain: "Ab hier neu aufzeichnen",
    keepDraft: "Als Entwurf speichern",
    done: "Fertig",
    submit: "Absenden",
    dontSubmit: "Nicht absenden",
  },
  status: {
    recorded: "Aufgezeichnet",
    draft: "Entwurf",
    verified: "Geprüft",
  },
  skillsHint:
    "Um einen Skill aufzuzeichnen, öffnen Sie die Seitenleiste auf der Seite, auf der die Aufgabe beginnt, und wählen Sie + → „Skill aufzeichnen“.",
  tool: {
    skillCheck: {
      running: "Melde das Prüfergebnis",
      done: "Prüfergebnis gemeldet",
    },
  },
};

import { plural } from "../../plural";
import type { TasksLocaleMessages } from "./en-US";

export const tasksFrFR: TasksLocaleMessages = {
  title: "Tâches",
  untitled: "Tâche sans titre",
  count: plural({ one: "{count} tâche", other: "{count} tâches" }),
  newTask: "Nouvelle tâche",
  editTask: "Modifier la tâche",
  makeTask: "En faire une tâche",
  empty: "Aucune tâche pour l’instant",
  emptyHint:
    "Faites faire quelque chose à l’agent plus tard, selon un planning ou quand une page change.",
  kinds: {
    once: "Une fois",
    interval: "Répéter",
    daily: "Chaque jour",
    weekly: "Chaque semaine",
    watch: "Surveiller une page",
  },
  units: {
    minutes: plural({ one: "{count} minute", other: "{count} minutes" }),
    hours: plural({ one: "{count} heure", other: "{count} heures" }),
    days: plural({ one: "{count} jour", other: "{count} jours" }),
  },
  unitNames: {
    minutes: "minutes",
    hours: "heures",
    days: "jours",
  },
  form: {
    title: "Titre",
    prompt: "À faire",
    promptPlaceholder:
      "Consulter les actualités de cette page et résumer ce qui est nouveau",
    watchPrompt: "Condition et ce qu’il faut signaler",
    watchPromptPlaceholder: "Préviens-moi quand le prix passe sous 50",
    kind: "Quand",
    at: "Date et heure",
    every: "Tous les",
    unit: "Unité",
    time: "Heure",
    days: "Jours",
    url: "Adresse de la page",
    part: "Partie de la page",
    partPage: "Contenu principal",
    partElement: "Élément sélectionné",
    pickElement: "Choisir sur la page",
    checkEvery: "Vérifier toutes les (minutes)",
    watchHint:
      "Chaque vérification lit la page sans le modèle ; l’agent ne s’exécute que si le texte surveillé a changé.",
    agent: "Agent",
    mayAct:
      "Cet agent peut agir seul : ses exécutions peuvent utiliser les outils qui cliquent, saisissent ou modifient.",
    looksOnly:
      "Les exécutions se contentent de regarder : elles lisent, cherchent et signalent, sans jamais cliquer, saisir ni modifier.",
    device: "Exécutée sur",
    thisDevice: "{name} (cet appareil)",
    save: "Enregistrer la tâche",
    invalidPrompt: "Indiquez ce que la tâche doit faire.",
    invalidUrl: "Saisissez une adresse http ou https.",
    invalidAt: "Choisissez une date et une heure.",
  },
  schedule: {
    once: "Une fois, {time}",
    every: "Tous les {amount}",
    daily: "Chaque jour à {time}",
    weekly: "{days} à {time}",
    watch: plural({ other: "Surveille {page} toutes les {count} min" }),
  },
  status: {
    running: "En cours",
    paused: "En pause",
    pausedFailures: "En pause après des échecs répétés",
    needsUser: "Vous attend",
    allPaused: "Toutes les tâches sont en pause",
    otherDevice: "Exécutée sur {device}",
    done: "Terminée",
  },
  results: {
    reported: "Signalé",
    nothing: "Rien de nouveau",
    met: "Condition remplie",
    notMet: "Condition non remplie",
    unchanged: "Aucun changement",
    needsUser: "Vous attend",
    failed: "Échec",
  },
  lastRun: "Dernière exécution {time}",
  nextRun: "Prochaine exécution {time}",
  actions: {
    runNow: "Exécuter maintenant",
    pause: "Mettre en pause",
    resume: "Reprendre",
    edit: "Modifier",
    delete: "Supprimer la tâche",
    deleteConfirm:
      "Supprimer cette tâche ? Ses résultats passés restent dans l’historique des conversations.",
    openResult: "Ouvrir le résultat",
  },
  notify: {
    titlePrefix: {
      result: "Résultat de tâche",
      met: "Surveillance",
      needsUser: "Une tâche vous attend",
      paused: "Tâche en pause",
    },
    finished: "La tâche est terminée. Ouvrez-la pour voir le résultat.",
    conditionMet: "La condition surveillée est remplie.",
    needsUser: "La tâche a besoin de votre réponse pour continuer.",
    paused: "La tâche a échoué plusieurs fois de suite et a été mise en pause.",
  },
  agentPermission: {
    label: "Agir seul",
    description:
      "Dans les tâches planifiées et les surveillances, peut utiliser ses outils qui cliquent, saisissent, envoient ou modifient. Désactivé : ces exécutions se contentent de regarder.",
  },
  settings: {
    title: "Tâches planifiées",
    description:
      "Les tâches et surveillances s’exécutent en arrière-plan tant que le navigateur est ouvert.",
    pauseAll: "Mettre toutes les tâches en pause",
    pauseAllDescription:
      "Aucune tâche planifiée ni surveillance ne s’exécute tant que vous ne désactivez pas ceci, sur tous les appareils.",
    notificationsUnavailable:
      "Ce navigateur n’a pas de notifications système : les résultats s’affichent sur le bouton de la barre d’outils et dans la liste des tâches.",
  },
  tool: {
    scheduleTask: {
      running: "Planification d’une tâche",
      done: "Tâche planifiée",
    },
    taskResult: {
      running: "Signalement du résultat",
      done: "Résultat signalé",
    },
  },
};

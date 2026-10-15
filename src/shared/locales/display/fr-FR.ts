import { plural } from "../../plural";
import type { DisplayMessages } from "./en-US";

export const displayFrFR: DisplayMessages = {
  counts: {
    models: plural({ one: "{count} modèle", other: "{count} modèles" }),
    files: plural({ one: "{count} fichier", other: "{count} fichiers" }),
    characters: plural({
      one: "{count} caractère",
      other: "{count} caractères",
    }),
  },
  providerTypes: {
    openai: "OpenAI (ou compatible)",
    "openai-responses": "OpenAI (API Responses)",
    anthropic: "Anthropic (ou compatible)",
    gemini: "Google Gemini",
    ollama: "Ollama (local)",
  },
  mcpServerPresets: {
    exa: "Recherche web et extraction du contenu des pages.",
    parallel: "Recherche web avec extraits et récupération de pages.",
    tinyfish: "Recherche web et d’actualités.",
    firecrawl:
      "Recherche web, extraction de pages et analyse de documents. Faible limite gratuite de requêtes.",
  },
  builtinSkills: {
    "fill-form": {
      name: "Remplir un formulaire",
      description:
        "Remplit des formulaires web à partir des informations ou du fichier que vous fournissez, vérifie chaque champ et n’envoie que si vous le demandez.",
    },
    "tidy-tabs": {
      name: "Ranger les onglets",
      description:
        "Ferme les onglets en double, regroupe ceux qui vont ensemble et repère ceux dont vous n’avez plus besoin.",
    },
    "openbrowseragent-help": {
      name: "Aide OpenBrowserAgent",
      description:
        "Répond aux questions sur l’utilisation et la configuration d’OpenBrowserAgent.",
    },
    "skill-creator": {
      name: "Créateur de compétences",
      description:
        "Crée, enregistre ou améliore des compétences, par exemple à partir d’une tâche que vous venez de faire.",
    },
    "local-execution-bridge-setup": {
      name: "Configurer un pont d’exécution local",
      description:
        "Configure, teste, met à jour ou supprime un pont d’exécution local pour que les agents puissent lancer des commandes sur votre ordinateur.",
    },
  },
  errors: {
    noModel:
      "Aucun modèle n’est configuré. Ajoutez un fournisseur dans « Paramètres » → « Fournisseurs d’IA ».",
    noImageModel:
      "Aucun modèle d’image n’est configuré. Choisissez-en un dans « Paramètres » → « Fournisseurs d’IA ».",
    baseUrlRequired: "Saisissez une URL de base.",
    bridgeNotFound: "Ce pont d’exécution n’existe plus.",
    bridgeHostRequired: "Saisissez le nom de l’hôte de messagerie native.",
    bridgeTimeout: "Le pont d’exécution n’a pas répondu à temps.",
    syncKeysLocked:
      "Vos clés API sont synchronisées mais verrouillées. Saisissez votre phrase secrète de synchronisation dans Paramètres → Synchronisation.",
  },
  toolSteps: {
    failed: "Échec",
    page: "Page",
    tabs: plural({ one: "{count} onglet", other: "{count} onglets" }),
    lines: plural({ one: "{count} ligne", other: "{count} lignes" }),
    matchingLines: plural({
      one: "{count} ligne correspondante",
      other: "{count} lignes correspondantes",
    }),
    matchingLinesWithOccurrences: plural({
      one: "{count} ligne correspondante ({occurrences})",
      other: "{count} lignes correspondantes ({occurrences})",
    }),
    occurrences: plural({
      one: "{count} occurrence",
      other: "{count} occurrences",
    }),
    results: plural({ one: "{count} résultat", other: "{count} résultats" }),
    items: plural({ one: "{count} élément", other: "{count} éléments" }),
    tools: plural({ one: "{count} outil", other: "{count} outils" }),
    filesSaved: plural({
      one: "{count} fichier enregistré",
      other: "{count} fichiers enregistrés",
    }),
    editsApplied: plural({
      one: "{applied} modification sur {count} appliquée",
      other: "{applied} modifications sur {count} appliquées",
    }),
    actions: {
      open: "Ouvert",
      switch: "Basculé vers",
      close: "Fermé",
      navigate: "Page ouverte",
      back: "Retour en arrière",
      forward: "Page suivante",
      reload: "Rechargé",
      group: "Regroupé",
      ungroup: "Dégroupé",
      list: "Liste",
      search: "Recherche",
      read: "Lecture",
      write: "Écriture",
      append: "Ajout en fin de fichier",
      replace: "Texte remplacé",
      delete: "Suppression",
      create: "Création",
      patch: "Modification",
      add: "Ajout",
      update: "Mise à jour",
      test: "Test",
      status: "Vérification de l’état",
      resources: "Ressources réseau listées",
      emulate: "Émulation d’un appareil",
      reset: "Émulation réinitialisée",
      download: "Téléchargement",
      save: "Enregistrement",
      wait: "Attente d’un téléchargement",
      retry: "Nouvelle tentative",
      images: "Images enregistrées",
      run: "Exécution",
      start: "Démarrage",
      cancel: "Annulation",
    },
    commandStates: {
      running: "En cours",
      done: "Terminé",
      error: "Échec",
      canceled: "Annulé",
      missing: "Tâche introuvable",
    },
    actStepSeparator: ", ",
    actSteps: {
      click: plural({
        one: "cliqué sur {count} élément",
        other: "cliqué sur {count} éléments",
      }),
      type: plural({
        one: "rempli {count} champ",
        other: "rempli {count} champs",
      }),
      press: plural({
        one: "appuyé sur {count} touche",
        other: "appuyé sur {count} touches",
      }),
      select: plural({
        one: "sélectionné {count} option",
        other: "sélectionné {count} options",
      }),
      hover: plural({
        one: "survolé {count} élément",
        other: "survolé {count} éléments",
      }),
      scroll: plural({
        one: "défilé {count} fois",
        other: "défilé {count} fois",
      }),
      wait: plural({
        one: "attendu {count} fois",
        other: "attendu {count} fois",
      }),
      drag: plural({
        one: "glissé {count} élément",
        other: "glissé {count} éléments",
      }),
      dialog: plural({
        one: "répondu à {count} boîte de dialogue",
        other: "répondu à {count} boîtes de dialogue",
      }),
      other: plural({
        one: "exécuté {count} autre étape",
        other: "exécuté {count} autres étapes",
      }),
    },
  },
};

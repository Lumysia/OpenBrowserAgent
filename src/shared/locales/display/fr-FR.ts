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
    openai: "Compatible OpenAI",
    "openai-responses": "OpenAI Responses",
    anthropic: "Compatible Anthropic",
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
  toolSteps: {
    page: "Page",
    tabs: plural({ one: "{count} onglet", other: "{count} onglets" }),
    lines: plural({ one: "{count} ligne", other: "{count} lignes" }),
    matches: plural({ one: "{count} résultat", other: "{count} résultats" }),
    results: plural({ one: "{count} résultat", other: "{count} résultats" }),
    items: plural({ one: "{count} élément", other: "{count} éléments" }),
    editsApplied: plural({
      one: "{applied} modification sur {count} appliquée",
      other: "{applied} modifications sur {count} appliquées",
    }),
    tabActions: {
      open: "Ouvert",
      switch: "Basculé vers",
      close: "Fermé",
      navigate: "Page ouverte",
      back: "Retour en arrière",
      forward: "Page suivante",
      reload: "Rechargé",
      group: "Regroupé",
      ungroup: "Dégroupé",
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

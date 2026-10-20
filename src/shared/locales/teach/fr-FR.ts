import { plural } from "../../plural";
import type { TeachLocaleMessages } from "./en-US";

export const teachFrFR: TeachLocaleMessages = {
  menu: {
    title: "Enregistrer une compétence",
    hint: "Montrer une tâche une fois à l’agent",
  },
  pill: {
    recording: "Enregistrement",
    stop: "Arrêter",
    stopHint: "Arrêter l’enregistrement et rédiger la compétence",
  },
  start: {
    title: "Enregistrer une compétence",
    description:
      "Faites la tâche vous-même sur cette page, puis appuyez sur Arrêter. L’enregistrement devient une compétence.",
    purpose: "À quoi sert-elle ? (facultatif)",
    purposePlaceholder: "Envoyer ma feuille de temps de la semaine",
    varies: "Qu’est-ce qui change à chaque fois ? (facultatif)",
    variesPlaceholder: "La semaine et le projet",
    privacy:
      "Ce que vous tapez n’est pas enregistré, seulement le champ utilisé. Jamais les mots de passe ni les codes.",
    start: "Démarrer l’enregistrement",
    unscriptable:
      "Cette page ne peut pas être enregistrée. Ouvrez la page où la tâche commence.",
    busy: "Un autre enregistrement est ouvert. Enregistrez-le ou supprimez-le avant d’en commencer un nouveau.",
    showRecording: "Afficher l’enregistrement",
  },
  recording: {
    title: "Enregistrement",
    steps: plural({ one: "{count} étape", other: "{count} étapes" }),
    empty: "Faites la tâche sur la page. Chaque étape s’affiche ici.",
    long: "Les longs enregistrements donnent des compétences moins bonnes. Arrêtez une fois la tâche terminée.",
    full: "L’enregistrement est plein : les étapes suivantes ne sont pas enregistrées.",
    unrecorded: plural({
      one: "{count} action sur la page n’a pas pu être enregistrée. Vérifiez que les étapes sont complètes.",
      other:
        "{count} actions sur la page n’ont pas pu être enregistrées. Vérifiez que les étapes sont complètes.",
    }),
    frames: plural({
      one: "Les étapes dans {count} cadre intégré n’ont pas été enregistrées.",
      other:
        "Les étapes dans {count} cadres intégrés n’ont pas été enregistrées.",
    }),
    stop: "Arrêter",
    discard: "Annuler",
    deleteStep: "Supprimer l’étape",
    varies: "Change à chaque fois",
    keepExample: "Garder ce que j’ai tapé comme exemple",
    dropExample: "Ne pas garder l’exemple",
    exampleKept: "Exemple gardé",
    exampleGone: "La page n’a plus cette valeur.",
    secret: "Secret – jamais enregistré",
  },
  step: {
    click: "Cliquer sur {target}",
    field: "Saisir dans {target}",
    fieldSubmitted: "Saisir dans {target} et appuyer sur Entrée",
    choose: "Choisir {choice} dans {target}",
    chooseSecret: "Choisir une option dans {target}",
    check: "Cocher {target}",
    uncheck: "Décocher {target}",
    key: "Appuyer sur {key}",
    navigate: "Aller à {url}",
    openTab: "Nouvel onglet : {url}",
    switchTab: "Passage à {site}",
    page: "la page",
  },
  ended: {
    title: "Enregistrement terminé",
    tabClosed:
      "Son onglet a été fermé. Rien n’a encore été envoyé : écrivez la compétence à partir de ces étapes, ou supprimez-les.",
    idle: "Rien ne s’est passé pendant un moment. Rien n’a encore été envoyé : écrivez la compétence à partir de ces étapes, ou supprimez-les.",
    consent:
      "Arrêté sur la page. Pour écrire la compétence, ces étapes sont envoyées à votre modèle.",
    write: "Écrire la compétence",
  },
  writing: {
    title: "Rédaction de la compétence…",
    description:
      "Le modèle transforme les étapes enregistrées en instructions.",
  },
  failed: {
    title: "Impossible de rédiger la compétence",
    retry: "Réessayer",
  },
  save: {
    title: "Enregistrer la compétence",
    name: "Nom",
    description: "Description",
    stored:
      "Enregistrée comme compétence avec ses étapes : quel contrôle sur quelle page. Ce que vous avez tapé n’est pas conservé. Elle se synchronise comme vos autres compétences.",
    check: "Enregistrer et vérifier",
    checkHint:
      "Exécute la compétence une fois dans un nouvel onglet et vous demande avant la dernière étape",
    draft: "Passer, enregistrer comme brouillon",
  },
  check: {
    message: "Vérifier la compétence enregistrée {name}",
    passed: "Vérification réussie : {name} est vérifiée.",
    auto: "Laisser l’agent l’utiliser automatiquement",
    autoOn: "L’agent utilise désormais {name} quand une demande s’y prête.",
    diverged: "La vérification a divergé à l’étape {step}.",
    divergedNoStep: "La vérification a divergé.",
    fix: "Corriger les étapes",
    fixMessage: "Corriger les étapes de {name} d’après cette vérification",
    recordAgain: "Réenregistrer à partir d’ici",
    keepDraft: "Enregistrer comme brouillon",
    done: "Terminé",
  },
  status: {
    recorded: "Enregistrée",
    draft: "Brouillon",
    verified: "Vérifiée",
  },
  skillsHint:
    "Pour enregistrer une compétence, ouvrez le panneau latéral sur la page où la tâche commence et choisissez + → Enregistrer une compétence.",
  tool: {
    skillCheck: {
      running: "Envoi du résultat de la vérification",
      done: "Résultat de la vérification envoyé",
    },
  },
};

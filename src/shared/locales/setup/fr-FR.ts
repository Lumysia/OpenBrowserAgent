import { plural } from "../../plural";
import type { SetupMessages } from "./en-US";

export const setupFrFR: SetupMessages = {
  continueSetup: "Continuer la configuration",
  runAgain: "Relancer la configuration",
  progressLabel: "Étapes de configuration",
  progressStep: "Étape {current} sur {total} : {step}",
  steps: {
    language: "Langue",
    path: "Nouveau ou habitué",
    provider: "Fournisseur d’IA",
    pages: "Sur les pages",
    sync: "Synchronisation",
    passphrase: "Phrase secrète",
    download: "Téléchargement",
    done: "Terminé",
  },
  back: "Retour",
  next: "Suivant",
  skipStep: "Passer",
  languageTitle: "Choisissez vos langues",
  languageDescription:
    "La langue de l’extension et celle dans laquelle les pages sont traduites. La plupart des gens gardent les deux telles quelles.",
  pathTitle: "Avez-vous déjà utilisé OpenBrowserAgent ?",
  pathDescription:
    "Si vous l’utilisez sur un autre appareil, la synchronisation apporte ici vos fournisseurs d’IA, vos agents et vos discussions.",
  pathNew: "C’est ma première fois",
  pathNewDescription:
    "Connectez un fournisseur d’IA et choisissez ce qu’OpenBrowserAgent ajoute aux pages web.",
  pathReturning: "Je l’utilise sur un autre appareil",
  pathReturningDescription:
    "Synchronisez vos paramètres, fournisseurs d’IA et discussions depuis votre autre appareil.",
  syncTitle: "Choisir comment synchroniser",
  syncDescription:
    "Connectez-vous de la même façon que sur votre autre appareil.",
  recommended: "Recommandé",
  methodCode: "Coller un code de synchronisation",
  methodCodeDescription:
    "Un seul code contient le serveur de synchronisation et ce qui se synchronise.",
  methodBrowser: "Synchronisation du compte du navigateur",
  browserConnect: "Activer la synchronisation du compte du navigateur",
  tryAgain: "Réessayer",
  asNewUser: "Configurer comme nouvel utilisateur",
  passphraseTitle: "Saisir votre phrase secrète de synchronisation",
  passphraseDescription:
    "Vos clés API sont synchronisées chiffrées. Saisissez la phrase secrète de synchronisation définie sur votre autre appareil.",
  keysUnlocked: "Vos clés API sont déverrouillées.",
  downloadTitle: "Se connecter et télécharger",
  downloadDescription:
    "OpenBrowserAgent télécharge ce que votre autre appareil a synchronisé.",
  downloading: "Téléchargement…",
  downloadFailed:
    "Impossible de télécharger depuis le serveur de synchronisation.",
  arrived: "Depuis votre autre appareil :",
  noSyncedProvider:
    "Aucun fournisseur d’IA n’est venu de votre autre appareil. Les discussions en ont besoin d’un.",
  arrivedCount: {
    providers: plural({
      one: "{count} fournisseur d’IA",
      other: "{count} fournisseurs d’IA",
    }),
    agents: plural({ one: "{count} agent", other: "{count} agents" }),
    skills: plural({ one: "{count} compétence", other: "{count} compétences" }),
    mcpServers: plural({
      one: "{count} serveur MCP",
      other: "{count} serveurs MCP",
    }),
    chats: plural({ one: "{count} discussion", other: "{count} discussions" }),
  },
  providerTitle: "Connecter un fournisseur d’IA",
  providerDescription:
    "Les discussions et l’agent ont besoin d’un fournisseur d’IA. Choisissez un service, ou n’importe quel serveur compatible OpenAI ou Anthropic avec son Base URL.",
  providerPlaceholder: "Choisir un fournisseur d’IA",
  providerReady: "{name} est prêt. Appuyez sur « Suivant » pour continuer.",
  testConnection: "Tester la connexion",
  testingConnection: "Test en cours…",
  connectionOk: "Connecté. {model} a répondu.",
  connectionFailed: "Impossible de se connecter au fournisseur d’IA",
  modelFailed: "Connecté, mais {model} n’a pas répondu",
  noModelsListed:
    "Connecté, mais le fournisseur d’IA n’a listé aucun modèle. Saisissez le nom d’un modèle.",
  model: "Modèle",
  modelName: "Nom du modèle",
  modelNameHint:
    "Si le fournisseur d’IA ne liste pas ses modèles, saisissez-en un par son nom, puis testez à nouveau.",
  pagesTitle: "Sur les pages",
  pagesDescription:
    "Ce qu’OpenBrowserAgent ajoute aux pages que vous visitez. Vous pourrez le modifier plus tard dans Paramètres → Sur les pages.",
  translateButtonDescription:
    "Un petit bouton au bord de la page la traduit ou affiche l’original.",
  smartBarTitle: "Barre intelligente sur le texte sélectionné",
  smartBarDescription:
    "Des actions rapides à côté du texte sélectionné. Rien n’est envoyé avant que vous en choisissiez une.",
  subtitlesDescription:
    "Les vidéos avec sous-titres affichent chaque ligne avec sa traduction en dessous.",
  doneTitle: "Tout est prêt",
  doneDescription:
    "Ouvrez le panneau latéral et posez une question sur la page affichée. Ces raccourcis fonctionnent sur toutes les pages.",
  noProviderNote:
    "Les discussions ont besoin d’un fournisseur d’IA. La traduction des pages avec le traducteur intégré fonctionne sans.",
  welcomeTitle: "Bienvenue dans OpenBrowserAgent",
  openPanelDescription:
    "Épinglez OpenBrowserAgent depuis le menu Extensions du navigateur, puis cliquez sur son icône pour ouvrir le panneau latéral.",
  openPanel: "Ouvrir le panneau latéral",
  code: "Code de synchronisation",
  codeDescription:
    "Sur votre autre appareil, ouvrez {settings} → {sync} et cliquez sur « {button} ». Les choix de synchronisation du code remplacent ceux de cet appareil.",
  codeInvalid:
    "Ce n’est pas un code de synchronisation valide. Copiez-le à nouveau et collez le code entier.",
  connect: "Connecter et synchroniser",
  testing: "Connexion…",
  pulling: "Synchronisation…",
  failed:
    "Connexion impossible. Vérifiez le code ou les informations du serveur, puis réessayez.",
  connected: "Connecté. Vos paramètres se synchronisent.",
  keysLocked:
    "Vos clés API sont synchronisées mais verrouillées. Saisissez votre phrase secrète de synchronisation.",
  unlock: "Déverrouiller",
  skip: "Plus tard",
};

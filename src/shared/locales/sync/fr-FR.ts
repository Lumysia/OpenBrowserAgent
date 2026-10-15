import { plural } from "../../plural";
import type { SyncMessages } from "./en-US";

export const syncFrFR: SyncMessages = {
  statusTitle: "État de la synchronisation",
  stateOff: "La synchronisation est désactivée",
  stateNeverSynced: "Pas encore synchronisé",
  stateSynced: "À jour",
  stateSyncing: "Synchronisation…",
  statePending: plural({
    one: "{count} modification en attente de synchronisation",
    other: "{count} modifications en attente de synchronisation",
  }),
  statePaused: "En pause jusqu’à {time}",
  stateError: "La dernière synchronisation a échoué",
  stateAttention: "La synchronisation demande votre attention",
  lastSync: "Dernière synchronisation : {time}",
  pausedRateLimit:
    "Le serveur a demandé de ralentir (HTTP {status}). La synchronisation reprendra d’elle-même.",
  syncNow: "Synchroniser maintenant",
  webDavOnly:
    "WebDAV uniquement : le stockage de synchronisation du compte du navigateur est trop petit.",
  groupSettings: "Paramètres",
  groupSettingsDescription:
    "Toujours synchronisés : langue, préférences, fournisseurs d’IA et serveurs MCP sans leurs clés, agents avec leurs MEMORY.md et USER.md, et compétences sans leurs fichiers.",
  groupAlways: "Toujours",
  groupKeys: "Clés",
  groupKeysDescription:
    "Clés API et en-têtes MCP, chiffrés avec votre phrase secrète de synchronisation avant de quitter cet appareil.",
  groupChats: "Discussions",
  groupChatsDescription:
    "Historique des discussions, sans pièces jointes. Laissez désactivé pour des discussions uniquement locales.",
  groupFiles: "Fichiers",
  groupFilesDescription:
    "Fichiers des compétences, fichiers de l’espace de travail des agents autres que MEMORY.md et USER.md, et pièces jointes des discussions (si les discussions sont synchronisées).",
  passphrase: "Phrase secrète de synchronisation",
  passphraseRepeat: "Répétez la phrase secrète",
  passphraseCreate:
    "Choisissez une phrase secrète de synchronisation. Chaque appareil qui synchronise les clés la demande une fois. Elle ne peut pas être récupérée : si vous l’oubliez, choisissez-en une nouvelle – vos clés restent sur chaque appareil.",
  passphraseEnter:
    "Les clés sont chiffrées avec une phrase secrète de synchronisation choisie sur un autre appareil. Saisissez-la une fois pour synchroniser les clés ici.",
  passphraseChangeDescription:
    "Choisissez une nouvelle phrase secrète de synchronisation. Vos autres appareils la demanderont une fois.",
  passphraseTooShort: "Utilisez au moins {min} caractères.",
  passphraseMismatch: "Les phrases secrètes ne correspondent pas.",
  passphraseWrong:
    "Phrase secrète incorrecte. Saisissez celle choisie sur votre autre appareil.",
  passphraseSave: "Enregistrer la phrase secrète",
  passphraseChange: "Modifier la phrase secrète",
  keysLocked:
    "Saisissez la phrase secrète de synchronisation pour synchroniser les clés sur cet appareil.",
  keysUnlocked:
    "Les clés sont synchronisées chiffrées avec votre phrase secrète de synchronisation.",
  filesNotSynced:
    "Les fichiers ne sont pas synchronisés sur cet appareil. Vos autres appareils les gardent tels quels.",
  warnings: {
    "unreliable-etags":
      "Impossible d’écrire sur ce serveur en toute sécurité. Utilisez un serveur WebDAV qui fournit des ETag forts.",
    "ignores-preconditions":
      "Ce serveur ne prend pas en charge les contrôles de version ; la synchronisation s’en charge.",
    "newer-format":
      "Un autre appareil utilise un format de synchronisation plus récent. Mettez à jour OpenBrowserAgent pour continuer à synchroniser.",
    "missing-content":
      "Une partie du contenu synchronisé manque sur le serveur.",
    quota:
      "Le stockage de synchronisation du compte du navigateur est plein. Désactivez certains éléments ou utilisez WebDAV.",
    "cloned-device":
      "Ce navigateur se synchronise désormais comme un nouvel appareil. Les modifications des deux côtés sont conservées.",
    "recovered-root":
      "Le fichier de synchronisation sur le serveur était endommagé. Il a été reconstruit à partir de sa copie précédente et des données de cet appareil.",
  },
  warningDetails: {
    "unreliable-etags":
      "Les versions de fichiers de ce serveur ne sont pas fiables : cet appareil n’envoie donc pas ses modifications, mais reçoit toujours celles des autres appareils.",
    "ignores-preconditions":
      "Si deux appareils enregistrent au même moment, un envoi peut écraser l’autre. Chaque appareil conserve ses modifications et les fusionne de nouveau à la synchronisation suivante. Si les deux ont modifié la même valeur, la modification la plus récente est conservée.",
    "missing-content":
      "Cet appareil garde sa copie jusqu’à ce qu’un autre appareil l’envoie à nouveau.",
    "cloned-device":
      "Un autre navigateur se synchronisait en tant que cet appareil, par exemple un profil de navigateur copié ou une sauvegarde restaurée sur un autre ordinateur.",
    "recovered-root":
      "Cela arrive quand un envoi s’arrête à mi-chemin. Rien n’a été perdu sur vos appareils : chacun renvoie ses modifications.",
  },
  massDeleteTitle: "Confirmer les suppressions venant d’un autre appareil",
  massDeleteDescription:
    "La dernière synchronisation supprimerait {count} éléments sur {total} dans {collection} sur cet appareil.",
  massDeleteApply: "Supprimer sur cet appareil",
  massDeleteKeep: "Conserver et renvoyer",
  massDeleteLocalTitle: "Confirmer les suppressions sur cet appareil",
  massDeleteLocalDescription:
    "{count} éléments sur {total} dans {collection} ont disparu de cet appareil. La synchronisation les supprimerait sur tous les appareils.",
  massDeleteLocalApply: "Supprimer sur tous les appareils",
  massDeleteLocalKeep: "Restaurer sur cet appareil",
  choiceTitle: "Synchroniser cet appareil",
  choiceOff: "Désactivée",
  choiceBrowser: "Compte du navigateur",
  choiceWebDav: "WebDAV",
  choiceOffHint: "Tout reste sur cet appareil.",
  whatSyncs: "Ce qui est synchronisé",
  copyCode: "Copier le code de synchronisation pour un autre appareil",
  codeCopied: "Code de synchronisation copié",
  pasteCode: "Coller le code de synchronisation d’un autre appareil",
};

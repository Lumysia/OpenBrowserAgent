import type { SyncMessages } from "./en-US";

export const syncFrFR: SyncMessages = {
  statusTitle: "État de la synchronisation",
  stateOff: "La synchronisation est désactivée",
  stateNeverSynced: "Pas encore synchronisé",
  stateSynced: "À jour",
  stateSyncing: "Synchronisation…",
  statePending: "{count} modification(s) en attente de synchronisation",
  statePaused: "En pause jusqu’à {time}",
  stateError: "La dernière synchronisation a échoué",
  stateAttention: "La synchronisation demande votre attention",
  lastSync: "Dernière synchronisation : {time}",
  pausedRateLimit:
    "Le serveur a demandé de ralentir (HTTP {status}). La synchronisation reprendra d’elle-même.",
  syncNow: "Synchroniser maintenant",
  webDavOnly:
    "WebDAV uniquement : le stockage de synchronisation du compte du navigateur est trop petit.",
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
};

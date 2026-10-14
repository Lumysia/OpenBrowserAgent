import { plural } from "../../plural";
import type { DownloadsLocaleMessages } from "./en-US";

export const downloadsFrFR: DownloadsLocaleMessages = {
  status: {
    completed: "{name} enregistré · {size}",
    failed: "Impossible de télécharger {name} : {reason}",
    canceled: "{name} annulé",
    in_progress: "Téléchargement de {name} · {progress}",
    paused: "{name} en pause · {progress}",
    needs_confirmation:
      "Le navigateur retient {name} : conservez-le dans la liste des téléchargements du navigateur",
    choosing_location:
      "Choisissez où enregistrer {name} dans la boîte de dialogue d’enregistrement du navigateur",
  },
  moved: "{name} a été déplacé ou supprimé",
  htmlPage: "{name} est une page web, pas le fichier",
  reasons: {
    network: "erreur réseau",
    missing: "le fichier n’existe pas sur le serveur",
    denied: "le serveur a refusé l’accès",
    signIn: "connexion requise",
    disk: "le fichier n’a pas pu être écrit",
    blocked: "bloqué par le navigateur",
    other: "erreur de téléchargement",
  },
  listed: plural({
    one: "{count} téléchargement",
    other: "{count} téléchargements",
  }),
  none: "Aucun téléchargement",
  showFileInFolder: "Afficher {name} dans son dossier",
};

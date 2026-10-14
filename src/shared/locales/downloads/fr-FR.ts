import { plural } from "../../plural";
import type { DownloadsLocaleMessages } from "./en-US";

export const downloadsFrFR: DownloadsLocaleMessages = {
  titles: {
    downloaded: "Téléchargement terminé",
    saved: "Enregistrement terminé",
    failed: "Échec du téléchargement",
    downloading: "Téléchargement en cours",
    paused: "Téléchargement en pause",
    waiting: "En attente de votre action",
    canceled: "Téléchargement annulé",
    listed: "Liste des téléchargements",
    noneStarted: "Aucun téléchargement lancé",
  },
  running: {
    download: "Téléchargement en cours",
    save: "Enregistrement en cours",
    images: "Enregistrement des images",
    list: "Consultation des téléchargements",
    wait: "Attente d’un téléchargement",
    cancel: "Annulation du téléchargement",
    retry: "Nouvelle tentative de téléchargement",
  },
  status: {
    completed: "{name} · {size}",
    failed: "{name} : {reason}",
    canceled: "{name}",
    in_progress: "{name} · {progress}",
    paused: "{name} · {progress}",
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

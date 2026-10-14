import { plural } from "../../plural";
import type { DownloadsLocaleMessages } from "./en-US";

export const downloadsEsES: DownloadsLocaleMessages = {
  status: {
    completed: "{name} guardado · {size}",
    failed: "No se pudo descargar {name}: {reason}",
    canceled: "{name} cancelado",
    in_progress: "Descargando {name} · {progress}",
    paused: "{name} en pausa · {progress}",
    needs_confirmation:
      "El navegador retiene {name}: consérvalo en la lista de descargas del navegador",
    choosing_location:
      "Elige dónde guardar {name} en el cuadro de diálogo Guardar del navegador",
  },
  moved: "{name} se movió o se eliminó",
  htmlPage: "{name} es una página web, no el archivo",
  reasons: {
    network: "error de red",
    missing: "el archivo no existe en el servidor",
    denied: "el servidor denegó el acceso",
    signIn: "hay que iniciar sesión",
    disk: "no se pudo escribir el archivo",
    blocked: "bloqueado por el navegador",
    other: "error de descarga",
  },
  listed: plural({ one: "{count} descarga", other: "{count} descargas" }),
  none: "No hay descargas",
  showFileInFolder: "Mostrar {name} en su carpeta",
};

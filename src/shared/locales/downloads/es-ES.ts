import { plural } from "../../plural";
import type { DownloadsLocaleMessages } from "./en-US";

export const downloadsEsES: DownloadsLocaleMessages = {
  titles: {
    downloaded: "Descarga completada",
    saved: "Archivo guardado",
    failed: "La descarga falló",
    downloading: "Descargando",
    paused: "Descarga en pausa",
    waiting: "Esperando tu acción",
    canceled: "Descarga cancelada",
    listed: "Descargas listadas",
    noneStarted: "No se inició ninguna descarga",
  },
  running: {
    download: "Descargando",
    save: "Guardando",
    images: "Guardando imágenes",
    list: "Consultando descargas",
    wait: "Esperando una descarga",
    cancel: "Cancelando la descarga",
    retry: "Reintentando la descarga",
  },
  status: {
    completed: "{name} · {size}",
    failed: "{name}: {reason}",
    canceled: "{name}",
    in_progress: "{name} · {progress}",
    paused: "{name} · {progress}",
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

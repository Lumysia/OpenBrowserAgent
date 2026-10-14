import { plural } from "../../plural";
import type { SyncMessages } from "./en-US";

export const syncEsES: SyncMessages = {
  statusTitle: "Estado de la sincronización",
  stateOff: "La sincronización está desactivada",
  stateNeverSynced: "Aún no se ha sincronizado",
  stateSynced: "Al día",
  stateSyncing: "Sincronizando…",
  statePending: plural({
    one: "{count} cambio esperando sincronización",
    other: "{count} cambios esperando sincronización",
  }),
  statePaused: "En pausa hasta las {time}",
  stateError: "La última sincronización ha fallado",
  stateAttention: "La sincronización necesita tu atención",
  lastSync: "Última sincronización: {time}",
  pausedRateLimit:
    "El servidor ha pedido reducir las peticiones (HTTP {status}). La sincronización se reanudará sola.",
  syncNow: "Sincronizar ahora",
  webDavOnly:
    "Solo con WebDAV: el almacenamiento de sincronización de la cuenta del navegador es demasiado pequeño.",
  warnings: {
    "unreliable-etags":
      "No se puede escribir en este servidor de forma segura. Usa un servidor WebDAV que envíe ETag fuertes.",
    "ignores-preconditions":
      "Este servidor no admite comprobaciones de versión; la sincronización lo resuelve sola.",
    "newer-format":
      "Otro dispositivo usa un formato de sincronización más reciente. Actualiza OpenBrowserAgent para seguir sincronizando.",
    "missing-content": "Falta parte del contenido sincronizado en el servidor.",
    quota:
      "El almacenamiento de sincronización de la cuenta del navegador está lleno. Desactiva algunos elementos o usa WebDAV.",
    "cloned-device":
      "Este navegador ahora se sincroniza como un dispositivo nuevo. Se conservan los cambios de ambos.",
  },
  warningDetails: {
    "unreliable-etags":
      "Las versiones de archivo de este servidor no son fiables, así que este dispositivo no sube sus cambios. Sigue descargando los cambios de otros dispositivos.",
    "ignores-preconditions":
      "Si dos dispositivos guardan a la vez, una subida puede sobrescribir la otra. Cada dispositivo conserva sus cambios y los vuelve a combinar en la siguiente sincronización. Si ambos cambiaron el mismo valor, se conserva el cambio más reciente.",
    "missing-content":
      "Este dispositivo conserva su copia hasta que otro dispositivo la vuelva a subir.",
    "cloned-device":
      "Otro navegador se estaba sincronizando como este dispositivo, por ejemplo un perfil de navegador copiado o una copia de seguridad restaurada en otro equipo.",
  },
  massDeleteTitle: "Confirma eliminaciones desde otro dispositivo",
  massDeleteDescription:
    "La última sincronización eliminaría {count} de {total} elementos de {collection} en este dispositivo.",
  massDeleteApply: "Eliminar en este dispositivo",
  massDeleteKeep: "Conservar y volver a subir",
  massDeleteLocalTitle: "Confirma eliminaciones en este dispositivo",
  massDeleteLocalDescription:
    "Faltan {count} de {total} elementos de {collection} en este dispositivo. La sincronización los eliminaría en todos los dispositivos.",
  massDeleteLocalApply: "Eliminar en todos los dispositivos",
  massDeleteLocalKeep: "Restaurar en este dispositivo",
};

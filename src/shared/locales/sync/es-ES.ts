import type { SyncMessages } from "./en-US";

export const syncEsES: SyncMessages = {
  statusTitle: "Estado de la sincronización",
  stateOff: "La sincronización está desactivada",
  stateNeverSynced: "Aún no se ha sincronizado",
  stateSynced: "Al día",
  stateSyncing: "Sincronizando…",
  statePending: "{count} cambio(s) esperando sincronización",
  statePaused: "En pausa hasta las {time}",
  stateError: "La última sincronización ha fallado",
  stateAttention: "La sincronización necesita tu atención",
  lastSync: "Última sincronización: {time}",
  pausedRateLimit:
    "El servidor ha pedido reducir las peticiones (HTTP {status}). La sincronización se reanudará sola.",
  syncNow: "Sincronizar ahora",
  webDavOnly:
    "Los chats y los adjuntos solo se sincronizan por WebDAV. El almacenamiento de sincronización de la cuenta del navegador es demasiado pequeño para ellos.",
  warnings: {
    "unreliable-etags":
      "Las versiones de archivo de este servidor no son fiables, así que los cambios de este dispositivo no se suben. Usa un servidor WebDAV que envíe ETag fuertes.",
    "ignores-preconditions":
      "Este servidor no admite comprobaciones de versión, así que si dos dispositivos guardan a la vez, una subida puede sobrescribir la otra. Cada dispositivo conserva sus cambios hasta verlos en el servidor y los vuelve a combinar en la siguiente sincronización. Si ambos cambiaron el mismo valor, se conserva el cambio más reciente.",
    "newer-format":
      "Otro dispositivo usa un formato de sincronización más reciente. Actualiza OpenBrowserAgent en este dispositivo para seguir sincronizando.",
    "missing-content":
      "Falta parte del contenido sincronizado en el servidor. Este dispositivo conserva su copia hasta que otro dispositivo la vuelva a subir.",
    quota:
      "El almacenamiento de sincronización de la cuenta del navegador está lleno. Desactiva algunos elementos o usa WebDAV.",
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

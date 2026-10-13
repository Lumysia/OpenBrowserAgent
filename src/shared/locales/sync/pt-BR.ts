import type { SyncMessages } from "./en-US";

export const syncPtBR: SyncMessages = {
  statusTitle: "Status da sincronização",
  stateOff: "A sincronização está desativada",
  stateNeverSynced: "Ainda não sincronizado",
  stateSynced: "Atualizado",
  stateSyncing: "Sincronizando…",
  statePending: "{count} alteração(ões) aguardando sincronização",
  statePaused: "Pausado até {time}",
  stateError: "A última sincronização falhou",
  stateAttention: "A sincronização precisa da sua atenção",
  lastSync: "Última sincronização: {time}",
  pausedRateLimit:
    "O servidor pediu menos requisições (HTTP {status}). A sincronização volta sozinha.",
  syncNow: "Sincronizar agora",
  webDavOnly:
    "Somente por WebDAV: o armazenamento de sincronização da conta do navegador é pequeno demais.",
  warnings: {
    "unreliable-etags":
      "Não é possível gravar neste servidor com segurança. Use um servidor WebDAV que envie ETags fortes.",
    "ignores-preconditions":
      "Este servidor não oferece suporte a verificações de versão; a sincronização contorna isso.",
    "newer-format":
      "Outro dispositivo usa um formato de sincronização mais novo. Atualize o OpenBrowserAgent para continuar sincronizando.",
    "missing-content":
      "Parte do conteúdo sincronizado está faltando no servidor.",
    quota:
      "O armazenamento de sincronização da conta do navegador está cheio. Desative alguns itens ou use WebDAV.",
    "cloned-device":
      "Este navegador agora sincroniza como um novo dispositivo. As alterações de ambos são mantidas.",
  },
  warningDetails: {
    "unreliable-etags":
      "As versões de arquivo deste servidor não são confiáveis, então este dispositivo não envia suas alterações. Ele continua baixando as alterações de outros dispositivos.",
    "ignores-preconditions":
      "Se dois dispositivos salvarem ao mesmo tempo, um envio pode substituir o outro. Cada dispositivo mantém suas alterações e as mescla de novo na sincronização seguinte. Se os dois mudaram o mesmo valor, a alteração mais recente é mantida.",
    "missing-content":
      "Este dispositivo mantém a cópia dele até que outro dispositivo a envie novamente.",
    "cloned-device":
      "Outro navegador estava sincronizando como este dispositivo, por exemplo um perfil de navegador copiado ou um backup restaurado em outro computador.",
  },
  massDeleteTitle: "Confirmar exclusões vindas de outro dispositivo",
  massDeleteDescription:
    "A última sincronização excluiria {count} de {total} itens em {collection} neste dispositivo.",
  massDeleteApply: "Excluir neste dispositivo",
  massDeleteKeep: "Manter e enviar novamente",
  massDeleteLocalTitle: "Confirmar exclusões neste dispositivo",
  massDeleteLocalDescription:
    "{count} de {total} itens em {collection} sumiram deste dispositivo. A sincronização os excluiria em todos os dispositivos.",
  massDeleteLocalApply: "Excluir em todos os dispositivos",
  massDeleteLocalKeep: "Restaurar neste dispositivo",
};

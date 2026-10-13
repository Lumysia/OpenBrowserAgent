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
    "Conversas e anexos são sincronizados apenas por WebDAV. O armazenamento de sincronização da conta do navegador é pequeno demais para eles.",
  warnings: {
    "unreliable-etags":
      "As versões de arquivo deste servidor não são confiáveis, então as alterações deste dispositivo não são enviadas. Use um servidor WebDAV que envie ETags fortes.",
    "ignores-preconditions":
      "Este servidor ignora as verificações de versão no envio. Se dois dispositivos salvarem ao mesmo tempo, a alteração sobrescrita é enviada novamente na próxima verificação desse dispositivo.",
    "newer-format":
      "Outro dispositivo usa um formato de sincronização mais novo. Atualize o OpenBrowserAgent neste dispositivo para continuar sincronizando.",
    "missing-content":
      "Parte do conteúdo sincronizado está faltando no servidor. Este dispositivo mantém a cópia dele até que outro dispositivo a envie novamente.",
    quota:
      "O armazenamento de sincronização da conta do navegador está cheio. Desative alguns itens ou use WebDAV.",
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

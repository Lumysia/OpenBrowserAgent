import { plural } from "../../plural";
import type { SyncMessages } from "./en-US";

export const syncPtBR: SyncMessages = {
  statusTitle: "Status da sincronização",
  stateOff: "A sincronização está desativada",
  stateNeverSynced: "Ainda não sincronizado",
  stateSynced: "Atualizado",
  stateSyncing: "Sincronizando…",
  statePending: plural({
    one: "{count} alteração aguardando sincronização",
    other: "{count} alterações aguardando sincronização",
  }),
  statePaused: "Pausado até {time}",
  stateError: "A última sincronização falhou",
  stateAttention: "A sincronização precisa da sua atenção",
  lastSync: "Última sincronização: {time}",
  pausedRateLimit:
    "O servidor pediu menos requisições (HTTP {status}). A sincronização volta sozinha.",
  syncNow: "Sincronizar agora",
  webDavOnly:
    "Somente por WebDAV: o armazenamento de sincronização da conta do navegador é pequeno demais.",
  groupSettings: "Configurações",
  groupSettingsDescription:
    "Sempre sincronizados: idioma, preferências, provedores de IA e servidores MCP sem as chaves, agentes com MEMORY.md e USER.md, e habilidades sem os arquivos.",
  groupAlways: "Sempre",
  groupKeys: "Chaves",
  groupKeysDescription:
    "Chaves de API e cabeçalhos de MCP, criptografados com sua frase secreta de sincronização antes de sair deste dispositivo.",
  groupChats: "Conversas",
  groupChatsDescription:
    "Histórico de conversas, sem anexos. Deixe desativado para conversas apenas locais.",
  groupFiles: "Arquivos",
  groupFilesDescription:
    "Arquivos das habilidades, arquivos do espaço de trabalho dos agentes além de MEMORY.md e USER.md, e anexos das conversas (com as conversas ativadas).",
  passphrase: "Frase secreta de sincronização",
  passphraseRepeat: "Repita a frase secreta",
  passphraseCreate:
    "Defina uma frase secreta de sincronização. Cada dispositivo que sincroniza chaves pede por ela uma vez. Ela não pode ser recuperada: se esquecer, defina outra — suas chaves continuam em cada dispositivo.",
  passphraseEnter:
    "As chaves estão criptografadas com uma frase secreta de sincronização definida em outro dispositivo. Digite-a uma vez para sincronizar as chaves aqui.",
  passphraseChangeDescription:
    "Defina uma nova frase secreta de sincronização. Seus outros dispositivos pedem por ela uma vez.",
  passphraseTooShort: "Use pelo menos {min} caracteres.",
  passphraseMismatch: "As frases secretas não coincidem.",
  passphraseWrong:
    "Frase secreta incorreta. Digite a que foi definida no seu outro dispositivo.",
  passphraseSave: "Salvar frase secreta",
  passphraseChange: "Alterar frase secreta",
  keysLocked:
    "Digite a frase secreta de sincronização para sincronizar as chaves neste dispositivo.",
  keysUnlocked:
    "As chaves são sincronizadas criptografadas com sua frase secreta de sincronização.",
  filesNotSynced:
    "Os arquivos não são sincronizados neste dispositivo. Seus outros dispositivos os mantêm como estão.",
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
    "recovered-root":
      "O arquivo de sincronização no servidor estava danificado. Ele foi reconstruído a partir da cópia anterior e dos dados deste dispositivo.",
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
    "recovered-root":
      "Isso acontece quando um envio para no meio. Nada foi perdido nos seus dispositivos: cada um envia suas alterações de novo.",
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

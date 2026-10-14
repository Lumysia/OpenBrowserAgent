import { plural } from "../../plural";
import type { DownloadsLocaleMessages } from "./en-US";

export const downloadsPtBR: DownloadsLocaleMessages = {
  status: {
    completed: "{name} salvo · {size}",
    failed: "Não foi possível baixar {name}: {reason}",
    canceled: "{name} cancelado",
    in_progress: "Baixando {name} · {progress}",
    paused: "{name} pausado · {progress}",
    needs_confirmation:
      "O navegador reteve {name}: mantenha-o na lista de downloads do navegador",
    choosing_location:
      "Escolha onde salvar {name} na caixa de diálogo Salvar do navegador",
  },
  moved: "{name} foi movido ou excluído",
  htmlPage: "{name} é uma página da web, não o arquivo",
  reasons: {
    network: "erro de rede",
    missing: "o arquivo não existe no servidor",
    denied: "o servidor negou o acesso",
    signIn: "é preciso entrar na conta",
    disk: "não foi possível gravar o arquivo",
    blocked: "bloqueado pelo navegador",
    other: "erro no download",
  },
  listed: plural({ one: "{count} download", other: "{count} downloads" }),
  none: "Nenhum download",
  showFileInFolder: "Mostrar {name} na pasta",
};

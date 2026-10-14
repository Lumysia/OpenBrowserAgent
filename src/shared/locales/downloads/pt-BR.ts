import { plural } from "../../plural";
import type { DownloadsLocaleMessages } from "./en-US";

export const downloadsPtBR: DownloadsLocaleMessages = {
  titles: {
    downloaded: "Download concluído",
    saved: "Arquivo salvo",
    failed: "Falha no download",
    downloading: "Baixando",
    paused: "Download pausado",
    waiting: "Aguardando você",
    canceled: "Download cancelado",
    listed: "Downloads listados",
    noneStarted: "Nenhum download iniciado",
  },
  running: {
    download: "Baixando",
    save: "Salvando",
    images: "Salvando imagens",
    list: "Consultando downloads",
    wait: "Aguardando um download",
    cancel: "Cancelando o download",
    retry: "Tentando baixar de novo",
  },
  status: {
    completed: "{name} · {size}",
    failed: "{name}: {reason}",
    canceled: "{name}",
    in_progress: "{name} · {progress}",
    paused: "{name} · {progress}",
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

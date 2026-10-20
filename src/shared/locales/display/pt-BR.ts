import { plural } from "../../plural";
import type { DisplayMessages } from "./en-US";

export const displayPtBR: DisplayMessages = {
  counts: {
    models: plural({ one: "{count} modelo", other: "{count} modelos" }),
    files: plural({ one: "{count} arquivo", other: "{count} arquivos" }),
    characters: plural({
      one: "{count} caractere",
      other: "{count} caracteres",
    }),
  },
  providerTypes: {
    openai: "OpenAI (ou compatível)",
    "openai-responses": "OpenAI (API Responses)",
    anthropic: "Anthropic (ou compatível)",
    gemini: "Google Gemini",
    ollama: "Ollama (local)",
  },
  mcpServerPresets: {
    exa: "Pesquisa na web e extração do conteúdo de páginas.",
    parallel: "Pesquisa na web com trechos e busca de páginas.",
    tinyfish: "Pesquisa na web e de notícias.",
    firecrawl:
      "Pesquisa na web, extração de páginas e análise de documentos. Limite gratuito de solicitações baixo.",
  },
  builtinSkills: {
    "fill-form": {
      name: "Preencher formulário",
      description:
        "Preenche formulários da web com os dados ou o arquivo que você fornecer, confere cada campo e só envia quando você pedir.",
    },
    "tidy-tabs": {
      name: "Organizar abas",
      description:
        "Fecha abas duplicadas, agrupa as relacionadas e encontra as que você não precisa mais.",
    },
    "openbrowseragent-help": {
      name: "Ajuda do OpenBrowserAgent",
      description:
        "Responde a perguntas sobre como usar e configurar o OpenBrowserAgent.",
    },
    "skill-creator": {
      name: "Criador de habilidades",
      description:
        "Cria, salva ou melhora habilidades, por exemplo a partir de uma tarefa que você acabou de fazer.",
    },
    "local-execution-bridge-setup": {
      name: "Configurar ponte de execução local",
      description:
        "Configura, testa, atualiza ou remove uma ponte de execução local para que os agentes possam executar comandos no seu computador.",
    },
  },
  errors: {
    noModel:
      "Nenhum modelo configurado. Adicione um provedor em “Configurações” → “Provedores de IA”.",
    noImageModel:
      "Nenhum modelo de imagem configurado. Escolha um em “Configurações” → “Provedores de IA”.",
    baseUrlRequired: "Informe uma URL base.",
    bridgeNotFound: "Esta ponte de execução não existe mais.",
    bridgeHostRequired: "Informe o nome do host de mensagens nativas.",
    bridgeTimeout: "A ponte de execução não respondeu a tempo.",
    syncKeysLocked:
      "Suas chaves de API estão sincronizadas, mas bloqueadas. Digite sua frase secreta de sincronização em Configurações → Sincronização.",
    teachUnscriptable: "Esta página não pode ser gravada.",
    tabRecording:
      "Esta guia está sendo gravada. Pare a gravação antes de o agente trabalhar nela.",
    teachEmpty: "Nada foi gravado. Faça a tarefa na página e depois pare.",
    teachNoInstructions: "O modelo não escreveu instruções. Tente de novo.",
    teachGone: "Esta gravação não existe mais.",
    teachCheckTab: "Não foi possível abrir a guia para a verificação.",
  },
  toolSteps: {
    failed: "Falhou",
    page: "Página",
    tabs: plural({ one: "{count} aba", other: "{count} abas" }),
    lines: plural({ one: "{count} linha", other: "{count} linhas" }),
    matchingLines: plural({
      one: "{count} linha correspondente",
      other: "{count} linhas correspondentes",
    }),
    matchingLinesWithOccurrences: plural({
      one: "{count} linha correspondente ({occurrences})",
      other: "{count} linhas correspondentes ({occurrences})",
    }),
    occurrences: plural({
      one: "{count} ocorrência",
      other: "{count} ocorrências",
    }),
    results: plural({ one: "{count} resultado", other: "{count} resultados" }),
    items: plural({ one: "{count} item", other: "{count} itens" }),
    tools: plural({ one: "{count} ferramenta", other: "{count} ferramentas" }),
    filesSaved: plural({
      one: "{count} arquivo salvo",
      other: "{count} arquivos salvos",
    }),
    editsApplied: plural({
      one: "{applied} de {count} alteração aplicada",
      other: "{applied} de {count} alterações aplicadas",
    }),
    actions: {
      open: "Aberta",
      switch: "Alternado para",
      close: "Fechada",
      navigate: "Página aberta",
      back: "Página anterior",
      forward: "Próxima página",
      reload: "Recarregada",
      group: "Agrupadas",
      ungroup: "Desagrupadas",
      list: "Listagem",
      search: "Pesquisa",
      read: "Leitura",
      write: "Escrita",
      append: "Texto adicionado ao final",
      replace: "Texto substituído",
      delete: "Exclusão",
      create: "Criação",
      patch: "Edição",
      add: "Adição",
      update: "Atualização",
      test: "Teste",
      status: "Consulta de status",
      resources: "Recursos de rede listados",
      emulate: "Emulação de um dispositivo",
      reset: "Emulação redefinida",
      capture: "Início do registro",
      captured: "Leitura do registro",
      request: "Leitura de uma requisição",
      download: "Download",
      save: "Salvamento",
      wait: "Espera por um download",
      retry: "Nova tentativa",
      images: "Imagens salvas",
      run: "Execução",
      start: "Início",
      cancel: "Cancelamento",
      get: "Consulta",
      runNow: "Execução iniciada",
      pause: "Pausa",
      resume: "Retomada",
    },
    commandStates: {
      running: "Em execução",
      done: "Concluído",
      error: "Falhou",
      canceled: "Cancelado",
      missing: "Tarefa não encontrada",
    },
    actStepSeparator: ", ",
    actSteps: {
      click: plural({ one: "{count} clique", other: "{count} cliques" }),
      type: plural({
        one: "{count} campo preenchido",
        other: "{count} campos preenchidos",
      }),
      press: plural({
        one: "{count} tecla pressionada",
        other: "{count} teclas pressionadas",
      }),
      select: plural({
        one: "{count} opção selecionada",
        other: "{count} opções selecionadas",
      }),
      hover: plural({
        one: "cursor sobre {count} elemento",
        other: "cursor sobre {count} elementos",
      }),
      scroll: plural({ one: "{count} rolagem", other: "{count} rolagens" }),
      wait: plural({ one: "{count} espera", other: "{count} esperas" }),
      drag: plural({
        one: "{count} elemento arrastado",
        other: "{count} elementos arrastados",
      }),
      dialog: plural({
        one: "{count} diálogo respondido",
        other: "{count} diálogos respondidos",
      }),
      other: plural({
        one: "{count} outra etapa",
        other: "{count} outras etapas",
      }),
    },
  },
};

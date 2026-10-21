import { plural } from "../../plural";
import type { TasksLocaleMessages } from "./en-US";

export const tasksPtBR: TasksLocaleMessages = {
  title: "Tarefas",
  untitled: "Tarefa sem título",
  count: plural({ one: "{count} tarefa", other: "{count} tarefas" }),
  newTask: "Nova tarefa",
  editTask: "Editar tarefa",
  makeTask: "Transformar em tarefa",
  empty: "Nenhuma tarefa ainda",
  emptyHint:
    "Peça ao agente para fazer algo mais tarde, em uma programação ou quando uma página mudar.",
  kinds: {
    once: "Uma vez",
    interval: "Repetir",
    daily: "Todo dia",
    weekly: "Toda semana",
    watch: "Monitorar uma página",
  },
  units: {
    minutes: plural({ one: "{count} minuto", other: "{count} minutos" }),
    hours: plural({ one: "{count} hora", other: "{count} horas" }),
    days: plural({ one: "{count} dia", other: "{count} dias" }),
  },
  unitNames: {
    minutes: "minutos",
    hours: "horas",
    days: "dias",
  },
  form: {
    title: "Título",
    prompt: "O que fazer",
    promptPlaceholder:
      "Verificar as notícias desta página e resumir o que há de novo",
    watchPrompt: "Condição e o que informar",
    watchPromptPlaceholder: "Avise quando o preço ficar abaixo de 50",
    kind: "Quando",
    at: "Data e hora",
    every: "A cada",
    unit: "Unidade",
    time: "Hora",
    days: "Dias",
    url: "Endereço da página",
    part: "Parte da página",
    partPage: "Conteúdo principal",
    partElement: "Elemento selecionado",
    pickElement: "Escolher na página",
    checkEvery: "Verificar a cada (minutos)",
    watchHint:
      "Cada verificação lê a página sem o modelo; o agente só é executado quando o texto monitorado mudou.",
    agent: "Agente",
    mayAct:
      "Este agente pode agir sozinho: as execuções podem usar as ferramentas que clicam, digitam ou alteram coisas.",
    looksOnly:
      "As execuções só observam: leem, pesquisam e informam, e nunca clicam, digitam ou alteram nada.",
    device: "Executa em",
    thisDevice: "{name} (este dispositivo)",
    save: "Salvar tarefa",
    invalidPrompt: "Diga o que a tarefa deve fazer.",
    invalidUrl: "Digite um endereço http ou https.",
    invalidAt: "Escolha uma data e uma hora.",
  },
  schedule: {
    unknown: "Agendamento de uma versão mais recente",
    once: "Uma vez, {time}",
    every: "A cada {amount}",
    daily: "Todo dia às {time}",
    weekly: "{days} às {time}",
    watch: plural({ other: "Monitora {page} a cada {count} min" }),
  },
  status: {
    needsOk: "Precisa da sua aprovação",
    unsupported: "Precisa de uma versão mais recente",
    running: "Em execução",
    paused: "Pausada",
    pausedFailures: "Pausada após falhas repetidas",
    needsUser: "Precisa de você",
    allPaused: "Todas as tarefas estão pausadas",
    otherDevice: "Executa em {device}",
    done: "Concluída",
  },
  results: {
    reported: "Informou",
    nothing: "Nada novo",
    met: "Condição atendida",
    notMet: "Condição não atendida",
    unchanged: "Sem mudança",
    answered: "Respondeu",
    needsUser: "Precisa de você",
    failed: "Falhou",
  },
  lastRun: "Última execução {time}",
  nextRun: "Próxima execução {time}",
  actions: {
    runNow: "Executar agora",
    pause: "Pausar",
    resume: "Retomar",
    edit: "Editar",
    delete: "Excluir tarefa",
    deleteConfirm:
      "Excluir esta tarefa? Os resultados anteriores continuam no histórico de conversas.",
    openResult: "Abrir resultado",
  },
  notify: {
    needsOk:
      "Ela não é executada neste dispositivo até você permitir na lista de tarefas.",
    titlePrefix: {
      needsOk: "A tarefa precisa da sua aprovação",
      result: "Resultado da tarefa",
      met: "Monitoramento",
      needsUser: "Tarefa precisa de você",
      paused: "Tarefa pausada",
    },
    finished: "A tarefa terminou. Abra para ver o resultado.",
    conditionMet: "A condição monitorada foi atendida.",
    needsUser: "A tarefa precisa da sua resposta para continuar.",
    paused: "A tarefa falhou várias vezes seguidas e foi pausada.",
  },
  approval: {
    allow: "Permitir",
    discard: "Descartar",
  },
  agentPermission: {
    pendingHere:
      "Ativado em outro dispositivo: aqui só age depois que você permitir.",
    allowHere: "Permitir neste dispositivo",
    label: "Agir sozinho",
    description:
      "Em tarefas programadas e monitoramentos, pode usar as ferramentas que clicam, digitam, enviam ou alteram coisas. Desligado: essas execuções só observam.",
  },
  settings: {
    title: "Tarefas programadas",
    description:
      "Tarefas e monitoramentos são executados em segundo plano enquanto o navegador está aberto.",
    pauseAll: "Pausar todas as tarefas",
    pauseAllDescription:
      "Nenhuma tarefa programada ou monitoramento é executado até você desligar isto, em todos os dispositivos.",
    notificationsUnavailable:
      "Este navegador não tem notificações do sistema: os resultados aparecem no botão da barra de ferramentas e na lista de tarefas.",
  },
  tool: {
    tasks: { running: "Gerenciando tarefas", done: "Gerenciamento de tarefas" },
    taskResult: {
      running: "Informando o resultado",
      done: "Resultado informado",
    },
  },
};

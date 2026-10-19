import { plural } from "../../plural";
import type { TeachLocaleMessages } from "./en-US";

export const teachPtBR: TeachLocaleMessages = {
  menu: {
    title: "Gravar uma habilidade",
    hint: "Mostre uma tarefa ao agente uma vez",
  },
  pill: {
    recording: "Gravando",
    stop: "Parar",
    stopHint: "Parar a gravação e escrever a habilidade",
  },
  start: {
    title: "Gravar uma habilidade",
    description:
      "Faça a tarefa você mesmo nesta página e clique em Parar. A gravação vira uma habilidade.",
    purpose: "Para que serve? (opcional)",
    purposePlaceholder: "Enviar minha folha de horas semanal",
    varies: "O que muda a cada vez? (opcional)",
    variesPlaceholder: "A semana e o projeto",
    privacy:
      "O que você digita não é gravado, só qual campo você usou. Senhas e códigos nunca.",
    start: "Começar a gravar",
    unscriptable:
      "Esta página não pode ser gravada. Abra a página onde a tarefa começa.",
  },
  recording: {
    title: "Gravando",
    steps: plural({ one: "{count} etapa", other: "{count} etapas" }),
    empty: "Faça a tarefa na página. Cada etapa aparece aqui.",
    long: "Gravações longas geram habilidades piores. Pare quando a tarefa terminar.",
    full: "A gravação está cheia: as próximas etapas não são gravadas.",
    stop: "Parar",
    discard: "Descartar",
    deleteStep: "Excluir etapa",
    varies: "Muda a cada vez",
    keepExample: "Manter o que digitei como exemplo",
    dropExample: "Não manter o exemplo",
    exampleKept: "Exemplo mantido",
    exampleGone: "A página não tem mais este valor.",
    secret: "Secreto — nunca armazenado",
  },
  step: {
    click: "Clicar em {target}",
    field: "Digitar em {target}",
    fieldSubmitted: "Digitar em {target} e pressionar Enter",
    choose: "Escolher {choice} em {target}",
    chooseSecret: "Escolher uma opção em {target}",
    check: "Marcar {target}",
    uncheck: "Desmarcar {target}",
    key: "Pressionar {key}",
    navigate: "Ir para {url}",
    openTab: "Nova guia: {url}",
    switchTab: "Mudança para {site}",
    page: "a página",
  },
  writing: {
    title: "Escrevendo a habilidade…",
    description: "O modelo transforma as etapas gravadas em instruções.",
  },
  failed: {
    title: "Não foi possível escrever a habilidade",
    retry: "Tentar de novo",
  },
  save: {
    title: "Salvar a habilidade",
    name: "Nome",
    description: "Descrição",
    stored:
      "Salva como habilidade com suas etapas: qual controle em qual página. O que você digitou não é armazenado. Ela sincroniza como suas outras habilidades.",
    check: "Salvar e verificar",
    checkHint:
      "Executa a habilidade uma vez em uma nova guia e pergunta a você antes da última etapa",
    draft: "Pular, salvar como rascunho",
  },
  check: {
    message: "Verificar a habilidade gravada {name}",
    passed: "Verificação aprovada: {name} está verificada.",
    auto: "Deixar o agente usá-la automaticamente",
    autoOn: "O agente agora usa {name} quando um pedido combina.",
    diverged: "A verificação foi diferente na etapa {step}.",
    divergedNoStep: "A verificação foi diferente.",
    fix: "Corrigir as etapas",
    fixMessage: "Corrigir as etapas de {name} com base nesta verificação",
    recordAgain: "Gravar de novo a partir daqui",
    keepDraft: "Salvar como rascunho",
    done: "Concluído",
  },
  status: {
    recorded: "Gravada",
    draft: "Rascunho",
    verified: "Verificada",
  },
  skillsHint:
    "Para gravar uma habilidade, abra o painel lateral na página onde a tarefa começa e escolha + → Gravar uma habilidade.",
  tool: {
    skillCheck: {
      running: "Informando a verificação",
      done: "Verificação informada",
    },
  },
};

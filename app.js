const STORAGE_KEY = "ritmo-study-planner-v1";
const USERS_KEY = "ritmo-local-users-v1";
const SESSION_KEY = "ritmo-local-session-v1";
const PROFILE_KEY = "ritmo-learning-profile-v1";
const BACKUP_VERSION = 1;
const DAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
const METHODS = ["Pomodoro", "Técnica de Feynman", "Prática ativa", "Repetição espaçada", "Estudo orientado a objetivo", "Estudo intercalado", "Leitura e resumo", "Exercícios", "Projeto prático", "Revisão de código"];
const PROGRAMMING_GOALS = new Set(["fundamentals", "python", "frontend", "javascript", "backend", "java", "csharp", "cpp", "go-rust", "php", "mobile", "games", "databases", "apis", "git", "testing", "devops", "data-ai", "cybersecurity", "web", "http"]);
const CURRICULUM_ALIASES = {
  web: "frontend",
  http: "apis",
};
const GOALS = {
  fundamentals: "Lógica de programação",
  python: "Python",
  frontend: "Desenvolvimento Front-end",
  javascript: "JavaScript",
  backend: "Desenvolvimento Back-end",
  java: "Java",
  csharp: "C# e .NET",
  cpp: "C e C++",
  "go-rust": "Go e Rust",
  php: "PHP para web",
  mobile: "Aplicativos para celular",
  games: "Desenvolvimento de jogos",
  databases: "Banco de dados e SQL",
  apis: "APIs, HTTP e integração",
  git: "Git e GitHub",
  testing: "Testes de software",
  devops: "DevOps e computação em nuvem",
  "data-ai": "Dados e inteligência artificial",
  cybersecurity: "Cibersegurança",
  // Aliases de programação mantidos para perfis que já estavam salvos.
  web: "Desenvolvimento web",
  http: "HTTP e APIs",
  custom: "Outro tema de programação",
};
const LEVELS = { beginner: "Estou começando", basic: "Já sei o básico", intermediate: "Intermediário", advanced: "Avançado" };
const LEARNING_STYLES = {
  balanced: "Variando teoria e prática",
  "hands-on": "Projetos e atividades práticas",
  theory: "Leitura e explicação",
  practice: "Exercícios e revisão ativa",
  visual: "Mapas, exemplos e recursos visuais",
};
const TIMELINES = { 3: "3 meses", 6: "6 meses", 12: "1 ano", 24: "2 anos ou mais" };
const STARTER_SESSIONS = [
  { id: makeId(), day: "Segunda", subject: "Lógica de programação", topic: "Variáveis e tipos de dados", method: "Exercícios", minutes: 35, done: false },
  { id: makeId(), day: "Terça", subject: "Python", topic: "Condições e repetições", method: "Prática ativa", minutes: 25, done: false },
  { id: makeId(), day: "Quarta", subject: "Desenvolvimento Front-end", topic: "Estrutura com HTML", method: "Projeto prático", minutes: 25, done: false },
  { id: makeId(), day: "Sexta", subject: "Git e GitHub", topic: "Primeiro commit", method: "Revisão de código", minutes: 30, done: false },
];

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readSessions(storageKey = STORAGE_KEY) {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (Array.isArray(saved)) return saved;
  } catch (error) {
    console.warn("Não foi possível ler o plano salvo.", error);
  }
  return STARTER_SESSIONS;
}

let sessions = readSessions();
let currentUser = null;
const rows = document.querySelector("#planner-rows");
const chart = document.querySelector("#weekly-chart");
const dialog = document.querySelector("#session-dialog");
const form = document.querySelector("#session-form");
const authForm = document.querySelector("#auth-form");
const profileForm = document.querySelector("#profile-form");
let toastTimer;
let authMode = "login";
let currentProfile = null;
let calendarMonth = new Date();
let analyticsRange = 7;
let focusTick = null;
let pendingImport = null;
const customStudySelects = new Map();

function userStorageId(user = currentUser) {
  return user?.storageId || user?.id || user?.email?.trim().toLowerCase() || "guest";
}

function planStorageKey(user = currentUser) {
  return `${STORAGE_KEY}:${userStorageId(user)}`;
}

function readUsers() {
  try {
    const users = JSON.parse(localStorage.getItem(USERS_KEY));
    return Array.isArray(users) ? users : [];
  } catch {
    return [];
  }
}

function profileKey(user = currentUser) {
  return `${PROFILE_KEY}:${userStorageId(user)}`;
}

function readProfile(user) {
  try {
    return JSON.parse(localStorage.getItem(profileKey(user)));
  } catch {
    return null;
  }
}

function saveProfile() {
  if (!currentUser || !currentProfile) return;
  try {
    localStorage.setItem(profileKey(), JSON.stringify(currentProfile));
  } catch (error) {
    console.error("Não foi possível salvar o perfil local.", error);
    showToast("Não consegui salvar o perfil neste navegador. Exporte um backup e confira o espaço disponível.");
    return false;
  }
  return true;
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function weekdayForDate(value) {
  const date = typeof value === "string" ? dateFromKey(value) : value;
  return DAYS[(date.getDay() + 6) % 7];
}

function weekKey(date = new Date()) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return localDateKey(monday);
}

function shiftDate(date, amount) {
  const shifted = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  shifted.setDate(shifted.getDate() + amount);
  return shifted;
}

function dateKeysBetween(start, end) {
  const keys = [];
  for (let date = dateFromKey(start); localDateKey(date) <= end; date = shiftDate(date, 1)) keys.push(localDateKey(date));
  return keys;
}

function sessionOccursOn(session, dateKey) {
  if (session.date) return session.date === dateKey;
  return session.repeatWeekly !== false && session.day === weekdayForDate(dateKey);
}

function normalizeWeeklySessions() {
  let changed = false;
  const currentWeek = weekKey();
  sessions.forEach((session) => {
    if (typeof session.repeatWeekly !== "boolean") {
      session.repeatWeekly = !session.date;
      changed = true;
    }
    if (!Array.isArray(session.studyLogs)) {
      session.studyLogs = [];
      changed = true;
    }
    if (!Array.isArray(session.completionHistory)) {
      session.completionHistory = [];
      changed = true;
    }
    if (session.done && session.completedAt && !session.completionHistory.some((item) => item.completedAt === session.completedAt)) {
      const migrated = { id: makeId(), completedAt: session.completedAt, studySeconds: Number(session.actualSeconds) || 0 };
      session.completionHistory.push(migrated);
      session.lastCompletionId = migrated.id;
      changed = true;
    }
    if (session.done && !session.lastCompletionId) {
      const latest = [...session.completionHistory].reverse().find((item) => item.completedAt === session.completedAt);
      if (latest) session.lastCompletionId = latest.id;
    }
    if (session.repeatWeekly && !session.date) {
      if (!session.completionWeek) {
        session.completionWeek = session.completedAt ? weekKey(dateFromKey(session.completedAt)) : currentWeek;
        changed = true;
      }
      if (session.completionWeek !== currentWeek) {
        session.done = false;
        delete session.completedAt;
        delete session.lastCompletionId;
        session.completionWeek = currentWeek;
        changed = true;
      }
    }
  });
  return changed;
}

function plannedOccurrences(start, end) {
  return dateKeysBetween(start, end).flatMap((date) => sessions
    .filter((session) => sessionOccursOn(session, date))
    .map((session) => ({ session, date })));
}

function currentWeekRange() {
  const start = weekKey();
  return { start, end: localDateKey(shiftDate(dateFromKey(start), 6)) };
}

function goalName(profile = currentProfile) {
  if (!profile) return "Seu objetivo de estudo";
  if (profile.goal === "custom") return profile.customGoal || "Outro tema de programação";
  return PROGRAMMING_GOALS.has(profile.goal) && GOALS[profile.goal] ? GOALS[profile.goal] : GOALS.fundamentals;
}

function profileStudyDays(profile = currentProfile) {
  const savedDays = Array.isArray(profile?.studyDays) ? profile.studyDays.filter((day) => DAYS.includes(day)) : [];
  if (savedDays.length) return DAYS.filter((day) => savedDays.includes(day));
  return ["Segunda", "Quarta", "Sexta"];
}

function profileSessionMinutes(profile = currentProfile) {
  if (!profile) return 60;
  const savedMinutes = Number(profile?.sessionMinutes);
  if ([15, 25, 30, 45, 60, 75, 90, 120, 180].includes(savedMinutes)) return savedMinutes;
  const legacyHours = Number(profile?.hours) || 4;
  const estimatedMinutes = Math.round((legacyHours * 60 / profileStudyDays(profile).length) / 15) * 15;
  return [15, 25, 30, 45, 60, 75, 90, 120, 180].sort((left, right) => Math.abs(left - estimatedMinutes) - Math.abs(right - estimatedMinutes))[0];
}

function weeklyHoursFor(profile = currentProfile) {
  if (!Array.isArray(profile?.studyDays) || !Number(profile?.sessionMinutes)) return Number(profile?.hours) || 4;
  return Math.round((profileStudyDays(profile).length * profileSessionMinutes(profile) / 60) * 10) / 10;
}

function curriculumFor(profile = currentProfile) {
  const selectedGoal = profile?.goal === "custom" || PROGRAMMING_GOALS.has(profile?.goal) ? profile.goal : "fundamentals";
  const plans = {
    custom: [
      ["Prepare o ambiente", "Identifique a linguagem e as ferramentas do tema escolhido e execute um exemplo pequeno.", "Rode um programa mínimo e anote cada etapa que aconteceu."],
      ["Entenda os fundamentos", "Estude os conceitos principais e observe como aparecem em um trecho de código.", "Explique uma linha de código com suas palavras."],
      ["Pratique exemplos curtos", "Altere exemplos pequenos e compare os resultados sem copiar tudo de uma vez.", "Modifique um exemplo e registre o que mudou."],
      ["Resolva um desafio", "Divida um problema de programação em passos e teste cada parte.", "Implemente uma função pequena para resolver uma tarefa."],
      ["Monte um projeto", "Combine os conceitos em uma aplicação pequena e fácil de testar.", "Faça uma primeira versão e descreva como executar."],
      ["Revise e compartilhe", "Organize o código, corrija os problemas encontrados e documente o projeto.", "Escreva um README curto com o objetivo e os comandos usados."],
    ],
    arts: [
      ["Escolha uma prática", "Defina uma habilidade artística que quer explorar e reúna exemplos.", "Escolha uma referência e descreva o que chama sua atenção."],
      ["Conheça os fundamentos", "Estude elementos básicos, materiais ou técnicas da área.", "Pratique um fundamento por alguns minutos e registre o resultado."],
      ["Exercite em partes", "Divida uma habilidade em movimentos ou elementos menores.", "Faça um exercício curto focado em uma técnica."],
      ["Observe e experimente", "Compare referências e teste variações com intenção.", "Crie duas versões simples usando abordagens diferentes."],
      ["Monte um projeto", "Combine fundamentos em uma criação pequena e possível de terminar.", "Planeje as etapas de uma peça, música ou desenho."],
      ["Revise seu processo", "Observe o que melhorou e escolha um próximo desafio.", "Compartilhe sua criação e anote o que faria diferente."],
    ],
    finance: [
      ["Conheça os conceitos", "Aprenda termos de orçamento, receitas, gastos e prioridades.", "Organize exemplos fictícios de entrada e saída de dinheiro."],
      ["Planeje um orçamento", "Separe gastos por categoria e compare com uma meta definida.", "Monte um orçamento mensal usando valores de exemplo."],
      ["Entenda poupança e juros", "Estude como tempo, taxas e frequência alteram um exemplo numérico.", "Compare dois cenários fictícios de economia usando uma planilha."],
      ["Leia informações com cuidado", "Observe custos, prazos, condições e linguagem de uma oferta.", "Faça uma lista de perguntas para entender uma proposta fictícia."],
      ["Pratique decisões", "Compare opções de exemplo considerando objetivos e limites.", "Explique os prós e contras de duas escolhas fictícias."],
      ["Revise seu aprendizado", "Reúna conceitos e crie uma ferramenta simples para organizar dados.", "Monte um guia pessoal de orçamento com exemplos inventados."],
    ],
    personal: [
      ["Defina uma meta", "Escreva uma meta clara, possível e importante para você.", "Transforme sua meta em um próximo passo pequeno."],
      ["Organize sua rotina", "Observe seus horários e escolha momentos realistas para praticar.", "Monte uma rotina semanal que inclua pausas."],
      ["Pratique foco", "Experimente blocos curtos de concentração e pausas planejadas.", "Faça uma atividade por 25 minutos e registre como foi."],
      ["Acompanhe o progresso", "Use registros simples para perceber avanços e obstáculos.", "Anote uma conquista e uma dificuldade da semana."],
      ["Ajuste sua estratégia", "Mude uma parte da rotina com base no que percebeu.", "Escolha um hábito pequeno para testar por alguns dias."],
      ["Reflita e continue", "Revise a meta, reconheça o que funcionou e defina o próximo passo.", "Escreva um plano breve para continuar aprendendo."],
    ],
    mathematics: [
      ["Descubra o ponto de partida", "Revise operações e identifique os assuntos que quer entender melhor.", "Resolva alguns exercícios e anote onde surgiram dúvidas."],
      ["Entenda os conceitos", "Estude definições e exemplos antes de avançar para regras novas.", "Explique um conceito com um exemplo criado por você."],
      ["Pratique passo a passo", "Resolva exercícios curtos e confira cada etapa do raciocínio.", "Faça três exercícios sem olhar a resolução."],
      ["Conecte os assuntos", "Observe como ideias diferentes aparecem no mesmo problema.", "Resolva um problema usando mais de uma estratégia."],
      ["Revise os erros", "Separe erros de cálculo, interpretação e escolha de estratégia.", "Refaça um exercício que antes parecia difícil."],
      ["Aplique o que aprendeu", "Use os conceitos em problemas do cotidiano ou desafios.", "Crie um problema e escreva uma solução explicada."],
    ],
    science: [
      ["Observe e faça perguntas", "Escolha um tema e liste o que já sabe e o que quer descobrir.", "Escreva três perguntas investigáveis sobre o tema."],
      ["Aprenda os conceitos", "Leia uma fonte confiável e registre as ideias principais.", "Explique o tema com suas palavras sem consultar o texto."],
      ["Use exemplos e modelos", "Relacione conceitos a fenômenos e exemplos concretos.", "Desenhe um modelo ou diagrama do processo estudado."],
      ["Analise informações", "Compare dados, evidências e explicações diferentes.", "Resuma o que uma tabela ou gráfico permite concluir."],
      ["Revise e conecte", "Retome conceitos e observe como eles se relacionam.", "Responda perguntas de memória e depois confira."],
      ["Compartilhe uma explicação", "Organize uma explicação curta com evidências e exemplos.", "Prepare um resumo ou apresentação de um tema."],
    ],
    languages: [
      ["Defina seu objetivo", "Escolha uma língua, uma situação de uso e um ponto de partida.", "Escreva uma apresentação curta usando o que já sabe."],
      ["Vocabulário em contexto", "Aprenda palavras em frases e situações, em vez de listas soltas.", "Monte cartões com palavras e frases de exemplo."],
      ["Escuta e pronúncia", "Pratique com áudios curtos e repita trechos em voz alta.", "Escute um diálogo e anote expressões que reconheceu."],
      ["Leitura e estruturas", "Leia textos curtos e observe como as frases são formadas.", "Resuma um parágrafo em suas próprias palavras."],
      ["Conversação e escrita", "Produza frases sobre assuntos que fazem parte do seu dia.", "Grave uma fala curta ou escreva uma mensagem simples."],
      ["Revise e use a língua", "Combine vocabulário, escuta, leitura e produção.", "Faça uma conversa ou texto curto sobre um tema familiar."],
    ],
    humanities: [
      ["Contextualize o tema", "Identifique período, lugar, pessoas e questões principais.", "Crie uma linha do tempo ou mapa de contexto."],
      ["Leia fontes com atenção", "Compare a ideia central e a perspectiva de cada fonte.", "Resuma uma fonte e destaque uma evidência."],
      ["Organize acontecimentos e conceitos", "Relacione causas, consequências e mudanças ao longo do tempo.", "Monte um mapa de conceitos com setas explicativas."],
      ["Compare perspectivas", "Observe semelhanças, diferenças e pontos de vista.", "Escreva duas interpretações possíveis do tema."],
      ["Recupere e revise", "Responda perguntas sem consultar e depois confira suas anotações.", "Explique a relação entre dois conceitos estudados."],
      ["Construa uma síntese", "Apresente uma conclusão apoiada em exemplos e fontes.", "Escreva um parágrafo explicando o que aprendeu."],
    ],
    writing: [
      ["Leia com um propósito", "Escolha um texto e identifique tema, público e intenção.", "Resuma o texto em três frases."],
      ["Amplie repertório", "Registre ideias, exemplos e palavras que podem apoiar sua escrita.", "Monte um pequeno banco de referências sobre um tema."],
      ["Planeje o texto", "Organize começo, desenvolvimento e conclusão antes de escrever.", "Faça um roteiro com a ideia principal de cada parágrafo."],
      ["Escreva uma primeira versão", "Transforme o plano em texto sem tentar acertar tudo de primeira.", "Escreva um rascunho curto sobre o tema escolhido."],
      ["Revise com critérios", "Confira clareza, organização, gramática e evidências.", "Revise o rascunho e anote três melhorias."],
      ["Finalize e compartilhe", "Prepare uma versão final adequada ao seu objetivo e leitor.", "Leia o texto em voz alta e faça os últimos ajustes."],
    ],
    "exam-prep": [
      ["Faça um diagnóstico", "Liste os conteúdos da prova e perceba o que já domina.", "Resolva algumas questões antigas sem consultar o material."],
      ["Organize os tópicos", "Divida o conteúdo em blocos pequenos e priorize os mais importantes.", "Monte um plano semanal com os assuntos principais."],
      ["Estude e recupere da memória", "Alterne leitura curta com perguntas e exercícios.", "Feche as anotações e escreva o que consegue lembrar."],
      ["Pratique questões", "Resolva questões por assunto e registre o raciocínio.", "Faça um bloco cronometrado de questões."],
      ["Revise seus erros", "Descubra se o erro veio de conteúdo, interpretação ou tempo.", "Refaça questões erradas e explique a solução."],
      ["Simule e ajuste", "Faça uma simulação curta e ajuste os próximos estudos.", "Revise o resultado e escolha três pontos para reforçar."],
    ],
    fundamentals: [
      ["Algoritmos e instruções", "Organize passos claros para resolver um problema.", "Descreva como preparar um lanche como uma sequência de instruções."],
      ["Variáveis e dados", "Guarde informações e escolha tipos de dados adequados.", "Monte um algoritmo que registre nome e idade."],
      ["Decisões", "Use condições para escolher caminhos diferentes.", "Crie as regras de um programa que verifica uma nota."],
      ["Repetições", "Repita passos com laços e condições de parada.", "Conte de 1 até um número escolhido pela pessoa."],
      ["Funções e decomposição", "Divida problemas grandes em partes menores reutilizáveis.", "Transforme um algoritmo em três funções pequenas."],
      ["Projeto de lógica", "Combine decisões, repetições e funções em uma solução.", "Explique e desenhe o algoritmo de um jogo simples."],
    ],
    python: [
      ["Lógica e primeiros passos", "Algoritmos simples, variáveis e tipos de dados.", "Crie um programa que faça uma pergunta e mostre uma resposta."],
      ["Decisões e repetições", "Condições, comparações e laços para repetir tarefas.", "Monte um jogo de adivinhação com tentativas."],
      ["Funções e coleções", "Funções, listas e dicionários para organizar seu código.", "Faça uma lista de tarefas que permita adicionar e concluir itens."],
      ["Arquivos e dados", "Leia e salve arquivos, use JSON e trate erros comuns.", "Salve os dados de um pequeno projeto em um arquivo JSON."],
      ["HTTP e APIs", "Entenda requisições, respostas, status e dados JSON.", "Consulte uma API pública e mostre um resultado no terminal."],
      ["Projeto para compartilhar", "Junte o que aprendeu em um projeto do seu interesse.", "Explique seu projeto e publique o código com um README."],
    ],
    frontend: [
      ["Estrutura de uma página", "HTML semântico, títulos, links e formulários.", "Monte uma página pessoal com seções bem organizadas."],
      ["Estilo e responsividade", "CSS, cores, espaçamento e layouts que se adaptam à tela.", "Deixe sua página confortável no celular e no computador."],
      ["JavaScript no navegador", "Variáveis, condições, funções e eventos do navegador.", "Adicione uma interação que responda a um clique."],
      ["Interfaces e dados", "DOM, formulários, validação e armazenamento local.", "Crie uma lista que continue salva depois de atualizar."],
      ["HTTP e APIs", "Como o navegador pede dados e recebe respostas.", "Carregue e apresente dados de uma API pública."],
      ["Projeto para compartilhar", "Una estrutura, estilo e interação em uma ideia sua.", "Publique uma página com descrição e instruções de uso."],
    ],
    javascript: [
      ["Sintaxe e primeiros passos", "Variáveis, tipos, operadores e entrada de dados.", "Faça uma calculadora simples no navegador."],
      ["Condições e repetições", "Use if, switch e laços para controlar seu programa.", "Crie um jogo de adivinhação com tentativas."],
      ["Funções e coleções", "Organize o código com funções, arrays e objetos.", "Monte uma lista de tarefas com funções separadas."],
      ["DOM e eventos", "Leia e altere elementos da página em resposta a ações.", "Faça um formulário validar os dados digitados."],
      ["Assincronia e APIs", "Promises, async/await, fetch e tratamento de erros.", "Busque dados de uma API e mostre o resultado."],
      ["Projeto JavaScript", "Junte interface, dados e lógica em um projeto.", "Publique um projeto com instruções no README."],
    ],
    backend: [
      ["Como a web funciona", "Clientes, servidores, HTTP, rotas e códigos de resposta.", "Desenhe e explique o caminho de uma requisição."],
      ["Linguagem e lógica", "Escolha Python ou JavaScript e pratique funções e estruturas.", "Crie um programa que organize uma coleção de dados."],
      ["Rotas e APIs", "Receba requisições e responda com dados em JSON.", "Crie endpoints para listar e cadastrar itens."],
      ["Banco de dados", "Modele tabelas, relações e operações CRUD.", "Salve e consulte os itens da sua API."],
      ["Validação e segurança", "Valide entradas, trate erros e proteja informações.", "Adicione validação e respostas de erro claras."],
      ["Publicação do projeto", "Configure ambiente, documentação e implantação.", "Documente e publique sua API de demonstração."],
    ],
    java: [
      ["Sintaxe e lógica", "Variáveis, tipos, operadores e entrada de dados em Java.", "Faça um programa de perguntas e respostas."],
      ["Condições e laços", "Use decisões e repetições para controlar o fluxo.", "Crie um jogo de adivinhação no terminal."],
      ["Métodos e classes", "Divida o código em métodos e modele objetos simples.", "Modele uma conta bancária fictícia."],
      ["Coleções e erros", "Trabalhe com listas, mapas e tratamento de exceções.", "Organize uma lista de tarefas em memória."],
      ["Arquivos e testes", "Persista dados e verifique o comportamento do programa.", "Salve seus dados e teste as operações principais."],
      ["Projeto Java", "Planeje e desenvolva uma aplicação completa pequena.", "Finalize um projeto com README e exemplos."],
    ],
    csharp: [
      ["Fundamentos de C#", "Variáveis, tipos, operadores e entrada e saída.", "Crie um conversor de unidades no console."],
      ["Decisões e coleções", "Condições, laços, arrays e listas.", "Monte uma lista de tarefas no terminal."],
      ["Classes e objetos", "Propriedades, métodos e conceitos básicos de orientação a objetos.", "Modele personagens de um jogo simples."],
      [".NET e organização", "Estruture projetos e use bibliotecas da plataforma .NET.", "Separe uma aplicação em arquivos e classes."],
      ["Dados e testes", "Salve informações e escreva testes para suas regras.", "Teste e persista os dados do seu projeto."],
      ["Projeto C#", "Conecte as partes em uma aplicação pequena.", "Documente seu projeto e explique como executar."],
    ],
    cpp: [
      ["Lógica e sintaxe", "Tipos, variáveis, operadores e entrada e saída.", "Crie um programa de cálculos no terminal."],
      ["Condições e laços", "Controle o fluxo com decisões e repetições.", "Faça um jogo de adivinhação com pontuação."],
      ["Funções e coleções", "Divida tarefas em funções e use arrays e strings.", "Procure um valor em uma lista de dados."],
      ["Memória e estruturas", "Entenda referências, ponteiros e estruturas de dados com cuidado.", "Modele um registro usando uma struct."],
      ["Algoritmos e depuração", "Compare soluções e aprenda a localizar erros.", "Implemente e teste uma ordenação simples."],
      ["Projeto C/C++", "Planeje uma aplicação de terminal com várias funcionalidades.", "Finalize o projeto com exemplos e documentação."],
    ],
    "go-rust": [
      ["Sintaxe e ferramentas", "Configure a linguagem escolhida e pratique tipos e variáveis.", "Crie um programa de terminal que receba dados."],
      ["Fluxo e funções", "Use condições, laços e funções para organizar a lógica.", "Faça um conversor ou jogo curto no terminal."],
      ["Tipos e estruturas", "Modele dados com structs e tipos compostos.", "Organize registros em uma coleção."],
      ["Pacotes e erros", "Divida o projeto em módulos e trate falhas.", "Separe o programa em arquivos e valide entradas."],
      ["Concorrência e segurança", "Conheça tarefas concorrentes e os recursos da linguagem.", "Desenhe como dividir um trabalho em pequenas tarefas."],
      ["Projeto Go/Rust", "Combine os fundamentos em um programa utilizável.", "Documente comandos, exemplos e decisões do projeto."],
    ],
    php: [
      ["Fundamentos de PHP", "Variáveis, tipos, operadores e funções.", "Crie um programa pequeno que formata informações."],
      ["Formulários e requisições", "Receba dados e entenda requisições HTTP.", "Monte e valide um formulário de contato fictício."],
      ["Páginas dinâmicas", "Organize templates, rotas e conteúdo reutilizável.", "Gere uma página com dados de uma lista."],
      ["Banco de dados", "Consulte e salve informações usando consultas preparadas.", "Crie um cadastro de itens usando uma base local."],
      ["Segurança e erros", "Valide dados, escape conteúdo e trate falhas.", "Revise entradas e mensagens de erro do seu projeto."],
      ["Projeto web com PHP", "Una páginas, formulários e dados em uma aplicação pequena.", "Documente como executar seu projeto localmente."],
    ],
    mobile: [
      ["Lógica para aplicativos", "Revise variáveis, funções e eventos de uma interface.", "Desenhe as telas de um app que você gostaria de usar."],
      ["Interface mobile", "Organize componentes, textos, botões e espaçamento.", "Monte uma tela inicial responsiva."],
      ["Navegação e estado", "Conecte telas e mantenha dados enquanto usa o app.", "Crie um fluxo simples entre duas telas."],
      ["Dados no aparelho", "Armazene preferências e informações localmente.", "Salve uma lista que continue após fechar o app."],
      ["APIs e qualidade", "Consuma serviços, trate carregamento e erros.", "Mostre dados de uma API com estados de carregamento."],
      ["Projeto mobile", "Junte interface e dados em um aplicativo demonstrativo.", "Apresente o app com imagens e instruções."],
    ],
    games: [
      ["Regras e ciclo do jogo", "Planeje objetivo, regras e atualização da partida.", "Escreva as regras de um jogo pequeno de perguntas."],
      ["Entrada e movimento", "Responda a teclas e atualize personagens ou objetos.", "Faça um objeto se mover na tela."],
      ["Colisões e pontuação", "Detecte interações e atualize o resultado do jogo.", "Adicione pontuação ao atingir um objetivo."],
      ["Fases e interface", "Organize telas, fases, menus e instruções.", "Crie começo, pausa e tela de fim."],
      ["Áudio e testes", "Adicione feedback e teste situações da partida.", "Teste diferentes caminhos e anote erros encontrados."],
      ["Projeto de jogo", "Finalize uma experiência pequena e explique como jogar.", "Compartilhe uma versão demonstrativa com instruções."],
    ],
    databases: [
      ["Modelagem de dados", "Tabelas, registros, chaves e relações.", "Desenhe as tabelas de uma biblioteca simples."],
      ["Consultas SQL", "SELECT, filtros, ordenação e agregações.", "Responda perguntas usando consultas SQL."],
      ["Alterar informações", "INSERT, UPDATE, DELETE e cuidados com alterações.", "Crie um pequeno cadastro de livros."],
      ["Relações e JOIN", "Combine dados de tabelas relacionadas.", "Relacione livros, autores e empréstimos."],
      ["Integridade e transações", "Restrições, transações e organização de consultas.", "Evite registros inválidos com regras do banco."],
      ["Projeto de banco", "Modele, preencha e documente uma base pequena.", "Explique o modelo e mostre consultas úteis."],
    ],
    apis: [
      ["Cliente e servidor", "Entenda requisições, respostas e o protocolo HTTP.", "Desenhe o caminho de uma chamada de API."],
      ["Métodos e status", "GET, POST, PUT, DELETE e códigos de resposta.", "Compare respostas de sucesso e de erro."],
      ["JSON e cabeçalhos", "Leia corpos e metadados de requisição e resposta.", "Organize dados JSON e identifique cabeçalhos."],
      ["Consumir uma API", "Envie requisições, leia dados e trate erros.", "Consulte uma API pública com Python ou JavaScript."],
      ["Criar uma API", "Modele rotas, entradas e respostas JSON.", "Implemente uma rota de consulta e uma de cadastro."],
      ["Documentar integração", "Descreva endpoints, exemplos e limitações.", "Monte uma documentação curta para sua API."],
    ],
    git: [
      ["Primeiros comandos", "Repositório, status, add e commit.", "Versione uma pasta de exercícios com commits claros."],
      ["Histórico e diferenças", "Leia logs e compare alterações entre versões.", "Encontre uma mudança antiga no histórico."],
      ["Branches", "Crie ramificações para experimentar com segurança.", "Faça uma melhoria em uma branch separada."],
      ["GitHub remoto", "Envie e atualize repositórios remotos.", "Publique um repositório de estudo no GitHub."],
      ["Colaboração", "Pull requests, revisão e resolução de conflitos simples.", "Revise uma alteração fictícia ou de um projeto próprio."],
      ["Fluxo de trabalho", "Use commits e documentação em um projeto completo.", "Mostre o histórico organizado do seu projeto."],
    ],
    testing: [
      ["Erros e depuração", "Leia mensagens de erro e descubra como reproduzir problemas.", "Registre passos simples para reproduzir um erro fictício."],
      ["Casos de teste", "Descreva entradas, resultados esperados e limites.", "Escreva exemplos para validar uma função pequena."],
      ["Testes unitários", "Teste partes isoladas e organize cenários.", "Crie casos para entradas válidas e inválidas."],
      ["Integração e interface", "Confira como partes diferentes funcionam juntas.", "Desenhe um fluxo de teste para um formulário."],
      ["Automação e qualidade", "Execute verificações com frequência e registre resultados.", "Monte um checklist de revisão antes de publicar."],
      ["Projeto testado", "Aplique testes a um projeto simples e documente o processo.", "Mostre os casos de teste e o que eles protegem."],
    ],
    devops: [
      ["Terminal e sistema", "Arquivos, processos, comandos e noções de Linux.", "Pratique comandos em uma pasta de testes."],
      ["Git e automação", "Versionamento e execução automática de verificações.", "Desenhe etapas de uma integração contínua."],
      ["Contêineres", "Imagens, contêineres e configuração reproduzível.", "Empacote uma aplicação de estudo em contêiner."],
      ["Nuvem e implantação", "Conceitos de serviços, ambientes e publicação.", "Mapeie o caminho de uma aplicação até produção."],
      ["Observabilidade", "Logs, métricas, alertas e investigação de problemas.", "Crie um checklist para observar uma aplicação."],
      ["Projeto DevOps", "Conecte código, automação e documentação.", "Documente um pipeline demonstrativo."],
    ],
    "data-ai": [
      ["Python para dados", "Tipos, coleções, arquivos e organização de dados.", "Leia um CSV e responda uma pergunta simples."],
      ["Preparação e análise", "Limpeza, tabelas, filtros e estatísticas básicas.", "Encontre padrões em um conjunto pequeno de dados."],
      ["Visualização", "Escolha gráficos que expliquem os dados claramente.", "Monte um gráfico e escreva o que ele mostra."],
      ["Ideias de aprendizado de máquina", "Dados de treino, modelos, previsões e avaliação.", "Explique como um modelo aprende com exemplos."],
      ["Experimentos responsáveis", "Compare resultados e procure erros ou vieses.", "Teste uma hipótese e registre limitações."],
      ["Projeto de dados", "Conte uma história com dados e conclusões cuidadosas.", "Compartilhe análise, gráfico e explicação."],
    ],
    cybersecurity: [
      ["Segurança e ética", "Princípios de segurança e autorização para praticar.", "Faça um inventário defensivo de riscos em um app fictício."],
      ["Redes e web", "DNS, HTTP, portas e conceitos de comunicação.", "Explique como proteger uma conexão web."],
      ["Linux e ferramentas", "Terminal, permissões e leitura de registros.", "Pratique comandos em um ambiente local seguro."],
      ["Aplicações seguras", "Validação, autenticação e falhas comuns em aplicações.", "Revise um formulário de demonstração procurando riscos."],
      ["Defesa e resposta", "Atualizações, cópias de segurança e resposta a incidentes.", "Escreva um checklist de proteção básica."],
      ["Laboratório autorizado", "Documente uma prática apenas em laboratório próprio.", "Escreva um relatório com riscos e correções."],
    ],
    web: [
      ["Estrutura de uma página", "HTML semântico, títulos, links e formulários.", "Monte uma página pessoal com seções bem organizadas."],
      ["Estilo e responsividade", "CSS, cores, espaçamento e layouts que se adaptam à tela.", "Deixe sua página confortável no celular e no computador."],
      ["JavaScript no navegador", "Variáveis, condições, funções e eventos.", "Adicione uma interação à sua página."],
      ["Interfaces e dados", "DOM, formulários, validação e armazenamento local.", "Crie uma lista que continue salva depois de atualizar."],
      ["HTTP e APIs", "Como o navegador pede dados e recebe respostas.", "Carregue e apresente dados de uma API pública."],
      ["Projeto para compartilhar", "Una estrutura, estilo e interação em uma ideia sua.", "Publique uma página com instruções de uso."],
    ],
    http: [
      ["Cliente e servidor", "O que acontece quando um programa faz uma requisição.", "Desenhe o caminho entre navegador, servidor e resposta."],
      ["Métodos e status", "GET, POST e os códigos de status mais comuns.", "Compare uma resposta 200 com uma resposta 404."],
      ["Cabeçalhos e JSON", "Metadados da requisição e formatos de troca de dados.", "Leia e organize um objeto JSON em Python."],
      ["Chamando uma API", "Envie requisições, leia respostas e lide com erros.", "Consulte uma API usando a biblioteca padrão do Python."],
      ["Criando um servidor", "Rotas, métodos e respostas em um servidor pequeno.", "Crie uma rota que devolve dados JSON."],
      ["Projeto de integração", "Use cliente e servidor para resolver uma tarefa real.", "Documente endpoints, exemplos e respostas do seu projeto."],
    ],
    school: [
      ["Mapeie as matérias", "Liste temas, dúvidas e prazos de cada matéria.", "Escolha um assunto pequeno para começar esta semana."],
      ["Entenda com suas palavras", "Leia um trecho e explique a ideia sem copiar.", "Faça um resumo de memória e depois confira suas anotações."],
      ["Pratique sem consultar", "Use perguntas e exercícios para recuperar o conteúdo.", "Crie cinco perguntas sobre um tema que estudou."],
      ["Alterne os assuntos", "Intercale duas matérias para manter a prática variada.", "Faça um bloco curto de cada matéria e compare o que aprendeu."],
      ["Revise no intervalo", "Retome os temas em um dia, uma semana e um mês.", "Agende a próxima revisão de um assunto importante."],
      ["Feche a semana", "Veja o que avançou e ajuste o plano seguinte.", "Explique o tema mais difícil para alguém ou para você mesmo."],
    ],
  };
  if (profile?.goal === "custom") {
    const subject = profile.customGoal || "seu objetivo";
    return [
      ["Defina o começo", `Separe ${subject} em assuntos pequenos e possíveis de praticar.`, "Escreva o que você já sabe e o que quer descobrir."],
      ["Aprenda os fundamentos", "Escolha uma fonte confiável e registre as ideias principais.", "Explique um conceito com suas palavras."],
      ["Pratique em partes", "Transforme o que aprendeu em exercícios curtos.", "Faça uma atividade simples sem consultar o material."],
      ["Conecte as ideias", "Observe como os assuntos se relacionam entre si.", "Crie um exemplo ou mapa para mostrar essas conexões."],
      ["Revise e aprofunde", "Volte aos pontos difíceis em intervalos curtos.", "Responda perguntas sobre o tema antes de reler."],
      ["Mostre o que aprendeu", "Faça um projeto, explicação ou resumo final.", "Compartilhe seu resultado e escolha o próximo passo."],
    ];
  }
  const curriculumKey = Object.hasOwn(CURRICULUM_ALIASES, selectedGoal) ? CURRICULUM_ALIASES[selectedGoal] : selectedGoal;
  return (Object.hasOwn(plans, curriculumKey) ? plans[curriculumKey] : null) || [
    ["Defina seu ponto de partida", "Liste o que já sabe e escolha uma parte pequena para estudar.", "Escreva uma pergunta que você quer responder."],
    ["Explore conceitos", "Use uma fonte confiável e registre as ideias principais.", "Explique um conceito com suas palavras."],
    ["Pratique em partes", "Transforme o que estudou em uma atividade curta.", "Faça um exercício ou exemplo sem consultar o material."],
    ["Conecte as ideias", "Observe relações entre os tópicos que está aprendendo.", "Crie um esquema ou exemplo para mostrar essa conexão."],
    ["Revise e ajuste", "Retome os pontos difíceis e altere o plano quando necessário.", "Responda perguntas de memória e confira suas anotações."],
    ["Mostre o que aprendeu", "Organize uma explicação, atividade ou projeto final.", "Compartilhe seu resultado e escolha o próximo passo."],
  ];
}

function createPlanSessions(profile) {
  const stages = curriculumFor(profile);
  const completedStages = Array.isArray(profile.completedStages) ? profile.completedStages : [];
  const firstPendingStage = stages.findIndex((_, index) => !completedStages.includes(index));
  const levelStartingPoint = { beginner: 0, basic: 1, intermediate: 2, advanced: 3 }[profile.level] || 0;
  const stageIndex = Math.max(levelStartingPoint, firstPendingStage < 0 ? 0 : firstPendingStage);
  const stageTitle = stages[Math.min(stageIndex, stages.length - 1)][0];
  const activities = [stages[Math.min(stageIndex, stages.length - 1)][2], "prática guiada", "desafio curto", "revisão ativa", "exercícios", "projeto pequeno", "explicação com suas palavras"];
  const methods = recommendedMethods(profile);
  const days = profileStudyDays(profile);
  const minutes = profileSessionMinutes(profile);

  return days.map((day, index) => ({
    id: makeId(),
    day,
    date: "",
    repeatWeekly: true,
    completionWeek: weekKey(),
    subject: goalName(profile),
    topic: `${stageTitle} — ${activities[index]}${profile.technology && index === days.length - 1 ? ` · ${profile.technology}` : ""}`.slice(0, 80),
    method: methods[index % methods.length],
    minutes,
    done: false,
    suggested: true,
    studyLogs: [],
    completionHistory: [],
  }));
}

function recommendedMethods(profile = currentProfile) {
  const programming = profile?.goal === "custom" || PROGRAMMING_GOALS.has(profile?.goal);
  if (profile?.style === "hands-on") return programming
    ? ["Projeto prático", "Exercícios", "Prática ativa", "Revisão de código"]
    : ["Projeto prático", "Exercícios", "Prática ativa", "Estudo intercalado"];
  if (profile?.style === "theory") return ["Leitura e resumo", "Técnica de Feynman", "Prática ativa", "Exercícios"];
  if (profile?.style === "practice") return ["Exercícios", "Prática ativa", "Repetição espaçada", "Técnica de Feynman"];
  if (profile?.style === "visual") return ["Leitura e resumo", "Estudo intercalado", "Prática ativa", "Técnica de Feynman"];
  const practicalTracks = new Set(["fundamentals", "mathematics", "science", "exam-prep", "arts", "personal", ...PROGRAMMING_GOALS]);
  const curriculumKey = programming ? (CURRICULUM_ALIASES[profile?.goal] || profile?.goal) : "fundamentals";
  return practicalTracks.has(curriculumKey)
    ? ["Projeto prático", "Prática ativa", "Exercícios", "Pomodoro"]
    : ["Leitura e resumo", "Estudo orientado a objetivo", "Prática ativa", "Técnica de Feynman"];
}

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password, saltHex) {
  if (!globalThis.crypto?.subtle) throw new Error("secure-storage-unavailable");
  const salt = Uint8Array.from(saltHex.match(/.{1,2}/g), (byte) => Number.parseInt(byte, 16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return bytesToHex(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 120000, hash: "SHA-256" }, key, 256));
}

function showAuthMessage(message) {
  const feedback = document.querySelector("#auth-feedback");
  feedback.textContent = message;
  feedback.hidden = false;
}

function setAuthMode(mode) {
  authMode = mode;
  const registering = mode === "register";
  const nameField = document.querySelector("#auth-name-field");
  const nameInput = document.querySelector("#auth-name");
  const passwordInput = document.querySelector("#auth-password");
  nameField.hidden = !registering;
  nameInput.required = registering;
  passwordInput.autocomplete = registering ? "new-password" : "current-password";
  document.querySelector("#auth-kicker").textContent = registering ? "SEU COMEÇO POR AQUI" : "QUE BOM TER VOCÊ AQUI";
  document.querySelector("#auth-title").textContent = registering ? "Crie sua conta." : "Entre no Ritmo.";
  document.querySelector("#auth-description").textContent = registering ? "Só mais um passo para montar seu espaço de estudos." : "Seu espaço de estudos está esperando por você.";
  document.querySelector("#auth-submit").innerHTML = registering ? 'Criar minha conta <span aria-hidden="true">→</span>' : 'Entrar no meu plano <span aria-hidden="true">→</span>';
  document.querySelector("#auth-switch-copy").textContent = registering ? "Já tem uma conta?" : "Ainda não tem conta?";
  document.querySelector("#auth-toggle").textContent = registering ? "Entrar" : "Criar conta";
  document.querySelector("#auth-feedback").hidden = true;
  authForm.reset();
}

function fillProfileForm(profile = null) {
  profileForm.reset();
  profileForm.elements.goal.value = profile?.goal === "custom" || PROGRAMMING_GOALS.has(profile?.goal) ? profile.goal : (profile?.goal ? "fundamentals" : "");
  profileForm.elements.customGoal.value = profile?.customGoal || "";
  profileForm.elements.level.value = profile?.level || "beginner";
  profileForm.elements.style.value = profile?.style || "balanced";
  const days = profileStudyDays(profile);
  profileForm.querySelectorAll('[name="studyDays"]').forEach((checkbox) => {
    checkbox.checked = days.includes(checkbox.value);
  });
  profileForm.elements.sessionMinutes.value = String(profileSessionMinutes(profile));
  profileForm.elements.timeline.value = String(profile?.timeline || 6);
  profileForm.elements.technology.value = profile?.technology || "";
  profileForm.elements.experience.value = profile?.experience || "";
  document.querySelector("#custom-goal-field").hidden = profileForm.elements.goal.value !== "custom";
  syncCustomStudySelects();
  updateStudyEstimate();
}

function formatHours(hours) {
  const rounded = Math.round(hours * 10) / 10;
  const formatted = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(".", ",");
  return `${formatted} ${rounded === 1 ? "hora" : "horas"}`;
}

function updateStudyEstimate() {
  if (!profileForm) return;
  const days = [...profileForm.querySelectorAll('[name="studyDays"]:checked')].map((checkbox) => checkbox.value);
  const minutes = Number(profileForm.elements.sessionMinutes?.value) || 60;
  const hours = days.length * minutes / 60;
  const estimate = document.querySelector("#study-estimate");
  if (!estimate) return;
  estimate.textContent = `${days.length} ${days.length === 1 ? "dia" : "dias"} por semana · ${formatHours(hours)} semanais`;
}

function syncCustomStudySelect(widget) {
  const selected = widget.select.selectedOptions[0];
  widget.value.textContent = selected?.textContent.trim() || "Escolha uma opção";
  widget.trigger.classList.toggle("has-value", Boolean(widget.select.value));
  widget.options.forEach((item) => {
    const isSelected = item.dataset.value === widget.select.value;
    item.classList.toggle("is-selected", isSelected);
    item.setAttribute("aria-selected", String(isSelected));
  });
}

function syncCustomStudySelects() {
  customStudySelects.forEach(syncCustomStudySelect);
}

function closeCustomStudySelect(widget, restoreFocus = false) {
  widget.menu.hidden = true;
  widget.root.classList.remove("is-open");
  widget.trigger.setAttribute("aria-expanded", "false");
  if (restoreFocus) widget.trigger.focus();
}

function openCustomStudySelect(widget) {
  customStudySelects.forEach((other) => {
    if (other !== widget) closeCustomStudySelect(other);
  });
  widget.menu.hidden = false;
  widget.root.classList.add("is-open");
  widget.trigger.setAttribute("aria-expanded", "true");
  const active = widget.options.find((item) => item.dataset.value === widget.select.value && item.getAttribute("aria-disabled") !== "true")
    || widget.options.find((item) => item.getAttribute("aria-disabled") !== "true");
  widget.options.forEach((item) => {
    item.tabIndex = item === active ? 0 : -1;
    item.classList.toggle("is-active", item === active);
  });
  active?.focus({ preventScroll: true });
  active?.scrollIntoView({ block: "nearest" });
}

function chooseCustomStudyOption(widget, item) {
  if (!item || item.getAttribute("aria-disabled") === "true") return;
  widget.select.value = item.dataset.value;
  widget.select.dispatchEvent(new Event("change", { bubbles: true }));
  closeCustomStudySelect(widget, true);
}

function buildCustomStudySelect(select) {
  const label = select.closest("label");
  const labelText = label?.childNodes[0]?.textContent.trim() || "Escolha uma opção";
  const root = document.createElement("div");
  root.className = `study-select${select.id === "goal-select" ? " study-select--goal" : ""}`;
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "study-select-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-label", labelText);
  trigger.setAttribute("aria-controls", `study-options-${select.id}`);
  if (select.required) trigger.setAttribute("aria-required", "true");
  const value = document.createElement("span");
  value.className = "study-select-value";
  trigger.append(value);

  const menu = document.createElement("div");
  menu.className = "study-select-menu";
  menu.id = `study-options-${select.id}`;
  menu.setAttribute("role", "listbox");
  menu.setAttribute("aria-label", labelText);
  menu.hidden = true;
  const options = [];

  const appendOption = (option, container) => {
    if (option.hidden && option.value !== select.value) return;
    const item = document.createElement("div");
    item.className = "study-select-option";
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", "false");
    item.tabIndex = -1;
    item.dataset.value = option.value;
    item.textContent = option.textContent.trim();
    if (option.disabled) {
      item.setAttribute("aria-disabled", "true");
      item.classList.add("is-disabled");
    }
    item.addEventListener("click", () => chooseCustomStudyOption(widget, item));
    container.append(item);
    options.push(item);
  };

  const widget = { select, root, trigger, value, menu, options, searchText: "", searchTimer: null };
  [...select.children].forEach((child) => {
    if (child.tagName === "OPTGROUP") {
      const group = document.createElement("div");
      group.className = "study-select-group";
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", child.label);
      const heading = document.createElement("div");
      heading.className = "study-select-group-label";
      heading.setAttribute("aria-hidden", "true");
      heading.textContent = child.label;
      group.append(heading);
      [...child.children].forEach((option) => appendOption(option, group));
      if (group.querySelector('[role="option"]')) menu.append(group);
    } else if (child.tagName === "OPTION") {
      appendOption(child, menu);
    }
  });

  trigger.addEventListener("click", () => {
    if (menu.hidden) openCustomStudySelect(widget);
    else closeCustomStudySelect(widget);
  });
  trigger.addEventListener("keydown", (event) => {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      if (menu.hidden) openCustomStudySelect(widget);
    }
  });
  menu.addEventListener("keydown", (event) => {
    const enabled = options.filter((item) => item.getAttribute("aria-disabled") !== "true");
    const current = enabled.indexOf(document.activeElement);
    if (event.key === "Escape") {
      event.preventDefault();
      closeCustomStudySelect(widget, true);
    } else if (event.key === "Tab") {
      closeCustomStudySelect(widget);
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next = event.key === "Home" ? 0
        : event.key === "End" ? enabled.length - 1
          : (current + (event.key === "ArrowDown" ? 1 : -1) + enabled.length) % enabled.length;
      enabled.forEach((item, index) => {
        item.tabIndex = index === next ? 0 : -1;
        item.classList.toggle("is-active", index === next);
      });
      enabled[next]?.focus();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      chooseCustomStudyOption(widget, document.activeElement);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      widget.searchText += event.key.toLocaleLowerCase("pt-BR");
      clearTimeout(widget.searchTimer);
      widget.searchTimer = setTimeout(() => { widget.searchText = ""; }, 700);
      const match = enabled.find((item) => item.textContent.trim().toLocaleLowerCase("pt-BR").startsWith(widget.searchText));
      if (match) {
        enabled.forEach((item) => {
          item.tabIndex = item === match ? 0 : -1;
          item.classList.toggle("is-active", item === match);
        });
        match.focus();
      }
    }
  });
  select.addEventListener("change", () => syncCustomStudySelect(widget));
  select.insertAdjacentElement("afterend", root);
  root.append(trigger, menu);
  select.classList.add("study-select-source");
  select.setAttribute("aria-hidden", "true");
  select.tabIndex = -1;
  select.required = false;
  customStudySelects.set(select.name, widget);
  syncCustomStudySelect(widget);
}

function initializeCustomStudySelects() {
  profileForm.querySelectorAll("select").forEach(buildCustomStudySelect);
  document.addEventListener("pointerdown", (event) => {
    customStudySelects.forEach((widget) => {
      if (!widget.root.contains(event.target)) closeCustomStudySelect(widget);
    });
  });
}

initializeCustomStudySelects();

function openProfileSetup() {
  fillProfileForm(currentProfile);
  document.querySelector("#auth-screen").hidden = true;
  document.querySelector("#app-shell").hidden = true;
  document.querySelector("#setup-screen").hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function enterPlanner(user) {
  const planKey = planStorageKey(user);
  let hasPlan = false;
  if (localStorage.getItem(planKey)) {
    sessions = readSessions(planKey);
    hasPlan = true;
  } else if (localStorage.getItem(STORAGE_KEY) && !localStorage.getItem(`${STORAGE_KEY}:claimed`)) {
    sessions = readSessions(STORAGE_KEY);
    localStorage.setItem(planKey, JSON.stringify(sessions));
    localStorage.setItem(`${STORAGE_KEY}:claimed`, userStorageId(user));
    hasPlan = true;
  } else {
    sessions = [];
  }
  currentUser = {
    id: user.id || userStorageId(user),
    storageId: userStorageId(user),
    email: user.email || "",
    name: user.name || user.email?.split("@")[0] || "Estudante",
  };
  currentProfile = readProfile(currentUser);
  if (!hasPlan && currentProfile) {
    sessions = createPlanSessions(currentProfile);
    saveSessions();
  }
  const displayName = currentUser.name;
  document.querySelector("#profile-name").textContent = displayName;
  document.querySelector("#sidebar-avatar").textContent = displayName.trim().charAt(0).toLocaleUpperCase("pt-BR") || "R";
  document.querySelector("#top-avatar").textContent = displayName.trim().charAt(0).toLocaleUpperCase("pt-BR") || "R";
  document.querySelector("#dashboard-name").textContent = displayName;
  document.querySelector("#dashboard-avatar").textContent = displayName.trim().charAt(0).toLocaleUpperCase("pt-BR") || "R";
  document.querySelector("#auth-screen").hidden = true;
  if (!currentProfile?.goal) {
    openProfileSetup();
    fillProfileForm(null);
  } else {
    document.querySelector("#setup-screen").hidden = true;
    document.querySelector("#app-shell").hidden = false;
    render();
  }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id: currentUser.id, storageId: currentUser.storageId, name: displayName, email: currentUser.email }));
}

function restoreSession() {
  try {
    const user = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    if (user?.email || user?.storageId === "guest" || user?.id === "guest") enterPlanner(user);
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
  }
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function saveSessions() {
  const storageKey = currentUser ? planStorageKey(currentUser) : STORAGE_KEY;
  try {
    localStorage.setItem(storageKey, JSON.stringify(sessions));
  } catch (error) {
    console.error("Não foi possível salvar as sessões locais.", error);
    showToast("Não consegui salvar o plano neste navegador. Exporte um backup e confira o espaço disponível.");
    return false;
  }
  return true;
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2500);
}

function methodOptions(selected) {
  return METHODS.map((method) => `<option value="${escapeHTML(method)}" ${method === selected ? "selected" : ""}>${escapeHTML(method)}</option>`).join("");
}

function dayOptions(selected) {
  return DAYS.map((day) => `<option value="${day}" ${day === selected ? "selected" : ""}>${day}</option>`).join("");
}

function sortedSessions() {
  return [...sessions].sort((a, b) => {
    if (a.date && b.date) return a.date.localeCompare(b.date);
    if (a.date) return 1;
    if (b.date) return -1;
    return DAYS.indexOf(a.day) - DAYS.indexOf(b.day);
  });
}

function renderPlanner() {
  if (sessions.length === 0) {
    rows.innerHTML = '<tr><td class="empty-row" colspan="8">Seu plano está vazio. Adicione uma sessão para começar. ✦</td></tr>';
    return;
  }

  rows.innerHTML = sortedSessions().map((session) => `
    <tr data-id="${escapeHTML(session.id)}">
      <td><select class="day-field" aria-label="Dia da semana" data-field="day" ${session.date ? "disabled" : ""}>${dayOptions(session.day)}</select></td>
      <td><input class="date-field" type="date" value="${escapeHTML(session.date || "")}" aria-label="Data específica; em branco repete toda semana" data-field="date" /></td>
      <td><input class="subject-field" type="text" maxlength="50" value="${escapeHTML(session.subject)}" aria-label="Tema de programação" data-field="subject" /></td>
      <td><input class="topic-field" type="text" maxlength="80" value="${escapeHTML(session.topic)}" aria-label="Assunto" data-field="topic" /></td>
      <td><select class="method-field" aria-label="Método" data-field="method">${methodOptions(session.method)}</select></td>
      <td><input type="number" min="5" max="600" value="${Number(session.minutes) || 25}" aria-label="Minutos" data-field="minutes" /></td>
      <td><input class="done-check" type="checkbox" aria-label="Marcar sessão como feita" data-field="done" ${session.done ? "checked" : ""} /></td>
      <td><button class="delete-row" type="button" data-delete="${escapeHTML(session.id)}" aria-label="Excluir sessão">×</button></td>
    </tr>`).join("");
}

function studyStreak() {
  const completedDates = new Set(sessions.flatMap((session) => [
    ...(session.completionHistory || []).map((item) => item.completedAt),
    ...(session.completedAt ? [session.completedAt] : []),
  ]).filter(Boolean));
  let cursor = new Date();
  if (!completedDates.has(localDateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (completedDates.has(localDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function scheduleReviews(session, completionId, completedAt) {
  if (!currentProfile) return;
  const reviews = Array.isArray(currentProfile.reviews) ? currentProfile.reviews : [];
  const existingIntervals = new Set(reviews.filter((review) => review.completionId === completionId).map((review) => review.interval));
  [1, 7, 30].forEach((interval) => {
    if (existingIntervals.has(interval)) return;
    const due = dateFromKey(completedAt);
    due.setDate(due.getDate() + interval);
    reviews.push({ id: makeId(), sessionId: session.id, completionId, subject: session.subject, topic: session.topic, interval, due: localDateKey(due), done: false });
  });
  currentProfile.reviews = reviews;
  saveProfile();
}

function renderReviews() {
  if (!currentProfile) return;
  const pending = (Array.isArray(currentProfile.reviews) ? currentProfile.reviews : []).filter((review) => !review.done).sort((a, b) => a.due.localeCompare(b.due));
  document.querySelector("#review-count").textContent = `${pending.length} ${pending.length === 1 ? "revisão" : "revisões"}`;
  if (pending.length === 0) {
    document.querySelector("#review-list").innerHTML = '<p class="review-empty">Quando você concluir uma sessão, as revisões recomendadas aparecerão aqui.</p>';
    return;
  }
  const today = localDateKey();
  document.querySelector("#review-list").innerHTML = pending.map((review) => {
    const daysAway = Math.round((new Date(`${review.due}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000);
    const dueLabel = daysAway < 0 ? "ATRASADA" : daysAway === 0 ? "HOJE" : `EM ${daysAway} ${daysAway === 1 ? "DIA" : "DIAS"}`;
    return `<article class="review-item"><span class="review-mark" aria-hidden="true">↻</span><div class="review-item-copy"><span>${dueLabel} · ${escapeHTML(review.subject)}</span><strong>${escapeHTML(review.topic)}</strong><small>Revisão de ${review.interval} ${review.interval === 1 ? "dia" : "dias"}</small></div><button class="review-done" type="button" data-review-id="${escapeHTML(review.id)}" ${daysAway > 0 ? "disabled" : ""}>${daysAway > 0 ? "Aguardando" : "Marcar revisão"}</button></article>`;
  }).join("");
}

function renderSummary() {
  const { start, end } = currentWeekRange();
  const occurrences = plannedOccurrences(start, end);
  const minutes = occurrences.reduce((sum, { session }) => sum + (Number(session.minutes) || 0), 0);
  const completed = occurrences.filter(({ session }) => session.done).length;
  const hours = Math.round((minutes / 60) * 10) / 10;
  document.querySelector("#hours-value").textContent = `${Number.isInteger(hours) ? hours : hours.toFixed(1).replace(".", ",")}h`;
  document.querySelector("#done-value").textContent = completed;
  document.querySelector("#done-caption").textContent = `de ${occurrences.length} ${occurrences.length === 1 ? "sessão" : "sessões"}`;
  const percent = occurrences.length ? Math.min(100, (completed / occurrences.length) * 100) : 0;
  document.querySelector("#progress-fill").style.width = `${percent}%`;
  document.querySelector(".progress-track").setAttribute("aria-valuenow", String(completed));
  document.querySelector(".progress-track").setAttribute("aria-valuemax", String(occurrences.length));
  const streak = studyStreak();
  document.querySelector("#streak-label").textContent = `✦ ${streak} ${streak === 1 ? "dia" : "dias"}`;
  document.querySelector("#dashboard-streak").textContent = `${streak} ${streak === 1 ? "dia" : "dias"} de sequência`;
}

function renderChart() {
  const minutesByDay = Object.fromEntries(DAYS.map((day) => [day, 0]));
  const { start, end } = currentWeekRange();
  sessions.forEach((session) => (session.studyLogs || []).forEach((log) => {
    if (!log.date || log.date < start || log.date > end) return;
    minutesByDay[weekdayForDate(log.date)] += Math.floor(Math.max(0, Number(log.durationSeconds) || 0) / 60);
  }));
  const maxMinutes = Math.max(45, ...Object.values(minutesByDay));
  const todayIndex = (new Date().getDay() + 6) % 7;
  chart.innerHTML = DAYS.map((day, index) => {
    const value = minutesByDay[day];
    const height = value ? Math.max(9, Math.round((value / maxMinutes) * 76)) : 4;
    const shortName = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"][index];
    return `<div class="chart-day" title="${day}: ${value} min registrados"><small>${value || ""}</small><div class="chart-column ${index === todayIndex ? "today" : ""}" style="height:${height}px"></div><span>${shortName}</span></div>`;
  }).join("");
}

function renderChecklist() {
  const groups = document.querySelector("#checklist-groups");
  if (!groups) return;
  const { start, end } = currentWeekRange();
  const occurrences = plannedOccurrences(start, end);
  const completed = occurrences.filter(({ session }) => session.done).length;
  const totalMinutes = occurrences.reduce((sum, { session }) => sum + (Number(session.minutes) || 0), 0);
  const weeklyHours = Math.round((totalMinutes / 60) * 10) / 10;
  document.querySelector("#checklist-summary").textContent = `${completed} de ${occurrences.length} ${occurrences.length === 1 ? "sessão concluída" : "sessões concluídas"}`;
  document.querySelector("#checklist-hours").textContent = `${formatHours(weeklyHours)} planejadas`;
  if (!occurrences.length) {
    groups.innerHTML = '<section class="content-panel checklist-empty"><p>Seu checklist ainda está vazio.</p><button class="button button-primary" type="button" data-add-session>＋ Criar uma sessão</button></section>';
    return;
  }
  const byDay = new Map();
  occurrences.forEach((occurrence) => {
    const day = weekdayForDate(occurrence.date);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(occurrence);
  });
  groups.innerHTML = DAYS.filter((day) => byDay.has(day)).map((day) => {
    const dayItems = byDay.get(day);
    const dayMinutes = dayItems.reduce((sum, { session }) => sum + (Number(session.minutes) || 0), 0);
    return `<section class="content-panel checklist-day"><header><div><p class="eyebrow">DIA DE ESTUDO</p><h2>${day}</h2></div><span class="chart-badge">${formatHours(dayMinutes / 60)}</span></header>
      <div class="checklist-items">${dayItems.map(({ session, date }) => `<article class="checklist-item ${session.done ? "is-done" : ""}"><button class="checklist-check ${session.done ? "is-checked" : ""}" type="button" data-checklist-toggle="${escapeHTML(session.id)}" aria-pressed="${Boolean(session.done)}" aria-label="${session.done ? "Desmarcar" : "Concluir"} ${escapeHTML(session.topic)}">${session.done ? "✓" : ""}</button><div class="checklist-item-copy"><strong>${escapeHTML(session.topic)}</strong><span>${escapeHTML(session.subject)} · ${Number(session.minutes) || 0} min · ${escapeHTML(session.method)}${session.date ? ` · ${new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(dateFromKey(date))}` : " · semanal"}</span></div><span class="checklist-status">${session.done ? "CONCLUÍDA" : "PENDENTE"}</span></article>`).join("")}</div></section>`;
  }).join("");
}

function renderCalendar() {
  const grid = document.querySelector("#calendar-grid");
  if (!grid) return;
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const title = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(calendarMonth);
  document.querySelector("#calendar-month-label").textContent = title.charAt(0).toLocaleUpperCase("pt-BR") + title.slice(1);
  const leadingDays = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let index = 0; index < leadingDays; index += 1) cells.push('<span class="calendar-day is-empty" aria-hidden="true"></span>');
  for (let date = 1; date <= daysInMonth; date += 1) {
    const weekdayIndex = new Date(year, month, date).getDay();
    const weekDayName = DAYS[(weekdayIndex + 6) % 7];
    const dateKey = localDateKey(new Date(year, month, date));
    const daySessions = sessions.filter((session) => sessionOccursOn(session, dateKey));
    const isToday = localDateKey(new Date(year, month, date)) === localDateKey();
    cells.push(`<button class="calendar-day ${daySessions.length ? "has-study" : ""} ${isToday ? "is-today" : ""}" type="button" data-calendar-day="${dateKey}" aria-label="Dia ${date}, ${weekDayName}${daySessions.length ? `, ${daySessions.length} sessões` : ""}"><span>${date}</span>${daySessions.length ? `<small>${daySessions.length} ${daySessions.length === 1 ? "sessão" : "sessões"}</small>` : ""}</button>`);
  }
  grid.innerHTML = cells.join("");
}

function updateSessionCompletion(session, done) {
  session.done = done;
  if (done) {
    session.completedAt = localDateKey();
    if (session.repeatWeekly && !session.date) session.completionWeek = weekKey();
    const completion = { id: makeId(), completedAt: session.completedAt, studySeconds: 0 };
    session.completionHistory = Array.isArray(session.completionHistory) ? session.completionHistory : [];
    session.completionHistory.push(completion);
    session.lastCompletionId = completion.id;
    scheduleReviews(session, completion.id, completion.completedAt);
  } else {
    const completionId = session.lastCompletionId;
    session.completionHistory = (session.completionHistory || []).filter((item) => item.id !== completionId);
    if (currentProfile && completionId) {
      currentProfile.reviews = (currentProfile.reviews || []).filter((review) => review.completionId !== completionId);
      saveProfile();
    }
    delete session.completedAt;
    delete session.lastCompletionId;
  }
  saveSessions();
}

function renderProfileDetails() {
  if (!currentProfile || !currentUser) return;
  const name = currentUser.name || currentUser.email?.split("@")[0] || "Estudante";
  const goal = goalName();
  const level = Object.hasOwn(LEVELS, currentProfile.level) ? LEVELS[currentProfile.level] : LEVELS.beginner;
  const style = Object.hasOwn(LEARNING_STYLES, currentProfile.style) ? LEARNING_STYLES[currentProfile.style] : LEARNING_STYLES.balanced;
  const days = profileStudyDays(currentProfile);
  const hours = weeklyHoursFor(currentProfile);
  const dayLabels = days.map((day) => day.slice(0, 3)).join(" · ");
  const timeline = Object.hasOwn(TIMELINES, currentProfile.timeline) ? TIMELINES[currentProfile.timeline] : TIMELINES[6];
  document.querySelector("#dashboard-goal").textContent = goal;
  document.querySelector("#dashboard-level").textContent = level;
  document.querySelector("#dashboard-hours").textContent = `${formatHours(hours)} / semana`;
  document.querySelector("#dashboard-days").textContent = dayLabels;
  document.querySelector("#roadmap-goal").textContent = goal;
  document.querySelector("#roadmap-level").textContent = level;
  document.querySelector("#roadmap-hours").textContent = `${formatHours(hours)} / semana`;
  document.querySelector("#roadmap-timeline").textContent = timeline;
  document.querySelector("#roadmap-description").textContent = `Uma trilha inicial de ${goal.toLocaleLowerCase("pt-BR")} organizada em etapas curtas. Ajuste o caminho conforme aprende.`;
  document.querySelector("#profile-display-name").textContent = name;
  document.querySelector("#profile-display-email").textContent = currentUser.email || "Dados salvos neste dispositivo";
  document.querySelector("#profile-avatar").textContent = name.trim().charAt(0).toLocaleUpperCase("pt-BR") || "R";
  document.querySelector("#profile-display-goal").textContent = goal;
  document.querySelector("#profile-display-level").textContent = level;
  document.querySelector("#profile-display-style").textContent = style;
  document.querySelector("#profile-display-days").textContent = days.join(", ");
  document.querySelector("#profile-display-hours").textContent = `${formatHours(hours)} · ${profileSessionMinutes(currentProfile)} min por dia`;
  document.querySelector("#profile-display-timeline").textContent = timeline;
  const summary = document.querySelector("#recommended-method-copy");
  const methods = recommendedMethods(currentProfile);
  if (summary) summary.textContent = `Para ${goal.toLocaleLowerCase("pt-BR")}, vamos alternar ${methods.slice(0, 3).join(", ")} em sessões de ${profileSessionMinutes(currentProfile)} min, nos dias ${days.join(", ")}.`;
  document.querySelector("#code-review-method").classList.toggle("is-unavailable", !PROGRAMMING_GOALS.has(currentProfile.goal));
  document.querySelectorAll("[data-method-card]").forEach((card) => {
    card.classList.toggle("is-recommended", methods.includes(card.dataset.methodCard));
  });
}

function timerElapsedMs(timer = currentProfile?.focusTimer, now = Date.now()) {
  if (!timer) return 0;
  const accumulated = Math.max(0, Number(timer.elapsedMs) || 0);
  return accumulated + (timer.startedAt ? Math.max(0, now - Number(timer.startedAt)) : 0);
}

function formatClock(milliseconds) {
  const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function formatStudyTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  return minutes >= 60 ? formatHours(minutes / 60) : `${minutes} min`;
}

function renderFocusTimer() {
  const select = document.querySelector("#focus-session");
  if (!select) return;
  const timer = currentProfile?.focusTimer || null;
  const selectedId = timer?.sessionId || select.value;
  const available = sessions;
  select.innerHTML = available.length
    ? available.map((session) => `<option value="${escapeHTML(session.id)}">${escapeHTML(session.subject)} — ${escapeHTML(session.topic)}</option>`).join("")
    : '<option value="">Adicione uma sessão ao plano</option>';
  if (available.some((session) => session.id === selectedId)) select.value = selectedId;
  select.disabled = Boolean(timer) || !available.length;
  document.querySelector("#focus-clock").textContent = formatClock(timerElapsedMs(timer));
  document.querySelector("#focus-start").hidden = Boolean(timer);
  document.querySelector("#focus-pause").hidden = !timer?.startedAt;
  document.querySelector("#focus-resume").hidden = !timer || Boolean(timer.startedAt);
  document.querySelector("#focus-finish").hidden = !timer;
  document.querySelector("#focus-start").disabled = !available.length;
  const session = timer ? sessions.find((item) => item.id === timer.sessionId) : null;
  const status = document.querySelector("#focus-status");
  if (timer && !session) status.textContent = "A sessão deste cronômetro não está mais no plano. Exporte o backup antes de restaurar outra versão.";
  else if (timer?.startedAt) status.textContent = `Cronometrando: ${session.subject} · ${session.topic}`;
  else if (timer) status.textContent = "Cronômetro pausado. Retome ou salve o tempo registrado.";
  else status.textContent = available.length ? "Escolha uma sessão e inicie quando estiver pronto." : "Adicione uma sessão ao plano para usar o cronômetro.";
  clearInterval(focusTick);
  focusTick = timer?.startedAt ? setInterval(() => {
    document.querySelector("#focus-clock").textContent = formatClock(timerElapsedMs());
  }, 1000) : null;
}

function startFocusTimer() {
  const sessionId = document.querySelector("#focus-session").value;
  if (!sessions.some((session) => session.id === sessionId)) {
    showToast("Escolha uma sessão válida para iniciar.");
    return;
  }
  currentProfile.focusTimer = { id: makeId(), sessionId, startedAt: Date.now(), elapsedMs: 0 };
  saveProfile();
  renderFocusTimer();
}

function pauseFocusTimer() {
  const timer = currentProfile?.focusTimer;
  if (!timer?.startedAt) return;
  timer.elapsedMs = timerElapsedMs(timer);
  timer.startedAt = null;
  saveProfile();
  renderFocusTimer();
}

function resumeFocusTimer() {
  const timer = currentProfile?.focusTimer;
  if (!timer || timer.startedAt) return;
  timer.startedAt = Date.now();
  saveProfile();
  renderFocusTimer();
}

function finishFocusTimer() {
  const timer = currentProfile?.focusTimer;
  if (!timer) return;
  const session = sessions.find((item) => item.id === timer.sessionId);
  if (!session) {
    showToast("Não encontrei a sessão. Ela continua no cronômetro.");
    return;
  }
  const durationSeconds = Math.floor(timerElapsedMs(timer) / 1000);
  if (durationSeconds < 1) {
    showToast("Inicie o cronômetro antes de salvar o tempo.");
    return;
  }
  const logId = timer.id || makeId();
  session.studyLogs = Array.isArray(session.studyLogs) ? session.studyLogs : [];
  if (!session.studyLogs.some((log) => log.id === logId)) {
    session.studyLogs.push({ id: logId, durationSeconds, endedAt: new Date().toISOString(), date: localDateKey(), subject: session.subject, topic: session.topic });
    saveSessions();
  }
  currentProfile.focusTimer = null;
  saveProfile();
  render();
  showToast(`${formatClock(durationSeconds * 1000)} registrado para ${session.subject}.`);
}

function completionRecordsInRange(start, end) {
  return sessions.flatMap((session) => (session.completionHistory || []).map((record) => ({ ...record, sessionId: session.id, subject: session.subject })))
    .filter((record) => record.completedAt >= start && record.completedAt <= end);
}

function studyLogsInRange(start, end) {
  return sessions.flatMap((session) => (session.studyLogs || []).map((log) => ({ ...log, subject: log.subject || session.subject })))
    .filter((log) => log.date >= start && log.date <= end && Number.isFinite(Number(log.durationSeconds)) && Number(log.durationSeconds) > 0);
}

function renderAnalytics() {
  const today = localDateKey();
  const start = localDateKey(shiftDate(new Date(), -(analyticsRange - 1)));
  const logs = studyLogsInRange(start, today);
  const completions = completionRecordsInRange(start, today);
  const eligible = plannedOccurrences(start, today).length;
  const studiedSeconds = logs.reduce((sum, log) => sum + Number(log.durationSeconds), 0);
  const minutes = Math.floor(studiedSeconds / 60);
  const rate = eligible ? Math.min(100, Math.round((completions.length / eligible) * 100)) : null;
  document.querySelector("#analytics-time").textContent = formatStudyTime(studiedSeconds);
  document.querySelector("#analytics-time-caption").textContent = logs.length ? `${logs.length} ${logs.length === 1 ? "bloco registrado" : "blocos registrados"} · últimos ${analyticsRange} dias` : "Nenhum bloco registrado neste período.";
  document.querySelector("#analytics-completed").textContent = String(completions.length);
  document.querySelector("#analytics-completed-caption").textContent = `${analyticsRange} dias até hoje`;
  document.querySelector("#analytics-eligible").textContent = String(eligible);
  document.querySelector("#analytics-rate").textContent = rate === null ? "—" : `${rate}%`;
  document.querySelector("#analytics-rate-caption").textContent = rate === null ? "Sem sessões elegíveis para calcular." : "Concluídas ÷ planejadas até hoje.";

  const dailySeconds = Object.fromEntries(dateKeysBetween(start, today).map((date) => [date, 0]));
  logs.forEach((log) => { dailySeconds[log.date] += Number(log.durationSeconds); });
  const maxSeconds = Math.max(60, ...Object.values(dailySeconds));
  const bars = Object.entries(dailySeconds).map(([date, seconds]) => {
    const height = seconds ? Math.max(5, Math.round((seconds / maxSeconds) * 92)) : 3;
    const label = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(dateFromKey(date)).replaceAll(".", "");
    const dayMinutes = Math.floor(seconds / 60);
    return `<div class="analytics-bar" title="${label}: ${formatStudyTime(seconds)}"><span>${dayMinutes || (seconds ? "<1" : "")}</span><i style="height:${height}px"></i><small>${label}</small></div>`;
  }).join("");
  document.querySelector("#analytics-activity").innerHTML = bars;
  document.querySelector("#analytics-activity").setAttribute("aria-label", `Tempo registrado nos últimos ${analyticsRange} dias, total de ${minutes} minutos`);
  document.querySelector("#analytics-empty").hidden = logs.length > 0;

  const bySubject = new Map();
  logs.forEach((log) => bySubject.set(log.subject, (bySubject.get(log.subject) || 0) + Number(log.durationSeconds)));
  const sorted = [...bySubject.entries()].sort((left, right) => right[1] - left[1]);
  const subjectTotal = sorted.reduce((sum, [, seconds]) => sum + seconds, 0);
  document.querySelector("#analytics-subjects").innerHTML = sorted.length
    ? sorted.map(([subject, seconds]) => `<div class="subject-analytics-row"><div><span>${escapeHTML(subject)}</span><strong>${formatStudyTime(seconds)}</strong></div><div class="analytics-track" role="progressbar" aria-label="Tempo em ${escapeHTML(subject)}" aria-valuemin="0" aria-valuemax="${subjectTotal}" aria-valuenow="${seconds}"><i style="width:${Math.round((seconds / subjectTotal) * 100)}%"></i></div></div>`).join("")
    : '<p class="analytics-empty">Registre um bloco de foco para ver a distribuição por tema de programação.</p>';
}

function renderRoadmap() {
  if (!currentProfile) return;
  const stages = curriculumFor();
  const doneStages = Array.isArray(currentProfile.completedStages) ? currentProfile.completedStages : [];
  const completed = doneStages.length;
  document.querySelector("#roadmap-count").textContent = `${completed} de ${stages.length}`;
  document.querySelector("#roadmap-progress-fill").style.width = `${(completed / stages.length) * 100}%`;
  document.querySelector("#roadmap-weeks").innerHTML = stages.map(([title, description, practice], index) => {
    const done = doneStages.includes(index);
    return `<article class="roadmap-stage ${done ? "is-done" : ""}">
      <div class="stage-number">${String(index + 1).padStart(2, "0")}</div>
      <div class="stage-content"><div class="stage-overline"><span>ETAPA ${index + 1}</span><span class="stage-state">${done ? "CONCLUÍDA" : "NO SEU RITMO"}</span></div>
      <h2>${escapeHTML(title)}</h2><p>${escapeHTML(description)}</p>
      <div class="stage-practice"><span>PARA PRATICAR</span><p>${escapeHTML(practice)}</p></div>
      <button class="stage-toggle" type="button" data-stage="${index}" aria-pressed="${done}">${done ? "✓ Etapa concluída" : "Marcar como concluída"}</button></div>
    </article>`;
  }).join("");
}

function renderPractice() {
  if (!currentProfile) return;
  const practice = {
    arts: ["O que observar em uma referência artística?", "Observe composição, ritmo, formas ou escolhas de materiais. Escolha um detalhe e experimente uma variação própria."],
    finance: ["Como um orçamento ajuda a organizar gastos?", "Ele mostra receitas e despesas por categoria para comparar o que entra, o que sai e uma meta de exemplo."],
    personal: ["Como tornar uma meta mais fácil de começar?", "Transforme a meta em uma ação pequena, defina quando praticar e acompanhe como foi por alguns dias."],
    mathematics: ["Como você escolheria uma estratégia para resolver um problema?", "Identifique o que foi dado, o que precisa descobrir e quais conceitos podem ajudar. Depois confira se a resposta faz sentido."],
    science: ["Qual é a diferença entre uma observação e uma hipótese?", "Uma observação descreve algo percebido ou medido. Uma hipótese é uma explicação que pode ser investigada com evidências."],
    languages: ["Como praticar uma palavra nova para lembrar dela depois?", "Use a palavra em uma frase própria, fale em voz alta e tente recuperá-la de memória em outro momento."],
    humanities: ["Por que comparar fontes diferentes sobre um tema?", "Fontes podem apresentar perspectivas e contextos distintos. Compará-las ajuda a construir uma explicação mais cuidadosa."],
    writing: ["O que ajuda um parágrafo a ficar claro?", "Uma ideia principal, exemplos que a apoiem e uma ligação clara com o restante do texto."],
    "exam-prep": ["O que fazer depois de errar uma questão de treino?", "Descubra se a dificuldade veio do conteúdo, da interpretação ou do tempo. Depois refaça a questão explicando cada etapa."],
    fundamentals: ["Como você divide um problema grande em passos menores?", "Identifique a entrada, as etapas necessárias e o resultado esperado. Depois transforme cada etapa em uma instrução simples."],
    python: ["O que uma função faz em Python?", "Uma função reúne instruções com um nome para você poder reutilizá-las. Ela pode receber dados e devolver um resultado."],
    frontend: ["Qual é o papel do HTML em uma página?", "HTML organiza a estrutura e o significado do conteúdo. CSS cuida da aparência e JavaScript das interações."],
    javascript: ["O que um evento permite fazer no JavaScript?", "Eventos permitem responder a ações, como um clique ou o envio de um formulário."],
    backend: ["Qual é o papel de uma rota em uma API?", "Uma rota conecta um endereço e método HTTP a uma ação que o servidor executa."],
    java: ["Para que serve um método em Java?", "Um método agrupa instruções com um nome. Ele pode receber dados e devolver um resultado."],
    csharp: ["O que uma classe representa em C#?", "Uma classe descreve dados e comportamentos que os objetos daquele tipo podem ter."],
    cpp: ["Por que separar o código em funções?", "Funções dividem um programa em partes menores que podem ser entendidas, testadas e reutilizadas."],
    "go-rust": ["Por que os tipos de dados ajudam a organizar um programa?", "Os tipos indicam que valores uma variável pode guardar e ajudam a detectar usos incompatíveis."],
    php: ["O que acontece quando um formulário envia dados para o servidor?", "O navegador envia uma requisição. O servidor recebe os dados, valida as entradas e prepara uma resposta."],
    mobile: ["O que é o estado de uma tela?", "Estado são os dados que a interface precisa acompanhar e mostrar enquanto a pessoa usa o aplicativo."],
    games: ["O que o ciclo de jogo atualiza a cada instante?", "Ele lê entradas, atualiza regras e objetos, e depois desenha a nova situação na tela."],
    databases: ["Para que serve uma chave primária?", "Ela identifica cada registro de uma tabela de forma única e ajuda a relacionar os dados."],
    apis: ["O que acontece em uma requisição GET?", "O cliente pede um recurso ao servidor. Em geral, GET consulta dados sem alterar o estado do servidor."],
    git: ["O que um commit registra no Git?", "Um commit guarda um conjunto de mudanças e uma mensagem para você acompanhar a evolução do projeto."],
    testing: ["O que um teste precisa comparar?", "O teste executa uma situação e compara o resultado obtido com o resultado esperado."],
    devops: ["O que a integração contínua automatiza?", "Ela executa verificações do código sempre que mudanças são enviadas, ajudando a encontrar problemas cedo."],
    "data-ai": ["Por que separar dados de treino e avaliação?", "Essa separação ajuda a verificar se um modelo funciona com dados que ele ainda não usou para aprender."],
    cybersecurity: ["Qual é a primeira regra para praticar segurança?", "Tenha autorização explícita e use apenas sistemas próprios ou ambientes de laboratório preparados para isso."],
    web: ["Qual é o papel do HTML em uma página?", "HTML organiza a estrutura e o significado do conteúdo. CSS cuida da aparência e JavaScript das interações."],
    http: ["O que acontece em uma requisição GET?", "O cliente pede um recurso ao servidor. Em geral, GET consulta dados sem alterar o estado do servidor."],
    school: ["Feche suas anotações: como você explicaria o último assunto que estudou?", "Tente explicar a ideia principal com suas palavras. Depois confira o material para encontrar o que faltou."],
    custom: [`Qual é uma ideia importante sobre ${currentProfile.customGoal || "seu objetivo"}?`, "Responda sem consultar o material. Depois explique a ideia com suas próprias palavras e confira suas anotações."],
  };
  const practiceGoal = currentProfile.goal === "custom" || PROGRAMMING_GOALS.has(currentProfile.goal) ? currentProfile.goal : "fundamentals";
  const [question, answer] = practice[practiceGoal] || [
    `Qual é uma ideia importante sobre ${goalName()}?`,
    "Responda sem consultar o material. Depois explique a ideia com suas palavras e confira suas anotações.",
  ];
  document.querySelector("#practice-question").textContent = question;
  document.querySelector("#practice-answer").textContent = answer;
  document.querySelector("#practice-answer").hidden = true;
  document.querySelector("#reveal-answer").hidden = false;
}

function renderVideoContent() {
  const container = document.querySelector("#video-content-grid");
  if (!container) return;
  const profileGoal = currentProfile?.goal;
  const goalKey = profileGoal === "custom" || PROGRAMMING_GOALS.has(profileGoal) ? profileGoal : "fundamentals";
  const curriculumGoal = goalKey === "custom" ? "fundamentals" : goalKey;
  const safeProfile = { ...(currentProfile || {}), goal: curriculumGoal };
  const goalLabel = profileGoal === "custom"
    ? (currentProfile.customGoal || "Programação")
    : (GOALS[curriculumGoal] || "Lógica de programação");
  const stages = curriculumFor(safeProfile);
  const completedStages = Array.isArray(currentProfile?.completedStages) ? currentProfile.completedStages : [];
  const nextStageIndex = stages.findIndex((_, index) => !completedStages.includes(index));
  const stage = stages[nextStageIndex < 0 ? 0 : nextStageIndex];
  const plannedSession = sessions.find((session) => !session.done && session.subject.toLocaleLowerCase("pt-BR") === goalName(currentProfile).toLocaleLowerCase("pt-BR"));
  const topic = plannedSession?.topic?.split("—")[0]?.trim() || stage?.[0] || "Fundamentos de programação";
  const topicLabel = `${goalLabel} · ${topic}`;
  const curated = {
    fundamentals: { title: "Introdução a algoritmos", source: "Curso em Vídeo", url: "https://www.youtube.com/watch?v=8mei6uVttho" },
    python: { title: "Python 3 — Mundo 1", source: "Curso em Vídeo", url: "https://www.youtube.com/playlist?list=PLHz_AreHm4dlKP6QQCekuIPky1CiwmdI6" },
    frontend: { title: "Curso introdutório de HTML", source: "freeCodeCamp em português", url: "https://www.youtube.com/watch?v=ijv8-PeLZ_O" },
    git: { title: "Criando o primeiro repositório", source: "Curso em Vídeo", url: "https://www.youtube.com/watch?v=5BYm7UdCrX0" },
  };
  const searchURL = (query) => `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  const featured = curated[curriculumGoal];
  const lessons = [
    featured
      ? { tag: "CURSO RECOMENDADO", title: featured.title, detail: `${featured.source} · relacionado a ${goalLabel}.`, url: featured.url, cta: "Assistir videoaula" }
      : { tag: "AULA DO TEMA", title: `Entenda ${topic}`, detail: "Videoaulas em português para acompanhar o próximo assunto da sua trilha.", url: searchURL(`${topicLabel} aula programação em português iniciante`), cta: "Ver aulas do tema" },
    { tag: "EXEMPLOS PRÁTICOS", title: `Pratique ${topic}`, detail: "Encontre demonstrações e exercícios resolvidos relacionados ao seu plano.", url: searchURL(`${topicLabel} exercício prático passo a passo`), cta: "Ver exemplos" },
    { tag: "PROJETO GUIADO", title: `Crie algo com ${goalLabel}`, detail: "Aulas com projetos pequenos para transformar o conteúdo em código.", url: searchURL(`${goalLabel} projeto iniciante tutorial em português`), cta: "Ver projetos" },
  ];
  document.querySelector("#video-content-description").textContent = `Aulas e exemplos para ${topicLabel}. Os links de busca usam seu próximo tema de estudo.`;
  container.innerHTML = lessons.map((lesson, index) => `<article class="video-content-card"><div class="video-card-art video-art-${index + 1}" aria-hidden="true"><span class="video-play-mark">▶</span><span class="video-art-caption">VIDEOAULA</span></div><div class="video-card-copy"><span class="video-card-tag">${escapeHTML(lesson.tag)}</span><h3>${escapeHTML(lesson.title)}</h3><p>${escapeHTML(lesson.detail)}</p><a class="video-card-link" href="${escapeHTML(lesson.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(lesson.cta)} <span aria-hidden="true">↗</span></a></div></article>`).join("");
}

function render() {
  if (!currentUser) return;
  if (normalizeWeeklySessions()) saveSessions();
  renderPlanner();
  renderSummary();
  renderChart();
  renderChecklist();
  renderCalendar();
  renderFocusTimer();
  renderAnalytics();
  if (currentProfile) {
    renderProfileDetails();
    renderRoadmap();
    renderPractice();
    renderReviews();
    renderVideoContent();
  }
}

function addSession({ method = "Pomodoro", minutes, day, date } = {}) {
  form.reset();
  form.querySelector('[name="method"]').value = METHODS.includes(method) ? method : "Pomodoro";
  form.querySelector('[name="minutes"]').value = minutes || (method === "Pomodoro" ? 25 : 30);
  if (date) {
    form.querySelector('[name="date"]').value = date;
    form.querySelector('[name="day"]').value = weekdayForDate(date);
  } else if (day && DAYS.includes(day)) form.querySelector('[name="day"]').value = day;
  dialog.showModal();
  form.querySelector('[name="subject"]').focus();
}

function csvValue(value) {
  let text = String(value ?? "");
  if (/^\s*[=+@-]/.test(text)) text = `'${text}`;
  return /[;"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadCSV(filename, data) {
  const content = "\uFEFF" + data.map((row) => row.map(csvValue).join(";")).join("\r\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportSheet(type) {
  if (type === "weekly") {
    const data = [["Dia", "Data específica", "Repete toda semana", "Tema de programação", "Tópico", "Método", "Minutos planejados", "Minutos registrados", "Concluída nesta semana", "Concluída em"], ...sortedSessions().map((session) => [session.day, session.date || "", session.repeatWeekly ? "Sim" : "Não", session.subject, session.topic, session.method, session.minutes, Math.floor((session.studyLogs || []).reduce((sum, log) => sum + (Number(log.durationSeconds) || 0), 0) / 60), session.done ? "Sim" : "Não", session.completedAt || ""])];
    downloadCSV("meu-plano-semanal.csv", data);
    showToast("Seu plano semanal foi baixado.");
    return;
  }

  const templates = {
    review: { filename: "modelo-revisao-espacada.csv", rows: [["Tema de programação", "Tópico", "Estudei em", "Revisão 1 (1 dia)", "Revisão 2 (7 dias)", "Revisão 3 (30 dias)", "Status"], ["", "", "", "", "", "", "Pendente"], ["", "", "", "", "", "", "Pendente"], ["", "", "", "", "", "", "Pendente"], ["", "", "", "", "", "", "Pendente"], ["", "", "", "", "", "", "Pendente"]] },
    focus: { filename: "modelo-registro-de-foco.csv", rows: [["Data", "Tema de programação", "Tópico", "Blocos de foco", "Minutos", "Pausas", "Como me senti?"], ["", "", "", "", "", "", ""], ["", "", "", "", "", "", ""], ["", "", "", "", "", "", ""], ["", "", "", "", "", "", ""], ["", "", "", "", "", "", ""]] },
    subjects: { filename: "modelo-mapa-de-topicos.csv", rows: [["Tema de programação", "Tópico", "Prioridade (1 a 3)", "Confiança (1 a 5)", "Próximo passo", "Data para retomar"], ["", "", "", "", "", ""], ["", "", "", "", "", ""], ["", "", "", "", "", ""], ["", "", "", "", "", ""], ["", "", "", "", "", ""]] },
  };
  const template = templates[type];
  if (!template) return;
  downloadCSV(template.filename, template.rows);
  showToast("Modelo de planilha baixado.");
}

function downloadJSON(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportBackup() {
  const profile = JSON.parse(JSON.stringify(currentProfile || {}));
  delete profile.focusTimer;
  downloadJSON("ritmo-backup.json", {
    format: "ritmo-backup",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    profile,
    sessions,
  });
  showToast("Backup do plano baixado. Guarde o arquivo em local seguro.");
}

function validDateKey(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && localDateKey(dateFromKey(value)) === value;
}

function sanitizeBackup(data) {
  if (!data || data.format !== "ritmo-backup" || data.version !== BACKUP_VERSION || !Array.isArray(data.sessions)) {
    throw new Error("Este arquivo não parece ser um backup compatível do Ritmo.");
  }
  if (data.sessions.length > 5000) throw new Error("O backup tem sessões demais para importar com segurança.");
  const sessionIds = new Set();
  const importedSessions = data.sessions.map((source) => {
    if (!source || typeof source !== "object") throw new Error("O backup contém uma sessão inválida. Nenhum dado foi alterado.");
    const id = String(source.id || "");
    const day = String(source.day || "");
    const subject = String(source.subject || "").trim();
    const topic = String(source.topic || "").trim();
    const method = String(source.method || "");
    const minutes = Number(source.minutes);
    const date = source.date ? String(source.date) : "";
    if (!id || id.length > 120 || sessionIds.has(id) || !DAYS.includes(day) || !subject || subject.length > 50 || !topic || topic.length > 80 || !METHODS.includes(method) || !Number.isFinite(minutes) || minutes < 5 || minutes > 600 || (date && !validDateKey(date))) {
      throw new Error("O backup contém dados inválidos ou duplicados. Nenhum dado foi alterado.");
    }
    sessionIds.add(id);
    const studyLogs = Array.isArray(source.studyLogs) ? source.studyLogs : [];
    const completionHistory = Array.isArray(source.completionHistory) ? source.completionHistory : [];
    if (studyLogs.length > 10000 || completionHistory.length > 10000) throw new Error("O backup contém histórico grande demais.");
    const cleanStudyLogs = studyLogs.map((log) => {
      const durationSeconds = Number(log?.durationSeconds);
      if (!log?.id || !validDateKey(log.date) || !Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 86400) throw new Error("Há um registro de tempo inválido no backup.");
      return { id: String(log.id), date: log.date, durationSeconds: Math.floor(durationSeconds), endedAt: String(log.endedAt || ""), subject: String(log.subject || subject).slice(0, 50), topic: String(log.topic || topic).slice(0, 80) };
    });
    const cleanHistory = completionHistory.map((record) => {
      if (!record?.id || !validDateKey(record.completedAt)) throw new Error("Há uma conclusão inválida no backup.");
      return { id: String(record.id), completedAt: record.completedAt, studySeconds: Math.max(0, Math.floor(Number(record.studySeconds) || 0)) };
    });
    return {
      id, day: date ? weekdayForDate(date) : day, date,
      repeatWeekly: !date,
      completionWeek: validDateKey(source.completionWeek) ? source.completionWeek : weekKey(),
      subject, topic, method, minutes: Math.floor(minutes), done: Boolean(source.done),
      completedAt: validDateKey(source.completedAt) ? source.completedAt : undefined,
      lastCompletionId: String(source.lastCompletionId || ""),
      suggested: Boolean(source.suggested), studyLogs: cleanStudyLogs, completionHistory: cleanHistory,
    };
  });

  const sourceProfile = data.profile;
  if (!sourceProfile || typeof sourceProfile !== "object" || !Object.hasOwn(GOALS, sourceProfile.goal)) throw new Error("O backup não contém um perfil de estudos válido.");
  const reviews = Array.isArray(sourceProfile.reviews) ? sourceProfile.reviews : [];
  const cleanReviews = reviews.filter((review) => review && sessionIds.has(String(review.sessionId)) && validDateKey(review.due) && [1, 7, 30].includes(Number(review.interval)))
    .map((review) => ({ id: String(review.id || makeId()), sessionId: String(review.sessionId), completionId: String(review.completionId || ""), subject: String(review.subject || "").slice(0, 50), topic: String(review.topic || "").slice(0, 80), interval: Number(review.interval), due: review.due, done: Boolean(review.done) }));
  const profile = {
    goal: sourceProfile.goal,
    customGoal: String(sourceProfile.customGoal || "").slice(0, 70),
    level: Object.hasOwn(LEVELS, sourceProfile.level) ? sourceProfile.level : "beginner",
    style: Object.hasOwn(LEARNING_STYLES, sourceProfile.style) ? sourceProfile.style : "balanced",
    studyDays: Array.isArray(sourceProfile.studyDays) ? sourceProfile.studyDays.filter((day) => DAYS.includes(day)) : [],
    sessionMinutes: [15, 25, 30, 45, 60, 75, 90, 120, 180].includes(Number(sourceProfile.sessionMinutes)) ? Number(sourceProfile.sessionMinutes) : 60,
    hours: Math.min(100, Math.max(0, Number(sourceProfile.hours) || 0)),
    timeline: [3, 6, 12, 24].includes(Number(sourceProfile.timeline)) ? Number(sourceProfile.timeline) : 6,
    technology: String(sourceProfile.technology || "").slice(0, 80),
    experience: String(sourceProfile.experience || "").slice(0, 240),
    completedStages: Array.isArray(sourceProfile.completedStages) ? sourceProfile.completedStages.map(Number).filter((index) => Number.isInteger(index) && index >= 0 && index < 6) : [],
    reviews: cleanReviews,
    focusTimer: null,
  };
  return { sessions: importedSessions, profile };
}

function parseCSVRows(input) {
  const text = String(input).replace(/^\uFEFF/, "");
  let delimiter = ";";
  let quoted = false;
  let semicolons = 0;
  let commas = 0;
  for (let index = 0; index < text.length && text[index] !== "\n" && text[index] !== "\r"; index += 1) {
    if (text[index] === '"' && text[index + 1] === '"' && quoted) { index += 1; continue; }
    if (text[index] === '"') quoted = !quoted;
    else if (!quoted && text[index] === ";") semicolons += 1;
    else if (!quoted && text[index] === ",") commas += 1;
  }
  if (commas > semicolons) delimiter = ",";

  const rows = [];
  let row = [];
  let field = "";
  quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"' && field.length === 0) quoted = true;
    else if (char === delimiter) { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field); field = "";
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
    } else field += char;
  }
  if (quoted) throw new Error("O CSV tem aspas sem fechamento.");
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

function normalizeCSVHeader(value) {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function parseCSVPlan(text) {
  const rows = parseCSVRows(text);
  if (rows.length < 2) throw new Error("O CSV precisa ter um cabeçalho e pelo menos uma sessão.");
  const headers = rows[0].map(normalizeCSVHeader);
  const findColumn = (...names) => headers.findIndex((header) => names.includes(header));
  const columns = {
    day: findColumn("dia", "dia da semana"),
    date: findColumn("data especifica", "data"),
    subject: findColumn("tema de programacao", "tema", "area ou materia", "area", "materia", "objetivo"),
    topic: findColumn("topico", "assunto"),
    method: findColumn("metodo"),
    minutes: findColumn("minutos planejados", "minutos", "tempo em minutos"),
    done: findColumn("concluida nesta semana", "concluida", "feito"),
    completedAt: findColumn("concluida em", "data de conclusao"),
  };
  if ([columns.day, columns.subject, columns.topic, columns.method, columns.minutes].some((index) => index < 0)) {
    throw new Error("Não encontrei as colunas necessárias: Dia, Tema de programação, Tópico, Método e Minutos.");
  }
  const dayAliases = { seg: "Segunda", ter: "Terça", qua: "Quarta", qui: "Quinta", sex: "Sexta", sab: "Sábado", dom: "Domingo" };
  const normalizeDay = (value) => {
    const normalized = normalizeCSVHeader(value);
    return DAYS.find((day) => normalizeCSVHeader(day) === normalized) || dayAliases[normalized] || "";
  };
  const sessionRows = rows.slice(1);
  if (sessionRows.length > 5000) throw new Error("O CSV tem sessões demais para importar com segurança.");
  const signatures = new Set();
  let missingCompletionDates = 0;
  const imported = sessionRows.map((cells) => {
    const value = (column) => column < 0 ? "" : String(cells[column] ?? "").trim();
    const date = value(columns.date);
    const specificDate = date && validDateKey(date) ? date : "";
    if (date && !specificDate) throw new Error(`A data “${date}” não é válida.`);
    const day = specificDate ? weekdayForDate(specificDate) : normalizeDay(value(columns.day));
    const subject = value(columns.subject);
    const topic = value(columns.topic);
    const methodName = normalizeCSVHeader(value(columns.method));
    const method = METHODS.find((item) => normalizeCSVHeader(item) === methodName);
    const minutes = Number(value(columns.minutes).replace(",", "."));
    if (!DAYS.includes(day) || !subject || subject.length > 50 || !topic || topic.length > 80 || !method || !Number.isInteger(minutes) || minutes < 5 || minutes > 600) {
      throw new Error("O CSV contém uma sessão com dia, tema de programação, tópico, método ou duração inválidos.");
    }
    const doneRequested = ["sim", "yes", "true", "1", "concluida", "feito"].includes(normalizeCSVHeader(value(columns.done)));
    const completedAt = value(columns.completedAt);
    const done = doneRequested && validDateKey(completedAt);
    if (doneRequested && !done) missingCompletionDates += 1;
    const id = makeId();
    const signature = `${specificDate || `weekly:${day}`}|${subject.toLocaleLowerCase("pt-BR")}|${topic.toLocaleLowerCase("pt-BR")}|${method}|${minutes}`;
    if (signatures.has(signature)) throw new Error("O CSV contém sessões duplicadas. Remova as duplicatas e tente novamente.");
    signatures.add(signature);
    const completion = done ? { id: makeId(), completedAt, studySeconds: 0 } : null;
    return {
      id, day, date: specificDate, repeatWeekly: !specificDate, completionWeek: weekKey(),
      subject, topic, method, minutes, done, completedAt: done ? completedAt : undefined,
      lastCompletionId: completion?.id, suggested: false, studyLogs: [], completionHistory: completion ? [completion] : [],
    };
  });
  if (!imported.length) throw new Error("Não encontrei sessões válidas no CSV.");
  const reviews = [];
  imported.filter((session) => session.done).forEach((session) => {
    [1, 7, 30].forEach((interval) => {
      const due = shiftDate(dateFromKey(session.completedAt), interval);
      reviews.push({ id: makeId(), sessionId: session.id, completionId: session.lastCompletionId, subject: session.subject, topic: session.topic, interval, due: localDateKey(due), done: false });
    });
  });
  return {
    sessions: imported,
    profile: { ...currentProfile, reviews, focusTimer: null },
    missingCompletionDates,
  };
}

document.querySelector("#export-backup").addEventListener("click", exportBackup);
document.querySelector("#import-backup-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (currentProfile?.focusTimer) {
    showToast("Pause e salve o cronômetro antes de importar outro plano.");
    event.target.value = "";
    return;
  }
  try {
    if (file.size > 4 * 1024 * 1024) throw new Error("O arquivo passa do limite de 4 MB.");
    const backup = sanitizeBackup(JSON.parse(await file.text()));
    pendingImport = backup;
    document.querySelector("#import-preview").textContent = `${backup.sessions.length} ${backup.sessions.length === 1 ? "sessão" : "sessões"}, ${backup.profile.reviews.length} ${backup.profile.reviews.length === 1 ? "revisão" : "revisões"} e o perfil de estudos. A importação substitui o plano atual.`;
    document.querySelector("#import-dialog").showModal();
  } catch (error) {
    showToast(error.message || "Não consegui ler esse backup. Seus dados atuais continuam intactos.");
    event.target.value = "";
  }
});

document.querySelector("#import-csv-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (currentProfile?.focusTimer) {
    showToast("Pause e salve o cronômetro antes de importar outro plano.");
    event.target.value = "";
    return;
  }
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error("O CSV passa do limite de 2 MB.");
    const csv = parseCSVPlan(await file.text());
    pendingImport = csv;
    const completionNote = csv.missingCompletionDates ? ` ${csv.missingCompletionDates} conclusão(ões) sem data foram importadas como pendentes.` : "";
    document.querySelector("#import-preview").textContent = `${csv.sessions.length} sessões. O CSV substitui a agenda atual e recria revisões para conclusões que tenham uma data válida. Registros do cronômetro não estão no CSV; use o backup JSON para preservá-los.${completionNote}`;
    document.querySelector("#import-dialog").showModal();
  } catch (error) {
    showToast(error.message || "Não consegui ler esse CSV. Seus dados atuais continuam intactos.");
    event.target.value = "";
  }
});

document.querySelector("#confirm-import").addEventListener("click", () => {
  if (!pendingImport) return;
  const nextSessions = pendingImport.sessions;
  const nextProfile = pendingImport.profile;
  const planKey = planStorageKey();
  const learningProfileKey = profileKey();
  const oldSessions = localStorage.getItem(planKey);
  const oldProfile = localStorage.getItem(learningProfileKey);
  try {
    localStorage.setItem(planKey, JSON.stringify(nextSessions));
    localStorage.setItem(learningProfileKey, JSON.stringify(nextProfile));
  } catch (error) {
    try {
      if (oldSessions === null) localStorage.removeItem(planKey);
      else localStorage.setItem(planKey, oldSessions);
      if (oldProfile === null) localStorage.removeItem(learningProfileKey);
      else localStorage.setItem(learningProfileKey, oldProfile);
    } catch (rollbackError) {
      console.error("Não foi possível restaurar os dados anteriores após uma falha de importação.", rollbackError);
    }
    console.error("Falha ao importar o backup.", error);
    showToast("Não consegui salvar esse backup neste navegador. Seus dados anteriores foram mantidos.");
    return;
  }
  sessions = nextSessions;
  currentProfile = nextProfile;
  pendingImport = null;
  document.querySelector("#import-dialog").close();
  document.querySelector("#import-backup-file").value = "";
  render();
  showToast("Backup importado. Seu plano foi atualizado.");
});
document.querySelector("#import-dialog").addEventListener("close", () => {
  pendingImport = null;
  document.querySelector("#import-backup-file").value = "";
});

document.querySelectorAll("[data-view-target]").forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.dataset.viewTarget;
    document.querySelectorAll(".nav-link").forEach((nav) => {
      const active = nav.dataset.viewTarget === target;
      nav.classList.toggle("is-active", active);
      if (active) nav.setAttribute("aria-current", "page");
      else nav.removeAttribute("aria-current");
    });
    document.querySelectorAll(".view").forEach((view) => {
      const visible = view.id === `view-${target}`;
      view.classList.toggle("is-visible", visible);
      view.hidden = !visible;
    });
    if (target === "roadmap" || target === "profile" || target === "calendar" || target === "checklist" || target === "analytics") render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});

document.querySelectorAll("[data-add-session]").forEach((button) => button.addEventListener("click", () => addSession()));
document.querySelectorAll("[data-use-method]").forEach((button) => button.addEventListener("click", () => {
  const method = button.dataset.useMethod;
  addSession({ method, minutes: method === "Pomodoro" ? 25 : 30 });
}));
document.querySelectorAll("[data-export]").forEach((button) => button.addEventListener("click", () => exportSheet(button.dataset.export)));

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const date = String(formData.get("date") || "");
  sessions.push({
    id: makeId(),
    day: date ? weekdayForDate(date) : String(formData.get("day")),
    date,
    repeatWeekly: !date,
    completionWeek: weekKey(),
    subject: String(formData.get("subject")).trim(),
    topic: String(formData.get("topic")).trim(),
    method: formData.get("method"),
    minutes: Math.min(600, Math.max(5, Number(formData.get("minutes")) || 25)),
    done: false,
    studyLogs: [],
    completionHistory: [],
  });
  saveSessions();
  render();
  dialog.close();
  showToast("Sessão adicionada ao seu plano!");
});

document.querySelector("#close-dialog").addEventListener("click", () => dialog.close());
document.querySelector("#cancel-dialog").addEventListener("click", () => dialog.close());

document.querySelector("#goal-select").addEventListener("change", (event) => {
  const custom = event.target.value === "custom";
  document.querySelector("#custom-goal-field").hidden = !custom;
  document.querySelector("#custom-goal").required = custom;
});

form.querySelector('[name="date"]').addEventListener("change", (event) => {
  if (event.target.value) form.querySelector('[name="day"]').value = weekdayForDate(event.target.value);
});

document.querySelector("#focus-start").addEventListener("click", startFocusTimer);
document.querySelector("#focus-pause").addEventListener("click", pauseFocusTimer);
document.querySelector("#focus-resume").addEventListener("click", resumeFocusTimer);
document.querySelector("#focus-finish").addEventListener("click", finishFocusTimer);
document.querySelectorAll("[data-analytics-range]").forEach((button) => button.addEventListener("click", () => {
  analyticsRange = Number(button.dataset.analyticsRange) === 30 ? 30 : 7;
  document.querySelectorAll("[data-analytics-range]").forEach((item) => {
    const selected = Number(item.dataset.analyticsRange) === analyticsRange;
    item.classList.toggle("is-selected", selected);
    item.setAttribute("aria-pressed", String(selected));
  });
  renderAnalytics();
}));

profileForm.querySelectorAll('[name="studyDays"], [name="sessionMinutes"]').forEach((field) => {
  field.addEventListener("change", updateStudyEstimate);
});

profileForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const values = new FormData(profileForm);
  const goal = String(values.get("goal"));
  const customGoal = String(values.get("customGoal") || "").trim();
  const studyDays = values.getAll("studyDays").filter((day) => DAYS.includes(day));
  const sessionMinutes = Number(values.get("sessionMinutes")) || 60;
  if (!goal || !Object.hasOwn(GOALS, goal)) {
    const goalPicker = customStudySelects.get("goal");
    goalPicker?.trigger.focus();
    if (goalPicker) openCustomStudySelect(goalPicker);
    showToast("Escolha uma área para montar sua trilha.");
    return;
  }
  if (goal === "custom" && !customGoal) {
    document.querySelector("#custom-goal").focus();
    return;
  }
  if (!studyDays.length) {
    showToast("Escolha pelo menos um dia para estudar.");
    profileForm.querySelector('[name="studyDays"]').focus();
    return;
  }
  currentProfile = {
    ...(currentProfile || {}),
    goal,
    customGoal,
    level: String(values.get("level")),
    style: String(values.get("style")),
    studyDays,
    sessionMinutes,
    hours: Math.round((studyDays.length * sessionMinutes / 60) * 10) / 10,
    timeline: Number(values.get("timeline")) || 6,
    technology: String(values.get("technology") || "").trim(),
    experience: String(values.get("experience") || "").trim(),
    completedStages: Array.isArray(currentProfile?.completedStages) ? currentProfile.completedStages : [],
  };
  const planKey = planStorageKey();
  if (!localStorage.getItem(planKey) || sessions.length === 0 || sessions.every((session) => session.suggested)) {
    sessions = createPlanSessions(currentProfile);
    saveSessions();
  }
  saveProfile();
  document.querySelector("#setup-screen").hidden = true;
  document.querySelector("#auth-screen").hidden = true;
  document.querySelector("#app-shell").hidden = false;
  render();
  showToast("Sua trilha de estudos está pronta.");
});

document.querySelector("#edit-profile-button").addEventListener("click", openProfileSetup);
document.querySelector("#edit-profile-from-roadmap").addEventListener("click", openProfileSetup);
document.querySelector("#edit-dashboard-profile").addEventListener("click", openProfileSetup);
document.querySelector("#reveal-answer").addEventListener("click", () => {
  document.querySelector("#practice-answer").hidden = false;
  document.querySelector("#reveal-answer").hidden = true;
});

document.querySelector("#roadmap-weeks").addEventListener("click", (event) => {
  const button = event.target.closest("[data-stage]");
  if (!button || !currentProfile) return;
  const stage = Number(button.dataset.stage);
  const done = Array.isArray(currentProfile.completedStages) ? currentProfile.completedStages : [];
  currentProfile.completedStages = done.includes(stage) ? done.filter((item) => item !== stage) : [...done, stage].sort((a, b) => a - b);
  saveProfile();
  renderRoadmap();
  showToast(currentProfile.completedStages.includes(stage) ? "Etapa concluída! Mandou bem." : "Etapa voltou para sua trilha.");
});

rows.addEventListener("change", (event) => {
  const field = event.target.dataset.field;
  const row = event.target.closest("tr[data-id]");
  if (!field || !row) return;
  const session = sessions.find((item) => item.id === row.dataset.id);
  if (!session) return;
  if (field === "done") {
    session.suggested = false;
    updateSessionCompletion(session, event.target.checked);
  }
  else if (field === "minutes") session.minutes = Math.min(600, Math.max(5, Number(event.target.value) || 5));
  else if (field === "date") {
    session.date = event.target.value;
    session.repeatWeekly = !session.date;
    if (session.date) session.day = weekdayForDate(session.date);
    session.done = false;
    delete session.completedAt;
    delete session.lastCompletionId;
  } else if (field === "day") {
    session.day = event.target.value;
    session.date = "";
    session.repeatWeekly = true;
    session.done = false;
    session.completionWeek = weekKey();
    delete session.completedAt;
    delete session.lastCompletionId;
  } else session[field] = event.target.value.trim?.() ?? event.target.value;
  if (field !== "done") session.suggested = false;
  saveSessions();
  render();
  showToast(field === "done" && session.done ? "Sessão marcada como feita. Boa!" : "Plano atualizado.");
});

document.querySelector("#checklist-groups").addEventListener("click", (event) => {
  const toggle = event.target.closest("[data-checklist-toggle]");
  if (toggle) {
    const session = sessions.find((item) => item.id === toggle.dataset.checklistToggle);
    if (!session) return;
    session.suggested = false;
    updateSessionCompletion(session, !session.done);
    render();
    showToast(session.done ? "Sessão concluída! Boa." : "Sessão desmarcada.");
    return;
  }
  if (event.target.closest("[data-add-session]")) addSession();
});

document.querySelector("#calendar-grid").addEventListener("click", (event) => {
  const dayButton = event.target.closest("[data-calendar-day]");
  if (dayButton) addSession({ date: dayButton.dataset.calendarDay, minutes: profileSessionMinutes() });
});

document.querySelectorAll("[data-calendar-shift]").forEach((button) => button.addEventListener("click", () => {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + Number(button.dataset.calendarShift), 1);
  renderCalendar();
}));

document.querySelector("#review-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-review-id]");
  if (!button || button.disabled || !currentProfile) return;
  const review = (currentProfile.reviews || []).find((item) => item.id === button.dataset.reviewId);
  if (!review) return;
  review.done = true;
  saveProfile();
  renderReviews();
  showToast("Revisão concluída. Boa memória!");
});

rows.addEventListener("click", (event) => {
  const button = event.target.closest("[data-delete]");
  if (!button) return;
  const session = sessions.find((item) => item.id === button.dataset.delete);
  if (!session) return;
  if (currentProfile?.focusTimer?.sessionId === session.id) {
    showToast("Pause ou salve o cronômetro antes de excluir essa sessão.");
    return;
  }
  if (!window.confirm(`Excluir a sessão “${session.topic}” e os registros ligados a ela?`)) return;
  sessions.forEach((session) => { session.suggested = false; });
  sessions = sessions.filter((session) => session.id !== button.dataset.delete);
  currentProfile.reviews = (currentProfile.reviews || []).filter((review) => review.sessionId !== button.dataset.delete);
  saveProfile();
  saveSessions();
  render();
  showToast("Sessão removida do plano.");
});

document.querySelector("#auth-toggle").addEventListener("click", () => {
  setAuthMode(authMode === "login" ? "register" : "login");
});

document.querySelector("#guest-start").addEventListener("click", () => {
  enterPlanner({ id: "guest", storageId: "guest", name: "Estudante", email: "" });
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.querySelector("#auth-email").value.trim().toLowerCase();
  const password = document.querySelector("#auth-password").value;
  const name = document.querySelector("#auth-name").value.trim();
  const submitButton = document.querySelector("#auth-submit");
  document.querySelector("#auth-feedback").hidden = true;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showAuthMessage("Digite um email válido para continuar.");
    return;
  }
  if (password.length < 8) {
    showAuthMessage("A senha precisa ter pelo menos 8 caracteres.");
    return;
  }
  if (authMode === "register" && !name) {
    showAuthMessage("Digite seu nome para criar a conta.");
    return;
  }

  submitButton.disabled = true;
  try {
    const users = readUsers();
    if (authMode === "register") {
      if (users.some((user) => user.email === email)) {
        showAuthMessage("Esse email já tem uma conta neste navegador. Tente entrar.");
        return;
      }
      const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
      const passwordHash = await hashPassword(password, salt);
      const user = { email, name, salt, passwordHash };
      localStorage.setItem(USERS_KEY, JSON.stringify([...users, user]));
      enterPlanner(user);
    } else {
      const user = users.find((account) => account.email === email);
      if (!user || await hashPassword(password, user.salt) !== user.passwordHash) {
        showAuthMessage("Email ou senha incorretos para as contas salvas neste navegador.");
        return;
      }
      enterPlanner(user);
    }
  } catch (error) {
    console.error("Falha no acesso local.", error);
    showAuthMessage(error.message === "secure-storage-unavailable"
      ? "Abra o projeto pelo endereço local para habilitar o cadastro neste navegador."
      : "Não consegui salvar a conta neste navegador. Confira as permissões de armazenamento e tente novamente.");
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelector("#logout-button").addEventListener("click", () => {
  clearInterval(focusTick);
  focusTick = null;
  sessionStorage.removeItem(SESSION_KEY);
  currentUser = null;
  currentProfile = null;
  document.querySelector("#app-shell").hidden = true;
  document.querySelector("#setup-screen").hidden = true;
  document.querySelector("#auth-screen").hidden = false;
  setAuthMode("login");
  document.querySelector("#auth-email").focus();
});

document.querySelector("#clear-study-data").addEventListener("click", () => {
  const confirmed = window.confirm("Apagar do navegador seu plano, sessões, revisões, cronômetro e conta local? Essa ação não pode ser desfeita. Exporte um backup JSON antes se quiser guardar uma cópia.");
  if (!confirmed || !currentUser) return;
  try {
    localStorage.removeItem(planStorageKey());
    localStorage.removeItem(profileKey());
    if (currentUser.email) {
      const remainingUsers = readUsers().filter((user) => user.email !== currentUser.email);
      localStorage.setItem(USERS_KEY, JSON.stringify(remainingUsers));
    }
    sessionStorage.removeItem(SESSION_KEY);
  } catch (error) {
    console.error("Não foi possível apagar todos os dados locais.", error);
    showToast("Não consegui apagar todos os dados. Confira as permissões de armazenamento.");
    return;
  }
  clearInterval(focusTick);
  focusTick = null;
  currentUser = null;
  currentProfile = null;
  sessions = [];
  document.querySelector("#app-shell").hidden = true;
  document.querySelector("#setup-screen").hidden = true;
  document.querySelector("#auth-screen").hidden = false;
  setAuthMode("login");
  document.querySelector("#auth-email").focus();
  showToast("Seus dados locais foram apagados.");
});

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const button = document.querySelector("#theme-toggle");
  button.innerHTML = theme === "dark"
    ? '<span aria-hidden="true">☼</span><span>Modo claro</span>'
    : '<span aria-hidden="true">☾</span><span>Modo escuro</span>';
  localStorage.setItem("ritmo-color-theme-v1", theme);
}

document.querySelector("#theme-toggle").addEventListener("click", () => {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});

const now = new Date();
const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(now);
document.querySelector("#day-greeting").textContent = `${weekday.toLocaleUpperCase("pt-BR")}, NOVOS COMEÇOS`;
document.querySelector("#today-label").textContent = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "numeric", month: "short" }).format(now).replaceAll(".", "");
applyTheme(localStorage.getItem("ritmo-color-theme-v1") || "dark");
render();
restoreSession();

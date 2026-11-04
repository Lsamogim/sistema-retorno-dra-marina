/**
 * Classificador inteligente de procedimentos da Clínica Dra. Marina.
 * Trata variações de grafia, múltiplos serviços na mesma célula e ciclos duplos (revisão + renovação).
 */

export const DEFAULT_CATEGORIES = [
  {
    id: 'capilar',
    name: 'Tratamento Capilar',
    shortName: 'Capilar',
    recurrenceDays: 15,
    reviewDays: null,
    whatsappTemplate:
      'Olá {nome}, tudo bem? Aqui é do consultório da Dra. Marina! Já está completando o prazo de {dias_retorno} dias da sua sessão de Tratamento Capilar (previsto para {data_retorno}). Vamos agendar o seu horário?',
    reviewWhatsappTemplate: null,
    sortOrder: 1,
  },
  {
    id: 'laser',
    name: 'Depilação a Laser',
    shortName: 'Laser',
    recurrenceDays: 30,
    reviewDays: null,
    whatsappTemplate:
      'Olá {nome}, tudo bem? Aqui é do consultório da Dra. Marina! Já está dando o prazo de 30 dias para a sua próxima sessão de Depilação a Laser. Qual o melhor horário para agendarmos?',
    reviewWhatsappTemplate: null,
    sortOrder: 2,
  },
  {
    id: 'botox',
    name: 'Botox',
    shortName: 'Botox',
    recurrenceDays: 180,
    reviewDays: 15,
    whatsappTemplate:
      'Olá {nome}, tudo bem? Aqui é do consultório da Dra. Marina! Já estão completando 6 meses desde a sua última aplicação de Botox. Vamos agendar o seu retorno para avaliação e nova aplicação?',
    reviewWhatsappTemplate:
      'Olá {nome}, tudo bem? Aqui é do consultório da Dra. Marina! Está chegando o prazo de 15 dias do seu retorno de retoque/avaliação do Botox. Qual o melhor horário para agendarmos?',
    sortOrder: 3,
  },
  {
    id: 'preenchimento',
    name: 'Preenchimento & Escultura',
    shortName: 'Preenchimento',
    recurrenceDays: 180,
    reviewDays: 15,
    whatsappTemplate:
      'Olá {nome}, tudo bem? Aqui é do consultório da Dra. Marina! Já está completando o ciclo de retorno do seu Preenchimento. Gostaria de agendar uma avaliação com a Dra. Marina?',
    reviewWhatsappTemplate:
      'Olá {nome}, tudo bem? Aqui é do consultório da Dra. Marina! Está chegando o prazo de 15 dias do seu retorno de retoque do Preenchimento. Vamos agendar um horário para a Dra. avaliar?',
    sortOrder: 4,
  },
  {
    id: 'vasinhos',
    name: 'Vasinhos (PEIM)',
    shortName: 'Vasinhos',
    recurrenceDays: 15,
    reviewDays: null,
    whatsappTemplate:
      'Olá {nome}, tudo bem? Aqui é do consultório da Dra. Marina! Já está dando o prazo da sua próxima sessão de Vasinhos. Vamos deixar o seu horário agendado?',
    reviewWhatsappTemplate: null,
    sortOrder: 5,
  },
  {
    id: 'emagrecimento',
    name: 'Emagrecimento & Enzimas',
    shortName: 'Emagrecimento',
    recurrenceDays: 7,
    reviewDays: null,
    whatsappTemplate:
      'Olá {nome}, tudo bem? Aqui é do consultório da Dra. Marina! Já está chegando o dia da sua aplicação semanal do protocolo de Emagrecimento/Enzimas. Vamos confirmar seu horário?',
    reviewWhatsappTemplate: null,
    sortOrder: 6,
  },
  {
    id: 'facial',
    name: 'Estética Facial & Pele',
    shortName: 'Facial & Pele',
    recurrenceDays: 30,
    reviewDays: null,
    whatsappTemplate:
      'Olá {nome}, tudo bem? Aqui é do consultório da Dra. Marina! Já está dando o prazo da sua próxima sessão de cuidados faciais ({servico}). Qual o melhor dia para agendarmos?',
    reviewWhatsappTemplate: null,
    sortOrder: 7,
  },
  {
    id: 'bioestimulador',
    name: 'Bioestimulador',
    shortName: 'Bioestimulador',
    recurrenceDays: 30,
    reviewDays: null,
    whatsappTemplate:
      'Olá {nome}, tudo bem? Aqui é do consultório da Dra. Marina! Está chegando o prazo de acompanhamento/sessão do seu Bioestimulador. Vamos agendar seu horário com a Dra. Marina?',
    reviewWhatsappTemplate: null,
    sortOrder: 8,
  },
];

/**
 * Remove acentos, espaços duplicados e converte para minúsculas.
 */
export function normalizeText(str) {
  if (!str) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Gera chave normalizada para unificar pacientes com variações de maiúsculas/acentos/espaços.
 */
export function normalizePatientKey(name) {
  return normalizeText(name)
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Limpa telefone mantendo dígitos úteis e formata link para WhatsApp.
 */
export function cleanPhoneDigits(phone) {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '');
}

export function formatWhatsappNumber(phone) {
  const digits = cleanPhoneDigits(phone);
  if (!digits || digits.length < 10) return null;
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  return `55${digits}`;
}

const IGNORED_EXACT = new Set([
  'produtos',
  'produto',
  'compromisso',
  'pagamento',
  'presente dia das maes',
  'vale presente',
  'injecao b12',
  'injecao vit d',
  'vit b12 e d',
  'coenzima q10',
  'pill food plus',
  'injecao pill food',
  'modelo',
]);

const LASER_BODY_AREAS = new Set([
  'virilha',
  'virilha e axilas',
  'virilha e axila',
  'axilas e buco',
  'buco e axilas',
  'axilas',
  'axila',
  'buco',
  'axilas e braco',
  'axilas e rosto',
  'rosto e axilas',
  'rosto',
  'meia perna e virilha',
  'meia perna e buco',
  'meia perna',
  'perna',
  'perna inteira',
  'meio bumbum',
  'bumbum',
  'barba',
  'costas',
  'abdomen',
]);

/**
 * Separa uma célula "Serviço(s)" em tokens individuais preservando expressões compostas com vírgula.
 */
export function splitServiceCell(rawCell) {
  if (!rawCell) return [];
  const protectedText = String(rawCell).replace(
    /Sculptra\s+Rosto\s*,\s*pesco[çc]o\s+e\s+colo/gi,
    'Sculptra Rosto pescoço e colo'
  );
  return protectedText
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Classifica um nome individual de serviço em uma ou mais entradas:
 * [{ categoryId, kind: 'procedure' | 'review' | 'evaluation', rawService }]
 * Retorna [] se for item administrativo/produto que não gera ciclo de retorno.
 */
export function classifySingleService(rawService) {
  const norm = normalizeText(rawService);
  if (!norm || IGNORED_EXACT.has(norm)) {
    return [];
  }

  // Retornos combinados ou específicos de Botox e Preenchimento
  if (norm.includes('retorno') || norm.startsWith('retoque')) {
    const hasBotox = norm.includes('botox') || norm.includes('toxina');
    const hasPreench =
      norm.includes('preenchimento') ||
      norm.includes('labial') ||
      norm.includes('boca') ||
      norm.includes('escultura') ||
      norm.includes('rinomodelacao') ||
      norm.includes('olheira');

    if (hasBotox && hasPreench) {
      return [
        { categoryId: 'botox', kind: 'review', rawService },
        { categoryId: 'preenchimento', kind: 'review', rawService },
      ];
    }
    if (hasBotox) {
      return [{ categoryId: 'botox', kind: 'review', rawService }];
    }
    if (hasPreench) {
      return [{ categoryId: 'preenchimento', kind: 'review', rawService }];
    }
    if (norm === 'retorno') {
      return [{ categoryId: '__generic_review__', kind: 'review', rawService }];
    }
  }

  // 1. Capilar
  if (norm.includes('capilar') || norm.includes('calvicie')) {
    const kind = norm.startsWith('avaliacao') && !norm.includes('tratamento') ? 'evaluation' : 'procedure';
    return [{ categoryId: 'capilar', kind, rawService }];
  }

  // 2. Depilação a Laser (com palavra laser/depilação ou áreas isoladas usadas na agenda)
  if (
    norm.includes('laser') ||
    norm.includes('depilacao') ||
    LASER_BODY_AREAS.has(norm)
  ) {
    return [{ categoryId: 'laser', kind: 'procedure', rawService }];
  }

  // 3. Bioestimulador (antes de facial para pegar Sculptra Rosto / Radiesse / NanoHidrox / Avaliação glútea)
  if (
    norm.includes('bioestimulador') ||
    norm.includes('radiesse') ||
    norm.includes('sculptra') ||
    norm.includes('nanohidrox') ||
    norm.includes('avaliacao glutea')
  ) {
    const kind = norm.startsWith('avaliacao') ? 'evaluation' : 'procedure';
    return [{ categoryId: 'bioestimulador', kind, rawService }];
  }

  // 3.5 Cortesias de pele (ex: "Cortesia Botox - tratamento de pele", "Peeling cortesia", "Microagulhamento cortesia")
  if (norm.includes('cortesia')) {
    return [{ categoryId: 'facial', kind: 'procedure', rawService }];
  }

  // 4. Botox / Toxina
  if (norm.includes('botox') || norm.includes('microtox') || norm.includes('toxina')) {
    return [{ categoryId: 'botox', kind: 'procedure', rawService }];
  }

  // 5. Preenchimento / Escultura Labial / Rinomodelação
  if (
    norm.includes('preenchimento') ||
    norm.includes('escultura labial') ||
    norm.includes('rinomodelacao')
  ) {
    return [{ categoryId: 'preenchimento', kind: 'procedure', rawService }];
  }

  // 6. Vasinhos (PEIM)
  if (norm.includes('vasinho') || norm.includes('peim')) {
    const kind = norm.startsWith('avaliacao') ? 'evaluation' : 'procedure';
    return [{ categoryId: 'vasinhos', kind, rawService }];
  }

  // 7. Emagrecimento / Enzimas / Massa muscular
  if (
    norm.includes('emagrecimento') ||
    norm.includes('enzima') ||
    norm.includes('massa muscular')
  ) {
    const kind = norm.startsWith('avaliacao') ? 'evaluation' : 'procedure';
    return [{ categoryId: 'emagrecimento', kind, rawService }];
  }

  // 8. Estética Facial & Pele
  if (
    norm.includes('limpeza de pele') ||
    norm.includes('peeling') ||
    norm.includes('microagulhamento') ||
    norm.includes('skinbooster') ||
    norm.includes('bio eyes') ||
    norm.includes('revitalizacao') ||
    norm.includes('dermaplaning') ||
    norm.includes('radiofrequencia') ||
    norm.includes('exoderma') ||
    norm.includes('cicatriz') ||
    norm.includes('acne') ||
    norm.includes('estria') ||
    norm.includes('sobrancelha') ||
    norm.includes('avaliacao facial') ||
    norm.includes('manchas da pele')
  ) {
    const kind =
      norm.startsWith('avaliacao') || norm.startsWith('ver manchas')
        ? 'evaluation'
        : 'procedure';
    return [{ categoryId: 'facial', kind, rawService }];
  }

  // Item desconhecido futuro -> registrar como não mapeado para visibilidade
  return [{ categoryId: '__unmapped__', kind: 'unknown', rawService }];
}

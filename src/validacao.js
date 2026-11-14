import { HUMORES, fusoValido, hhmmParaMin } from './dominio.js';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DIA_MS = 86_400_000;

export const inteiroEntre = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
export const numeroEntre = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
export const arredondar1 = (v) => Math.round(v * 10) / 10;

/** Data opcional informada pelo usuário (para registrar algo que esqueceu). */
export function lerQuando(valor, agora) {
  if (valor === undefined || valor === null) return { valor: agora };
  if (typeof valor !== 'string' || valor.length > 40) return { erro: 'quando inválido' };
  const t = Date.parse(valor);
  if (Number.isNaN(t)) return { erro: 'quando inválido' };
  if (t > agora.getTime() + 2 * 60_000) return { erro: 'quando não pode estar no futuro' };
  if (t < agora.getTime() - 30 * DIA_MS) return { erro: 'quando está antigo demais (máximo 30 dias)' };
  return { valor: new Date(t) };
}

export function lerAlimentacao(corpo, config) {
  const bolinhas = corpo.bolinhas === undefined ? config.bolinhasPorRefeicao : corpo.bolinhas;
  if (!inteiroEntre(bolinhas, 1, 20)) return { erro: 'bolinhas deve ser um inteiro de 1 a 20' };
  return { colunas: ['bolinhas'], valores: [bolinhas] };
}

export function lerLimpeza(corpo) {
  const tipo = corpo.tipo === undefined ? 'parcial' : corpo.tipo;
  if (tipo !== 'parcial' && tipo !== 'total') return { erro: 'tipo deve ser parcial ou total' };
  return { colunas: ['tipo'], valores: [tipo] };
}

export function lerTemperatura(corpo) {
  if (!numeroEntre(corpo.valor, 10, 40)) return { erro: 'valor deve ser um número de 10 a 40 (°C)' };
  return { colunas: ['valor_celsius'], valores: [arredondar1(corpo.valor)] };
}

export function lerHumor(corpo) {
  if (typeof corpo.tipo !== 'string' || !Object.hasOwn(HUMORES, corpo.tipo)) {
    return { erro: `tipo deve ser um de: ${Object.keys(HUMORES).join(', ')}` };
  }
  return { colunas: ['tipo'], valores: [corpo.tipo] };
}

const CAMPOS_CONFIG = [
  'refeicoesPorDia',
  'horarios',
  'bolinhasPorRefeicao',
  'intervaloTrocaDias',
  'luzAcende',
  'luzApaga',
  'tempMinima',
  'tempMaxima',
  'fusoHorario',
];

export function validarConfiguracao(entrada, atual) {
  if (entrada === null || typeof entrada !== 'object' || Array.isArray(entrada)) return { erro: 'corpo inválido' };
  const desconhecido = Object.keys(entrada).find((k) => !CAMPOS_CONFIG.includes(k));
  if (desconhecido) return { erro: `campo desconhecido: ${desconhecido}` };

  const novo = {};
  for (const campo of CAMPOS_CONFIG) novo[campo] = Object.hasOwn(entrada, campo) ? entrada[campo] : atual[campo];

  if (!inteiroEntre(novo.refeicoesPorDia, 1, 6)) return { erro: 'refeicoesPorDia deve ser de 1 a 6' };
  if (!inteiroEntre(novo.bolinhasPorRefeicao, 1, 20)) return { erro: 'bolinhasPorRefeicao deve ser de 1 a 20' };
  if (!inteiroEntre(novo.intervaloTrocaDias, 1, 60)) return { erro: 'intervaloTrocaDias deve ser de 1 a 60' };

  if (!Array.isArray(novo.horarios) || novo.horarios.some((h) => typeof h !== 'string' || !HHMM.test(h))) {
    return { erro: 'horarios deve ser uma lista de HH:mm' };
  }
  novo.horarios = [...novo.horarios].sort();
  if (new Set(novo.horarios).size !== novo.horarios.length) return { erro: 'horarios não pode ter repetidos' };
  if (novo.horarios.length !== novo.refeicoesPorDia) {
    return { erro: `informe ${novo.refeicoesPorDia} horário(s), um para cada refeição` };
  }

  for (const campo of ['luzAcende', 'luzApaga']) {
    if (typeof novo[campo] !== 'string' || !HHMM.test(novo[campo])) return { erro: `${campo} deve ser HH:mm` };
  }
  if (hhmmParaMin(novo.luzAcende) === hhmmParaMin(novo.luzApaga)) return { erro: 'luz não pode acender e apagar no mesmo horário' };

  for (const campo of ['tempMinima', 'tempMaxima']) {
    if (!numeroEntre(novo[campo], 10, 40)) return { erro: `${campo} deve ser de 10 a 40` };
    novo[campo] = arredondar1(novo[campo]);
  }
  if (novo.tempMinima >= novo.tempMaxima) return { erro: 'tempMinima deve ser menor que tempMaxima' };

  if (!fusoValido(novo.fusoHorario)) return { erro: 'fusoHorario inválido' };

  return { valor: novo };
}

export const CHAVES_AVISO = ['comer', 'agua', 'luz', 'temp', 'humor'];

export function validarAvisos(entrada) {
  if (entrada === null || typeof entrada !== 'object' || Array.isArray(entrada)) return { erro: 'corpo inválido' };
  const chaves = Object.keys(entrada);
  if (chaves.length === 0) return { erro: 'informe ao menos um aviso' };
  for (const chave of chaves) {
    if (!CHAVES_AVISO.includes(chave)) return { erro: `aviso desconhecido: ${chave}` };
    if (typeof entrada[chave] !== 'boolean') return { erro: `${chave} deve ser true ou false` };
  }
  return { valor: entrada };
}

// ---------- Inscrição de notificações ----------
// O servidor envia requisições para este endereço, então só aceito serviços de push conhecidos.
const HOSTS_PUSH = [
  /(^|\.)push\.apple\.com$/,
  /^fcm\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)notify\.windows\.com$/,
];

export function validarInscricao(corpo) {
  if (corpo === null || typeof corpo !== 'object') return { erro: 'corpo inválido' };
  const { endpoint, keys } = corpo;
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return { erro: 'endpoint inválido' };
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return { erro: 'endpoint inválido' };
  }
  if (url.protocol !== 'https:' || url.port || url.username || url.password) return { erro: 'endpoint inválido' };
  if (!HOSTS_PUSH.some((re) => re.test(url.hostname))) return { erro: 'serviço de notificação não permitido' };
  const base64url = /^[A-Za-z0-9_-]+={0,2}$/;
  if (!keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') return { erro: 'chaves inválidas' };
  if (keys.p256dh.length > 200 || keys.auth.length > 100 || !base64url.test(keys.p256dh) || !base64url.test(keys.auth)) {
    return { erro: 'chaves inválidas' };
  }
  return { valor: { endpoint: url.toString(), p256dh: keys.p256dh, auth: keys.auth } };
}

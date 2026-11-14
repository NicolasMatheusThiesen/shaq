// Regras de negócio puras (sem banco, sem rede): fáceis de testar e de manter.
// Toda conta de "hoje" e de horário usa o fuso configurado, nunca o do servidor.

export const HUMORES = Object.freeze({
  ativo: 'Ativo',
  calmo: 'Calmo',
  bravo: 'Bravo',
  apatico: 'Apático',
  escondendo: 'Se escondendo',
});

const HUMORES_PREOCUPANTES = new Set(['apatico', 'escondendo']);

export const ROTULOS_TEMPERATURA = Object.freeze({
  fria: 'Peixe congelando',
  saudavel: 'Peixe saudável',
  quente: 'Peixe frito',
});

// ---------- Tempo ----------
const formatadores = new Map();

function formatador(fuso) {
  let f = formatadores.get(fuso);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: fuso,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatadores.set(fuso, f);
  }
  return f;
}

export function fusoValido(fuso) {
  if (typeof fuso !== 'string' || fuso.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: fuso });
    return true;
  } catch {
    return false;
  }
}

export function partesLocais(data, fuso) {
  const p = {};
  for (const parte of formatador(fuso).formatToParts(data)) {
    if (parte.type !== 'literal') p[parte.type] = Number(parte.value);
  }
  return p;
}

const pad = (n) => String(n).padStart(2, '0');

/** 'AAAA-MM-DD' no fuso. */
export function dataLocal(data, fuso) {
  const p = partesLocais(data, fuso);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Minutos desde 00:00 no fuso. */
export function minutosLocais(data, fuso) {
  const p = partesLocais(data, fuso);
  return p.hour * 60 + p.minute;
}

export function addDias(dataIso, n) {
  const [a, m, d] = dataIso.split('-').map(Number);
  const r = new Date(Date.UTC(a, m - 1, d + n));
  return `${r.getUTCFullYear()}-${pad(r.getUTCMonth() + 1)}-${pad(r.getUTCDate())}`;
}

/** a - b, em dias, para datas 'AAAA-MM-DD'. */
export function diffDias(a, b) {
  const [aa, am, ad] = a.split('-').map(Number);
  const [ba, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(aa, am - 1, ad) - Date.UTC(ba, bm - 1, bd)) / 86_400_000);
}

export function hhmmParaMin(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function fmtDuracao(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h ? `${h} h` : '', m ? `${m} min` : ''].filter(Boolean).join(' ') || '0 min';
}

export function fmtTemperatura(valor) {
  return valor.toFixed(1).replace('.', ',');
}

// ---------- Estado e alertas ----------
const HORA_AVISO_AGUA = 9 * 60; // o aviso de troca de água vai às 09:00 do dia previsto

const maisRecenteprimeiro = (a, b) => b.quando - a.quando;

/**
 * config: { horarios[], bolinhasPorRefeicao, intervaloTrocaDias, luzAcende, luzApaga, luzLigada,
 *           tempMinima, tempMaxima, fusoHorario }
 * alimentacoes: [{ id, quando: Date, bolinhas }]   limpezas: [{ id, quando, tipo }]
 * temperatura: { id, quando, valor } | null        humor: { id, quando, tipo } | null
 */
export function calcularEstado({ config, alimentacoes = [], limpezas = [], temperatura = null, humor = null, agora }) {
  const fuso = config.fusoHorario;
  const hoje = dataLocal(agora, fuso);
  const minAgora = minutosLocais(agora, fuso);
  const alertas = [];

  // --- Alimentação ---
  const refeicoes = [...alimentacoes].sort(maisRecenteprimeiro);
  const total = config.horarios.length;
  const feitasHoje = refeicoes.filter((a) => dataLocal(a.quando, fuso) === hoje).length;
  const ultimaRefeicao = refeicoes[0] ? { id: refeicoes[0].id, quando: refeicoes[0].quando, bolinhas: refeicoes[0].bolinhas } : null;
  const bolinhas = config.bolinhasPorRefeicao;

  let alimentacao;
  if (feitasHoje < total) {
    const horario = config.horarios[feitasHoje];
    const minutos = hhmmParaMin(horario) - minAgora;
    const status = minutos > 30 ? 'ok' : minutos >= -60 ? 'agora' : 'atrasada';
    alimentacao = { feitasHoje, totalHoje: total, proxima: { horario, quando: 'hoje' }, minutos, status, bolinhas, ultima: ultimaRefeicao };
    if (status !== 'ok') {
      alertas.push({
        tipo: 'comer',
        nivel: 'alerta',
        titulo: 'Hora de comer',
        sub: status === 'atrasada' ? `Atrasada há ${fmtDuracao(-minutos)} · ${bolinhas} bolinhas` : `${horario} · ${bolinhas} bolinhas`,
        push: minutos <= 0,
        chave: `comer:${hoje}:${feitasHoje}`,
      });
    }
  } else {
    const horario = config.horarios[0];
    alimentacao = {
      feitasHoje,
      totalHoje: total,
      proxima: { horario, quando: 'amanha' },
      minutos: 1440 - minAgora + hhmmParaMin(horario),
      status: 'completa',
      bolinhas,
      ultima: ultimaRefeicao,
    };
  }

  // --- Troca de água ---
  const trocas = [...limpezas].sort(maisRecenteprimeiro);
  const ultimaTroca = trocas[0] ? { id: trocas[0].id, quando: trocas[0].quando, tipo: trocas[0].tipo } : null;
  let troca = { ultima: ultimaTroca, intervaloDias: config.intervaloTrocaDias, proximaData: null, dias: null, status: 'sem_registro' };
  if (ultimaTroca) {
    const proximaData = addDias(dataLocal(ultimaTroca.quando, fuso), config.intervaloTrocaDias);
    const dias = diffDias(proximaData, hoje);
    const status = dias > 1 ? 'ok' : dias === 1 ? 'amanha' : dias === 0 ? 'hoje' : 'atrasada';
    troca = { ...troca, proximaData, dias, status };
    if (dias <= 0) {
      alertas.push({
        tipo: 'agua',
        nivel: 'alerta',
        titulo: 'Hora de trocar a água',
        sub: dias === 0 ? 'Prevista para hoje' : `Atrasada há ${-dias} ${-dias === 1 ? 'dia' : 'dias'}`,
        push: minAgora >= HORA_AVISO_AGUA,
        chave: `agua:${proximaData}:${hoje}`,
      });
    }
  }

  // --- Temperatura ---
  let temp = null;
  if (temperatura) {
    const v = temperatura.valor;
    const faixa = v < config.tempMinima ? 'fria' : v >= config.tempMaxima ? 'quente' : 'saudavel';
    temp = { id: temperatura.id, valor: v, quando: temperatura.quando, faixa, rotulo: ROTULOS_TEMPERATURA[faixa] };
    if (faixa !== 'saudavel') {
      alertas.push({
        tipo: 'temp',
        nivel: 'alerta',
        titulo: 'Temperatura fora da faixa',
        sub: `${fmtTemperatura(v)} °C · ${ROTULOS_TEMPERATURA[faixa]}`,
        push: true,
        chave: `temp:${temperatura.id}`,
      });
    }
  }

  // --- Humor ---
  let humorAtual = null;
  if (humor) {
    humorAtual = { id: humor.id, tipo: humor.tipo, rotulo: HUMORES[humor.tipo], quando: humor.quando };
    if (HUMORES_PREOCUPANTES.has(humor.tipo)) {
      alertas.push({
        tipo: 'humor',
        nivel: 'aviso',
        titulo: `Shaq está ${HUMORES[humor.tipo].toLowerCase()}`,
        sub: 'Se continuar assim, confira a temperatura e a água.',
        push: true,
        chave: `humor:${humor.id}`,
      });
    }
  }

  // --- Luz ---
  const acende = hhmmParaMin(config.luzAcende);
  const apaga = hhmmParaMin(config.luzApaga);
  const esperada = acende < apaga ? minAgora >= acende && minAgora < apaga : minAgora >= acende || minAgora < apaga;
  const alvo = esperada ? apaga : acende;
  const minutosParaMudar = (((alvo - minAgora) % 1440) + 1440) % 1440 || 1440;
  const luzOk = config.luzLigada === esperada;
  const luz = {
    ligada: config.luzLigada,
    esperada,
    ok: luzOk,
    acende: config.luzAcende,
    apaga: config.luzApaga,
    proximaMudanca: esperada ? config.luzApaga : config.luzAcende,
    minutosParaMudar,
  };
  if (!luzOk) {
    alertas.push({
      tipo: 'luz',
      nivel: 'alerta',
      titulo: esperada ? 'Hora de acender a luz' : 'Hora de apagar a luz',
      sub: `${config.luzAcende} acende · ${config.luzApaga} apaga`,
      push: true,
      chave: `luz:${hoje}:${esperada}`,
    });
  }

  return {
    agora,
    fuso,
    alimentacao,
    troca,
    temperatura: temp,
    limitesTemperatura: { minima: config.tempMinima, maxima: config.tempMaxima },
    humor: humorAtual,
    luz,
    alertas,
    tudoEmDia: alertas.length === 0,
  };
}

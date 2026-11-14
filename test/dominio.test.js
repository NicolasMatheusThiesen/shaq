import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDias, calcularEstado, dataLocal, diffDias, fmtDuracao, minutosLocais } from '../src/dominio.js';

const FUSO = 'America/Sao_Paulo'; // UTC-3, sem horário de verão atualmente
const config = {
  horarios: ['08:00', '20:00'],
  bolinhasPorRefeicao: 4,
  intervaloTrocaDias: 7,
  luzAcende: '06:00',
  luzApaga: '20:00',
  luzLigada: true,
  tempMinima: 22,
  tempMaxima: 27,
  fusoHorario: FUSO,
};

// Atalho: horário local de São Paulo -> Date (UTC-3)
const sp = (iso) => new Date(`${iso}-03:00`);
const refeicao = (id, quando) => ({ id, quando: sp(quando), bolinhas: 4 });

test('data e minutos locais respeitam o fuso, não o do servidor', () => {
  const d = new Date('2026-11-10T02:30:00Z'); // 23:30 do dia 9 em São Paulo
  assert.equal(dataLocal(d, FUSO), '2026-11-09');
  assert.equal(minutosLocais(d, FUSO), 23 * 60 + 30);
  assert.equal(dataLocal(d, 'UTC'), '2026-11-10');
});

test('aritmética de datas', () => {
  assert.equal(addDias('2026-11-28', 5), '2026-12-03');
  assert.equal(addDias('2026-12-30', 3), '2027-01-02');
  assert.equal(diffDias('2026-11-10', '2026-11-03'), 7);
  assert.equal(diffDias('2026-11-03', '2026-11-10'), -7);
});

test('duração legível', () => {
  assert.equal(fmtDuracao(90), '1 h 30 min');
  assert.equal(fmtDuracao(120), '2 h');
  assert.equal(fmtDuracao(45), '45 min');
});

// ---------- Alimentação ----------
test('uma refeição feita: próxima é a das 20:00, ainda sem alerta', () => {
  const e = calcularEstado({ config, agora: sp('2026-11-10T14:10:00'), alimentacoes: [refeicao(1, '2026-11-10T08:05:00')] });
  assert.equal(e.alimentacao.feitasHoje, 1);
  assert.equal(e.alimentacao.proxima.horario, '20:00');
  assert.equal(e.alimentacao.proxima.quando, 'hoje');
  assert.equal(e.alimentacao.minutos, 350);
  assert.equal(e.alimentacao.status, 'ok');
  assert.equal(e.alertas.filter((a) => a.tipo === 'comer').length, 0);
});

test('faltando 10 min: alerta aparece, mas a notificação ainda não sai', () => {
  const e = calcularEstado({ config, agora: sp('2026-11-10T19:50:00'), alimentacoes: [refeicao(1, '2026-11-10T08:05:00')] });
  assert.equal(e.alimentacao.status, 'agora');
  const a = e.alertas.find((x) => x.tipo === 'comer');
  assert.equal(a.titulo, 'Hora de comer');
  assert.equal(a.push, false);
});

test('na hora exata a notificação sai; depois de 1 h vira atrasada', () => {
  const alim = [refeicao(1, '2026-11-10T08:05:00')];
  const naHora = calcularEstado({ config, agora: sp('2026-11-10T20:00:00'), alimentacoes: alim });
  assert.equal(naHora.alertas.find((x) => x.tipo === 'comer').push, true);
  const atrasada = calcularEstado({ config, agora: sp('2026-11-10T21:30:00'), alimentacoes: alim });
  assert.equal(atrasada.alimentacao.status, 'atrasada');
  assert.equal(atrasada.alertas.find((x) => x.tipo === 'comer').sub, 'Atrasada há 1 h 30 min · 4 bolinhas');
});

test('nenhuma refeição ainda hoje às 08:30: primeira está em alerta', () => {
  const e = calcularEstado({ config, agora: sp('2026-11-10T08:30:00') });
  assert.equal(e.alimentacao.feitasHoje, 0);
  assert.equal(e.alimentacao.proxima.horario, '08:00');
  assert.equal(e.alimentacao.status, 'agora');
});

test('todas as refeições feitas: próxima é amanhã cedo, sem alerta', () => {
  const alim = [refeicao(1, '2026-11-10T08:05:00'), refeicao(2, '2026-11-10T20:02:00')];
  const e = calcularEstado({ config, agora: sp('2026-11-10T21:00:00'), alimentacoes: alim });
  assert.equal(e.alimentacao.status, 'completa');
  assert.equal(e.alimentacao.proxima.quando, 'amanha');
  assert.equal(e.alimentacao.proxima.horario, '08:00');
  assert.equal(e.alimentacao.minutos, 3 * 60 + 8 * 60);
  assert.equal(e.alertas.filter((a) => a.tipo === 'comer').length, 0);
});

test('refeição de ontem à noite (23:30 local) não conta para hoje', () => {
  // 23:30 de 09/11 em São Paulo = 02:30Z de 10/11
  const alim = [{ id: 1, quando: new Date('2026-11-10T02:30:00Z'), bolinhas: 4 }];
  const e = calcularEstado({ config, agora: sp('2026-11-10T07:00:00'), alimentacoes: alim });
  assert.equal(e.alimentacao.feitasHoje, 0);
});

test('configuração com 3 refeições e 5 bolinhas', () => {
  const c = { ...config, horarios: ['07:00', '13:00', '19:00'], bolinhasPorRefeicao: 5 };
  const e = calcularEstado({ config: c, agora: sp('2026-11-10T10:00:00'), alimentacoes: [refeicao(1, '2026-11-10T07:10:00')] });
  assert.equal(e.alimentacao.totalHoje, 3);
  assert.equal(e.alimentacao.proxima.horario, '13:00');
  assert.equal(e.alimentacao.bolinhas, 5);
});

// ---------- Troca de água ----------
const troca = (id, quando, tipo = 'parcial') => ({ id, quando: sp(quando), tipo });

test('troca de água: sem registro não gera alerta', () => {
  const e = calcularEstado({ config, agora: sp('2026-11-10T14:10:00') });
  assert.equal(e.troca.status, 'sem_registro');
  assert.equal(e.alertas.filter((a) => a.tipo === 'agua').length, 0);
});

test('troca de água: em dia, amanhã, hoje e atrasada', () => {
  const agora = sp('2026-11-10T14:10:00');
  const ok = calcularEstado({ config, agora, limpezas: [troca(1, '2026-11-08T10:00:00')] }); // próxima 15/11
  assert.equal(ok.troca.status, 'ok');
  assert.equal(ok.troca.proximaData, '2026-11-15');
  assert.equal(ok.troca.dias, 5);

  const amanha = calcularEstado({ config, agora, limpezas: [troca(1, '2026-11-04T10:00:00')] });
  assert.equal(amanha.troca.status, 'amanha');
  assert.equal(amanha.alertas.filter((a) => a.tipo === 'agua').length, 0);

  const hoje = calcularEstado({ config, agora, limpezas: [troca(1, '2026-11-03T17:30:00')] });
  assert.equal(hoje.troca.status, 'hoje');
  assert.equal(hoje.alertas.find((a) => a.tipo === 'agua').sub, 'Prevista para hoje');

  const atrasada = calcularEstado({ config, agora, limpezas: [troca(1, '2026-10-30T10:00:00')] });
  assert.equal(atrasada.troca.status, 'atrasada');
  // 30/10 + 7 dias = 06/11; em 10/11 faltou trocar há 4 dias
  assert.equal(atrasada.troca.proximaData, '2026-11-06');
  assert.equal(atrasada.alertas.find((a) => a.tipo === 'agua').sub, 'Atrasada há 4 dias');
});

test('aviso de troca de água só é enviado depois das 09:00', () => {
  const limpezas = [troca(1, '2026-11-03T10:00:00')];
  const cedo = calcularEstado({ config, agora: sp('2026-11-10T08:00:00'), limpezas });
  assert.equal(cedo.alertas.find((a) => a.tipo === 'agua').push, false);
  const tarde = calcularEstado({ config, agora: sp('2026-11-10T09:00:00'), limpezas });
  assert.equal(tarde.alertas.find((a) => a.tipo === 'agua').push, true);
});

test('a limpeza mais recente vale, mesmo que a lista venha fora de ordem', () => {
  const limpezas = [troca(1, '2026-10-01T10:00:00'), troca(2, '2026-11-09T10:00:00', 'total')];
  const e = calcularEstado({ config, agora: sp('2026-11-10T14:10:00'), limpezas });
  assert.equal(e.troca.ultima.id, 2);
  assert.equal(e.troca.ultima.tipo, 'total');
});

// ---------- Temperatura ----------
const faixa = (valor) =>
  calcularEstado({ config, agora: sp('2026-11-10T14:10:00'), temperatura: { id: 9, quando: sp('2026-11-10T14:00:00'), valor } });

test('temperatura: limites das faixas', () => {
  assert.equal(faixa(21.9).temperatura.faixa, 'fria');
  assert.equal(faixa(21.9).temperatura.rotulo, 'Peixe congelando');
  assert.equal(faixa(22).temperatura.faixa, 'saudavel');
  assert.equal(faixa(26.9).temperatura.faixa, 'saudavel');
  assert.equal(faixa(27).temperatura.faixa, 'quente');
  assert.equal(faixa(27).temperatura.rotulo, 'Peixe frito');
});

test('temperatura fora da faixa gera alerta; dentro da faixa não', () => {
  assert.equal(faixa(25.5).alertas.filter((a) => a.tipo === 'temp').length, 0);
  const quente = faixa(28.5).alertas.find((a) => a.tipo === 'temp');
  assert.equal(quente.sub, '28,5 °C · Peixe frito');
  assert.equal(quente.push, true);
  assert.equal(quente.chave, 'temp:9');
});

test('faixa de temperatura é configurável', () => {
  const c = { ...config, tempMinima: 24, tempMaxima: 29 };
  const e = calcularEstado({ config: c, agora: sp('2026-11-10T14:10:00'), temperatura: { id: 1, quando: sp('2026-11-10T14:00:00'), valor: 28 } });
  assert.equal(e.temperatura.faixa, 'saudavel');
});

// ---------- Humor ----------
test('humor: só apático e se escondendo geram aviso', () => {
  const com = (tipo) => calcularEstado({ config, agora: sp('2026-11-10T14:10:00'), humor: { id: 3, quando: sp('2026-11-10T14:00:00'), tipo } });
  for (const tipo of ['ativo', 'calmo', 'bravo']) assert.equal(com(tipo).alertas.filter((a) => a.tipo === 'humor').length, 0, tipo);
  for (const tipo of ['apatico', 'escondendo']) {
    const a = com(tipo).alertas.find((x) => x.tipo === 'humor');
    assert.ok(a, tipo);
    assert.equal(a.nivel, 'aviso');
  }
  assert.equal(com('escondendo').humor.rotulo, 'Se escondendo');
  assert.equal(com('escondendo').alertas.find((a) => a.tipo === 'humor').titulo, 'Shaq está se escondendo');
});

// ---------- Luz ----------
test('luz: de dia deve estar acesa, de noite apagada', () => {
  const dia = calcularEstado({ config, agora: sp('2026-11-10T14:10:00') });
  assert.equal(dia.luz.esperada, true);
  assert.equal(dia.luz.ok, true);
  assert.equal(dia.luz.proximaMudanca, '20:00');
  assert.equal(dia.luz.minutosParaMudar, 350);

  const noite = calcularEstado({ config: { ...config, luzLigada: false }, agora: sp('2026-11-10T22:00:00') });
  assert.equal(noite.luz.esperada, false);
  assert.equal(noite.luz.ok, true);
  assert.equal(noite.luz.proximaMudanca, '06:00');
  assert.equal(noite.luz.minutosParaMudar, 8 * 60);
});

test('luz: avisa para acender e para apagar', () => {
  const acender = calcularEstado({ config: { ...config, luzLigada: false }, agora: sp('2026-11-10T06:05:00') });
  assert.equal(acender.alertas.find((a) => a.tipo === 'luz').titulo, 'Hora de acender a luz');
  const apagar = calcularEstado({ config, agora: sp('2026-11-10T20:00:00') });
  assert.equal(apagar.alertas.find((a) => a.tipo === 'luz').titulo, 'Hora de apagar a luz');
  assert.equal(apagar.alertas.find((a) => a.tipo === 'luz').chave, 'luz:2026-11-10:false');
});

test('luz: janela que atravessa a meia-noite', () => {
  const c = { ...config, luzAcende: '18:00', luzApaga: '06:00', luzLigada: true };
  assert.equal(calcularEstado({ config: c, agora: sp('2026-11-10T02:00:00') }).luz.esperada, true);
  assert.equal(calcularEstado({ config: c, agora: sp('2026-11-10T12:00:00') }).luz.esperada, false);
  assert.equal(calcularEstado({ config: c, agora: sp('2026-11-10T23:00:00') }).luz.esperada, true);
});

// ---------- Geral ----------
test('tudo em dia: sem alertas', () => {
  const e = calcularEstado({
    config,
    agora: sp('2026-11-10T14:10:00'),
    alimentacoes: [refeicao(1, '2026-11-10T08:05:00')],
    limpezas: [troca(1, '2026-11-08T10:00:00')],
    temperatura: { id: 1, quando: sp('2026-11-10T08:00:00'), valor: 25 },
    humor: { id: 1, quando: sp('2026-11-10T08:06:00'), tipo: 'ativo' },
  });
  assert.equal(e.tudoEmDia, true);
  assert.deepEqual(e.alertas, []);
});

test('o cálculo não altera os dados recebidos', () => {
  const alim = [refeicao(1, '2026-11-09T08:05:00'), refeicao(2, '2026-11-10T08:05:00')];
  const copia = structuredClone(alim);
  calcularEstado({ config, agora: sp('2026-11-10T14:10:00'), alimentacoes: alim });
  assert.deepEqual(alim, copia);
});

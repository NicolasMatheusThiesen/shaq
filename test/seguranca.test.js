import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarLimitador, hashSenha, hashToken, novoToken, textosIguais, verificarSenha } from '../src/seguranca.js';
import { lerQuando, validarAvisos, validarConfiguracao, validarInscricao, lerTemperatura, lerHumor } from '../src/validacao.js';

test('hash de senha: confere a certa, recusa a errada e nunca guarda texto puro', async () => {
  const hash = await hashSenha('uma senha bem longa 123');
  assert.match(hash, /^scrypt\$32768\$8\$1\$/);
  assert.ok(!hash.includes('uma senha'));
  assert.equal(await verificarSenha('uma senha bem longa 123', hash), true);
  assert.equal(await verificarSenha('uma senha bem longa 124', hash), false);
  assert.equal(await verificarSenha('x', 'lixo'), false);
});

test('hashes da mesma senha são diferentes (sal aleatório)', async () => {
  assert.notEqual(await hashSenha('mesma-senha-123'), await hashSenha('mesma-senha-123'));
});

test('token de sessão: aleatório e só o hash é guardado', () => {
  const a = novoToken();
  const b = novoToken();
  assert.notEqual(a.token, b.token);
  assert.ok(a.token.length >= 43);
  assert.deepEqual(hashToken(a.token), a.hash);
  assert.equal(textosIguais('abc', 'abc'), true);
  assert.equal(textosIguais('abc', 'abd'), false);
});

test('limitador: bloqueia depois do máximo e libera passada a janela', () => {
  let agora = 1_000_000;
  const lim = criarLimitador({ janelaMs: 60_000, max: 3, agora: () => agora });
  for (let i = 0; i < 3; i++) {
    assert.equal(lim.bloqueado('ip'), 0);
    lim.contar('ip');
  }
  assert.ok(lim.bloqueado('ip') > 0);
  assert.equal(lim.bloqueado('outro-ip'), 0);
  agora += 61_000;
  assert.equal(lim.bloqueado('ip'), 0);
  lim.contar('x');
  lim.zerar('x');
  assert.equal(lim.bloqueado('x'), 0);
});

test('lerQuando: aceita agora e passado recente, recusa futuro e passado distante', () => {
  const agora = new Date('2026-11-10T17:00:00Z');
  assert.equal(lerQuando(undefined, agora).valor, agora);
  assert.equal(lerQuando('2026-11-10T16:00:00Z', agora).valor.toISOString(), '2026-11-10T16:00:00.000Z');
  assert.ok(lerQuando('2026-11-10T18:00:00Z', agora).erro);
  assert.ok(lerQuando('2026-09-01T00:00:00Z', agora).erro);
  assert.ok(lerQuando('ontem', agora).erro);
  assert.ok(lerQuando(12345, agora).erro);
});

const atual = {
  refeicoesPorDia: 2,
  horarios: ['08:00', '20:00'],
  bolinhasPorRefeicao: 4,
  intervaloTrocaDias: 7,
  luzAcende: '06:00',
  luzApaga: '20:00',
  tempMinima: 22,
  tempMaxima: 27,
  fusoHorario: 'America/Sao_Paulo',
};

test('configuração: aceita mudança válida e ordena horários', () => {
  const r = validarConfiguracao({ refeicoesPorDia: 3, horarios: ['19:00', '07:00', '13:00'], bolinhasPorRefeicao: 5 }, atual);
  assert.deepEqual(r.valor.horarios, ['07:00', '13:00', '19:00']);
  assert.equal(r.valor.bolinhasPorRefeicao, 5);
  assert.equal(r.valor.intervaloTrocaDias, 7);
});

test('configuração: recusa valores inválidos', () => {
  const invalidos = [
    { refeicoesPorDia: 0 },
    { refeicoesPorDia: 7, horarios: ['01:00', '02:00', '03:00', '04:00', '05:00', '06:00', '07:00'] },
    { refeicoesPorDia: 3 }, // faltam horários
    { horarios: ['08:00', '08:00'] },
    { horarios: ['8:00', '20:00'] },
    { horarios: ['08:00', '25:00'] },
    { bolinhasPorRefeicao: 21 },
    { bolinhasPorRefeicao: 2.5 },
    { bolinhasPorRefeicao: '4' },
    { intervaloTrocaDias: 61 },
    { luzAcende: '06:00', luzApaga: '06:00' },
    { tempMinima: 28, tempMaxima: 27 },
    { tempMinima: 5 },
    { fusoHorario: 'Marte/Olympus' },
    { campoQualquer: 1 },
  ];
  for (const entrada of invalidos) assert.ok(validarConfiguracao(entrada, atual).erro, JSON.stringify(entrada));
  assert.ok(validarConfiguracao(null, atual).erro);
  assert.ok(validarConfiguracao([], atual).erro);
});

test('avisos: só booleanos conhecidos', () => {
  assert.deepEqual(validarAvisos({ comer: false }).valor, { comer: false });
  assert.ok(validarAvisos({}).erro);
  assert.ok(validarAvisos({ comer: 'sim' }).erro);
  assert.ok(validarAvisos({ outro: true }).erro);
});

test('inscrição de push: só serviços conhecidos, sempre https', () => {
  const chaves = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' };
  assert.ok(validarInscricao({ endpoint: 'https://web.push.apple.com/abc123', keys: chaves }).valor);
  assert.ok(validarInscricao({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: chaves }).valor);
  assert.ok(validarInscricao({ endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/abc', keys: chaves }).valor);
  const ruins = [
    'http://web.push.apple.com/abc',
    'https://evil.example.com/abc',
    'https://web.push.apple.com.evil.com/abc',
    'https://127.0.0.1/abc',
    'https://user:pw@web.push.apple.com/abc',
    'https://web.push.apple.com:8443/abc',
    'não é url',
  ];
  for (const endpoint of ruins) assert.ok(validarInscricao({ endpoint, keys: chaves }).erro, endpoint);
  assert.ok(validarInscricao({ endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: '<x>', auth: 'a' } }).erro);
  assert.ok(validarInscricao({ endpoint: 'https://web.push.apple.com/abc' }).erro);
});

test('temperatura e humor: validação de entrada', () => {
  assert.deepEqual(lerTemperatura({ valor: 25.54 }).valores, [25.5]);
  assert.ok(lerTemperatura({ valor: 9.9 }).erro);
  assert.ok(lerTemperatura({ valor: 40.1 }).erro);
  assert.ok(lerTemperatura({ valor: '25' }).erro);
  assert.ok(lerTemperatura({ valor: NaN }).erro);
  assert.deepEqual(lerHumor({ tipo: 'bravo' }).valores, ['bravo']);
  assert.ok(lerHumor({ tipo: 'feliz' }).erro);
  assert.ok(lerHumor({ tipo: '__proto__' }).erro);
  assert.ok(lerHumor({}).erro);
});

// Teste de ponta a ponta da API contra um PostgreSQL real.
// Rode com: TEST_DATABASE_URL=postgres://usuario:senha@127.0.0.1:5432/banco_de_teste npm test
// ATENÇÃO: o banco de teste é APAGADO e recriado a cada execução. Nunca aponte para o banco de verdade.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarApp } from '../src/app.js';
import { verificarAvisos } from '../src/avisos.js';
import { criarPool, migrar } from '../src/db.js';
import { dataLocal } from '../src/dominio.js';
import { hashSenha } from '../src/seguranca.js';

const URL_TESTE = process.env.TEST_DATABASE_URL;
const opcoes = { skip: URL_TESTE ? false : 'defina TEST_DATABASE_URL para rodar os testes de API' };
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

const LOGIN = 'shaq';
const SENHA = 'uma-frase-bem-longa-123';

let pool;
const envios = [];
const pushFalso = {
  ativo: true,
  chavePublica: 'CHAVE-PUBLICA-FALSA',
  async enviar(sub, payload) {
    envios.push({ endpoint: sub.endpoint, payload });
    return sub.endpoint.includes('gone') ? { ok: false, gone: true } : { ok: true };
  },
};

const cfgBase = { prod: false, porta: 0, trustProxy: false, appUrl: null, vapid: {} };
const servidores = [];

async function subir(cfg = cfgBase, push = pushFalso) {
  const app = criarApp({ pool, cfg: { ...cfgBase, ...cfg }, push });
  const servidor = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  servidores.push(servidor);
  return `http://127.0.0.1:${servidor.address().port}`;
}

/** Cliente HTTP minúsculo com cookie, para simular o navegador. */
function cliente(base) {
  let cookie = null;
  const api = {
    get cookie() {
      return cookie;
    },
    set cookie(v) {
      cookie = v;
    },
    async req(metodo, caminho, corpo, cabecalhos = {}) {
      const headers = { ...cabecalhos };
      if (corpo !== undefined && !headers['content-type']) headers['content-type'] = 'application/json';
      if (cookie) headers.cookie = cookie;
      const r = await fetch(base + caminho, {
        method: metodo,
        headers,
        body: corpo === undefined ? undefined : typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
        redirect: 'manual',
      });
      const setCookies = r.headers.getSetCookie();
      for (const s of setCookies) {
        const par = s.split(';')[0];
        cookie = par.endsWith('=') ? null : par;
      }
      const texto = await r.text();
      let json = null;
      try {
        json = JSON.parse(texto);
      } catch {
        /* resposta não-JSON */
      }
      return { status: r.status, json, headers: r.headers, setCookies, texto };
    },
    async login(login = LOGIN, senha = SENHA) {
      return api.req('POST', '/api/login', { login, senha });
    },
  };
  return api;
}

before(async () => {
  if (!URL_TESTE) return;
  pool = criarPool(URL_TESTE);
  await pool.query('drop schema public cascade; create schema public;');
  await migrar(pool, join(RAIZ, 'migrations'));
  await pool.query('insert into usuario (id, login, senha_hash) values (1, $1, $2)', [LOGIN, await hashSenha(SENHA)]);
});

after(async () => {
  for (const s of servidores) s.close();
  await pool?.end();
});

// ---------- Segurança básica ----------
test('saúde é pública e as respostas trazem cabeçalhos de segurança', opcoes, async () => {
  const c = cliente(await subir());
  const r = await c.req('GET', '/api/saude');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true });
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(r.headers.get('x-powered-by'), null);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('strict-transport-security'), null); // só em produção
});

test('em produção: HSTS e cookie __Host- com Secure', opcoes, async () => {
  const c = cliente(await subir({ prod: true }));
  const saude = await c.req('GET', '/api/saude');
  assert.match(saude.headers.get('strict-transport-security'), /max-age=31536000/);
  const r = await c.login();
  assert.equal(r.status, 200);
  const cookie = r.setCookies[0];
  assert.match(cookie, /^__Host-sid=[A-Za-z0-9_-]{43}/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Path=\//);
  assert.doesNotMatch(cookie, /Domain=/);
});

test('rotas protegidas respondem 401 sem login', opcoes, async () => {
  const c = cliente(await subir());
  const rotas = [
    ['GET', '/api/estado'],
    ['GET', '/api/historico'],
    ['GET', '/api/configuracao'],
    ['GET', '/api/push/chave'],
    ['POST', '/api/alimentacoes', {}],
    ['POST', '/api/limpezas', {}],
    ['POST', '/api/temperaturas', { valor: 25 }],
    ['POST', '/api/humores', { tipo: 'calmo' }],
    ['PUT', '/api/luz', { ligada: true }],
    ['PUT', '/api/configuracao', {}],
    ['PUT', '/api/notificacoes', { comer: true }],
    ['POST', '/api/senha', { atual: 'a', nova: 'b' }],
    ['DELETE', '/api/alimentacoes/1'],
    ['POST', '/api/push/inscrever', {}],
    ['POST', '/api/push/testar', {}],
  ];
  for (const [metodo, caminho, corpo] of rotas) {
    const r = await c.req(metodo, caminho, corpo);
    assert.equal(r.status, 401, `${metodo} ${caminho}`);
    assert.deepEqual(r.json, { erro: 'nao_autenticado' });
  }
});

test('cookie falso ou inventado não autentica', opcoes, async () => {
  const c = cliente(await subir());
  c.cookie = 'sid=' + 'A'.repeat(43);
  assert.equal((await c.req('GET', '/api/estado')).status, 401);
  c.cookie = 'sid=' + 'x'.repeat(500);
  assert.equal((await c.req('GET', '/api/estado')).status, 401);
});

test('login: erro igual para usuário e senha errados; cookie seguro no sucesso', opcoes, async () => {
  const c = cliente(await subir());
  const senhaErrada = await c.login(LOGIN, 'senha-errada-12345');
  const usuarioErrado = await c.login('outro', SENHA);
  assert.equal(senhaErrada.status, 401);
  assert.equal(usuarioErrado.status, 401);
  assert.deepEqual(senhaErrada.json, usuarioErrado.json);
  assert.equal(c.cookie, null);

  const ok = await c.login(' SHAQ ', SENHA); // login ignora maiúsculas e espaços nas pontas
  assert.equal(ok.status, 200);
  const cookie = ok.setCookies[0];
  assert.match(cookie, /^sid=[A-Za-z0-9_-]{43}/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Max-Age=7776000/);
  assert.equal((await c.req('GET', '/api/me')).status, 200);
  assert.ok(!ok.texto.includes(c.cookie.split('=')[1]), 'o token nunca vai no corpo da resposta');
});

test('login: só o hash do token fica no banco', opcoes, async () => {
  const c = cliente(await subir());
  await c.login();
  const token = c.cookie.split('=')[1];
  const { rows } = await pool.query('select encode(token_hash, $1) as h from sessao', ['escape']);
  assert.ok(rows.length >= 1);
  const { rows: achou } = await pool.query("select 1 from sessao where position($1 in encode(token_hash, 'base64')) > 0", [token]);
  assert.equal(achou.length, 0);
});

test('login: limite de tentativas devolve 429 com Retry-After', opcoes, async () => {
  const c = cliente(await subir());
  for (let i = 0; i < 5; i++) assert.equal((await c.login(LOGIN, 'errada-errada-1')).status, 401);
  const bloqueada = await c.login(LOGIN, SENHA); // mesmo com a senha certa, está bloqueado
  assert.equal(bloqueada.status, 429);
  assert.ok(Number(bloqueada.headers.get('retry-after')) >= 1);
});

test('login: corpo inválido recebe 400', opcoes, async () => {
  const c = cliente(await subir());
  assert.equal((await c.req('POST', '/api/login', { login: 123, senha: 'x' })).status, 400);
  assert.equal((await c.req('POST', '/api/login', { login: 'a'.repeat(200), senha: 'x' })).status, 400);
  assert.equal((await c.req('POST', '/api/login', {})).status, 400);
});

test('CSRF e entrada: origem alheia, tipo errado, JSON quebrado e corpo grande', opcoes, async () => {
  const c = cliente(await subir());
  await c.login();
  const alheia = await c.req('POST', '/api/alimentacoes', {}, { origin: 'https://evil.example' });
  assert.equal(alheia.status, 403);
  const outraSite = await c.req('POST', '/api/alimentacoes', {}, { 'sec-fetch-site': 'cross-site' });
  assert.equal(outraSite.status, 403);
  const form = await c.req('POST', '/api/alimentacoes', 'bolinhas=4', { 'content-type': 'application/x-www-form-urlencoded' });
  assert.equal(form.status, 415);
  const texto = await c.req('POST', '/api/alimentacoes', '{"bolinhas":4}', { 'content-type': 'text/plain' });
  assert.equal(texto.status, 415);
  assert.equal((await c.req('POST', '/api/alimentacoes', '{quebrado')).status, 400);
  assert.equal((await c.req('POST', '/api/alimentacoes', { lixo: 'x'.repeat(20_000) })).status, 413);
});

test('com APP_URL definido, só aquela origem é aceita', opcoes, async () => {
  const c = cliente(await subir({ appUrl: 'https://shaq.exemplo.com' }));
  await c.login();
  assert.equal((await c.req('POST', '/api/humores', { tipo: 'calmo' }, { origin: 'https://shaq.exemplo.com' })).status, 201);
  assert.equal((await c.req('POST', '/api/humores', { tipo: 'calmo' }, { origin: 'https://outro.exemplo.com' })).status, 403);
});

test('tentativas de SQL injection são recusadas e as tabelas continuam intactas', opcoes, async () => {
  const c = cliente(await subir());
  await c.login();
  const ataques = [
    ['POST', '/api/alimentacoes', { bolinhas: '1); drop table alimentacao; --' }],
    ['POST', '/api/limpezas', { tipo: "total'; drop table limpeza; --" }],
    ['POST', '/api/temperaturas', { valor: '25; drop table temperatura' }],
    ['POST', '/api/humores', { tipo: "calmo'); drop table humor; --" }],
    ['POST', '/api/alimentacoes', { quando: "2026-01-01'; drop table alimentacao" }],
    ['DELETE', '/api/alimentacoes/1 or 1=1'],
    ['DELETE', '/api/alimentacoes/1;drop table usuario'],
    ['PUT', '/api/notificacoes', { 'comer = true; drop table usuario; --': true }],
    ['PUT', '/api/configuracao', { fusoHorario: "'; drop table configuracao; --" }],
    ['GET', "/api/historico?dias=1;drop table usuario"],
  ];
  for (const [metodo, caminho, corpo] of ataques) {
    const r = await c.req(metodo, caminho, corpo);
    assert.ok(r.status >= 400 && r.status < 500, `${metodo} ${caminho} -> ${r.status}`);
  }
  const { rows } = await pool.query("select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name in ('usuario','alimentacao','limpeza','temperatura','humor','configuracao')");
  assert.equal(rows[0].n, 6);
});

// ---------- Registros ----------
test('alimentação: registra com padrão da configuração, valida e apaga', opcoes, async () => {
  const c = cliente(await subir());
  await c.login();
  const antes = (await c.req('GET', '/api/estado')).json;
  assert.equal(antes.alimentacao.totalHoje, 2);

  const criada = await c.req('POST', '/api/alimentacoes', {});
  assert.equal(criada.status, 201);
  assert.equal(criada.json.estado.alimentacao.ultima.bolinhas, 4);
  assert.equal(criada.json.estado.alimentacao.feitasHoje, antes.alimentacao.feitasHoje + 1);

  const tres = await c.req('POST', '/api/alimentacoes', { bolinhas: 3 });
  assert.equal(tres.json.estado.alimentacao.ultima.bolinhas, 3);

  for (const ruim of [0, 21, 2.5, 'a', null, []]) {
    assert.equal((await c.req('POST', '/api/alimentacoes', { bolinhas: ruim })).status, 400, JSON.stringify(ruim));
  }

  const apagada = await c.req('DELETE', `/api/alimentacoes/${tres.json.id}`);
  assert.equal(apagada.status, 200);
  assert.equal(apagada.json.estado.alimentacao.feitasHoje, criada.json.estado.alimentacao.feitasHoje);
  assert.equal((await c.req('DELETE', `/api/alimentacoes/${tres.json.id}`)).status, 404);
  assert.equal((await c.req('DELETE', '/api/alimentacoes/abc')).status, 400);
});

test('registro com data anterior (esqueci de anotar) e recusa de futuro', opcoes, async () => {
  const c = cliente(await subir());
  await c.login();
  const duasHorasAtras = new Date(Date.now() - 2 * 3600_000).toISOString();
  const ok = await c.req('POST', '/api/limpezas', { tipo: 'total', quando: duasHorasAtras });
  assert.equal(ok.status, 201);
  assert.equal(ok.json.estado.troca.ultima.tipo, 'total');
  assert.equal(new Date(ok.json.estado.troca.ultima.quando).toISOString(), duasHorasAtras);
  assert.equal((await c.req('POST', '/api/limpezas', { quando: new Date(Date.now() + 3600_000).toISOString() })).status, 400);
  assert.equal((await c.req('POST', '/api/limpezas', { tipo: 'meia-boca' })).status, 400);
});

test('troca de água, temperatura, humor e luz atualizam o estado', opcoes, async () => {
  const c = cliente(await subir());
  await c.login();

  const troca = await c.req('POST', '/api/limpezas', { tipo: 'parcial' });
  assert.equal(troca.status, 201);
  assert.equal(troca.json.estado.troca.status, 'ok');
  assert.equal(troca.json.estado.troca.dias, 7);

  const quente = await c.req('POST', '/api/temperaturas', { valor: 28.5 });
  assert.equal(quente.json.estado.temperatura.faixa, 'quente');
  assert.equal(quente.json.estado.temperatura.rotulo, 'Peixe frito');
  assert.ok(quente.json.estado.alertas.some((a) => a.tipo === 'temp'));
  const fria = await c.req('POST', '/api/temperaturas', { valor: 20 });
  assert.equal(fria.json.estado.temperatura.faixa, 'fria');
  const boa = await c.req('POST', '/api/temperaturas', { valor: 25.54 });
  assert.equal(boa.json.estado.temperatura.valor, 25.5);
  assert.equal(boa.json.estado.temperatura.faixa, 'saudavel');
  for (const ruim of [9.9, 40.1, '25', null]) assert.equal((await c.req('POST', '/api/temperaturas', { valor: ruim })).status, 400);

  const humor = await c.req('POST', '/api/humores', { tipo: 'escondendo' });
  assert.equal(humor.json.estado.humor.rotulo, 'Se escondendo');
  assert.ok(humor.json.estado.alertas.some((a) => a.tipo === 'humor'));
  assert.equal((await c.req('POST', '/api/humores', { tipo: 'feliz' })).status, 400);
  await c.req('POST', '/api/humores', { tipo: 'ativo' });

  const luz = await c.req('PUT', '/api/luz', { ligada: false });
  assert.equal(luz.json.estado.luz.ligada, false);
  assert.equal((await c.req('PUT', '/api/luz', { ligada: 'sim' })).status, 400);
  await c.req('PUT', '/api/luz', { ligada: true });
});

test('histórico mistura os quatro tipos, do mais novo ao mais antigo, e permite apagar', opcoes, async () => {
  const c = cliente(await subir());
  await c.login();
  await c.req('POST', '/api/alimentacoes', {});
  await c.req('POST', '/api/limpezas', { tipo: 'total' });
  await c.req('POST', '/api/temperaturas', { valor: 24 });
  const ultimo = await c.req('POST', '/api/humores', { tipo: 'bravo' });

  const h = await c.req('GET', '/api/historico?dias=7');
  assert.equal(h.status, 200);
  assert.equal(h.json.dias, 7);
  const tipos = new Set(h.json.itens.map((i) => i.tipo));
  assert.deepEqual([...tipos].sort(), ['alimentacao', 'humor', 'limpeza', 'temperatura']);
  const datas = h.json.itens.map((i) => new Date(i.quando).getTime());
  assert.deepEqual(datas, [...datas].sort((a, b) => b - a));
  const humor = h.json.itens.find((i) => i.tipo === 'humor' && i.id === ultimo.json.id);
  assert.equal(humor.rotulo, 'Bravo');
  assert.equal(h.json.itens.find((i) => i.tipo === 'temperatura').valor, 24);

  for (const dias of ['0', '91', 'x', '1.5']) assert.equal((await c.req('GET', `/api/historico?dias=${dias}`)).status, 400);
  assert.equal((await c.req('DELETE', `/api/humores/${ultimo.json.id}`)).status, 200);
});

// ---------- Configuração ----------
test('configuração: lê, altera e recalcula o estado; recusa valores inválidos', opcoes, async () => {
  const c = cliente(await subir());
  await c.login();
  const lida = await c.req('GET', '/api/configuracao');
  assert.equal(lida.json.refeicoesPorDia, 2);
  assert.deepEqual(lida.json.horarios, ['08:00', '20:00']);
  assert.equal(lida.json.tempMaxima, 27);
  assert.equal(lida.json.fusoHorario, 'America/Sao_Paulo');

  const nova = await c.req('PUT', '/api/configuracao', {
    refeicoesPorDia: 3,
    horarios: ['19:00', '07:00', '13:00'],
    bolinhasPorRefeicao: 5,
    intervaloTrocaDias: 5,
    luzAcende: '07:00',
    luzApaga: '21:00',
    tempMinima: 23,
    tempMaxima: 28.5,
  });
  assert.equal(nova.status, 200);
  assert.deepEqual(nova.json.configuracao.horarios, ['07:00', '13:00', '19:00']);
  assert.equal(nova.json.estado.alimentacao.totalHoje, 3);
  assert.equal(nova.json.estado.alimentacao.bolinhas, 5);
  assert.equal(nova.json.estado.luz.acende, '07:00');
  assert.equal(nova.json.estado.troca.intervaloDias, 5);

  const invalidas = [
    { refeicoesPorDia: 0 },
    { refeicoesPorDia: 4 },
    { horarios: ['25:00', '07:00', '13:00'] },
    { bolinhasPorRefeicao: 99 },
    { luzAcende: '07:00', luzApaga: '07:00' },
    { tempMinima: 30 },
    { fusoHorario: 'Nao/Existe' },
    { naoExiste: true },
  ];
  for (const corpo of invalidas) assert.equal((await c.req('PUT', '/api/configuracao', corpo)).status, 400, JSON.stringify(corpo));
  assert.equal((await c.req('GET', '/api/configuracao')).json.bolinhasPorRefeicao, 5); // nada foi alterado pelas inválidas

  // volta ao padrão para não afetar os outros testes
  const volta = await c.req('PUT', '/api/configuracao', {
    refeicoesPorDia: 2, horarios: ['08:00', '20:00'], bolinhasPorRefeicao: 4, intervaloTrocaDias: 7, luzAcende: '06:00', luzApaga: '20:00', tempMinima: 22, tempMaxima: 27,
  });
  assert.equal(volta.status, 200);
});

test('avisos: liga e desliga por tipo', opcoes, async () => {
  const c = cliente(await subir());
  await c.login();
  const r = await c.req('PUT', '/api/notificacoes', { luz: false, temp: false });
  assert.equal(r.status, 200);
  assert.equal(r.json.avisos.luz, false);
  assert.equal(r.json.avisos.comer, true);
  assert.equal((await c.req('PUT', '/api/notificacoes', { luz: 'nao' })).status, 400);
  assert.equal((await c.req('PUT', '/api/notificacoes', {})).status, 400);
  assert.equal((await c.req('PUT', '/api/notificacoes', { outra: true })).status, 400);
  await c.req('PUT', '/api/notificacoes', { comer: true, agua: true, luz: true, temp: true, humor: true });
});

// ---------- Senha e sessão ----------
test('trocar a senha derruba os outros aparelhos e exige a senha atual', opcoes, async () => {
  const base = await subir();
  const a = cliente(base);
  const b = cliente(base);
  await a.login();
  await b.login();

  assert.equal((await a.req('POST', '/api/senha', { atual: 'errada-errada-1', nova: 'nova-senha-bem-longa-9' })).status, 403);
  assert.equal((await a.req('POST', '/api/senha', { atual: SENHA, nova: 'curta' })).status, 400);
  assert.equal((await a.req('POST', '/api/senha', { atual: SENHA, nova: SENHA })).status, 400);

  const ok = await a.req('POST', '/api/senha', { atual: SENHA, nova: 'nova-senha-bem-longa-9' });
  assert.equal(ok.status, 200);
  assert.equal((await a.req('GET', '/api/estado')).status, 200); // este aparelho segue logado
  assert.equal((await b.req('GET', '/api/estado')).status, 401); // o outro caiu

  const c2 = cliente(await subir()); // limitador novo
  assert.equal((await c2.login(LOGIN, SENHA)).status, 401);
  assert.equal((await c2.login(LOGIN, 'nova-senha-bem-longa-9')).status, 200);

  // restaura a senha original
  await pool.query('update usuario set senha_hash = $1 where id = 1', [await hashSenha(SENHA)]);
});

test('logout encerra a sessão no servidor', opcoes, async () => {
  const c = cliente(await subir());
  await c.login();
  const cookieAntigo = c.cookie;
  assert.equal((await c.req('POST', '/api/logout', {})).status, 200);
  c.cookie = cookieAntigo; // mesmo guardando o cookie, não vale mais
  assert.equal((await c.req('GET', '/api/estado')).status, 401);
});

test('sessão com mais de um dia de uso é renovada', opcoes, async () => {
  const c = cliente(await subir());
  await c.login();
  await pool.query("update sessao set ultimo_uso = now() - interval '2 days', expira_em = now() + interval '10 days'");
  const r = await c.req('GET', '/api/estado');
  assert.equal(r.status, 200);
  assert.ok(r.setCookies.some((s) => s.startsWith('sid=')));
  const { rows } = await pool.query("select (expira_em > now() + interval '80 days') as renovada from sessao order by id desc limit 1");
  assert.equal(rows[0].renovada, true);
});

test('sessão expirada não autentica', opcoes, async () => {
  const c = cliente(await subir());
  await c.login();
  await pool.query("update sessao set expira_em = now() - interval '1 minute'");
  assert.equal((await c.req('GET', '/api/estado')).status, 401);
});

// ---------- Notificações ----------
const CHAVES = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' };

test('push: chave pública, inscrição validada, remoção e teste', opcoes, async () => {
  const c = cliente(await subir());
  await c.login();
  assert.deepEqual((await c.req('GET', '/api/push/chave')).json, { ativo: true, chave: 'CHAVE-PUBLICA-FALSA' });

  const ruim = await c.req('POST', '/api/push/inscrever', { endpoint: 'https://evil.example/x', keys: CHAVES });
  assert.equal(ruim.status, 400);
  assert.equal((await c.req('POST', '/api/push/inscrever', { endpoint: 'http://web.push.apple.com/x', keys: CHAVES })).status, 400);

  const endpoint = 'https://web.push.apple.com/teste-aparelho-1';
  assert.equal((await c.req('POST', '/api/push/inscrever', { endpoint, keys: CHAVES })).status, 201);
  assert.equal((await c.req('POST', '/api/push/inscrever', { endpoint, keys: CHAVES })).status, 201); // repetir não duplica
  const { rows } = await pool.query('select count(*)::int as n from inscricao_push where endpoint = $1', [endpoint]);
  assert.equal(rows[0].n, 1);

  envios.length = 0;
  const teste = await c.req('POST', '/api/push/testar', {});
  assert.equal(teste.json.enviados >= 1, true);
  assert.equal(envios[0].payload.titulo, 'Shaq o Betta');

  assert.equal((await c.req('DELETE', '/api/push/inscrever', { endpoint })).status, 200);
  assert.equal((await pool.query('select count(*)::int as n from inscricao_push')).rows[0].n, 0);
});

test('push: respostas nunca expõem as chaves da inscrição', opcoes, async () => {
  const c = cliente(await subir());
  await c.login();
  const r = await c.req('POST', '/api/push/inscrever', { endpoint: 'https://web.push.apple.com/segredo', keys: CHAVES });
  assert.ok(!r.texto.includes(CHAVES.auth));
  assert.ok(!r.texto.includes(CHAVES.p256dh));
  await c.req('DELETE', '/api/push/inscrever', { endpoint: 'https://web.push.apple.com/segredo' });
});

test('push: limite de aparelhos inscritos', opcoes, async () => {
  const c = cliente(await subir());
  await c.login();
  for (let i = 0; i < 10; i++) {
    assert.equal((await c.req('POST', '/api/push/inscrever', { endpoint: `https://web.push.apple.com/lim-${i}`, keys: CHAVES })).status, 201);
  }
  assert.equal((await c.req('POST', '/api/push/inscrever', { endpoint: 'https://web.push.apple.com/lim-extra', keys: CHAVES })).status, 400);
  await pool.query('delete from inscricao_push');
});

test('push desativado (sem chaves VAPID): rotas respondem 503 e o resto segue funcionando', opcoes, async () => {
  const semPush = { ativo: false, chavePublica: null, async enviar() { return { ok: false }; } };
  const c = cliente(await subir(cfgBase, semPush));
  await c.login();
  assert.deepEqual((await c.req('GET', '/api/push/chave')).json, { ativo: false, chave: null });
  assert.equal((await c.req('POST', '/api/push/inscrever', { endpoint: 'https://web.push.apple.com/x', keys: CHAVES })).status, 503);
  assert.equal((await c.req('GET', '/api/estado')).status, 200);
});

test('avisos automáticos: enviados uma única vez, respeitam as preferências e limpam inscrições mortas', opcoes, async () => {
  await pool.query('delete from inscricao_push; delete from aviso_enviado; delete from alimentacao; delete from limpeza; delete from temperatura; delete from humor;');
  await pool.query("update configuracao set luz_ligada = true, aviso_comer = true, aviso_agua = true, aviso_luz = true, aviso_temp = true, aviso_humor = true");
  await pool.query("insert into inscricao_push (endpoint, p256dh, auth) values ('https://web.push.apple.com/aviso-1', 'p', 'a')");

  // 21:00 de hoje (horário de São Paulo): refeições atrasadas e luz deveria estar apagada
  const hoje = dataLocal(new Date(), 'America/Sao_Paulo');
  const noite = new Date(`${hoje}T21:00:00-03:00`);

  envios.length = 0;
  let r = await verificarAvisos({ pool, push: pushFalso, agora: noite });
  const titulos = envios.map((e) => e.payload.titulo).sort();
  assert.deepEqual(titulos, ['Hora de apagar a luz', 'Hora de comer']);
  assert.equal(r.enviados, 2);

  envios.length = 0;
  r = await verificarAvisos({ pool, push: pushFalso, agora: noite });
  assert.equal(envios.length, 0, 'não repete o mesmo aviso');

  // temperatura alta gera um novo aviso, uma vez só
  await pool.query("insert into temperatura (quando, valor_celsius) values (now(), 30)");
  envios.length = 0;
  await verificarAvisos({ pool, push: pushFalso, agora: noite });
  assert.deepEqual(envios.map((e) => e.payload.titulo), ['Temperatura fora da faixa']);
  assert.match(envios[0].payload.corpo, /30,0 °C · Peixe frito/);
  envios.length = 0;
  await verificarAvisos({ pool, push: pushFalso, agora: noite });
  assert.equal(envios.length, 0);

  // preferência desligada: humor preocupante não gera aviso
  await pool.query("update configuracao set aviso_humor = false");
  await pool.query("insert into humor (quando, tipo) values (now(), 'apatico')");
  envios.length = 0;
  await verificarAvisos({ pool, push: pushFalso, agora: noite });
  assert.equal(envios.length, 0);
  await pool.query("update configuracao set aviso_humor = true");
  await verificarAvisos({ pool, push: pushFalso, agora: noite });
  assert.deepEqual(envios.map((e) => e.payload.titulo), ['Shaq está apático']);

  // inscrição que o serviço de push diz estar morta é removida
  await pool.query('delete from aviso_enviado');
  await pool.query("insert into inscricao_push (endpoint, p256dh, auth) values ('https://web.push.apple.com/gone-1', 'p', 'a')");
  await verificarAvisos({ pool, push: pushFalso, agora: noite });
  const restantes = await pool.query("select endpoint from inscricao_push where endpoint like '%gone%'");
  assert.equal(restantes.rowCount, 0);
  await pool.query('delete from inscricao_push');
});

test('avisos automáticos: falha temporária de envio tenta de novo no minuto seguinte', opcoes, async () => {
  await pool.query('delete from inscricao_push; delete from aviso_enviado; delete from temperatura; delete from humor; delete from alimentacao;');
  await pool.query("update configuracao set luz_ligada = true");
  await pool.query("insert into inscricao_push (endpoint, p256dh, auth) values ('https://web.push.apple.com/instavel', 'p', 'a')");
  await pool.query("insert into temperatura (quando, valor_celsius) values (now(), 19)");
  const hoje = dataLocal(new Date(), 'America/Sao_Paulo');
  const meioDia = new Date(`${hoje}T12:00:00-03:00`); // luz acesa e refeição da manhã já feita: só a temperatura alerta
  await pool.query("insert into alimentacao (quando, bolinhas) values ($1, 4)", [new Date(`${hoje}T08:05:00-03:00`)]);

  let falhar = true;
  const instavel = { ativo: true, chavePublica: 'x', async enviar() { return falhar ? { ok: false, erro: 'rede' } : { ok: true }; } };
  let r = await verificarAvisos({ pool, push: instavel, agora: meioDia });
  assert.equal(r.enviados, 0);
  assert.equal((await pool.query('select count(*)::int as n from aviso_enviado')).rows[0].n, 0, 'não marca como enviado');
  falhar = false;
  r = await verificarAvisos({ pool, push: instavel, agora: meioDia });
  assert.equal(r.enviados, 1);
  await pool.query('delete from inscricao_push');
});

test('rotas desconhecidas: 404 em JSON na API e texto simples fora dela', opcoes, async () => {
  const c = cliente(await subir());
  await c.login();
  const api = await c.req('GET', '/api/nao-existe');
  assert.equal(api.status, 404);
  assert.deepEqual(api.json, { erro: 'nao_encontrado' });
  const fora = await c.req('GET', '/nao-existe');
  assert.equal(fora.status, 404);
});

test('arquivos sensíveis não são servidos pelo site', opcoes, async () => {
  const c = cliente(await subir());
  for (const caminho of ['/.env', '/package.json', '/src/server.js', '/migrations/001_inicial.sql', '/../package.json', '/%2e%2e/package.json', '/.git/config']) {
    const r = await c.req('GET', caminho);
    assert.equal(r.status, 404, caminho);
  }
});

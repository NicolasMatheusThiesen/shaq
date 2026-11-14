import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateVAPIDKeys } from 'web-push';
import { criarPush } from '../src/push.js';

test('sem chaves VAPID o envio fica desativado e não quebra', async () => {
  const push = criarPush({ publica: null, privada: null, assunto: null });
  assert.equal(push.ativo, false);
  assert.equal(push.chavePublica, null);
  assert.equal((await push.enviar({}, {})).ok, false);
});

test('com chaves válidas o envio fica ativo e expõe só a chave pública', () => {
  const { publicKey, privateKey } = generateVAPIDKeys();
  const push = criarPush({ publica: publicKey, privada: privateKey, assunto: 'mailto:teste@exemplo.com' });
  assert.equal(push.ativo, true);
  assert.equal(push.chavePublica, publicKey);
  assert.ok(!JSON.stringify(push).includes(privateKey));
});

test('chaves ou assunto inválidos impedem a inicialização com erro claro', () => {
  const { publicKey, privateKey } = generateVAPIDKeys();
  assert.throws(() => criarPush({ publica: 'lixo', privada: privateKey, assunto: 'mailto:a@b.com' }));
  assert.throws(() => criarPush({ publica: publicKey, privada: privateKey, assunto: 'sem-formato-valido' }));
});

test('falha de rede devolve ok:false sem lançar e sem vazar endpoint ou chaves', async () => {
  const { publicKey, privateKey } = generateVAPIDKeys();
  const push = criarPush({ publica: publicKey, privada: privateKey, assunto: 'mailto:teste@exemplo.com' });
  const cliente = generateVAPIDKeys(); // só para ter uma chave P-256 válida no formato da inscrição
  const sub = { endpoint: 'https://127.0.0.1:9/segredo-do-endpoint', p256dh: cliente.publicKey, auth: 'tBHItJI5svbpez7KI4CCXg' };
  const r = await push.enviar(sub, { titulo: 'x', corpo: 'y' });
  assert.equal(r.ok, false);
  assert.equal(r.gone, false);
  assert.ok(!JSON.stringify(r).includes('segredo-do-endpoint'));
  assert.ok(!JSON.stringify(r).includes(cliente.publicKey));
});

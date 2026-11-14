import { Router } from 'express';
import { ah, corpoObjeto, erro } from '../util.js';
import { validarInscricao } from '../validacao.js';

const MAX_INSCRICOES = 10;

export function rotasPush({ pool, push }) {
  const r = Router();

  r.get('/push/chave', (req, res) => {
    res.json({ ativo: push.ativo, chave: push.chavePublica });
  });

  r.post(
    '/push/inscrever',
    ah(async (req, res) => {
      if (!push.ativo) return erro(res, 503, 'push_desativado');
      const resultado = validarInscricao(req.body);
      if (resultado.erro) return erro(res, 400, resultado.erro);
      const { endpoint, p256dh, auth } = resultado.valor;
      const { rows } = await pool.query('select count(*)::int as n, bool_or(endpoint = $1) as existe from inscricao_push', [endpoint]);
      if (!rows[0].existe && rows[0].n >= MAX_INSCRICOES) return erro(res, 400, 'limite_de_aparelhos');
      await pool.query(
        `insert into inscricao_push (endpoint, p256dh, auth) values ($1, $2, $3)
         on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth`,
        [endpoint, p256dh, auth],
      );
      res.status(201).json({ ok: true });
    }),
  );

  r.delete(
    '/push/inscrever',
    ah(async (req, res) => {
      const { endpoint } = corpoObjeto(req);
      if (typeof endpoint !== 'string' || endpoint.length > 1000) return erro(res, 400, 'endpoint inválido');
      await pool.query('delete from inscricao_push where endpoint = $1', [endpoint]);
      res.json({ ok: true });
    }),
  );

  r.post(
    '/push/testar',
    ah(async (req, res) => {
      if (!push.ativo) return erro(res, 503, 'push_desativado');
      const { rows } = await pool.query('select id, endpoint, p256dh, auth from inscricao_push');
      let enviados = 0;
      let falhas = 0;
      for (const sub of rows) {
        const resultado = await push.enviar(sub, { titulo: 'Shaq o Betta', corpo: 'Teste de notificação: está tudo funcionando.', tag: 'teste', url: '/' });
        if (resultado.ok) enviados++;
        else {
          falhas++;
          if (resultado.gone) await pool.query('delete from inscricao_push where id = $1', [sub.id]);
        }
      }
      res.json({ enviados, falhas });
    }),
  );

  return r;
}

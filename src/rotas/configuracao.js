import { Router } from 'express';
import { carregarConfig, estadoAtual, salvarConfig } from '../repositorio.js';
import { ah, erro } from '../util.js';
import { validarAvisos, validarConfiguracao } from '../validacao.js';

// chave do JSON -> coluna (lista fixa, nunca vinda do usuário)
const COLUNA_AVISO = { comer: 'aviso_comer', agua: 'aviso_agua', luz: 'aviso_luz', temp: 'aviso_temp', humor: 'aviso_humor' };

export function rotasConfiguracao({ pool }) {
  const r = Router();

  r.get(
    '/configuracao',
    ah(async (req, res) => {
      res.json(await carregarConfig(pool));
    }),
  );

  r.put(
    '/configuracao',
    ah(async (req, res) => {
      const atual = await carregarConfig(pool);
      const resultado = validarConfiguracao(req.body, atual);
      if (resultado.erro) return erro(res, 400, resultado.erro);
      await salvarConfig(pool, resultado.valor);
      res.json({ configuracao: await carregarConfig(pool), estado: await estadoAtual(pool) });
    }),
  );

  r.put(
    '/notificacoes',
    ah(async (req, res) => {
      const resultado = validarAvisos(req.body);
      if (resultado.erro) return erro(res, 400, resultado.erro);
      const chaves = Object.keys(resultado.valor);
      const sets = chaves.map((k, i) => `${COLUNA_AVISO[k]} = $${i + 1}`).join(', ');
      await pool.query(`update configuracao set ${sets} where id = 1`, chaves.map((k) => resultado.valor[k]));
      res.json({ avisos: (await carregarConfig(pool)).avisos });
    }),
  );

  return r;
}

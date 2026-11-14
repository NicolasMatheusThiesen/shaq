import { Router } from 'express';
import { HUMORES } from '../dominio.js';
import { carregarConfig, estadoAtual } from '../repositorio.js';
import { ID, ah, corpoObjeto, erro } from '../util.js';
import { lerAlimentacao, lerHumor, lerLimpeza, lerQuando, lerTemperatura } from '../validacao.js';

// Cada tipo de registro: rota, tabela e como ler o corpo. Nomes de tabela e coluna vêm daqui (código),
// nunca do usuário.
const TIPOS = [
  { rota: 'alimentacoes', tabela: 'alimentacao', ler: lerAlimentacao },
  { rota: 'limpezas', tabela: 'limpeza', ler: lerLimpeza },
  { rota: 'temperaturas', tabela: 'temperatura', ler: lerTemperatura },
  { rota: 'humores', tabela: 'humor', ler: lerHumor },
];

export function rotasRegistros({ pool }) {
  const r = Router();

  r.get(
    '/estado',
    ah(async (req, res) => {
      res.json(await estadoAtual(pool));
    }),
  );

  for (const { rota, tabela, ler } of TIPOS) {
    r.post(
      `/${rota}`,
      ah(async (req, res) => {
        const agora = new Date();
        const corpo = corpoObjeto(req);
        const quando = lerQuando(corpo.quando, agora);
        if (quando.erro) return erro(res, 400, quando.erro);
        const config = await carregarConfig(pool);
        const dados = ler(corpo, config);
        if (dados.erro) return erro(res, 400, dados.erro);

        const marcadores = dados.valores.map((_, i) => `$${i + 2}`).join(', ');
        const { rows } = await pool.query(`insert into ${tabela} (quando, ${dados.colunas.join(', ')}) values ($1, ${marcadores}) returning id`, [
          quando.valor,
          ...dados.valores,
        ]);
        res.status(201).json({ id: Number(rows[0].id), estado: await estadoAtual(pool) });
      }),
    );

    r.delete(
      `/${rota}/:id`,
      ah(async (req, res) => {
        if (!ID.test(req.params.id)) return erro(res, 400, 'id_invalido');
        const { rowCount } = await pool.query(`delete from ${tabela} where id = $1`, [req.params.id]);
        if (!rowCount) return erro(res, 404, 'nao_encontrado');
        res.json({ ok: true, estado: await estadoAtual(pool) });
      }),
    );
  }

  r.put(
    '/luz',
    ah(async (req, res) => {
      const { ligada } = corpoObjeto(req);
      if (typeof ligada !== 'boolean') return erro(res, 400, 'ligada deve ser true ou false');
      await pool.query('update configuracao set luz_ligada = $1 where id = 1', [ligada]);
      res.json({ ok: true, estado: await estadoAtual(pool) });
    }),
  );

  r.get(
    '/historico',
    ah(async (req, res) => {
      const dias = req.query.dias === undefined ? 30 : Number(req.query.dias);
      if (!Number.isInteger(dias) || dias < 1 || dias > 90) return erro(res, 400, 'dias deve ser de 1 a 90');
      const desde = new Date(Date.now() - dias * 86_400_000);
      const { rows } = await pool.query(
        `select 'alimentacao' as tipo, id, quando, bolinhas::int as inteiro, null::text as texto, null::numeric as valor from alimentacao where quando >= $1
         union all
         select 'limpeza', id, quando, null::int, tipo, null::numeric from limpeza where quando >= $1
         union all
         select 'temperatura', id, quando, null::int, null::text, valor_celsius from temperatura where quando >= $1
         union all
         select 'humor', id, quando, null::int, tipo, null::numeric from humor where quando >= $1
         order by quando desc, id desc
         limit 500`,
        [desde],
      );
      const itens = rows.map((l) => {
        const base = { tipo: l.tipo, id: Number(l.id), quando: l.quando };
        if (l.tipo === 'alimentacao') return { ...base, bolinhas: l.inteiro };
        if (l.tipo === 'limpeza') return { ...base, troca: l.texto };
        if (l.tipo === 'temperatura') return { ...base, valor: Number(l.valor) };
        return { ...base, humor: l.texto, rotulo: HUMORES[l.texto] };
      });
      res.json({ dias, itens });
    }),
  );

  return r;
}

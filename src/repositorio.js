// Acesso ao banco. Todas as consultas são parametrizadas ($1, $2...): nada é montado com texto do usuário.
import { calcularEstado } from './dominio.js';

export function configDeLinha(l) {
  return {
    refeicoesPorDia: l.refeicoes_por_dia,
    bolinhasPorRefeicao: l.bolinhas_por_refeicao,
    horarios: l.horarios,
    intervaloTrocaDias: l.intervalo_troca_dias,
    luzAcende: l.luz_acende,
    luzApaga: l.luz_apaga,
    luzLigada: l.luz_ligada,
    tempMinima: Number(l.temp_minima),
    tempMaxima: Number(l.temp_maxima),
    fusoHorario: l.fuso_horario,
    avisos: { comer: l.aviso_comer, agua: l.aviso_agua, luz: l.aviso_luz, temp: l.aviso_temp, humor: l.aviso_humor },
  };
}

export async function carregarConfig(db) {
  const { rows } = await db.query('select * from configuracao where id = 1');
  return configDeLinha(rows[0]);
}

export async function salvarConfig(db, c) {
  await db.query(
    `update configuracao set
       refeicoes_por_dia = $1, horarios = $2, bolinhas_por_refeicao = $3, intervalo_troca_dias = $4,
       luz_acende = $5, luz_apaga = $6, temp_minima = $7, temp_maxima = $8, fuso_horario = $9
     where id = 1`,
    [c.refeicoesPorDia, c.horarios, c.bolinhasPorRefeicao, c.intervaloTrocaDias, c.luzAcende, c.luzApaga, c.tempMinima, c.tempMaxima, c.fusoHorario],
  );
}

const DIA_MS = 86_400_000;

/** Tudo o que calcularEstado precisa, lido do banco. */
export async function carregarBase(db, agora) {
  const desde = new Date(agora.getTime() - 3 * DIA_MS);
  const [config, alim, limp, temp, hum] = await Promise.all([
    carregarConfig(db),
    db.query('select id, quando, bolinhas from alimentacao where quando >= $1 order by quando desc limit 50', [desde]),
    db.query('select id, quando, tipo from limpeza order by quando desc limit 1'),
    db.query('select id, quando, valor_celsius from temperatura order by quando desc limit 1'),
    db.query('select id, quando, tipo from humor order by quando desc limit 1'),
  ]);
  return {
    config,
    alimentacoes: alim.rows.map((r) => ({ id: Number(r.id), quando: r.quando, bolinhas: r.bolinhas })),
    limpezas: limp.rows.map((r) => ({ id: Number(r.id), quando: r.quando, tipo: r.tipo })),
    temperatura: temp.rows[0] ? { id: Number(temp.rows[0].id), quando: temp.rows[0].quando, valor: Number(temp.rows[0].valor_celsius) } : null,
    humor: hum.rows[0] ? { id: Number(hum.rows[0].id), quando: hum.rows[0].quando, tipo: hum.rows[0].tipo } : null,
  };
}

export async function estadoAtual(db, agora = new Date()) {
  const base = await carregarBase(db, agora);
  return calcularEstado({ ...base, agora });
}

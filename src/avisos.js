import { calcularEstado } from './dominio.js';
import { carregarBase } from './repositorio.js';

const TRAVA_AVISOS = 727001;

/**
 * Roda a cada minuto: calcula os alertas e envia a notificação de cada um uma única vez
 * (a chave do alerta fica registrada em aviso_enviado).
 * A trava no banco garante que só uma instância envia por vez.
 */
export async function verificarAvisos({ pool, push, agora = new Date() }) {
  if (!push.ativo) return { enviados: 0 };

  const cliente = await pool.connect();
  try {
    await cliente.query('begin');
    const { rows: trava } = await cliente.query('select pg_try_advisory_xact_lock($1) as ok', [TRAVA_AVISOS]);
    if (!trava[0].ok) {
      await cliente.query('rollback');
      return { enviados: 0 };
    }

    let enviados = 0;
    const { rows: inscricoes } = await cliente.query('select id, endpoint, p256dh, auth from inscricao_push');
    if (inscricoes.length) {
      const base = await carregarBase(cliente, agora);
      const estado = calcularEstado({ ...base, agora });

      for (const alerta of estado.alertas) {
        if (!alerta.push || !base.config.avisos[alerta.tipo]) continue;
        const { rowCount } = await cliente.query('select 1 from aviso_enviado where chave = $1', [alerta.chave]);
        if (rowCount) continue;

        let algumaOk = false;
        let falhaTemporaria = false;
        for (const sub of inscricoes) {
          const r = await push.enviar(sub, { titulo: alerta.titulo, corpo: alerta.sub, tag: alerta.tipo, url: '/' });
          if (r.ok) algumaOk = true;
          else if (r.gone) await cliente.query('delete from inscricao_push where id = $1', [sub.id]);
          else falhaTemporaria = true;
        }
        // Se tudo falhou por motivo temporário (rede, serviço fora do ar), tenta de novo no próximo minuto.
        if (algumaOk || !falhaTemporaria) {
          await cliente.query('insert into aviso_enviado (chave) values ($1) on conflict do nothing', [alerta.chave]);
          if (algumaOk) enviados++;
        }
      }
    }

    await cliente.query("delete from aviso_enviado where enviado_em < now() - interval '3 days'");
    await cliente.query('delete from sessao where expira_em < now()');
    await cliente.query('commit');
    return { enviados };
  } catch (e) {
    await cliente.query('rollback').catch(() => {});
    throw e;
  } finally {
    cliente.release();
  }
}

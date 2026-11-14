import pg from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

// numeric chega como string no driver; converto onde preciso. Datas já chegam como Date.
export function criarPool(databaseUrl, { ssl } = {}) {
  const url = new URL(databaseUrl);
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);
  // Banco fora da própria máquina: TLS obrigatório e com verificação do certificado.
  const usarSsl = ssl === 'off' ? false : !local;
  url.searchParams.delete('sslmode'); // a decisão é nossa, não da string de conexão
  return new pg.Pool({
    connectionString: url.toString(),
    ssl: usarSsl ? { rejectUnauthorized: true } : false,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

const TRAVA_MIGRACAO = 727000;

export async function migrar(pool, pasta) {
  const arquivos = (await readdir(pasta)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  const cliente = await pool.connect();
  try {
    await cliente.query('select pg_advisory_lock($1)', [TRAVA_MIGRACAO]);
    await cliente.query(
      'create table if not exists schema_migrations (nome text primary key, aplicada_em timestamptz not null default now())',
    );
    for (const arquivo of arquivos) {
      const { rowCount } = await cliente.query('select 1 from schema_migrations where nome = $1', [arquivo]);
      if (rowCount) continue;
      const sql = await readFile(join(pasta, arquivo), 'utf8');
      await cliente.query('begin');
      try {
        await cliente.query(sql);
        await cliente.query('insert into schema_migrations (nome) values ($1)', [arquivo]);
        await cliente.query('commit');
      } catch (erro) {
        await cliente.query('rollback');
        throw new Error(`Falha na migração ${arquivo}: ${erro.message}`);
      }
    }
  } finally {
    await cliente.query('select pg_advisory_unlock($1)', [TRAVA_MIGRACAO]).catch(() => {});
    cliente.release();
  }
}

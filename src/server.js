import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarApp } from './app.js';
import { verificarAvisos } from './avisos.js';
import { lerConfig } from './config.js';
import { criarPool, migrar } from './db.js';
import { criarPush } from './push.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

const cfg = lerConfig();
const pool = criarPool(cfg.databaseUrl, { ssl: cfg.dbSsl });
await migrar(pool, join(RAIZ, 'migrations'));

const { rowCount } = await pool.query('select 1 from usuario where id = 1');
if (!rowCount) console.warn('Atenção: ainda não existe usuário. Rode: npm run criar-usuario');

const push = criarPush(cfg.vapid);
if (!push.ativo) console.warn('Notificações desativadas: defina VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT (npm run gerar-vapid).');

const app = criarApp({ pool, cfg, push });
const servidor = app.listen(cfg.porta, () => console.log(`Shaq o Betta no ar na porta ${cfg.porta}`));

const timer = setInterval(() => {
  verificarAvisos({ pool, push }).catch((e) => console.error('Falha ao verificar avisos:', e.message));
}, 60_000);

async function encerrar(sinal) {
  console.log(`${sinal} recebido, encerrando...`);
  clearInterval(timer);
  servidor.close(async () => {
    await pool.end().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => encerrar('SIGTERM'));
process.on('SIGINT', () => encerrar('SIGINT'));
process.on('unhandledRejection', (e) => console.error('Promessa rejeitada:', e?.message ?? e));

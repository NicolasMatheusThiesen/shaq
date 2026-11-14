// Cria (ou redefine) o único usuário do app. Não existe tela pública de cadastro.
// Uso interativo:   npm run criar-usuario
// Uso por pipe:     printf 'shaq\nSUA-SENHA-LONGA\n' | npm run criar-usuario
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lerConfig } from '../src/config.js';
import { criarPool, migrar } from '../src/db.js';
import { SENHA_MAX, SENHA_MIN, hashSenha } from '../src/seguranca.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

function lerTudo(stream) {
  return new Promise((resolve, reject) => {
    let texto = '';
    stream.setEncoding('utf8');
    stream.on('data', (parte) => (texto += parte));
    stream.on('end', () => resolve(texto));
    stream.on('error', reject);
  });
}

function lerNoTerminal(pergunta, oculto) {
  return new Promise((resolve) => {
    process.stdout.write(pergunta);
    const { stdin } = process;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let texto = '';
    const fim = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', aoReceber);
    };
    const aoReceber = (dados) => {
      for (const c of dados) {
        if (c === '\u0003') {
          fim();
          process.stdout.write('\n');
          process.exit(130);
        }
        if (c === '\r' || c === '\n') {
          fim();
          process.stdout.write('\n');
          return resolve(texto);
        }
        if (c === '\u007f' || c === '\b') {
          texto = texto.slice(0, -1);
          continue;
        }
        texto += c;
        if (!oculto) process.stdout.write(c);
      }
    };
    stdin.on('data', aoReceber);
  });
}

const linhas = process.stdin.isTTY ? null : (await lerTudo(process.stdin)).split('\n').map((l) => l.replace(/\r$/, ''));
const perguntar = (texto, oculto = false) => (linhas ? Promise.resolve(linhas.shift() ?? '') : lerNoTerminal(texto, oculto));

const login = (await perguntar('Login (3 a 50 letras minúsculas, números, . _ -): ')).trim().toLowerCase();
if (!/^[a-z0-9._-]{3,50}$/.test(login)) {
  console.error('Login inválido.');
  process.exit(1);
}
const senha = await perguntar(`Senha (mínimo ${SENHA_MIN} caracteres; use uma frase longa): `, true);
if (senha.length < SENHA_MIN || senha.length > SENHA_MAX) {
  console.error(`A senha deve ter de ${SENHA_MIN} a ${SENHA_MAX} caracteres.`);
  process.exit(1);
}
if (!linhas) {
  const confirmacao = await perguntar('Repita a senha: ', true);
  if (confirmacao !== senha) {
    console.error('As senhas não conferem.');
    process.exit(1);
  }
}

const cfg = lerConfig();
const pool = criarPool(cfg.databaseUrl, { ssl: cfg.dbSsl });
try {
  await migrar(pool, join(RAIZ, 'migrations'));
  await pool.query(
    `insert into usuario (id, login, senha_hash) values (1, $1, $2)
     on conflict (id) do update set login = excluded.login, senha_hash = excluded.senha_hash`,
    [login, await hashSenha(senha)],
  );
  await pool.query('delete from sessao'); // quem estava logado precisa entrar de novo
  console.log(`Pronto. Usuário "${login}" salvo; todas as sessões antigas foram encerradas.`);
} finally {
  await pool.end();
}

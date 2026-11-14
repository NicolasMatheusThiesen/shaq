import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cabecalhosSeguranca } from './seguranca.js';
import { criarAuth } from './rotas/auth.js';
import { rotasConfiguracao } from './rotas/configuracao.js';
import { rotasPush } from './rotas/push.js';
import { rotasRegistros } from './rotas/registros.js';

const PUBLICO = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const METODOS_QUE_ALTERAM = ['POST', 'PUT', 'PATCH', 'DELETE'];

const temCorpo = (req) => {
  const tamanho = req.headers['content-length'];
  return (tamanho !== undefined && tamanho !== '0') || req.headers['transfer-encoding'] !== undefined;
};

/** Defesa extra contra CSRF (além do cookie SameSite=Strict): a origem do pedido tem de ser a nossa. */
function verificarOrigem(cfg) {
  const fixa = cfg.appUrl ? new URL(cfg.appUrl).origin : null;
  return (req, res, next) => {
    if (!METODOS_QUE_ALTERAM.includes(req.method)) return next();
    const origem = req.get('origin');
    if (origem) {
      let ok = false;
      try {
        ok = fixa ? origem === fixa : new URL(origem).host === req.get('host');
      } catch {
        ok = false;
      }
      if (!ok) return res.status(403).json({ erro: 'origem_nao_permitida' });
    } else {
      const site = req.get('sec-fetch-site');
      if (site && site !== 'same-origin' && site !== 'none') return res.status(403).json({ erro: 'origem_nao_permitida' });
    }
    next();
  };
}

export function criarApp({ pool, cfg, push }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', cfg.trustProxy);
  app.use(cabecalhosSeguranca(cfg.prod));

  const auth = criarAuth({ pool, prod: cfg.prod });
  const api = express.Router();
  api.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  api.use(verificarOrigem(cfg));
  api.use((req, res, next) => {
    // só JSON: um formulário de outro site não consegue enviar application/json sem preflight
    if (METODOS_QUE_ALTERAM.includes(req.method) && temCorpo(req) && !req.is('application/json')) {
      return res.status(415).json({ erro: 'use_application_json' });
    }
    next();
  });
  api.use(express.json({ limit: '10kb' }));

  api.get('/saude', (req, res) => res.json({ ok: true }));
  api.use(auth.rotasPublicas);
  api.use(auth.exigirLogin); // tudo abaixo exige login
  api.use(auth.rotasPrivadas);
  api.use(rotasRegistros({ pool }));
  api.use(rotasConfiguracao({ pool }));
  api.use(rotasPush({ pool, push }));
  api.use((req, res) => res.status(404).json({ erro: 'nao_encontrado' }));
  app.use('/api', api);

  app.use(
    express.static(PUBLICO, {
      dotfiles: 'ignore',
      index: 'index.html',
      setHeaders(res, caminho) {
        // o app abre sempre na versão nova; só os ícones podem ficar em cache
        res.set('Cache-Control', /\/icones\//.test(caminho) ? 'public, max-age=86400' : 'no-cache');
      },
    }),
  );
  app.use((req, res) => res.status(404).type('text/plain').send('Não encontrado'));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'json_invalido' });
    if (err.type === 'entity.too.large') return res.status(413).json({ erro: 'corpo_grande_demais' });
    // Log só do essencial: nunca corpo, cookies ou cabeçalhos.
    console.error(`Erro em ${req.method} ${req.path}:`, err.code ?? '', err.message);
    res.status(500).json({ erro: 'erro_interno' });
  });

  return app;
}

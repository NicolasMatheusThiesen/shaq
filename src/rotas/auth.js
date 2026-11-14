import { Router } from 'express';
import {
  SENHA_MAX,
  SENHA_MIN,
  SESSAO_DIAS,
  criarLimitador,
  definirCookie,
  hashParaIgualarTempo,
  hashSenha,
  hashToken,
  lerCookie,
  limparCookie,
  nomeCookie,
  novoToken,
  textosIguais,
  verificarSenha,
} from '../seguranca.js';
import { ah, corpoObjeto, erro } from '../util.js';

const UM_DIA_MS = 86_400_000;

export function criarAuth({ pool, prod }) {
  const nome = nomeCookie(prod);
  // 5 tentativas por minuto por IP e 20 falhas por 15 minutos no total (app de usuário único).
  const porIp = criarLimitador({ janelaMs: 60_000, max: 5 });
  const falhas = criarLimitador({ janelaMs: 15 * 60_000, max: 20 });

  function espera(req) {
    return Math.max(porIp.bloqueado(req.ip ?? 'desconhecido'), falhas.bloqueado('global'));
  }

  function bloquear(req, res) {
    const s = espera(req);
    if (!s) return false;
    res.set('Retry-After', String(s));
    res.status(429).json({ erro: 'muitas_tentativas', tenteEmSegundos: s });
    return true;
  }

  async function exigirLogin(req, res, next) {
    try {
      const token = lerCookie(req, nome);
      if (!token || token.length > 100) return erro(res, 401, 'nao_autenticado');
      const { rows } = await pool.query('select id, ultimo_uso from sessao where token_hash = $1 and expira_em > now()', [hashToken(token)]);
      if (!rows[0]) {
        limparCookie(res, prod);
        return erro(res, 401, 'nao_autenticado');
      }
      req.sessaoId = rows[0].id;
      if (Date.now() - rows[0].ultimo_uso.getTime() > UM_DIA_MS) {
        // sessão deslizante: renova por mais 90 dias a cada dia de uso
        await pool.query('update sessao set ultimo_uso = now(), expira_em = now() + make_interval(days => $2) where id = $1', [rows[0].id, SESSAO_DIAS]);
        definirCookie(res, prod, token);
      }
      next();
    } catch (e) {
      next(e);
    }
  }

  const publicas = Router();
  publicas.post(
    '/login',
    ah(async (req, res) => {
      if (bloquear(req, res)) return;
      porIp.contar(req.ip ?? 'desconhecido');

      const { login, senha } = corpoObjeto(req);
      if (typeof login !== 'string' || typeof senha !== 'string' || login.length > 100 || senha.length > SENHA_MAX) {
        return erro(res, 400, 'dados_invalidos');
      }

      const { rows } = await pool.query('select login, senha_hash from usuario where id = 1');
      const usuario = rows[0];
      const loginOk = Boolean(usuario) && textosIguais(usuario.login, login.trim().toLowerCase());
      // Mesmo custo de tempo exista o usuário ou não, e mesma resposta para os dois erros.
      const senhaOk = await verificarSenha(senha, loginOk ? usuario.senha_hash : await hashParaIgualarTempo());
      if (!loginOk || !senhaOk) {
        falhas.contar('global');
        return erro(res, 401, 'credenciais_invalidas');
      }

      falhas.zerar('global');
      const { token, hash } = novoToken();
      await pool.query('insert into sessao (token_hash, expira_em) values ($1, now() + make_interval(days => $2))', [hash, SESSAO_DIAS]);
      await pool.query('delete from sessao where expira_em < now()');
      definirCookie(res, prod, token);
      res.json({ ok: true });
    }),
  );

  const privadas = Router();
  privadas.get('/me', (req, res) => res.json({ ok: true }));

  privadas.post(
    '/logout',
    ah(async (req, res) => {
      await pool.query('delete from sessao where id = $1', [req.sessaoId]);
      limparCookie(res, prod);
      res.json({ ok: true });
    }),
  );

  privadas.post(
    '/senha',
    ah(async (req, res) => {
      if (bloquear(req, res)) return;
      const { atual, nova } = corpoObjeto(req);
      if (typeof atual !== 'string' || typeof nova !== 'string' || atual.length > SENHA_MAX) return erro(res, 400, 'dados_invalidos');
      if (nova.length < SENHA_MIN || nova.length > SENHA_MAX) {
        return res.status(400).json({ erro: 'senha_fraca', mensagem: `A nova senha deve ter de ${SENHA_MIN} a ${SENHA_MAX} caracteres.` });
      }
      porIp.contar(req.ip ?? 'desconhecido');
      const { rows } = await pool.query('select senha_hash from usuario where id = 1');
      if (!rows[0] || !(await verificarSenha(atual, rows[0].senha_hash))) {
        falhas.contar('global');
        return erro(res, 403, 'senha_atual_incorreta');
      }
      if (textosIguais(atual, nova)) return erro(res, 400, 'senha_igual_a_atual');
      await pool.query('update usuario set senha_hash = $1 where id = 1', [await hashSenha(nova)]);
      await pool.query('delete from sessao where id <> $1', [req.sessaoId]); // derruba os outros aparelhos
      res.json({ ok: true });
    }),
  );

  return { exigirLogin, rotasPublicas: publicas, rotasPrivadas: privadas };
}

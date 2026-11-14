import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

// ---------- Senhas (scrypt, nativo do Node: sem dependência extra) ----------
const N = 32768;
const R = 8;
const P = 1;
const TAMANHO = 64;
const MAXMEM = 64 * 1024 * 1024;

export const SENHA_MIN = 12;
export const SENHA_MAX = 200;

export async function hashSenha(senha) {
  const sal = crypto.randomBytes(16);
  const chave = await scrypt(senha.normalize('NFKC'), sal, TAMANHO, { N, r: R, p: P, maxmem: MAXMEM });
  return ['scrypt', N, R, P, sal.toString('base64'), chave.toString('base64')].join('$');
}

export async function verificarSenha(senha, armazenado) {
  const partes = String(armazenado).split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [, n, r, p, sal, esperado] = partes;
  const esperadoBuf = Buffer.from(esperado, 'base64');
  const calculado = await scrypt(senha.normalize('NFKC'), Buffer.from(sal, 'base64'), esperadoBuf.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: MAXMEM,
  });
  return crypto.timingSafeEqual(calculado, esperadoBuf);
}

let hashFalso;
/** Hash de mentira para gastar o mesmo tempo quando o usuário não existe. */
export async function hashParaIgualarTempo() {
  hashFalso ??= await hashSenha(crypto.randomBytes(16).toString('hex'));
  return hashFalso;
}

export function textosIguais(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// ---------- Sessão ----------
export function novoToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest();
}

export const SESSAO_DIAS = 90;

export function nomeCookie(prod) {
  return prod ? '__Host-sid' : 'sid';
}

export function lerCookie(req, nome) {
  const cabecalho = req.headers.cookie;
  if (!cabecalho) return null;
  for (const parte of cabecalho.split(';')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    if (parte.slice(0, i).trim() === nome) return parte.slice(i + 1).trim();
  }
  return null;
}

export function definirCookie(res, prod, token) {
  const atributos = [`${nomeCookie(prod)}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${SESSAO_DIAS * 86400}`];
  if (prod) atributos.push('Secure'); // __Host- exige Secure
  res.append('Set-Cookie', atributos.join('; '));
}

export function limparCookie(res, prod) {
  const atributos = [`${nomeCookie(prod)}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
  if (prod) atributos.push('Secure');
  res.append('Set-Cookie', atributos.join('; '));
}

// ---------- Limite de tentativas (em memória: o app roda em uma instância) ----------
export function criarLimitador({ janelaMs, max, agora = () => Date.now() }) {
  const mapa = new Map();

  function recentes(chave) {
    const limite = agora() - janelaMs;
    const lista = (mapa.get(chave) ?? []).filter((t) => t > limite);
    if (lista.length) mapa.set(chave, lista);
    else mapa.delete(chave);
    return lista;
  }

  const varredura = setInterval(() => {
    for (const chave of [...mapa.keys()]) recentes(chave);
  }, 5 * 60_000);
  varredura.unref();

  return {
    contar(chave) {
      if (mapa.size > 10_000 && !mapa.has(chave)) return; // proteção de memória
      const lista = recentes(chave);
      lista.push(agora());
      mapa.set(chave, lista);
    },
    /** Segundos até liberar; 0 se liberado. */
    bloqueado(chave) {
      const lista = recentes(chave);
      if (lista.length < max) return 0;
      return Math.max(1, Math.ceil((lista[0] + janelaMs - agora()) / 1000));
    },
    zerar(chave) {
      mapa.delete(chave);
    },
  };
}

// ---------- Cabeçalhos de segurança ----------
export function cabecalhosSeguranca(prod) {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

  return (req, res, next) => {
    res.set({
      'Content-Security-Policy': csp,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    });
    if (prod) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  };
}

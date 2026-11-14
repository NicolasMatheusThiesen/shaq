// Lê a configuração do ambiente. Nenhum segredo fica no código: tudo vem de variáveis de ambiente.

function lerTrustProxy(valor) {
  if (valor === undefined || valor === '') return false;
  if (valor === 'true') return true;
  if (/^\d+$/.test(valor)) return Number(valor);
  return valor;
}

export function lerConfig(env = process.env) {
  const prod = env.NODE_ENV === 'production';
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Defina DATABASE_URL (veja .env.example).');

  const porta = env.PORT ? Number(env.PORT) : 3000;
  if (!Number.isInteger(porta) || porta < 1 || porta > 65535) throw new Error('PORT inválida.');

  return {
    prod,
    porta,
    databaseUrl,
    dbSsl: env.DB_SSL,                         // 'off' só para bancos em rede privada
    trustProxy: lerTrustProxy(env.TRUST_PROXY), // 1 atrás de Render/Railway/Fly
    appUrl: env.APP_URL || null,               // ex.: https://shaq.onrender.com (fixa a origem aceita)
    vapid: {
      publica: env.VAPID_PUBLIC_KEY || null,
      privada: env.VAPID_PRIVATE_KEY || null,
      assunto: env.VAPID_SUBJECT || null,
    },
  };
}

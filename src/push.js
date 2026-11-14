import { sendNotification, setVapidDetails } from 'web-push';

/**
 * Envio de notificações (Web Push, assinado com a chave VAPID).
 * A chave privada vem só de variável de ambiente e nunca é registrada em log.
 */
export function criarPush({ publica, privada, assunto }) {
  if (!publica || !privada || !assunto) {
    return {
      ativo: false,
      chavePublica: null,
      async enviar() {
        return { ok: false, erro: 'push desativado' };
      },
    };
  }

  setVapidDetails(assunto, publica, privada);

  return {
    ativo: true,
    chavePublica: publica,
    async enviar(sub, payload) {
      try {
        await sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), {
          TTL: 3600,
          urgency: 'normal',
          timeout: 10_000,
        });
        return { ok: true };
      } catch (e) {
        const gone = e.statusCode === 404 || e.statusCode === 410; // inscrição expirada ou removida
        return { ok: false, gone, erro: `falha no envio (${e.statusCode ?? e.code ?? 'erro'})` };
      }
    },
  };
}

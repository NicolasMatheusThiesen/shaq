/** Faz o Express capturar erros de funções assíncronas. */
export const ah = (fn) => (req, res, next) => {
  fn(req, res, next).catch(next);
};

export const erro = (res, status, mensagem) => res.status(status).json({ erro: mensagem });

export const corpoObjeto = (req) =>
  req.body !== null && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};

export const ID = /^\d{1,15}$/;

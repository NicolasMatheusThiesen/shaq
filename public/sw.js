// Service worker: deixa o app abrir mesmo sem rede e recebe as notificações.
// Regra de ouro: NUNCA guarda respostas de /api em cache (dados e sessão não ficam no aparelho).
const CACHE = 'shaq-v1';
const ARQUIVOS = ['/', '/estilo.css', '/app.js', '/manifest.webmanifest', '/icones/icone-192.png', '/icones/apple-touch-icon.png'];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(ARQUIVOS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((chaves) => Promise.all(chaves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  const url = new URL(pedido.url);
  if (pedido.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Rede primeiro (sempre a versão mais nova); sem rede, usa a cópia guardada.
  evento.respondWith(
    fetch(pedido)
      .then((resposta) => {
        if (resposta.ok && ARQUIVOS.includes(url.pathname)) {
          const copia = resposta.clone();
          caches.open(CACHE).then((c) => c.put(pedido, copia));
        }
        return resposta;
      })
      .catch(() => caches.match(pedido).then((guardada) => guardada || caches.match('/'))),
  );
});

self.addEventListener('push', (evento) => {
  let dados = {};
  try {
    dados = evento.data ? evento.data.json() : {};
  } catch {
    dados = {};
  }
  evento.waitUntil(
    self.registration.showNotification(dados.titulo || 'Shaq o Betta', {
      body: dados.corpo || '',
      tag: dados.tag || 'shaq',
      icon: '/icones/icone-192.png',
      badge: '/icones/icone-192.png',
    }),
  );
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((janelas) => {
      for (const janela of janelas) if ('focus' in janela) return janela.focus();
      return self.clients.openWindow('/');
    }),
  );
});

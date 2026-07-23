const cacheName = "dm-financeira-v10";

const arquivos = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json"
];

// Instalação do Service Worker
self.addEventListener("install", evento => {
  // Força o Service Worker novo a se tornar ativo imediatamente
  self.skipWaiting();
  
  evento.waitUntil(  
    caches.open(cacheName)  
      .then(cache => cache.addAll(arquivos))  
  );
});

// Ativação e Limpeza de Caches Antigos (v1, v2, etc.)
self.addEventListener("activate", evento => {
  evento.waitUntil(
    caches.keys().then(chaves => {
      return Promise.all(
        chaves.map(chave => {
          if (chave !== cacheName) {
            return caches.delete(chave); // Deleta caches antigos
          }
        })
      );
    }).then(() => self.clients.claim()) // Assume o controle da página imediatamente
  );
});

// Interceptador de Requisições (offline)
self.addEventListener("fetch", evento => {
  evento.respondWith(  
    caches.match(evento.request)  
      .then(resposta => {  
        return resposta || fetch(evento.request);  
      })  
  );
});

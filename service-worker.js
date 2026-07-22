const cacheName = "dm-financeira-v10";

const arquivos = [
"./",
"./index.html",
"./style.css",
"./app.js"
];

self.addEventListener("install", evento => {

evento.waitUntil(  
    caches.open(cacheName)  
    .then(cache => cache.addAll(arquivos))  
);

});

self.addEventListener("fetch", evento => {

evento.respondWith(  

    caches.match(evento.request)  
    .then(resposta => {  

        return resposta || fetch(evento.request);  

    })  

);

});
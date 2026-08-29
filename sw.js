const CACHE = "ils-v11-final";

const ASSETS = [
  "./",
  "./index.html",
  "./admin.html",
  "./judgments.html",
  "./judgment.html",
  "./advocates.html",
  "./law-guide.html",
  "./ai-assistant.html",
  "./assistance.html",
  "./advocate-register.html",
  "./about.html",
  "./faq.html",
  "./manifest.webmanifest",
  "./assets/ils.css",
  "./assets/ils-core.js?v=11",
  "./assets/pwa.js?v=11"
];

self.addEventListener("install", event => {

  event.waitUntil(
    caches
      .open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );

});

self.addEventListener("activate", event => {

  event.waitUntil(

    caches.keys().then(keys =>
      Promise.all(

        keys
          .filter(key => key !== CACHE)
          .map(key => caches.delete(key))

      )
    ).then(() => self.clients.claim())

  );

});

self.addEventListener("fetch", event => {

  if(event.request.method !== "GET") return;

  event.respondWith(

    fetch(event.request)
      .then(response => {

        const copy = response.clone();

        caches
          .open(CACHE)
          .then(cache => cache.put(event.request, copy));

        return response;

      })
      .catch(() =>
        caches
          .match(event.request)
          .then(response =>
            response || caches.match("./index.html")
          )
      )

  );

});

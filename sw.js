const CACHE = "ils-v13-final";

const STATIC_ASSETS = [
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
  "./assets/ils-core.js?v=12",
  "./assets/pwa.js?v=12"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== CACHE)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {

  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  /* NEVER cache Supabase/API/external requests */
  if (url.origin !== self.location.origin) {
    return;
  }

  /*
    HTML/navigation:
    ALWAYS try network first.
    Old HTML must never permanently win.
  */
  if (
    event.request.mode === "navigate" ||
    event.request.destination === "document"
  ) {

    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match(event.request))
        .then(response =>
          response || caches.match("./index.html")
        )
    );

    return;
  }

  /*
    JS/CSS/static files:
    network first, cache fallback.
  */
  event.respondWith(
    fetch(event.request)
      .then(response => {

        if (response && response.ok) {
          const copy = response.clone();

          caches.open(CACHE)
            .then(cache =>
              cache.put(event.request, copy)
            );
        }

        return response;
      })
      .catch(() =>
        caches.match(event.request)
      )
  );

});

const CACHE_VERSION = "open-stellar-pwa-v1"
const APP_SHELL = [
  "/",
  "/offline",
  "/manifest.webmanifest",
  "/icon.svg",
  "/apple-icon.png",
  "/icon-light-32x32.png",
  "/icon-dark-32x32.png",
  "/bg-city.gif",
  "/bg-data-center.jpg",
  "/bg-comm-hub.jpg",
  "/bg-processing.jpg",
  "/bg-defense.jpg",
  "/bg-research.jpg",
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  const url = new URL(request.url)

  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached

      return fetch(request)
        .then((response) => {
          const contentType = response.headers.get("content-type") || ""
          const shouldCache = response.ok && (contentType.startsWith("image/") || url.pathname === "/" || url.pathname.endsWith(".webmanifest"))

          if (shouldCache) {
            const clone = response.clone()
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone))
          }

          return response
        })
        .catch(() => caches.match("/offline"))
    }),
  )
})

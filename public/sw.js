// Deliberately minimal. This site is live, deadline-driven data (picks,
// scores, gameweek status) — real offline caching of pages or API
// responses would risk silently showing stale picks or scores as if they
// were current, which is worse than no offline support at all. This
// service worker exists only to satisfy PWA installability criteria
// (some browsers require one with a fetch handler present before
// offering the install prompt); every request always goes to the
// network, never a cache.
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', () => {
  // Intentionally a no-op pass-through — see note above.
})

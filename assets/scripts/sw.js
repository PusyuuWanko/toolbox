const saveingPagesPath = [
  "/", 
  "./script.js",          // ← sw.jsと同じ場所
  "../styles/Style.css",  // ← 1つ上に戻ってstyles
  "../documents/appList.json"
];

self.addEventListener("install", function(event) {
  console.log(event);
  event.waitUntil(
    caches.open("saveVar1").then(function(cache) {
      return cache.addAll(saveingPagesPath);
    })
  );
});

self.addEventListener("fetch", function(event) {
  console.log("Fetch event:", event);
  console.log("Fetch event intercepted:", event.request);
  console.log("Fetch event intercepted url:", event.request.url);

  event.respondWith(
    caches.match(event.request).then(function(response) {
      return response || fetch(event.request);
    })
  );
});

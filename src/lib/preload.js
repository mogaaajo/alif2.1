// Warms the browser audio cache by loading upcoming audio files in the background.
const cache = new Map();

export const preloadAudio = (urls = []) => {
  urls.forEach((url) => {
    if (!url || cache.has(url)) return;
    try {
      const a = new Audio();
      a.preload = "auto";
      a.src = url;
      a.load?.();
      cache.set(url, a);
    } catch {
      /* ignore */
    }
  });
  // keep the cache bounded
  if (cache.size > 40) {
    const drop = [...cache.keys()].slice(0, cache.size - 40);
    drop.forEach((k) => cache.delete(k));
  }
};

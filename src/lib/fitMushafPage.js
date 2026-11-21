// Measure actual Arabic shaping and wrapping with strict minimum font floor and per-page caching.
// Enforces minSize = 22px for desktop/tablet and 18px for mobile so the text NEVER collapses or shrinks into tiny unreadable strips.

export const pageSizeCache = new Map();

export function getDeviceFloor() {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
  return {
    isMobile,
    minSize: isMobile ? 18 : 22,
    maxSize: isMobile ? 32 : 46,
  };
}

export function getDefaultFontSize(surface, sizeOffset = 0) {
  const { isMobile, minSize, maxSize } = getDeviceFloor();
  const base = isMobile ? 20 : 26;
  const scaled = base + sizeOffset * (isMobile ? 1.5 : 2.0);
  return Math.min(maxSize, Math.max(minSize, Math.round(scaled)));
}

export function getCachedPageFontSize(page, sizeOffset = 0, isMobile = false) {
  if (typeof window === "undefined") return isMobile ? 20 : 26;
  const widthBucket = Math.round(window.innerWidth / 100) * 100;
  const cacheKey = `${page}_${sizeOffset}_${widthBucket}`;
  if (pageSizeCache.has(cacheKey)) {
    return pageSizeCache.get(cacheKey);
  }
  const minSize = isMobile ? 18 : 22;
  const maxSize = isMobile ? 32 : 46;
  const base = isMobile ? 20 : 26;
  return Math.min(maxSize, Math.max(minSize, Math.round(base + sizeOffset * (isMobile ? 1.5 : 2.0))));
}

export function fitMushafPage(surface, text, sizeOffset = 0, page = null, isInitial = false) {
  if (!surface || !text || !text.textContent.trim()) return 24;

  const { isMobile, minSize, maxSize } = getDeviceFloor();
  const widthBucket = typeof window !== "undefined" ? Math.round(window.innerWidth / 100) * 100 : 800;
  const cacheKey = page ? `${page}_${sizeOffset}_${widthBucket}` : null;

  // 1. If already cached for this page & viewport, apply cached size immediately with zero binary search reflow
  if (cacheKey && pageSizeCache.has(cacheKey)) {
    const cached = pageSizeCache.get(cacheKey);
    text.style.fontSize = `${cached}px`;
    return cached;
  }

  // 2. If initial page turn, apply sensible default instantly without synchronous binary search reflow
  const defaultSize = getDefaultFontSize(surface, sizeOffset);
  if (isInitial) {
    text.style.fontSize = `${defaultSize}px`;
    return defaultSize;
  }

  // 3. Measure container dimensions with protection against collapsed measurements
  const style = getComputedStyle(surface);
  const height = surface.clientHeight - parseFloat(style.paddingTop || 0) - parseFloat(style.paddingBottom || 0) - 2;
  if (height < 150) {
    text.style.fontSize = `${defaultSize}px`;
    return defaultSize;
  }

  const fits = () => {
    const rect = text.getBoundingClientRect();
    return rect.height <= height && text.scrollWidth <= text.clientWidth + 1;
  };

  text.style.textAlign = "justify";
  text.style.textAlignLast = "center";
  text.style.textJustify = "inter-word";
  text.style.wordSpacing = "normal";
  text.style.letterSpacing = "normal";
  text.style.lineHeight = "2.0";

  // Binary search with strict minSize floor (never shrinking below 22px desktop / 18px mobile)
  let low = minSize;
  let high = maxSize;

  for (let i = 0; i < 14; i++) {
    const middle = (low + high) / 2;
    text.style.fontSize = `${middle}px`;
    if (fits()) {
      low = middle;
    } else {
      high = middle;
    }
  }

  // Ensure chosen size is strictly clamped between minSize and maxSize
  const baseSize = low;
  const scaled = baseSize * (1 + sizeOffset * 0.08);
  const chosenSize = Math.round(Math.min(maxSize, Math.max(minSize, scaled)));

  text.style.fontSize = `${chosenSize}px`;

  // Line-height adjustment if it fits
  if (fits()) {
    const maxLeading = Math.min(2.5, Math.max(2.0, height / chosenSize));
    let lLow = 2.0;
    let lHigh = maxLeading;
    for (let j = 0; j < 8; j++) {
      const mid = (lLow + lHigh) / 2;
      text.style.lineHeight = String(mid);
      if (fits()) lLow = mid;
      else lHigh = mid;
    }
    text.style.lineHeight = String(lLow);
  }

  // Cache for instant retrieval on next navigation
  if (cacheKey) {
    pageSizeCache.set(cacheKey, chosenSize);
  }

  return chosenSize;
}

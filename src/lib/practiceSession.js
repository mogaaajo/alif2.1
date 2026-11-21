export const ayahKey = (ayah, fallback) => `${ayah.surahNumber ?? fallback}:${ayah.numberInSurah}`;

export function practiceDetails(ayahs, fallback, scope, assisted = false) {
  return { scope, assisted, ayah_keys: ayahs.map((ayah) => ayahKey(ayah, fallback)),
    page: scope === 'page' ? ayahs[0]?.page : undefined };
}

export function playbackStart(items, surah, ayah) {
  const index = items.findIndex((item) => item.surahNumber === surah && item.numberInSurah === ayah && !item.isBasmala);
  if (index < 0) return 0;
  return index > 0 && items[index - 1].isBasmala && items[index - 1].surahNumber === surah ? index - 1 : index;
}

export const BASMALA_TEXT = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ";

export const needsBasmalaBefore = (surahNumber, ayahNumber) =>
  Number(ayahNumber) === 1 && ![1, 9].includes(Number(surahNumber));

const basmalaPrefixLength = (text = '') => {
  const match = text.match(/^\s*(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+/u);
  if (!match) return 0;
  const words = match.slice(1).map((word) => word.replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/gu, '').replace(/[ٱآأإ]/gu, 'ا'));
  return words.join(' ') === 'بسم الله الرحمن الرحيم' ? match[0].length : 0;
};

export function separateBasmala(data, surahNumber) {
  return { ...data, ayahs: (data.ayahs || []).map((ayah) => {
    if (!needsBasmalaBefore(ayah.surahNumber ?? surahNumber, ayah.numberInSurah)) return ayah;
    const clean = { ...ayah };
    if (typeof ayah.arabic === 'string') clean.arabic = ayah.arabic.slice(basmalaPrefixLength(ayah.arabic));
    if (ayah.segments) {
      let remove = basmalaPrefixLength(ayah.segments.map((segment) => segment.text).join(''));
      clean.segments = ayah.segments.map((segment) => {
        const skip = Math.min(remove, segment.text.length);
        remove -= skip;
        return { ...segment, text: segment.text.slice(skip) };
      }).filter((segment) => segment.text);
    }
    return clean;
  }) };
}

// The Quran API supplies the Basmala separately from most first ayahs. Keep it
// as a queue item so it is heard before the first ayah without becoming ayah 1.
export const appendAyahWithBasmala = (items, {
  ayah,
  surahNumber,
  surahName,
  basmalaAudio,
  page,
}) => {
  if (!ayah?.audio) return;
  const resolvedPage = ayah.page ?? page;
  if (needsBasmalaBefore(surahNumber, ayah.numberInSurah) && basmalaAudio) {
    items.push({
      surahNumber,
      surahName,
      numberInSurah: 0,
      arabic: BASMALA_TEXT,
      audio: basmalaAudio,
      page: resolvedPage,
      isBasmala: true,
    });
  }
  items.push({
    surahNumber,
    surahName,
    numberInSurah: ayah.numberInSurah,
    arabic: ayah.arabic,
    audio: ayah.audio,
    page: resolvedPage,
  });
};

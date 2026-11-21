// Tajweed rule -> color, human label + explanation, based on Quran.com tajweed classes.
export const TAJWEED_RULES = {
  ham_wasl: {
    label: "Hamzat Wasl (silent)",
    color: "#AAAAAA",
    group: "Silent",
    desc: "A connecting hamza. This alif is silent when you join it to the previous word — you only pronounce it if you start reciting from here.",
  },
  laam_shamsiyah: {
    label: "Lām Shamsiyyah (silent)",
    color: "#AAAAAA",
    group: "Silent",
    desc: "The 'lām' of 'al-' is not pronounced. It merges into the following 'sun letter', which is doubled instead.",
  },
  slnt: {
    label: "Silent letter",
    color: "#AAAAAA",
    group: "Silent",
    desc: "This letter is written in the script but is not pronounced.",
  },
  madda_normal: {
    label: "Madd — natural (2)",
    color: "#537FFF",
    group: "Madd",
    desc: "Natural elongation. Stretch this vowel for about 2 counts (ḥarakah).",
  },
  madda_permissible: {
    label: "Madd — permissible",
    color: "#4050C8",
    group: "Madd",
    desc: "Permissible elongation of 2, 4 or 6 counts, occurring when a hamza follows across two words.",
  },
  madda_necessary: {
    label: "Madd — necessary (6)",
    color: "#000EAD",
    group: "Madd",
    desc: "Obligatory 6-count elongation, caused by a sukoon or shaddah appearing right after the madd letter.",
  },
  madda_obligatory: {
    label: "Madd — obligatory (4-5)",
    color: "#2144C1",
    group: "Madd",
    desc: "Connected obligatory elongation of 4–5 counts, when a hamza follows the madd letter within the same word.",
  },
  qalqalah: {
    label: "Qalqalah",
    color: "#DD0008",
    group: "Qalqalah",
    desc: "An echoing 'bounce' on the letters ق ط ب ج د when they carry a sukoon.",
  },
  ikhafa: {
    label: "Ikhfa",
    color: "#9400A8",
    group: "Ikhfa",
    desc: "Partially hide the noon sākinah / tanween with a light nasal sound (ghunnah) before the next letter.",
  },
  ikhafa_shafawi: {
    label: "Ikhfa Shafawi",
    color: "#D500B7",
    group: "Ikhfa",
    desc: "Hide the meem sākinah with a nasal sound when it is followed by the letter ب.",
  },
  iqlab: {
    label: "Iqlab",
    color: "#26BFFD",
    group: "Iqlab",
    desc: "Convert the noon sākinah / tanween into a hidden meem sound when followed by the letter ب.",
  },
  idgham_ghunnah: {
    label: "Idgham w/ Ghunnah",
    color: "#169777",
    group: "Idgham",
    desc: "Merge the noon / tanween into the next letter (ي ن م و) while holding a nasal ghunnah.",
  },
  idgham_wo_ghunnah: {
    label: "Idgham w/o Ghunnah",
    color: "#169200",
    group: "Idgham",
    desc: "Merge the noon / tanween into the next letter (ل or ر) with no nasal sound.",
  },
  idgham_shafawi: {
    label: "Idgham Shafawi",
    color: "#58B800",
    group: "Idgham",
    desc: "Merge a meem sākinah into a following meem, held with a ghunnah.",
  },
  idgham_mutajanisayn: {
    label: "Idgham Mutajānisayn",
    color: "#A1A1A1",
    group: "Idgham",
    desc: "Two letters from the same point of articulation merge together.",
  },
  idgham_mutaqaribayn: {
    label: "Idgham Mutaqāribayn",
    color: "#A1A1A1",
    group: "Idgham",
    desc: "Two letters from close points of articulation merge together.",
  },
  ghunnah: {
    label: "Ghunnah",
    color: "#FF7E1E",
    group: "Ghunnah",
    desc: "A nasal humming sound held for about 2 counts on a doubled ن or م (with shaddah).",
  },
};

export const TAJWEED_LEGEND = [
  { group: "Madd", color: "#537FFF" },
  { group: "Ghunnah", color: "#FF7E1E" },
  { group: "Qalqalah", color: "#DD0008" },
  { group: "Ikhfa", color: "#9400A8" },
  { group: "Idgham", color: "#169777" },
  { group: "Iqlab", color: "#26BFFD" },
  { group: "Silent", color: "#AAAAAA" },
];

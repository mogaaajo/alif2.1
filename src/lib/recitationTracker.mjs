// This tracks transcript words, not pronunciation or tajweed accuracy.
export const normalizeAr = (s = "") => s
  .normalize("NFKC")
  .replace(/[\u064B-\u065F\u0670\u0640\u06D6-\u06ED]/g, "")
  .replace(/[\u0622\u0623\u0625\u0671]/g, "ا")
  .replace(/[^\u0621-\u063A\u0641-\u064A\s]/g, "")
  .trim();

export const initialPosition = (revealed = 0) => ({ cursor: revealed, revealed, heard: "" });

export function followTranscript(words, position, transcript) {
  const tokens = normalizeAr(transcript).split(/\s+/).filter(Boolean);
  const reference = words.map((w) => normalizeAr(w.text));
  let { cursor, revealed } = position;
  let heard = "";
  for (let i = 0; i < tokens.length; i++) {
    // A two-word anchor allows a restart within this ayah or the preceding ayah.
    // Never jump forward over an unrecited word to find a match.
    const ayah = words[Math.min(cursor, words.length - 1)]?.ai ?? 0;
    let anchor = -1;
    let longest = 1;
    let forwardLength = 0;
    while (i + forwardLength < tokens.length && cursor + forwardLength < reference.length &&
      tokens[i + forwardLength] === reference[cursor + forwardLength]) forwardLength++;
    longest = Math.max(longest, forwardLength);
    for (let j = 0; j < cursor; j++) {
      if (words[j].ai < ayah - 1) continue;
      let length = 0;
      while (i + length < tokens.length && j + length < reference.length &&
        tokens[i + length] === reference[j + length]) length++;
      if (length > longest) { longest = length; anchor = j; }
    }
    if (anchor >= 0) cursor = anchor;
    if (tokens[i] === reference[cursor]) {
      cursor++;
      revealed = Math.max(revealed, cursor);
      heard = "";
    } else {
      heard = tokens[i];
    }
  }
  return { cursor, revealed, heard };
}

// Recompute cumulative results from this recognition session's starting point.
// This also handles repeat anchors split between result segments. Interim
// hypotheses never change the committed reveal position.
export function createRecognitionSession(words, position) {
  const baseline = { ...position };
  return (results) => {
    const entries = Array.from(results);
    const finalText = entries.filter((r) => r.isFinal).map((r) => r[0].transcript).join(" ");
    const allText = entries.map((r) => r[0].transcript).join(" ");
    return {
      committed: followTranscript(words, baseline, finalText),
      preview: followTranscript(words, baseline, allText),
    };
  };
}

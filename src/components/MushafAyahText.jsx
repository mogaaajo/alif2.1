import React from 'react';
import { TAJWEED_RULES } from '@/lib/tajweed';

// Count characters excluding Arabic diacritics / tashkeel
const getCleanLetterCount = (wordArr) => {
  const full = wordArr.map((p) => p.text).join('');
  const clean = full.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '');
  return Math.max(2, Math.min(8, clean.length || 3));
};

// Keep a complete Arabic word together, including all of its colored segments.
// The ayah marker belongs with the last word, not on its own trailing line.
export default function MushafAyahText({ text, segments, hidden, marker, onRule }) {
  const words = [[]];
  for (const segment of segments || [{ text }]) {
    for (const part of segment.text.split(/(\s+)/u)) {
      if (!part) continue;
      if (/^\s+$/u.test(part)) {
        if (words[words.length - 1].length) words.push([]);
      } else words[words.length - 1].push({ text: part, rule: segment.rule });
    }
  }
  const filled = words.filter((word) => word.length);

  return filled.map((word, i) => {
    const isLastWord = i === filled.length - 1;
    const count = getCleanLetterCount(word);

    return (
      <React.Fragment key={i}>
        {i > 0 && ' '}
        {hidden ? (
          <span className="relative inline-block align-baseline" style={{ whiteSpace: 'nowrap' }}>
            {/* Invisible original Arabic text preserves exact layout, line height, and line breaks */}
            <span className="opacity-0 select-none pointer-events-none" aria-hidden="true">
              {word.map((part) => part.text).join('')}
            </span>
            {/* Subtle placeholder dots matching word length */}
            <span
              aria-hidden="true"
              className="absolute inset-0 flex items-center justify-center pointer-events-none select-none text-current opacity-30 tracking-[0.22em] text-[9px] sm:text-[11px] leading-none"
            >
              {'•'.repeat(count)}
            </span>
            {isLastWord && marker}
          </span>
        ) : (
          <span style={{ whiteSpace: 'nowrap' }}>
            {word.map((part, j) => (
              <span
                key={j}
                style={TAJWEED_RULES[part.rule] ? { color: TAJWEED_RULES[part.rule].color } : undefined}
                onClick={(event) => {
                  if (TAJWEED_RULES[part.rule]) {
                    event.stopPropagation();
                    onRule(part.rule);
                  }
                }}
              >
                {part.text}
              </span>
            ))}
            {isLastWord && marker}
          </span>
        )}
      </React.Fragment>
    );
  });
}

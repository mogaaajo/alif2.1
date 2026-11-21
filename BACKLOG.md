# User testing and deferred improvements

## Memory-recitation tracker: user acceptance

The user completed Al-Ikhlas in the local preview and reported that recognition now continues successfully, including after pauses. Their screenshots show progression through the surah and the completion screen. This validates that scenario; other surahs and devices still need testing.

## Deferred at the user's request

- Reveal matched words progressively while the user speaks, without requiring a pause for a finalized transcript. Current permanent green reveal waits for final recognition results and can update an entire phrase at once.
- Use interim recognition for a provisional word-by-word display while preserving confirmed progress when hypotheses change.
- Improve the moving recitation highlight, including when repeating earlier words.
- Investigate letter-level alignment separately. Current transcript matching does not establish letter-level pronunciation accuracy.
- Replace misleading yellow/red timed hints with feedback that clearly distinguishes a hint, provisional recognition, and confirmed word matching. A red hint currently does not prove that the user pronounced a letter incorrectly.
- In the full-page Memorize view, show the same live word-level progress as the `3 / 19 words` counter. Today the counter updates from finalized speech recognition, so the page can look unchanged until recognition catches up after a pause. Add provisional per-word highlighting from interim results, then promote it to green only when confirmed.

Do not prioritize these refinements ahead of the remaining core reliability repairs unless the user changes direction. The user explicitly asked to address them later.

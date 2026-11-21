# Memory recitation tracker repair

Recognition sessions now start at the last confirmed position instead of comparing every new session against the beginning of the surah. Revealed progress and the current recitation position are separate. Repeating at least two matching words within the current or previous ayah can relocate the cursor without hiding revealed words. Interim transcripts are provisional; permanent reveal waits for final speech results. This is transcript alignment, not letter-level pronunciation or tajweed assessment.

The screen reports reconnecting, cancels pending restarts when stopped, ignores callbacks from an old session, and rebases the tracker after manual reveal/reset. Consecutive disconnects without results stop after bounded retries and offer a tap to reconnect.

## Automated verification

From `frontend`, run `npm run test:recitation` (Node 18+), then `npm run build`.

The regression suite covers restart continuity, pauses, self-correction, backtracking, skipped words, revised interim results, repeated phrases, manual reveal, and React lifecycle behavior with a simulated speech recognizer.

Local build validation used npm with legacy peer resolution because the repository has no tracked dependency lockfile. That installation required a local, unsaved `ajv@8.17.1` to resolve an AJV peer mismatch. It does not verify the repository's Yarn resolution overrides. Unrelated hook warnings remain in PlaybackContext, ReciteAlong, and TeacherClass.

## Device acceptance checks

- Recite Al-Ikhlas continuously through the third and fourth ayahs.
- Pause, then resume at the next expected word.
- Repeat two or more words from the current ayah; then repeat the preceding ayah and continue. Already revealed words should stay visible.
- Say a wrong word, then correct it. Progress should resume when the expected transcript word is recognized.
- Stop while reconnecting; verify the microphone does not restart by itself.
- Use Reveal word or Reset while listening; continue from the new position.
- Deny microphone access, then verify that manual controls remain usable.

Real microphone recognition and Arabic transcription quality still require testing on the target phone/browser. Incorrect transcription can still stall exact normalized word matching. Subword/letter tracking and persistent storage are not part of this repair.

This change has not been deployed. Bismillah, playback queues, scoring thresholds, full mushaf consistency, and memorization chunks remain separate work.

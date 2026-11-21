# Playback repair

Regression tests reproduced three defects in the previous player:

- A rejected play promise from an old source could pause the newly selected ayah.
- Comparing an absolute DOM source with a relative API URL reassigned the source during pause/resume.
- Clearing the queue removed the audio element, while the audio-effects graph remained connected to that removed element.

The player now ignores obsolete play promises, compares the source attribute consistently, and retains its audio element across queue changes. Playback failures display a retry message. Repeat counters reset for a replacement queue.

The reader also rendered two Bismillah headings in mushaf mode. The outer heading is now limited to list mode. Al-Fatiha uses the Bismillah already present in its ayah text; no additional heading is inserted in the reader, mushaf, or memory views. Surah 9 retains no introductory heading.

Validation: `npm run test:playback` covers three-surah queue advancement, obsolete promise rejection, player reopening, pause/resume, and visible failure/retry behavior. All five pass. The 17 memory-recitation regression tests also pass. The production build succeeds with existing unrelated hook warnings.

This does not establish which reciter recordings contain an introductory Bismillah. A reciter/surah example is still needed to investigate the reported duplicate or missing spoken Bismillah. No extra audio is inserted speculatively.

Local preview: open `/surah/112`, choose Next N surahs with N=3, and press Play. Verify automatic progression through 112, 113, and 114; pause/resume in the middle of an ayah; close/reopen the player. These changes are local and have not been pushed or deployed.

Browser verification: the local preview with Alafasy automatically progressed from Al-Ikhlas into Al-Falaq and then An-Nas. The media element was verified playing during Al-Falaq, and paused successfully during An-Nas ayah 4. The remainder of An-Nas was not played to completion in this manual test; end-of-queue stopping is covered by the automated test.

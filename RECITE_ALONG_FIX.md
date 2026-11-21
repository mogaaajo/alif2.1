# Recite Along corrective replay

Below the adjustable pass mark, the next selected reciter repeats the user's ayah, then the normal turn sequence resumes at the following ayah. The correction does not consume a scheduled turn. If there are no reciter slots, the default reciter supplies the correction. At or above the pass mark, the session advances without a correction.

Feedback is only displayed in the final summary. The session must wait for the score before choosing corrective versus normal playback; a neutral transition is shown, and the API request has a 30-second timeout. This is not a zero-latency solution. Unavailable feedback is excluded from pass/fail counts. A legacy backend failure response with score zero is recognized as unavailable.

Recordings capture their own ayah, media type, and chunks, rather than sharing mutable buffers. Leaving the session cancels the request and ignores late results. Manual and hands-free modes are retained; long recordings are no longer automatically cut off at 30 seconds. Hands-free still uses the existing 1.5-second silence detector and may end on a pause within an ayah; content-aware endpoint detection remains future work. Upcoming normal and correction audio are preloaded.

The local backend source now returns HTTP 502 on scoring exceptions instead of saving a zero score. This backend change is not deployed; the local preview uses the existing Emergent service and includes compatibility handling for its legacy response. The underlying transcript-based scoring model has not been replaced or validated as a pronunciation/tajweed assessment.

## Testing

Run `npm run test:along` from frontend. Simulated recording tests cover low score correction, threshold equality, failed requests, actual recording MIME type, hands-free start, legacy zero-on-error responses, and cancellation. Real microphone and live scoring latency require user testing.

Open `/surah/112/along`, leave Reciter / You selected, choose manual first, then Start. Finish the user ayah and verify that a below-threshold score leads to that ayah being repeated before the following one. Try hands-free afterward. Scores appear after the final turn. Test uploads go to the existing Emergent scoring service and may update its normal progress logs.

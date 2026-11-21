/**
 * Fail-closed recitation assessment provenance gate (ALIF-001A).
 *
 * Automated Quran recitation scoring is disabled until a validated speech and
 * Tajweed evaluation engine is implemented and explicitly authorized.
 *
 * While AUTOMATED_ASSESSMENT_ENABLED is false, no numeric accuracy score from
 * any backend response (including older or externally hosted deployments) may
 * be treated as a verified assessment.
 */
export const AUTOMATED_ASSESSMENT_ENABLED = false;

export const ASSESSMENT_UNAVAILABLE_SUMMARY =
  "Automated recitation assessment is currently unavailable.";

const isValidScoreNumber = (value) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 100;

/**
 * Returns true only when automated assessment is enabled AND the payload carries
 * explicit server-side verification provenance and a valid numeric score.
 */
export function isVerifiedAssessment(payload) {
  if (!AUTOMATED_ASSESSMENT_ENABLED) return false;
  if (!payload || typeof payload !== "object") return false;
  if (payload.available !== true) return false;
  if (payload.score_verified !== true) return false;
  return isValidScoreNumber(payload.score);
}

/**
 * Extracts a verified numeric score (0..100) from a payload field, failing
 * closed to null whenever automated assessment is disabled or provenance is
 * absent/invalid.
 */
export function getVerifiedScore(payload, field = "score") {
  if (!AUTOMATED_ASSESSMENT_ENABLED) return null;
  if (!payload || typeof payload !== "object") return null;
  if (payload.available === false) return null;
  if (payload.score_verified !== true) return null;
  const value = payload[field];
  return isValidScoreNumber(value) ? value : null;
}

/**
 * Extracts a verified per-surah best score from a progress payload, failing
 * closed to null when automated assessment is disabled or unverified.
 */
export function getVerifiedSurahScore(progress, surahNumber) {
  if (!AUTOMATED_ASSESSMENT_ENABLED) return null;
  if (!progress || typeof progress !== "object") return null;
  if (progress.score_verified !== true) return null;
  const map = progress.surah_best;
  if (!map || typeof map !== "object") return null;
  const raw = map[surahNumber] ?? map[String(surahNumber)];
  return isValidScoreNumber(raw) ? raw : null;
}

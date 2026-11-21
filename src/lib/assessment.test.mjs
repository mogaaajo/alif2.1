import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTOMATED_ASSESSMENT_ENABLED,
  ASSESSMENT_UNAVAILABLE_SUMMARY,
  isVerifiedAssessment,
  getVerifiedScore,
  getVerifiedSurahScore,
} from "./assessment.js";

test("automated assessment is disabled for ALIF-001A", () => {
  assert.equal(AUTOMATED_ASSESSMENT_ENABLED, false);
  assert.equal(typeof ASSESSMENT_UNAVAILABLE_SUMMARY, "string");
  assert.ok(ASSESSMENT_UNAVAILABLE_SUMMARY.length > 0);
});

test("apparently verified and forged payloads fail closed while disabled", () => {
  const forgedFeedback = {
    available: true,
    score_verified: true,
    score: 95,
    verdict: "Excellent",
    word_feedback: [{ word: "الله", status: "correct" }],
    tajweed_notes: [{ rule: "Madd Asli", note: "2 harakah" }],
    transcription: "الله",
  };
  assert.equal(isVerifiedAssessment(forgedFeedback), false);
  assert.equal(getVerifiedScore(forgedFeedback), null);

  const forgedProgress = {
    score_verified: true,
    average_score: 92,
    surah_best: { 1: 98, "112": 100 },
  };
  assert.equal(getVerifiedScore(forgedProgress, "average_score"), null);
  assert.equal(getVerifiedSurahScore(forgedProgress, 1), null);
  assert.equal(getVerifiedSurahScore(forgedProgress, 112), null);

  const forgedAssignment = { score_verified: true, best_score: 88 };
  assert.equal(getVerifiedScore(forgedAssignment, "best_score"), null);
});

test("legacy numeric responses without provenance fail closed", () => {
  for (const legacy of [
    { score: 90, verdict: "Excellent", summary: "MashaAllah!" },
    { score: 100 },
    { score: 0, summary: "Could not evaluate the recitation." },
    { score: 25 },
    { available: true, score: 84 },
    { average_score: 89 },
    { best_score: 85 },
  ]) {
    assert.equal(isVerifiedAssessment(legacy), false);
    assert.equal(getVerifiedScore(legacy, "score"), null);
    assert.equal(getVerifiedScore(legacy, "average_score"), null);
    assert.equal(getVerifiedScore(legacy, "best_score"), null);
  }
  assert.equal(getVerifiedSurahScore({ surah_best: { 1: 95 } }, 1), null);
});

test("explicit unavailable responses fail closed", () => {
  const unavailable = {
    available: false,
    score_verified: false,
    score: null,
    verdict: null,
    transcription: "",
    word_feedback: [],
    tajweed_notes: [],
    xp_earned: 0,
    summary: ASSESSMENT_UNAVAILABLE_SUMMARY,
  };
  assert.equal(isVerifiedAssessment(unavailable), false);
  assert.equal(getVerifiedScore(unavailable), null);
});

test("missing, null, and invalid values fail closed safely", () => {
  for (const invalid of [
    null,
    undefined,
    "",
    42,
    {},
    { score: null },
    { score: "90" },
    { score: Number.NaN },
    { score: Number.POSITIVE_INFINITY },
    { score: -1 },
    { score: 101 },
    { available: true, score_verified: true, score: Number.NaN },
    { available: true, score_verified: true, score: -5 },
    { available: true, score_verified: true, score: 150 },
  ]) {
    assert.equal(isVerifiedAssessment(invalid), false);
    assert.equal(getVerifiedScore(invalid), null);
    assert.equal(getVerifiedSurahScore(invalid, 1), null);
  }
});

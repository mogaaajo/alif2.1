import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTOMATED_ASSESSMENT_ENABLED,
  ASSESSMENT_UNAVAILABLE_SUMMARY,
  isVerifiedAssessment,
  getVerifiedScore,
  getVerifiedSurahScore,
} from "./assessment.js";
import { ayahKey, practiceDetails, playbackStart } from "./practiceSession.js";

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

test("ayahKey formats exact surah:ayah identity and never emits bare ayah numbers", () => {
  assert.equal(ayahKey({ surahNumber: 112, numberInSurah: 1 }, 1), "112:1");
  assert.equal(ayahKey({ numberInSurah: 4 }, 112), "112:4");
  assert.equal(ayahKey({ surahNumber: 113, numberInSurah: 1 }, 112), "113:1");
  assert.match(ayahKey({ surahNumber: 2, numberInSurah: 255 }, 2), /^\d+:\d+$/);
});

test("practiceDetails preserves cross-surah Mushaf page ayah_keys and scope metadata", () => {
  const page604Ayahs = [
    { surahNumber: 112, numberInSurah: 4, page: 604 },
    { surahNumber: 113, numberInSurah: 1, page: 604 },
    { surahNumber: 114, numberInSurah: 1, page: 604 },
  ];
  const pageDetails = practiceDetails(page604Ayahs, 112, "page", false);
  assert.deepEqual(pageDetails, {
    scope: "page",
    assisted: false,
    ayah_keys: ["112:4", "113:1", "114:1"],
    page: 604,
  });

  const surahDetails = practiceDetails(
    [{ numberInSurah: 1 }, { numberInSurah: 2 }],
    112,
    "surah",
    true
  );
  assert.deepEqual(surahDetails, {
    scope: "surah",
    assisted: true,
    ayah_keys: ["112:1", "112:2"],
    page: undefined,
  });
});

test("playbackStart selects preceding basmala only for matching surah", () => {
  const items = [
    { surahNumber: 112, numberInSurah: 4, isBasmala: false },
    { surahNumber: 113, numberInSurah: 0, isBasmala: true },
    { surahNumber: 113, numberInSurah: 1, isBasmala: false },
    { surahNumber: 113, numberInSurah: 2, isBasmala: false },
  ];
  assert.equal(playbackStart(items, 113, 1), 1);
  assert.equal(playbackStart(items, 113, 2), 3);
  assert.equal(playbackStart(items, 112, 4), 0);
  assert.equal(playbackStart(items, 114, 1), 0);
});

test("Dashboard, Homework, and GroupRoom payload shapes fail closed", () => {
  const dashboardProgress = {
    score_verified: true,
    average_score: 94,
    surah_best: { 112: 97, "113": 91 },
    recent: [
      { kind: "recite_practice", surah_number: 112, ayah_keys: ["112:1"], xp: 10, score: null, score_verified: false },
      { kind: "recite_practice", surah_number: 112, ayah_keys: ["112:2"], xp: 10, score: 96, score_verified: true },
    ],
  };
  assert.equal(getVerifiedScore(dashboardProgress, "average_score"), null);
  assert.equal(getVerifiedSurahScore(dashboardProgress, 112), null);
  assert.equal(getVerifiedSurahScore(dashboardProgress, 113), null);
  assert.equal(getVerifiedScore(dashboardProgress.recent[0], "score"), null);
  assert.equal(getVerifiedScore(dashboardProgress.recent[1], "score"), null);

  const homeworkLegacy = { best_score: 85, legacy_best_score: 85 };
  const homeworkForged = { best_score: 92, score_verified: true, available: true };
  assert.equal(getVerifiedScore(homeworkLegacy, "best_score"), null);
  assert.equal(getVerifiedScore(homeworkForged, "best_score"), null);

  const groupRoom = {
    last_turn: { name: "Ali", ayah: 1, score: 95, verdict: "Excellent", score_verified: true },
    results: [
      { name: "Ali", ayah: 1, score: 95, score_verified: true },
      { name: "Fatima", ayah: 2, score: 88 },
    ],
  };
  assert.equal(getVerifiedScore(groupRoom.last_turn), null);
  assert.equal(isVerifiedAssessment(groupRoom.last_turn), false);
  for (const entry of groupRoom.results) {
    assert.equal(getVerifiedScore(entry), null);
  }
});


import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import {
  validateGroupPracticeTurn,
  commitPracticeActivity,
  makeGroupTurnCreditKey,
  SURAH_AYAH_COUNTS,
  getSurahAyahCount,
  parseValidSurahNumber,
  resolveRoomTotalAyahs,
  advanceGroupRoomTurn,
} from "./groupTurnGuard.mjs";

const makeRoom = (overrides = {}) => ({
  instance_id: "room-inst-1",
  code: "ABCDE",
  host_device: "dev-a",
  surah_number: 112,
  surah_name: "Al-Ikhlas",
  participants: [
    { device_id: "dev-a", name: "Amina" },
    { device_id: "dev-b", name: "Bilal" },
  ],
  status: "active",
  ayah_index: 0,
  turn_index: 0,
  ...overrides,
});

const makeGroupPayload = (overrides = {}) => ({
  user_id: "user-a",
  kind: "group_recitation",
  room_code: "ABCDE",
  device_id: "dev-a",
  turn_index: 0,
  ayah_index: 0,
  surah_number: 112,
  surah_name: "Al-Ikhlas",
  ayah_number: 1,
  ayah_keys: ["112:1"],
  client_event_id: "ev-1",
  ...overrides,
});

const makeHarness = (room = makeRoom()) => {
  const rooms = new Map();
  if (room) rooms.set(room.code, room);
  const practiceLogs = [];
  const creditedGroupTurns = new Set();
  let seq = 0;
  const commit = (activity, options = {}) =>
    commitPracticeActivity({
      activity,
      practiceLogs,
      rooms,
      creditedGroupTurns,
      maxAyahCount: options.maxAyahCount,
      persistLogs: options.persistLogs ?? (() => true),
      createId: () => `log-${++seq}`,
      nowIso: () => "2026-11-21T12:00:00.000Z",
    });
  return { rooms, practiceLogs, creditedGroupTurns, commit };
};

test("Test A — stale-turn rejection after authoritative room advances", () => {
  const room = makeRoom();
  const { practiceLogs, creditedGroupTurns, commit } = makeHarness(room);

  // Participant A captures attempt while owning turn 0, ayah 0 (112:1)
  const staleAttempt = makeGroupPayload({ client_event_id: "ev-stale-a" });

  // Authoritative room advances to Participant B before A's request arrives
  room.turn_index = 1;
  room.ayah_index = 1;

  const res = commit(staleAttempt);
  assert.equal(res.ok, false);
  assert.equal(res.status, 403);
  assert.equal(res.body.xp_earned, 0);
  assert.equal(practiceLogs.length, 0);
  assert.equal(creditedGroupTurns.size, 0);

  // Even when turn wraps back to Participant A at turn 2, stale turn 0 is rejected (409)
  room.turn_index = 2;
  room.ayah_index = 2;
  const staleWrap = commit(staleAttempt);
  assert.equal(staleWrap.ok, false);
  assert.equal(staleWrap.status, 409);
  assert.equal(staleWrap.body.xp_earned, 0);
  assert.equal(practiceLogs.length, 0);
});

test("Test B — valid turn commits once with score_verified false and null score", () => {
  const { practiceLogs, creditedGroupTurns, commit } = makeHarness();

  const res = commit(makeGroupPayload({ client_event_id: "ev-valid-1" }), {
    maxAyahCount: 4,
  });
  assert.equal(res.ok, true);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { xp_earned: 10 });
  assert.equal(practiceLogs.length, 1);
  assert.equal(practiceLogs[0].score, null);
  assert.equal(practiceLogs[0].score_verified, false);
  assert.deepEqual(practiceLogs[0].ayah_keys, ["112:1"]);
  assert.equal(creditedGroupTurns.size, 1);
});

test("Test C — duplicate submission on same turn with different client_event_id earns 0 extra XP", () => {
  const { practiceLogs, creditedGroupTurns, commit } = makeHarness();

  const first = commit(makeGroupPayload({ client_event_id: "ev-tab-1" }));
  assert.equal(first.status, 200);
  assert.deepEqual(first.body, { xp_earned: 10 });

  const second = commit(makeGroupPayload({ client_event_id: "ev-tab-2" }));
  assert.equal(second.ok, true);
  assert.equal(second.status, 200);
  assert.deepEqual(second.body, { xp_earned: 0, duplicate: true });
  assert.equal(practiceLogs.length, 1);
  assert.equal(creditedGroupTurns.size, 1);
});

test("Test D — post-advance retry of committed client_event_id returns duplicate with 0 XP", () => {
  const room = makeRoom();
  const { practiceLogs, commit } = makeHarness(room);

  const attempt = makeGroupPayload({ client_event_id: "ev-retry-after-advance" });
  const first = commit(attempt);
  assert.deepEqual(first.body, { xp_earned: 10 });

  // Room advances to Participant B
  room.turn_index = 1;
  room.ayah_index = 1;

  // Network retries exact same client_event_id after turn moved on
  const retry = commit(attempt);
  assert.equal(retry.ok, true);
  assert.equal(retry.status, 200);
  assert.deepEqual(retry.body, { xp_earned: 0, duplicate: true });
  assert.equal(practiceLogs.length, 1);
});

test("Test E — legitimate repeated practice on a genuinely new turn for same participant", () => {
  const room = makeRoom();
  const { practiceLogs, commit } = makeHarness(room);

  // Turn 0 (Amina, 112:1)
  const first = commit(makeGroupPayload({ client_event_id: "ev-a-turn-0" }));
  assert.deepEqual(first.body, { xp_earned: 10 });

  // Advance to Turn 1 (Bilal, 112:2), then Turn 2 (Amina, 112:3)
  room.turn_index = 2;
  room.ayah_index = 2;

  const laterTurn = commit(
    makeGroupPayload({
      turn_index: 2,
      ayah_index: 2,
      ayah_number: 3,
      ayah_keys: ["112:3"],
      client_event_id: "ev-a-turn-2",
    })
  );
  assert.equal(laterTurn.ok, true);
  assert.equal(laterTurn.status, 200);
  assert.deepEqual(laterTurn.body, { xp_earned: 10 });
  assert.equal(practiceLogs.length, 2);
});

test("Test F — invalid room conditions, wrong ayah, forged ayah_keys, and malformed metadata", () => {
  // Missing room -> 404
  {
    const { commit, practiceLogs } = makeHarness(null);
    const res = commit(makeGroupPayload());
    assert.equal(res.status, 404);
    assert.equal(res.body.xp_earned, 0);
    assert.equal(practiceLogs.length, 0);
  }

  // Inactive (lobby) room -> 409
  {
    const { commit, practiceLogs } = makeHarness(makeRoom({ status: "lobby" }));
    const res = commit(makeGroupPayload());
    assert.equal(res.status, 409);
    assert.equal(res.body.xp_earned, 0);
    assert.equal(practiceLogs.length, 0);
  }

  // Finished room -> 409
  {
    const { commit, practiceLogs } = makeHarness(makeRoom({ status: "finished" }));
    const res = commit(makeGroupPayload());
    assert.equal(res.status, 409);
    assert.equal(res.body.xp_earned, 0);
    assert.equal(practiceLogs.length, 0);
  }

  // Nonparticipant -> 403
  {
    const { commit, practiceLogs } = makeHarness();
    const res = commit(makeGroupPayload({ device_id: "intruder-dev" }));
    assert.equal(res.status, 403);
    assert.equal(res.body.xp_earned, 0);
    assert.equal(practiceLogs.length, 0);
  }

  // Wrong turn owner (member B submitting on A's turn) -> 403
  {
    const { commit, practiceLogs } = makeHarness();
    const res = commit(makeGroupPayload({ device_id: "dev-b" }));
    assert.equal(res.status, 403);
    assert.equal(res.body.xp_earned, 0);
    assert.equal(practiceLogs.length, 0);
  }

  // Wrong turn index -> 409
  {
    const { commit, practiceLogs } = makeHarness();
    const res = commit(makeGroupPayload({ turn_index: 2 }));
    assert.equal(res.status, 409);
    assert.equal(res.body.xp_earned, 0);
    assert.equal(practiceLogs.length, 0);
  }

  // Wrong ayah index -> 409
  {
    const { commit, practiceLogs } = makeHarness();
    const res = commit(makeGroupPayload({ ayah_index: 1, ayah_number: 2, ayah_keys: ["112:2"] }));
    assert.equal(res.status, 409);
    assert.equal(res.body.xp_earned, 0);
    assert.equal(practiceLogs.length, 0);
  }

  // Wrong surah -> 409
  {
    const { commit, practiceLogs } = makeHarness();
    const res = commit(makeGroupPayload({ surah_number: 113, ayah_keys: ["113:1"] }));
    assert.equal(res.status, 409);
    assert.equal(res.body.xp_earned, 0);
    assert.equal(practiceLogs.length, 0);
  }

  // Wrong ayah number (room at 112:1, request claims 112:4) -> 409
  {
    const { commit, practiceLogs } = makeHarness();
    const res = commit(makeGroupPayload({ ayah_number: 4, ayah_keys: ["112:4"] }));
    assert.equal(res.status, 409);
    assert.equal(res.body.xp_earned, 0);
    assert.equal(practiceLogs.length, 0);
  }

  // Forged ayah_keys mismatch -> 409
  {
    const { commit, practiceLogs } = makeHarness();
    const res = commit(makeGroupPayload({ ayah_number: 1, ayah_keys: ["112:4"] }));
    assert.equal(res.status, 409);
    assert.equal(res.body.xp_earned, 0);
    assert.equal(practiceLogs.length, 0);
  }

  // Exceeds cached Quran surah ayah boundary (Surah 112 has 4 ayahs, ayah_index 4 => ayah 5) -> 409
  {
    const { commit, practiceLogs } = makeHarness(
      makeRoom({ turn_index: 4, ayah_index: 4 })
    );
    const res = commit(
      makeGroupPayload({ turn_index: 4, ayah_index: 4, ayah_number: 5, ayah_keys: ["112:5"] }),
      { maxAyahCount: 4 }
    );
    assert.equal(res.status, 409);
    assert.equal(res.body.xp_earned, 0);
    assert.equal(practiceLogs.length, 0);
  }

  // Malformed request metadata -> 400
  const malformedCases = [
    { room_code: "" },
    { room_code: undefined },
    { device_id: "" },
    { turn_index: -1 },
    { turn_index: "0" },
    { ayah_index: 1.5 },
    { surah_number: 0 },
    { surah_number: 115 },
    { ayah_number: 0 },
    { ayah_keys: [] },
    { ayah_keys: ["112:1", "112:2"] },
    { ayah_keys: "112:1" },
  ];
  for (const bad of malformedCases) {
    const { commit, practiceLogs } = makeHarness();
    const res = commit(makeGroupPayload(bad));
    assert.equal(res.status, 400, `Expected 400 for malformed payload ${JSON.stringify(bad)}`);
    assert.equal(res.body.xp_earned, 0);
    assert.equal(practiceLogs.length, 0);
  }
});

test("Test G — non-group practice modes remain unaffected and do not require room metadata", () => {
  const { commit, practiceLogs } = makeHarness(null);

  const focus1 = commit({
    user_id: "user-focus",
    kind: "recite_practice",
    surah_number: 112,
    surah_name: "Al-Ikhlas",
    ayah_number: 1,
    ayah_keys: ["112:1"],
    client_event_id: "focus-1",
  });
  assert.equal(focus1.status, 200);
  assert.deepEqual(focus1.body, { xp_earned: 10 });

  const focus2 = commit({
    user_id: "user-focus",
    kind: "recite_practice",
    surah_number: 112,
    surah_name: "Al-Ikhlas",
    ayah_number: 1,
    ayah_keys: ["112:1"],
    client_event_id: "focus-2",
  });
  assert.equal(focus2.status, 200);
  assert.deepEqual(focus2.body, { xp_earned: 10 });

  const memorize = commit({
    user_id: "user-focus",
    kind: "memorize",
    surah_number: 112,
    ayah_keys: ["112:1", "112:2"],
    client_event_id: "mem-1",
  });
  assert.equal(memorize.status, 200);
  assert.deepEqual(memorize.body, { xp_earned: 25 });

  const along = commit({
    user_id: "user-focus",
    kind: "recite_along",
    surah_number: 112,
    ayah_keys: ["112:1"],
    client_event_id: "along-1",
  });
  assert.equal(along.status, 200);
  assert.deepEqual(along.body, { xp_earned: 15 });
  assert.equal(practiceLogs.length, 4);
});

test("Test H — persistence failure rolls back cleanly and room-code reuse does not inherit credit", () => {
  // 1. Persistence failure rolls back in-memory log & does NOT mark turn credited
  {
    const { practiceLogs, creditedGroupTurns, commit } = makeHarness();
    const attempt = makeGroupPayload({ client_event_id: "ev-disk-fail" });

    const failed = commit(attempt, { persistLogs: () => false });
    assert.equal(failed.ok, false);
    assert.equal(failed.status, 500);
    assert.equal(failed.body.xp_earned, 0);
    assert.equal(practiceLogs.length, 0);
    assert.equal(creditedGroupTurns.size, 0);

    // Once persistence recovers, the same legitimate turn can still succeed
    const recovered = commit(attempt, { persistLogs: () => true });
    assert.equal(recovered.ok, true);
    assert.equal(recovered.status, 200);
    assert.deepEqual(recovered.body, { xp_earned: 10 });
    assert.equal(practiceLogs.length, 1);
    assert.equal(creditedGroupTurns.size, 1);
  }

  // 2. Newly created room reusing the same code has distinct instance_id and does NOT inherit credit
  {
    const room1 = makeRoom({ instance_id: "inst-old", code: "REUSE" });
    const { rooms, creditedGroupTurns, commit, practiceLogs } = makeHarness(room1);

    const firstRoomCommit = commit(
      makeGroupPayload({ room_code: "REUSE", client_event_id: "ev-room-1" })
    );
    assert.deepEqual(firstRoomCommit.body, { xp_earned: 10 });

    const room2 = makeRoom({ instance_id: "inst-new", code: "REUSE" });
    rooms.set("REUSE", room2);
    assert.notEqual(
      makeGroupTurnCreditKey(room1, 0, 0, "dev-a"),
      makeGroupTurnCreditKey(room2, 0, 0, "dev-a")
    );

    const secondRoomCommit = commit(
      makeGroupPayload({ room_code: "REUSE", client_event_id: "ev-room-2" })
    );
    assert.equal(secondRoomCommit.ok, true);
    assert.equal(secondRoomCommit.status, 200);
    assert.deepEqual(secondRoomCommit.body, { xp_earned: 10 });
    assert.equal(practiceLogs.length, 2);
    assert.equal(creditedGroupTurns.size, 2);
  }
});

// ---- Isolated Real HTTP Endpoint Verification against server.ts ----
const getFreePort = () =>
  new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });

const waitForServer = async (baseUrl, timeoutMs = 10000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/`);
      if (res.ok) return;
    } catch {
      /* waiting for startup */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Isolated test server did not start in time");
};

test("Isolated real HTTP endpoint test — POST /api/progress/activity enforces authoritative group turns without touching real data/", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "alif-group-guard-"));
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const tsxBin = path.resolve(process.cwd(), "node_modules", ".bin", "tsx");

  const child = spawn(tsxBin, ["server.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      ALIF_DATA_DIR: tempDir,
      ALIF_API_ONLY: "1",
    },
    stdio: "pipe",
  });

  const postJson = async (endpoint, payload) => {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    return { status: res.status, body };
  };

  try {
    await waitForServer(baseUrl);

    // 1. Create room (Device A) and join (Device B)
    const created = await postJson("/api/rooms", {
      name: "Amina",
      surah_number: 112,
      surah_name: "Al-Ikhlas",
    });
    assert.equal(created.status, 200);
    const code = created.body.code;
    const devA = created.body.device_id;
    assert.ok(created.body.instance_id, "room must have unique instance_id");

    const joined = await postJson(`/api/rooms/${code}/join`, { name: "Bilal" });
    assert.equal(joined.status, 200);
    const devB = joined.body.device_id;

    // 2. Reject attempt while room is still in lobby
    const lobbyAttempt = await postJson("/api/progress/activity", {
      user_id: "http-user-a",
      kind: "group_recitation",
      room_code: code,
      device_id: devA,
      turn_index: 0,
      ayah_index: 0,
      surah_number: 112,
      surah_name: "Al-Ikhlas",
      ayah_number: 1,
      ayah_keys: ["112:1"],
      client_event_id: "http-ev-lobby",
    });
    assert.equal(lobbyAttempt.status, 409);
    assert.equal(lobbyAttempt.body.xp_earned, 0);

    // 3. Start room (turn 0, ayah 0 -> 112:1, owner devA)
    const started = await postJson(`/api/rooms/${code}/start`, { device_id: devA });
    assert.equal(started.status, 200);
    assert.equal(started.body.status, "active");

    // 4. Reproduce TOCTOU race: snapshot devA turn 0, advance room to devB BEFORE activity arrives
    const stalePayloadA = {
      user_id: "http-user-a",
      kind: "group_recitation",
      room_code: code,
      device_id: devA,
      turn_index: 0,
      ayah_index: 0,
      surah_number: 112,
      surah_name: "Al-Ikhlas",
      ayah_number: 1,
      ayah_keys: ["112:1"],
      client_event_id: "http-ev-stale-a",
    };

    const advanced1 = await postJson(`/api/rooms/${code}/advance`, { device_id: devA });
    assert.equal(advanced1.status, 200);
    assert.equal(advanced1.body.turn_index, 1);
    assert.equal(advanced1.body.ayah_index, 1);

    const staleRes = await postJson("/api/progress/activity", stalePayloadA);
    assert.equal(staleRes.status, 403);
    assert.equal(staleRes.body.xp_earned, 0);

    const progA1 = await (await fetch(`${baseUrl}/api/progress?user_id=http-user-a`)).json();
    assert.equal(progA1.total_xp, 0);

    // 5. Reject forged ayah_number / ayah_keys on devB's current turn (expects 112:2, not 112:4)
    const forgedAyah = await postJson("/api/progress/activity", {
      user_id: "http-user-b",
      kind: "group_recitation",
      room_code: code,
      device_id: devB,
      turn_index: 1,
      ayah_index: 1,
      surah_number: 112,
      surah_name: "Al-Ikhlas",
      ayah_number: 4,
      ayah_keys: ["112:4"],
      client_event_id: "http-ev-forged-b",
    });
    assert.equal(forgedAyah.status, 409);
    assert.equal(forgedAyah.body.xp_earned, 0);

    // 6. Commit valid turn for devB (turn 1, ayah 1 -> 112:2)
    const validPayloadB = {
      user_id: "http-user-b",
      kind: "group_recitation",
      room_code: code,
      device_id: devB,
      turn_index: 1,
      ayah_index: 1,
      surah_number: 112,
      surah_name: "Al-Ikhlas",
      ayah_number: 2,
      ayah_keys: ["112:2"],
      client_event_id: "http-ev-valid-b",
    };
    const validResB = await postJson("/api/progress/activity", validPayloadB);
    assert.equal(validResB.status, 200);
    assert.deepEqual(validResB.body, { xp_earned: 10 });

    // 7. Same turn submitted again with a NEW client_event_id -> duplicate 0 XP
    const dupTurnB = await postJson("/api/progress/activity", {
      ...validPayloadB,
      client_event_id: "http-ev-valid-b-second-tab",
    });
    assert.equal(dupTurnB.status, 200);
    assert.deepEqual(dupTurnB.body, { xp_earned: 0, duplicate: true });

    // 8. Advance room to turn 2 (devA), then retry devB's original client_event_id -> duplicate 0 XP
    const advanced2 = await postJson(`/api/rooms/${code}/advance`, { device_id: devB });
    assert.equal(advanced2.status, 200);
    assert.equal(advanced2.body.turn_index, 2);

    const postAdvanceRetryB = await postJson("/api/progress/activity", validPayloadB);
    assert.equal(postAdvanceRetryB.status, 200);
    assert.deepEqual(postAdvanceRetryB.body, { xp_earned: 0, duplicate: true });

    // 9. Legitimate new turn 2 for devA (112:3) -> earns 10 XP
    const validResA = await postJson("/api/progress/activity", {
      user_id: "http-user-a",
      kind: "group_recitation",
      room_code: code,
      device_id: devA,
      turn_index: 2,
      ayah_index: 2,
      surah_number: 112,
      surah_name: "Al-Ikhlas",
      ayah_number: 3,
      ayah_keys: ["112:3"],
      client_event_id: "http-ev-valid-a-turn2",
    });
    assert.equal(validResA.status, 200);
    assert.deepEqual(validResA.body, { xp_earned: 10 });

    // 10. Focus mode remains unaffected without room metadata
    const focusRes = await postJson("/api/progress/activity", {
      user_id: "http-user-a",
      kind: "recite_practice",
      surah_number: 112,
      surah_name: "Al-Ikhlas",
      ayah_number: 1,
      ayah_keys: ["112:1"],
      client_event_id: "http-ev-focus-a",
    });
    assert.equal(focusRes.status, 200);
    assert.deepEqual(focusRes.body, { xp_earned: 10 });

    // Verify persisted progress totals in isolated temp data dir
    const progA2 = await (await fetch(`${baseUrl}/api/progress?user_id=http-user-a`)).json();
    const progB2 = await (await fetch(`${baseUrl}/api/progress?user_id=http-user-b`)).json();
    assert.equal(progA2.total_xp, 20);
    assert.equal(progB2.total_xp, 10);
    assert.equal(progA2.score_verified, false);
    assert.equal(progB2.score_verified, false);
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      child.once("exit", resolve);
      setTimeout(resolve, 1500);
    });
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

// ---- ALIF-001A Correction 03 Tests: Surah Boundary Integrity & Completion ----

test("Correction 03 Test A — authoritative 114-surah verse counts are complete, sum to 6236, and reject invalid surahs", () => {
  assert.equal(SURAH_AYAH_COUNTS.length, 115);
  assert.equal(SURAH_AYAH_COUNTS[0], 0);

  let total = 0;
  for (let s = 1; s <= 114; s += 1) {
    const count = getSurahAyahCount(s);
    assert.ok(Number.isInteger(count) && count >= 1, `Surah ${s} must have a positive integer ayah count`);
    total += count;
  }
  assert.equal(total, 6236);

  // Spot checks of canonical Hafs/Madani counts
  assert.equal(getSurahAyahCount(1), 7);    // Al-Fatiha
  assert.equal(getSurahAyahCount(2), 286);  // Al-Baqarah
  assert.equal(getSurahAyahCount(78), 40);  // An-Naba
  assert.equal(getSurahAyahCount(108), 3);  // Al-Kawthar
  assert.equal(getSurahAyahCount(112), 4);  // Al-Ikhlas
  assert.equal(getSurahAyahCount(113), 5);  // Al-Falaq
  assert.equal(getSurahAyahCount(114), 6);  // An-Nas

  for (const invalid of [0, -1, 115, 1.5, "1", "", null, undefined, NaN, Infinity]) {
    assert.equal(getSurahAyahCount(invalid), null, `getSurahAyahCount should reject ${String(invalid)}`);
  }

  assert.equal(parseValidSurahNumber(1), 1);
  assert.equal(parseValidSurahNumber("1"), 1);
  assert.equal(parseValidSurahNumber("114"), 114);
  for (const invalid of [0, -5, 115, 1.5, "1.5", "", "abc", "0", "115", null, undefined, true]) {
    assert.equal(parseValidSurahNumber(invalid), null, `parseValidSurahNumber should reject ${String(invalid)}`);
  }
});

test("Correction 03 Tests B & C — Al-Fatiha finishes cleanly after ayah 7, preserves final-ayah XP and idempotent retry, and rejects post-completion advance/XP", () => {
  const room = makeRoom({
    surah_number: 1,
    surah_name: "Al-Fatiha",
    total_ayahs: 7,
  });
  const { practiceLogs, commit } = makeHarness(room);

  // Advance through Ayahs 1..6 (indices 0..5 -> lands on index 6 = Ayah 7)
  for (let i = 0; i < 6; i += 1) {
    const owner = room.participants[room.turn_index % room.participants.length].device_id;
    const adv = advanceGroupRoomTurn({ room, deviceId: owner });
    assert.equal(adv.ok, true);
    assert.equal(adv.finished, false);
    assert.equal(room.status, "active");
    assert.equal(room.ayah_index, i + 1);
    assert.equal(room.turn_index, i + 1);
  }

  // Ayah 7 (index 6, turn 6 -> owned by dev-a) earns legitimate XP
  const finalAyahPayload = makeGroupPayload({
    surah_number: 1,
    surah_name: "Al-Fatiha",
    device_id: "dev-a",
    turn_index: 6,
    ayah_index: 6,
    ayah_number: 7,
    ayah_keys: ["1:7"],
    client_event_id: "ev-fatiha-7",
  });
  const finalXp = commit(finalAyahPayload);
  assert.equal(finalXp.ok, true);
  assert.equal(finalXp.status, 200);
  assert.deepEqual(finalXp.body, { xp_earned: 10 });
  assert.equal(practiceLogs.length, 1);

  // Advancing after Ayah 7 completes the session cleanly without incrementing past index 6
  const finishAdv = advanceGroupRoomTurn({ room, deviceId: "dev-a" });
  assert.equal(finishAdv.ok, true);
  assert.equal(finishAdv.finished, true);
  assert.equal(room.status, "finished");
  assert.equal(room.ayah_index, 6);
  assert.equal(room.turn_index, 6);

  // Subsequent advance after completion is rejected cleanly
  const extraAdv = advanceGroupRoomTurn({ room, deviceId: "dev-a" });
  assert.equal(extraAdv.ok, false);
  assert.equal(extraAdv.status, 400);
  assert.equal(room.status, "finished");
  assert.equal(room.ayah_index, 6);

  // New practice activity on finished room (Ayah 7 new event or nonexistent Ayah 8) is rejected with 0 XP
  const postCompleteNew = commit({
    ...finalAyahPayload,
    client_event_id: "ev-fatiha-7-late-new",
  });
  assert.equal(postCompleteNew.ok, false);
  assert.equal(postCompleteNew.status, 409);
  assert.equal(postCompleteNew.body.xp_earned, 0);

  const ayah8Attempt = commit(
    makeGroupPayload({
      surah_number: 1,
      surah_name: "Al-Fatiha",
      device_id: "dev-b",
      turn_index: 7,
      ayah_index: 7,
      ayah_number: 8,
      ayah_keys: ["1:8"],
      client_event_id: "ev-fatiha-8",
    })
  );
  assert.equal(ayah8Attempt.ok, false);
  assert.equal(ayah8Attempt.status, 409);
  assert.equal(ayah8Attempt.body.xp_earned, 0);
  assert.equal(practiceLogs.length, 1);

  // Idempotent retry of already-committed final-ayah client_event_id after completion still returns duplicate 0 XP
  const retryFinal = commit(finalAyahPayload);
  assert.equal(retryFinal.ok, true);
  assert.equal(retryFinal.status, 200);
  assert.deepEqual(retryFinal.body, { xp_earned: 0, duplicate: true });
  assert.equal(practiceLogs.length, 1);
});

test("Correction 03 Test D — cold-server boundary enforcement rejects nonexistent ayahs without cached Quran metadata", () => {
  // Al-Fatiha forced to Ayah 8 (index 7) with NO total_ayahs and NO maxAyahCount
  const coldFatiha = makeRoom({
    surah_number: 1,
    surah_name: "Al-Fatiha",
    turn_index: 7,
    ayah_index: 7,
  });
  const h1 = makeHarness(coldFatiha);
  const res1 = h1.commit(
    makeGroupPayload({
      surah_number: 1,
      surah_name: "Al-Fatiha",
      device_id: "dev-b",
      turn_index: 7,
      ayah_index: 7,
      ayah_number: 8,
      ayah_keys: ["1:8"],
      client_event_id: "ev-cold-fatiha-8",
    })
    // maxAyahCount intentionally omitted
  );
  assert.equal(res1.ok, false);
  assert.equal(res1.status, 409);
  assert.equal(res1.body.xp_earned, 0);
  assert.equal(h1.practiceLogs.length, 0);

  // Spoofed inflated total_ayahs on Surah 112 (Al-Ikhlas has 4 ayahs) is capped by authoritative metadata
  const spoofedIkhlas = makeRoom({
    surah_number: 112,
    surah_name: "Al-Ikhlas",
    total_ayahs: 99,
    turn_index: 4,
    ayah_index: 4,
  });
  assert.equal(resolveRoomTotalAyahs(spoofedIkhlas), 4);
  const h2 = makeHarness(spoofedIkhlas);
  const res2 = h2.commit(
    makeGroupPayload({
      surah_number: 112,
      surah_name: "Al-Ikhlas",
      device_id: "dev-a",
      turn_index: 4,
      ayah_index: 4,
      ayah_number: 5,
      ayah_keys: ["112:5"],
      client_event_id: "ev-cold-ikhlas-5",
    })
  );
  assert.equal(res2.ok, false);
  assert.equal(res2.status, 409);
  assert.equal(res2.body.xp_earned, 0);
  assert.equal(h2.practiceLogs.length, 0);
});

test("Correction 03 Test E — Al-Fatiha completes cleanly with 1, 2, and 3 participants", () => {
  for (const participantCount of [1, 2, 3]) {
    const participants = Array.from({ length: participantCount }, (_, idx) => ({
      device_id: `dev-${idx + 1}`,
      name: `User ${idx + 1}`,
    }));
    const room = makeRoom({
      surah_number: 1,
      surah_name: "Al-Fatiha",
      total_ayahs: 7,
      participants,
      host_device: participants[0].device_id,
    });

    for (let step = 0; step < 7; step += 1) {
      const expectedOwner = participants[step % participantCount].device_id;
      const adv = advanceGroupRoomTurn({ room, deviceId: expectedOwner });
      assert.equal(adv.ok, true);
      if (step < 6) {
        assert.equal(adv.finished, false);
        assert.equal(room.status, "active");
        assert.equal(room.ayah_index, step + 1);
      } else {
        assert.equal(adv.finished, true);
        assert.equal(room.status, "finished");
        assert.equal(room.ayah_index, 6);
      }
    }
  }
});

test("Correction 03 Test F — other surahs (Al-Ikhlas 4, An-Naba 40, Al-Baqarah 286) enforce exact final-ayah boundaries", () => {
  const cases = [
    { surah: 112, name: "Al-Ikhlas", total: 4 },
    { surah: 78, name: "An-Naba", total: 40 },
    { surah: 2, name: "Al-Baqarah", total: 286 },
  ];

  for (const c of cases) {
    const lastIdx = c.total - 1;
    const room = makeRoom({
      surah_number: c.surah,
      surah_name: c.name,
      total_ayahs: c.total,
      ayah_index: lastIdx,
      turn_index: lastIdx,
    });
    const owner = room.participants[room.turn_index % room.participants.length].device_id;
    const { commit, practiceLogs } = makeHarness(room);

    // Final valid ayah succeeds
    const validLast = commit(
      makeGroupPayload({
        surah_number: c.surah,
        surah_name: c.name,
        device_id: owner,
        turn_index: lastIdx,
        ayah_index: lastIdx,
        ayah_number: c.total,
        ayah_keys: [`${c.surah}:${c.total}`],
        client_event_id: `ev-${c.surah}-last`,
      })
    );
    assert.equal(validLast.ok, true);
    assert.deepEqual(validLast.body, { xp_earned: 10 });
    assert.equal(practiceLogs.length, 1);

    // Advance completes the room cleanly
    const finished = advanceGroupRoomTurn({ room, deviceId: owner });
    assert.equal(finished.ok, true);
    assert.equal(finished.finished, true);
    assert.equal(room.status, "finished");
    assert.equal(room.ayah_index, lastIdx);

    // Next nonexistent ayah rejected on cold server
    const overRoom = makeRoom({
      surah_number: c.surah,
      surah_name: c.name,
      ayah_index: c.total,
      turn_index: c.total,
    });
    const overOwner = overRoom.participants[overRoom.turn_index % overRoom.participants.length].device_id;
    const hOver = makeHarness(overRoom);
    const overRes = hOver.commit(
      makeGroupPayload({
        surah_number: c.surah,
        surah_name: c.name,
        device_id: overOwner,
        turn_index: c.total,
        ayah_index: c.total,
        ayah_number: c.total + 1,
        ayah_keys: [`${c.surah}:${c.total + 1}`],
        client_event_id: `ev-${c.surah}-over`,
      })
    );
    assert.equal(overRes.ok, false);
    assert.equal(overRes.status, 409);
    assert.equal(overRes.body.xp_earned, 0);
  }
});

test("Correction 03 Isolated real HTTP test — cold server validates surahs, completes Al-Fatiha & Al-Ikhlas cleanly, and blocks post-completion advance/XP", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "alif-surah-bounds-"));
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const tsxBin = path.resolve(process.cwd(), "node_modules", ".bin", "tsx");

  const child = spawn(tsxBin, ["server.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      ALIF_DATA_DIR: tempDir,
      ALIF_API_ONLY: "1",
    },
    stdio: "pipe",
  });

  const postJson = async (endpoint, payload) => {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    return { status: res.status, body };
  };

  try {
    await waitForServer(baseUrl);

    // 1. POST /api/rooms rejects invalid surah_number values
    for (const badSurah of [0, 115, -2, 1.5, "abc", "", null]) {
      const badRes = await postJson("/api/rooms", {
        name: "Host",
        surah_number: badSurah,
        surah_name: "Invalid",
      });
      assert.equal(badRes.status, 400, `Expected 400 for surah_number=${String(badSurah)}`);
    }

    // 2. Surah Al-Fatiha (7 ayahs) on cold server ignores client-supplied total_ayahs
    const created = await postJson("/api/rooms", {
      name: "Amina",
      surah_number: 1,
      surah_name: "Al-Fatiha",
      total_ayahs: 99,
    });
    assert.equal(created.status, 200);
    assert.equal(created.body.surah_number, 1);
    assert.equal(created.body.total_ayahs, 7);
    const code = created.body.code;
    const devA = created.body.device_id;

    const joined = await postJson(`/api/rooms/${code}/join`, { name: "Bilal" });
    assert.equal(joined.status, 200);
    const devB = joined.body.device_id;
    const devs = [devA, devB];

    const started = await postJson(`/api/rooms/${code}/start`, { device_id: devA });
    assert.equal(started.status, 200);
    assert.equal(started.body.status, "active");

    // Advance ayahs 1..6 (indices 0..5 -> lands on ayah 7, index 6)
    for (let i = 0; i < 6; i += 1) {
      const adv = await postJson(`/api/rooms/${code}/advance`, { device_id: devs[i % 2] });
      assert.equal(adv.status, 200);
      assert.equal(adv.body.status, "active");
      assert.equal(adv.body.ayah_index, i + 1);
      assert.equal(adv.body.turn_index, i + 1);
    }

    // Final ayah (1:7) owned by devA (turn_index 6 % 2 === 0) earns legitimate +10 XP
    const finalPayload = {
      user_id: "fatiha-user-a",
      kind: "group_recitation",
      room_code: code,
      device_id: devA,
      turn_index: 6,
      ayah_index: 6,
      surah_number: 1,
      surah_name: "Al-Fatiha",
      ayah_number: 7,
      ayah_keys: ["1:7"],
      client_event_id: "http-fatiha-final-7",
    };
    const finalXp = await postJson("/api/progress/activity", finalPayload);
    assert.equal(finalXp.status, 200);
    assert.deepEqual(finalXp.body, { xp_earned: 10 });

    // Advancing after ayah 7 transitions room to finished and keeps ayah_index clamped at 6
    const finished = await postJson(`/api/rooms/${code}/advance`, { device_id: devA });
    assert.equal(finished.status, 200);
    assert.equal(finished.body.status, "finished");
    assert.equal(finished.body.ayah_index, 6);
    assert.equal(finished.body.total_ayahs, 7);

    // GET /api/rooms/:code reflects finished state
    const fetched = await (await fetch(`${baseUrl}/api/rooms/${code}`)).json();
    assert.equal(fetched.status, "finished");
    assert.equal(fetched.ayah_index, 6);

    // Subsequent advance after completion is rejected cleanly
    const extraAdv = await postJson(`/api/rooms/${code}/advance`, { device_id: devA });
    assert.equal(extraAdv.status, 400);

    // New practice attempt on finished room or nonexistent ayah 1:8 is rejected with 0 XP
    const ayah8Res = await postJson("/api/progress/activity", {
      user_id: "fatiha-user-b",
      kind: "group_recitation",
      room_code: code,
      device_id: devB,
      turn_index: 7,
      ayah_index: 7,
      surah_number: 1,
      surah_name: "Al-Fatiha",
      ayah_number: 8,
      ayah_keys: ["1:8"],
      client_event_id: "http-fatiha-8",
    });
    assert.equal(ayah8Res.status, 409);
    assert.equal(ayah8Res.body.xp_earned, 0);

    // Retrying already-committed 1:7 client_event_id after completion still succeeds idempotently with 0 XP
    const retryFinal = await postJson("/api/progress/activity", finalPayload);
    assert.equal(retryFinal.status, 200);
    assert.deepEqual(retryFinal.body, { xp_earned: 0, duplicate: true });

    const progA = await (await fetch(`${baseUrl}/api/progress?user_id=fatiha-user-a`)).json();
    assert.equal(progA.total_xp, 10);
    assert.equal(progA.score_verified, false);

    // 3. Surah Al-Ikhlas (4 ayahs) completion with 1 participant and 3 participants over HTTP
    for (const count of [1, 3]) {
      const r = await postJson("/api/rooms", {
        name: "P1",
        surah_number: 112,
        surah_name: "Al-Ikhlas",
      });
      assert.equal(r.status, 200);
      assert.equal(r.body.total_ayahs, 4);
      const roomCode = r.body.code;
      const devices = [r.body.device_id];
      for (let p = 2; p <= count; p += 1) {
        const j = await postJson(`/api/rooms/${roomCode}/join`, { name: `P${p}` });
        assert.equal(j.status, 200);
        devices.push(j.body.device_id);
      }
      const st = await postJson(`/api/rooms/${roomCode}/start`, { device_id: devices[0] });
      assert.equal(st.status, 200);

      for (let step = 0; step < 4; step += 1) {
        const adv = await postJson(`/api/rooms/${roomCode}/advance`, {
          device_id: devices[step % count],
        });
        assert.equal(adv.status, 200);
        if (step < 3) {
          assert.equal(adv.body.status, "active");
          assert.equal(adv.body.ayah_index, step + 1);
        } else {
          assert.equal(adv.body.status, "finished");
          assert.equal(adv.body.ayah_index, 3);
        }
      }
      const afterDone = await postJson(`/api/rooms/${roomCode}/advance`, { device_id: devices[0] });
      assert.equal(afterDone.status, 400);
    }
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      child.once("exit", resolve);
      setTimeout(resolve, 1500);
    });
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

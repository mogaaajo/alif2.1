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

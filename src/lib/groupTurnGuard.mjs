export const isNonEmptyString = (value) =>
  typeof value === "string" && value.trim().length > 0;

export const isNonNegativeInteger = (value) =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

export const isPositiveInteger = (value) =>
  typeof value === "number" && Number.isInteger(value) && value >= 1;

export const normalizeClientEventId = (value) =>
  isNonEmptyString(value) ? value.trim() : undefined;

export const makeGroupTurnCreditKey = (room, turnIndex, ayahIndex, deviceId) => {
  const roomIdentity = isNonEmptyString(room?.instance_id)
    ? room.instance_id.trim()
    : String(room?.code || "").trim().toUpperCase();
  return `${roomIdentity}:${turnIndex}:${ayahIndex}:${deviceId}`;
};

export function validateGroupPracticeTurn({
  activity,
  rooms,
  creditedGroupTurns,
  maxAyahCount,
}) {
  if (!activity || typeof activity !== "object") {
    return {
      ok: false,
      status: 400,
      detail: "Valid group room turn metadata is required.",
    };
  }

  const roomCode = isNonEmptyString(activity.room_code)
    ? activity.room_code.trim().toUpperCase()
    : "";
  const deviceId = isNonEmptyString(activity.device_id)
    ? activity.device_id.trim()
    : "";
  const turnIndex = activity.turn_index;
  const ayahIndex = activity.ayah_index;
  const surahNumber = activity.surah_number;
  const ayahNumber = activity.ayah_number;
  const ayahKeys = activity.ayah_keys;

  if (
    !roomCode ||
    !deviceId ||
    !isNonNegativeInteger(turnIndex) ||
    !isNonNegativeInteger(ayahIndex) ||
    !isPositiveInteger(surahNumber) ||
    surahNumber > 114 ||
    !isPositiveInteger(ayahNumber) ||
    !Array.isArray(ayahKeys) ||
    ayahKeys.length !== 1 ||
    !isNonEmptyString(ayahKeys[0])
  ) {
    return {
      ok: false,
      status: 400,
      detail: "Valid group room turn metadata is required.",
    };
  }

  const room = rooms?.get(roomCode);
  if (!room) {
    return {
      ok: false,
      status: 404,
      detail: "Group room not found.",
    };
  }

  if (room.status !== "active") {
    return {
      ok: false,
      status: 409,
      detail: "Group session is not active.",
    };
  }

  const participants = Array.isArray(room.participants) ? room.participants : [];
  if (participants.length === 0) {
    return {
      ok: false,
      status: 409,
      detail: "Group room has no active participants.",
    };
  }

  const isMember = participants.some((p) => p?.device_id === deviceId);
  if (!isMember) {
    return {
      ok: false,
      status: 403,
      detail: "Participant is not a member of this group room.",
    };
  }

  const currentOwner = participants[room.turn_index % participants.length]?.device_id;
  if (currentOwner !== deviceId) {
    return {
      ok: false,
      status: 403,
      detail: "It is not your turn.",
    };
  }

  if (room.turn_index !== turnIndex || room.ayah_index !== ayahIndex) {
    return {
      ok: false,
      status: 409,
      detail: "Group turn is no longer current.",
    };
  }

  const roomSurah = Number(room.surah_number);
  if (!isPositiveInteger(roomSurah) || roomSurah > 114 || roomSurah !== surahNumber) {
    return {
      ok: false,
      status: 409,
      detail: "Submitted surah does not match the active group room.",
    };
  }

  const expectedAyahNumber = room.ayah_index + 1;
  if (isPositiveInteger(maxAyahCount) && expectedAyahNumber > maxAyahCount) {
    return {
      ok: false,
      status: 409,
      detail: "Group room ayah position exceeds surah length.",
    };
  }

  const expectedAyahKey = `${roomSurah}:${expectedAyahNumber}`;
  if (ayahNumber !== expectedAyahNumber || ayahKeys[0].trim() !== expectedAyahKey) {
    return {
      ok: false,
      status: 409,
      detail: "Submitted ayah does not match the current group turn.",
    };
  }

  const turnCreditKey = makeGroupTurnCreditKey(
    room,
    room.turn_index,
    room.ayah_index,
    deviceId
  );

  if (creditedGroupTurns?.has(turnCreditKey)) {
    return {
      ok: true,
      duplicate: true,
      xp: 0,
      turnCreditKey,
    };
  }

  return {
    ok: true,
    duplicate: false,
    turnCreditKey,
    expectedAyahNumber,
    expectedAyahKey,
  };
}

export function commitPracticeActivity({
  activity,
  practiceLogs,
  rooms,
  creditedGroupTurns,
  maxAyahCount,
  persistLogs,
  createId,
  nowIso,
}) {
  const payload = activity && typeof activity === "object" ? activity : {};
  const userId = isNonEmptyString(payload.user_id) ? payload.user_id.trim() : "anon";
  const clientEventId = normalizeClientEventId(payload.client_event_id);

  // Step A — Exact (user_id, client_event_id) idempotency before turn validation
  if (
    clientEventId &&
    practiceLogs.some((l) => l.user_id === userId && l.client_event_id === clientEventId)
  ) {
    return {
      ok: true,
      status: 200,
      body: { xp_earned: 0, duplicate: true },
    };
  }

  let turnCreditKey = null;
  if (payload.kind === "group_recitation") {
    const validation = validateGroupPracticeTurn({
      activity: payload,
      rooms,
      creditedGroupTurns,
      maxAyahCount,
    });
    if (!validation.ok) {
      return {
        ok: false,
        status: validation.status,
        body: { detail: validation.detail, xp_earned: 0 },
      };
    }
    if (validation.duplicate) {
      return {
        ok: true,
        status: 200,
        body: { xp_earned: 0, duplicate: true },
      };
    }
    turnCreditKey = validation.turnCreditKey;
  }

  const xp =
    payload.kind === "memorize" ? 25 : payload.kind === "recite_along" ? 15 : 10;

  const log = {
    id: createId(),
    user_id: userId,
    kind: payload.kind,
    surah_number: payload.surah_number,
    surah_name: payload.surah_name,
    ayah_number: payload.ayah_number,
    ayah_keys: payload.ayah_keys,
    score: null,
    verdict: undefined,
    score_verified: false,
    ...(clientEventId ? { client_event_id: clientEventId } : {}),
    xp,
    created_at: nowIso(),
  };

  practiceLogs.unshift(log);

  let persisted = false;
  try {
    persisted = persistLogs(practiceLogs) !== false;
  } catch {
    persisted = false;
  }

  if (!persisted) {
    const idx = practiceLogs.indexOf(log);
    if (idx !== -1) practiceLogs.splice(idx, 1);
    return {
      ok: false,
      status: 500,
      body: { detail: "Could not save practice progress.", xp_earned: 0 },
    };
  }

  if (turnCreditKey && creditedGroupTurns) {
    creditedGroupTurns.add(turnCreditKey);
  }

  return {
    ok: true,
    status: 200,
    body: { xp_earned: xp },
    log,
  };
}

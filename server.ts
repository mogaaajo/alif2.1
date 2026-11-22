import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import {
  commitPracticeActivity,
  getSurahAyahCount,
  parseValidSurahNumber,
  advanceGroupRoomTurn,
} from './src/lib/groupTurnGuard.mjs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

const upload = multer({
  limits: { fileSize: 25 * 1024 * 1024 },
  storage: multer.memoryStorage(),
});

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// ---------------- In-memory + File Persistence ----------------
const dataDir = process.env.ALIF_DATA_DIR
  ? path.resolve(process.env.ALIF_DATA_DIR)
  : path.resolve(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch { /* ignore */ }
}

const loadJson = <T>(filename: string, fallback: T): T => {
  const filePath = path.join(dataDir, filename);
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (err) {
    console.warn(`Error loading ${filename}:`, err);
  }
  return fallback;
};

const saveJson = (filename: string, data: any): boolean => {
  const filePath = path.join(dataDir, filename);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.warn(`Error saving ${filename}:`, err);
    return false;
  }
};

interface Learner {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  salt: string;
}

interface Teacher {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  salt: string;
}

interface PracticeLog {
  id?: string;
  user_id: string;
  kind?: string;
  surah_number?: number;
  surah_name?: string;
  ayah_number?: string | number;
  ayah_keys?: string[];
  score?: number | null;
  verdict?: string;
  score_verified?: boolean;
  client_event_id?: string;
  xp: number;
  created_at: string;
}

interface ClassDoc {
  code: string;
  name: string;
  teacher_id: string;
  created_at: string;
}

interface ClassMember {
  code: string;
  user_id: string;
  name: string;
  joined_at: string;
}

interface AssignmentDoc {
  id: string;
  class_code: string;
  surah_number: number;
  surah_name: string;
  note: string;
  created_at: string;
}

interface SubmissionDoc {
  assignment_id: string;
  user_id: string;
  name: string;
  best_score: number | null;
  score_verified?: boolean;
  submitted_at: string;
  reviewed: boolean;
}

interface RoomDoc {
  instance_id: string;
  code: string;
  host_device: string;
  surah_number: number;
  surah_name: string;
  total_ayahs: number;
  participants: Array<{ device_id: string; name: string }>;
  status: 'lobby' | 'active' | 'finished';
  ayah_index: number;
  turn_index: number;
  updated_at: string;
  recent_event?: any;
}

const learners: Learner[] = loadJson('learners.json', []);
const teachers: Teacher[] = loadJson('teachers.json', []);
const practiceLogs: PracticeLog[] = loadJson('practice-logs.json', []);
const classes: ClassDoc[] = loadJson('classes.json', []);
const classMembers: ClassMember[] = loadJson('class-members.json', []);
const assignments: AssignmentDoc[] = loadJson('assignments.json', []);
const submissions: SubmissionDoc[] = loadJson('submissions.json', []);
const resetTokens: Array<{ token: string; email: string; created_at: string; used: boolean }> = [];
const rooms: Map<string, RoomDoc> = new Map();
const creditedGroupTurns: Set<string> = new Set();
const surahAyahCounts: Map<number, number> = new Map();

// ---------------- Helpers & Crypto ----------------
const passwordHash = (password: string, salt = crypto.randomBytes(16).toString('hex')) => ({
  salt,
  hash: crypto.scryptSync(password, salt, 32).toString('hex'),
});

const checkPassword = (password: string, user: { salt: string; password_hash: string }) => {
  const hash = crypto.scryptSync(password, user.salt, 32).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.password_hash, 'hex'));
  } catch {
    return false;
  }
};

const makeToken = (id: string, type: 'learner' | 'teacher') =>
  Buffer.from(JSON.stringify({ id, type, exp: Date.now() + 30 * 86400 * 1000 })).toString('base64url');

const decodeToken = (token: string): { id: string; type: string } | null => {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const getAuthUser = (req: Request, expectedType?: 'learner' | 'teacher') => {
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const decoded = decodeToken(token);
  if (!decoded) return null;
  if (expectedType && decoded.type !== expectedType) return null;
  if (decoded.type === 'learner') {
    return learners.find((l) => l.id === decoded.id) || null;
  }
  if (decoded.type === 'teacher') {
    return teachers.find((t) => t.id === decoded.id) || null;
  }
  return null;
};

// Quran API cache
const apiCache = new Map<string, any>();
const QURAN_API = 'https://api.alquran.cloud/v1';
const QURAN_COM_API = 'https://api.quran.com/api/v4';

const fetchWithCache = async (url: string, ttlMs = 12 * 60 * 60 * 1000) => {
  const cached = apiCache.get(url);
  if (cached && Date.now() - cached.timestamp < ttlMs) {
    return cached.data;
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(35000) });
  if (!res.ok) {
    throw new Error(`Upstream API error ${res.status}: ${res.statusText}`);
  }
  const json = await res.json();
  const data = json.data !== undefined ? json.data : json;
  apiCache.set(url, { data, timestamp: Date.now() });
  return data;
};

// Text normalization & Basmala removal
const HARAKAT_REGEX = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
const normWord = (w: string) => {
  let res = w.replace(HARAKAT_REGEX, '');
  res = res.replace(/[\u0671\u0622\u0623\u0625]/g, '\u0627');
  return res;
};

const BASMALA_NORM = ['بسم', 'الله', 'الرحمن', 'الرحيم'];
const stripBasmala = (text: string) => {
  if (!text) return text;
  const words = text.replace(/^\ufeff/, '').trim().split(/\s+/);
  if (words.length > 4) {
    const first4 = words.slice(0, 4).map(normWord);
    if (first4.every((w, i) => w === BASMALA_NORM[i])) {
      return words.slice(4).join(' ').trim();
    }
  }
  return text;
};

const parseTajweed = (rawHtml = ''): Array<{ text: string; rule: string | null }> => {
  const segments: Array<{ text: string; rule: string | null }> = [];
  const cleaned = rawHtml.replace(/<span class=["']?end["']?>.*?<\/span>/gs, '');
  const re = /<tajweed class=["']?([a-z_]+)["']?>(.*?)<\/tajweed>/gs;
  let cursor = 0;
  for (const match of cleaned.matchAll(re)) {
    if (match.index !== undefined && match.index > cursor) {
      const plain = cleaned.slice(cursor, match.index).replace(/<[^>]+>/g, '');
      if (plain) segments.push({ text: plain, rule: null });
    }
    const rawRule = match[1];
    const rule = rawRule === 'qalaqah' ? 'qalqalah' : rawRule;
    segments.push({ text: match[2], rule });
    cursor = (match.index || 0) + match[0].length;
  }
  if (cursor < cleaned.length) {
    const tail = cleaned.slice(cursor).replace(/<[^>]+>/g, '');
    if (tail) segments.push({ text: tail, rule: null });
  }
  return segments;
};

// Read-time verification predicate (reversible; never mutates stored records)
const isVerifiedScoreLog = (l: PracticeLog): boolean =>
  l.score_verified === true &&
  typeof l.score === 'number' &&
  Number.isFinite(l.score) &&
  l.score >= 0 &&
  l.score <= 100;

const isVerifiedSubmissionScore = (s?: SubmissionDoc): boolean =>
  s?.score_verified === true &&
  typeof s.best_score === 'number' &&
  Number.isFinite(s.best_score) &&
  s.best_score >= 0 &&
  s.best_score <= 100;

// Compute user progress stats & badges
const computeProgress = (userId: string) => {
  const logs = practiceLogs.filter((l) => l.user_id === userId);
  const totalRecitations = logs.length;
  const totalXp = logs.reduce((sum, l) => sum + (Number(l.xp) || 0), 0);
  const level = Math.floor(totalXp / 100) + 1;
  const xpInLevel = totalXp % 100;

  const scoredLogs = logs.filter(isVerifiedScoreLog);
  const avgScore = scoredLogs.length > 0
    ? Math.round(scoredLogs.reduce((acc, cur) => acc + (cur.score || 0), 0) / scoredLogs.length)
    : null;
  const maxScore = scoredLogs.length > 0 ? Math.max(...scoredLogs.map((l) => l.score || 0)) : 0;

  const surahBest: Record<number, number> = {};
  const surahCounts: Record<number, number> = {};
  for (const entry of logs) {
    const surahIds = entry.ayah_keys && entry.ayah_keys.length > 0
      ? [...new Set(entry.ayah_keys.map((k) => Number(k.split(':')[0])))]
      : entry.surah_number ? [entry.surah_number] : [];

    for (const sid of surahIds) {
      if (!sid) continue;
      surahCounts[sid] = (surahCounts[sid] || 0) + 1;
      if (isVerifiedScoreLog(entry)) {
        surahBest[sid] = Math.max(surahBest[sid] || 0, entry.score as number);
      }
    }
  }

  // Daily activity for last 14 days
  const today = new Date();
  const daily = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000);
    const dateStr = d.toISOString().slice(0, 10);
    const cnt = logs.filter((l) => (l.created_at || '').slice(0, 10) === dateStr).length;
    daily.push({ date: dateStr, count: cnt });
  }

  // Streaks
  const uniqueDates = [...new Set(logs.map((l) => (l.created_at || '').slice(0, 10)).filter(Boolean))].sort().reverse();
  let currentStreak = 0;
  let bestStreak = 0;
  if (uniqueDates.length > 0) {
    const todayStr = today.toISOString().slice(0, 10);
    const yesterdayStr = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
    if (uniqueDates[0] === todayStr || uniqueDates[0] === yesterdayStr) {
      let run = 1;
      let prevDate = new Date(uniqueDates[0]);
      for (let i = 1; i < uniqueDates.length; i++) {
        const curDate = new Date(uniqueDates[i]);
        const diffDays = Math.round((prevDate.getTime() - curDate.getTime()) / 86400000);
        if (diffDays === 1) {
          run++;
          prevDate = curDate;
        } else {
          break;
        }
      }
      currentStreak = run;
    }
    bestStreak = Math.max(currentStreak, uniqueDates.length ? 1 : 0);
  }

  const makeBadge = (bid: string, name: string, desc: string, icon: string, val: number, target: number) => ({
    id: bid,
    name,
    desc,
    icon,
    earned: val >= target,
    progress: Math.max(0, Math.min(1, target ? val / target : 0)),
    value: val,
    target,
  });

  const badges = [
    makeBadge('first_step', 'First Steps', 'Complete your first recitation', 'sparkles', totalRecitations, 1),
    makeBadge('devoted', 'Devoted', 'Log 10 recitations', 'heart', totalRecitations, 10),
    makeBadge('centurion', 'Centurion', 'Log 100 recitations', 'medal', totalRecitations, 100),
    makeBadge('streak_3', 'Getting Consistent', 'Reach a 3-day streak', 'flame', bestStreak, 3),
    makeBadge('streak_7', 'Week Warrior', 'Reach a 7-day streak', 'calendar-check', bestStreak, 7),
    makeBadge('streak_30', 'Unbreakable', 'Reach a 30-day streak', 'trophy', bestStreak, 30),
    makeBadge('explorer', 'Explorer', 'Practise 5 different surahs', 'compass', Object.keys(surahCounts).length, 5),
    makeBadge('voyager', 'Voyager', 'Practise 20 different surahs', 'map', Object.keys(surahCounts).length, 20),
    makeBadge('precise', 'Precise Tongue', 'Reach 90% average accuracy', 'target', scoredLogs.length >= 3 ? (avgScore || 0) : 0, 90),
    makeBadge('ihsan', 'Ihsan', 'Score a perfect 100 on an ayah', 'star', maxScore, 100),
  ];

  // Read-time masking of unverified scores/verdicts without mutating stored logs
  const recent = logs.slice(0, 20).map((l) => {
    const verified = isVerifiedScoreLog(l);
    return {
      ...l,
      score: verified ? l.score : null,
      verdict: verified ? l.verdict : undefined,
      score_verified: verified,
    };
  });

  return {
    total_recitations: totalRecitations,
    total_xp: totalXp,
    level,
    xp_in_level: xpInLevel,
    xp_to_next: 100,
    average_score: avgScore,
    score_verified: scoredLogs.length > 0,
    scored_count: scoredLogs.length,
    max_score: maxScore,
    current_streak: currentStreak,
    best_streak: bestStreak,
    surahs_practiced: Object.keys(surahCounts).length,
    surah_counts: surahCounts,
    surah_best: surahBest,
    daily_activity: daily,
    badges,
    badges_earned: badges.filter((b) => b.earned).length,
    recent,
  };
};

// ---------------- API Routes ----------------
const apiRouter = express.Router();

apiRouter.get('/', (_req, res) => {
  res.json({ message: 'Alif Quran API' });
});

// Surah catalogue
apiRouter.get('/surahs', async (_req, res) => {
  try {
    const data = await fetchWithCache(`${QURAN_API}/surah`);
    if (Array.isArray(data)) {
      for (const s of data) {
        if (Number.isInteger(s?.number) && Number.isInteger(s?.numberOfAyahs) && s.numberOfAyahs > 0) {
          surahAyahCounts.set(s.number, s.numberOfAyahs);
        }
      }
    }
    res.json(data);
  } catch (err: any) {
    res.status(502).json({ detail: `Quran API error: ${err.message}` });
  }
});

// Reciters
apiRouter.get('/reciters', async (_req, res) => {
  try {
    const data = await fetchWithCache(`${QURAN_API}/edition/format/audio`);
    const verseByVerse = Array.isArray(data) ? data.filter((e: any) => e.type === 'versebyverse') : [];
    res.json(verseByVerse);
  } catch (err: any) {
    res.status(502).json({ detail: `Quran API error: ${err.message}` });
  }
});

// Translations
apiRouter.get('/translations', async (_req, res) => {
  try {
    const data = await fetchWithCache(`${QURAN_API}/edition?format=text&type=translation`);
    res.json(data);
  } catch (err: any) {
    res.status(502).json({ detail: `Quran API error: ${err.message}` });
  }
});

// Surah details with ayahs, audio, translation
apiRouter.get('/surah/:number', async (req, res) => {
  const number = Number(req.params.number);
  const reciter = (req.query.reciter as string) || 'ar.alafasy';
  const translation = (req.query.translation as string) || 'en.sahih';
  const editions = `quran-uthmani,${translation},${reciter}`;

  try {
    const data = await fetchWithCache(`${QURAN_API}/surah/${number}/editions/${encodeURIComponent(editions)}`);
    const byId: Record<string, any> = {};
    if (Array.isArray(data)) {
      for (const ed of data) {
        if (ed.edition?.identifier) byId[ed.edition.identifier] = ed;
      }
    }
    const arabic = byId['quran-uthmani'];
    if (!arabic) {
      return res.status(404).json({ detail: 'Surah data not found' });
    }
    const trans = byId[translation];
    const audio = byId[reciter];

    const meta = {
      number: arabic.number,
      name: arabic.name,
      englishName: arabic.englishName,
      englishNameTranslation: arabic.englishNameTranslation,
      revelationType: arabic.revelationType,
      numberOfAyahs: arabic.numberOfAyahs,
    };
    if (Number.isInteger(number) && Number.isInteger(arabic.numberOfAyahs) && arabic.numberOfAyahs > 0) {
      surahAyahCounts.set(number, arabic.numberOfAyahs);
    }

    const ayahs = (arabic.ayahs || []).map((a: any, i: number) => {
      let text = a.text;
      if (a.numberInSurah === 1 && number !== 1 && number !== 9) {
        text = stripBasmala(text);
      }
      return {
        numberInSurah: a.numberInSurah,
        arabic: text,
        translation: trans?.ayahs?.[i]?.text || '',
        audio: audio?.ayahs?.[i]?.audio || null,
        juz: a.juz,
        page: a.page,
        sajda: a.sajda,
      };
    });

    res.json({ surah: meta, ayahs });
  } catch (err: any) {
    res.status(502).json({ detail: `Quran API error: ${err.message}` });
  }
});

// Multi reciter audio for Surah
apiRouter.get('/surah/:number/audio', async (req, res) => {
  const number = Number(req.params.number);
  const recitersParam = (req.query.reciters as string) || 'ar.alafasy';
  const ids = recitersParam.split(',').filter(Boolean);
  const editions = ['quran-uthmani', ...ids].join(',');

  try {
    const data = await fetchWithCache(`${QURAN_API}/surah/${number}/editions/${encodeURIComponent(editions)}`);
    const byId: Record<string, any> = {};
    if (Array.isArray(data)) {
      for (const ed of data) {
        if (ed.edition?.identifier) byId[ed.edition.identifier] = ed;
      }
    }
    const arabic = byId['quran-uthmani'];
    if (!arabic) return res.status(404).json({ detail: 'Surah not found' });

    const ayahs = (arabic.ayahs || []).map((_a: any, index: number) => {
      const audios: Record<string, string> = {};
      for (const id of ids) {
        const url = byId[id]?.ayahs?.[index]?.audio;
        if (url) audios[id] = url;
      }
      return {
        numberInSurah: index + 1,
        audios,
      };
    });

    res.json({ ayahs });
  } catch (err: any) {
    res.status(502).json({ detail: `Quran API error: ${err.message}` });
  }
});

// Tajweed metadata for Surah
apiRouter.get('/surah/:number/tajweed', async (req, res) => {
  const number = Number(req.params.number);
  try {
    const raw = await fetchWithCache(`${QURAN_COM_API}/quran/verses/uthmani_tajweed?chapter_number=${number}`);
    const verses = raw.verses || [];
    const ayahs = verses.map((verse: any, index: number) => ({
      numberInSurah: index + 1,
      segments: parseTajweed(verse.text_uthmani_tajweed),
    }));
    res.json({ ayahs });
  } catch (err: any) {
    res.status(502).json({ detail: `Tajweed API error: ${err.message}` });
  }
});

// Madani Mushaf page audio
apiRouter.get('/page/:number/audio', async (req, res) => {
  const number = Number(req.params.number);
  const reciter = (req.query.reciter as string) || 'ar.alafasy';
  const translation = (req.query.translation as string) || 'en.sahih';

  try {
    const [arabic, trans, audio] = await Promise.all([
      fetchWithCache(`${QURAN_API}/page/${number}/quran-uthmani`),
      fetchWithCache(`${QURAN_API}/page/${number}/${encodeURIComponent(translation)}`).catch(() => null),
      fetchWithCache(`${QURAN_API}/page/${number}/${encodeURIComponent(reciter)}`).catch(() => null),
    ]);

    const seenSurahs: number[] = [];
    const ayahs = (arabic.ayahs || []).map((a: any, i: number) => {
      const sNum = a.surah?.number;
      if (sNum && !seenSurahs.includes(sNum)) seenSurahs.push(sNum);

      let text = a.text;
      if (a.numberInSurah === 1 && sNum !== 1 && sNum !== 9) {
        text = stripBasmala(text);
      }

      return {
        surahNumber: sNum,
        surahName: a.surah?.englishName,
        surahNameArabic: a.surah?.name,
        numberInSurah: a.numberInSurah,
        arabic: text,
        translation: trans?.ayahs?.[i]?.text || '',
        audio: audio?.ayahs?.[i]?.audio || null,
        juz: a.juz,
        page: a.page,
      };
    });

    res.json({ page: number, ayahs, surahs: seenSurahs });
  } catch (err: any) {
    res.status(502).json({ detail: `Page audio error: ${err.message}` });
  }
});

// Juz audio
apiRouter.get('/juz/:number/audio', async (req, res) => {
  const number = Number(req.params.number);
  const reciter = (req.query.reciter as string) || 'ar.alafasy';
  const translation = (req.query.translation as string) || 'en.sahih';

  try {
    const [arabic, trans, audio] = await Promise.all([
      fetchWithCache(`${QURAN_API}/juz/${number}/quran-uthmani`),
      fetchWithCache(`${QURAN_API}/juz/${number}/${encodeURIComponent(translation)}`).catch(() => null),
      fetchWithCache(`${QURAN_API}/juz/${number}/${encodeURIComponent(reciter)}`).catch(() => null),
    ]);

    const ayahs = (arabic.ayahs || []).map((a: any, i: number) => {
      const sNum = a.surah?.number;
      let text = a.text;
      if (a.numberInSurah === 1 && sNum !== 1 && sNum !== 9) {
        text = stripBasmala(text);
      }

      return {
        surahNumber: sNum,
        surahName: a.surah?.englishName,
        numberInSurah: a.numberInSurah,
        arabic: text,
        translation: trans?.ayahs?.[i]?.text || '',
        audio: audio?.ayahs?.[i]?.audio || null,
        page: a.page,
      };
    });

    res.json({ juz: number, ayahs });
  } catch (err: any) {
    res.status(502).json({ detail: `Juz audio error: ${err.message}` });
  }
});

// Audio proxy with Range support
apiRouter.get('/audio-proxy', async (req, res) => {
  const targetUrl = req.query.url as string;
  if (!targetUrl) return res.status(400).send('URL required');

  try {
    const parsed = new URL(targetUrl);
    if (!['cdn.islamic.network', 'verses.quran.com', 'audio.qurancdn.com'].includes(parsed.hostname)) {
      return res.status(400).send('Invalid audio host');
    }

    const headers: Record<string, string> = {};
    if (req.headers.range) headers.Range = req.headers.range;

    const upstream = await fetch(targetUrl, { headers, signal: AbortSignal.timeout(30000) });
    res.status(upstream.status);
    const contentType = upstream.headers.get('content-type') || 'audio/mpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');

    for (const h of ['content-length', 'content-range', 'accept-ranges']) {
      const val = upstream.headers.get(h);
      if (val) res.setHeader(h, val);
    }

    if (!upstream.body) {
      return res.end();
    }

    // Pipe upstream response to client
    const arrayBuf = await upstream.arrayBuffer();
    res.send(Buffer.from(arrayBuf));
  } catch (err: any) {
    res.status(502).send(`Audio proxy failed: ${err.message}`);
  }
});

// Recitation Feedback / Assessment (ALIF-001A: automated audio grading disabled)
apiRouter.post('/recite/feedback', upload.single('audio'), async (req, res) => {
  const { reference } = req.body;

  if (!reference) {
    return res.status(400).json({ detail: 'Reference ayah is required' });
  }

  res.json({
    available: false,
    score_verified: false,
    transcription: '',
    reference,
    score: null,
    verdict: null,
    summary: 'Could not evaluate the recitation. Automated audio grading is currently unavailable.',
    word_feedback: [],
    tajweed_notes: [],
    xp_earned: 0,
  });
});

// Learner Auth
apiRouter.post('/learner/register', (req, res) => {
  const { name, email, password, previous_user_id } = req.body;
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanName = String(name || '').trim();

  if (!cleanName || !cleanEmail || !password) {
    return res.status(400).json({ detail: 'Name, email, and password are required' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ detail: 'Password must be at least 6 characters' });
  }
  if (learners.some((l) => l.email === cleanEmail)) {
    return res.status(400).json({ detail: 'An account with this email already exists' });
  }

  const { salt, hash } = passwordHash(password);
  const learner: Learner = {
    id: crypto.randomUUID(),
    name: cleanName,
    email: cleanEmail,
    password_hash: hash,
    salt,
  };
  learners.push(learner);
  saveJson('learners.json', learners);

  // Transfer anonymous logs
  if (previous_user_id) {
    practiceLogs.forEach((l) => {
      if (l.user_id === previous_user_id) l.user_id = learner.id;
    });
    saveJson('practice-logs.json', practiceLogs);
  }

  res.json({
    token: makeToken(learner.id, 'learner'),
    learner: { id: learner.id, name: learner.name, email: learner.email },
  });
});

apiRouter.post('/learner/login', (req, res) => {
  const { email, password, previous_user_id } = req.body;
  const cleanEmail = String(email || '').trim().toLowerCase();
  const learner = learners.find((l) => l.email === cleanEmail);

  if (!learner || !checkPassword(password, learner)) {
    return res.status(401).json({ detail: 'Invalid email or password' });
  }

  if (previous_user_id) {
    practiceLogs.forEach((l) => {
      if (l.user_id === previous_user_id) l.user_id = learner.id;
    });
    saveJson('practice-logs.json', practiceLogs);
  }

  res.json({
    token: makeToken(learner.id, 'learner'),
    learner: { id: learner.id, name: learner.name, email: learner.email },
  });
});

apiRouter.get('/learner/me', (req, res) => {
  const user = getAuthUser(req, 'learner');
  if (!user) return res.status(401).json({ detail: 'Not authenticated' });
  res.json({ id: user.id, name: user.name, email: user.email });
});

// Progress Tracking (never accepts client-supplied scores or score_verified flags)
apiRouter.post('/progress/activity', (req, res) => {
  const activity = req.body || {};
  const surahNum = typeof activity.surah_number === 'number' ? activity.surah_number : undefined;
  const result = commitPracticeActivity({
    activity,
    practiceLogs,
    rooms,
    creditedGroupTurns,
    maxAyahCount: surahNum !== undefined ? surahAyahCounts.get(surahNum) : undefined,
    persistLogs: (logs) => saveJson('practice-logs.json', logs),
    createId: () => crypto.randomUUID(),
    nowIso: () => new Date().toISOString(),
  });
  return res.status(result.status).json(result.body);
});

apiRouter.get('/progress', (req, res) => {
  const userId = req.query.user_id as string;
  if (!userId) return res.status(400).json({ detail: 'user_id required' });
  const stats = computeProgress(userId);
  res.json(stats);
});

// Teacher Auth & Classroom Management
apiRouter.post('/teacher/register', (req, res) => {
  const { name, email, password } = req.body;
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanName = String(name || '').trim();

  if (!cleanName || !cleanEmail || !password) {
    return res.status(400).json({ detail: 'Name, email, and password are required' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ detail: 'Password must be at least 6 characters' });
  }
  if (teachers.some((t) => t.email === cleanEmail)) {
    return res.status(400).json({ detail: 'An account with this email already exists' });
  }

  const { salt, hash } = passwordHash(password);
  const teacher: Teacher = {
    id: crypto.randomUUID(),
    name: cleanName,
    email: cleanEmail,
    password_hash: hash,
    salt,
  };
  teachers.push(teacher);
  saveJson('teachers.json', teachers);

  res.json({
    token: makeToken(teacher.id, 'teacher'),
    teacher: { id: teacher.id, name: teacher.name, email: teacher.email },
  });
});

apiRouter.post('/teacher/login', (req, res) => {
  const { email, password } = req.body;
  const cleanEmail = String(email || '').trim().toLowerCase();
  const teacher = teachers.find((t) => t.email === cleanEmail);

  if (!teacher || !checkPassword(password, teacher)) {
    return res.status(401).json({ detail: 'Invalid email or password' });
  }

  res.json({
    token: makeToken(teacher.id, 'teacher'),
    teacher: { id: teacher.id, name: teacher.name, email: teacher.email },
  });
});

apiRouter.get('/teacher/me', (req, res) => {
  const teacher = getAuthUser(req, 'teacher');
  if (!teacher) return res.status(401).json({ detail: 'Not authenticated' });
  res.json({ id: teacher.id, name: teacher.name, email: teacher.email });
});

apiRouter.post('/teacher/forgot-password', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const teacher = teachers.find((t) => t.email === email);
  if (!teacher) {
    return res.status(404).json({ detail: 'No teacher found with this email' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  resetTokens.push({ token, email, created_at: new Date().toISOString(), used: false });
  res.json({
    message: 'Password reset link generated',
    reset_token: token,
    reset_link: `/teacher/reset?token=${token}`,
  });
});

apiRouter.post('/teacher/reset-password', (req, res) => {
  const { token, new_password } = req.body;
  const entry = resetTokens.find((r) => r.token === token && !r.used);
  if (!entry) {
    return res.status(400).json({ detail: 'Invalid or expired token' });
  }
  const teacher = teachers.find((t) => t.email === entry.email);
  if (!teacher) return res.status(404).json({ detail: 'Teacher not found' });

  const { salt, hash } = passwordHash(new_password);
  teacher.password_hash = hash;
  teacher.salt = salt;
  entry.used = true;
  saveJson('teachers.json', teachers);

  res.json({ ok: true, message: 'Password updated successfully' });
});

// Teacher Classes
apiRouter.post('/teacher/classes', (req, res) => {
  const teacher = getAuthUser(req, 'teacher');
  if (!teacher) return res.status(401).json({ detail: 'Unauthorized' });

  const name = String(req.body.name || 'My Class').trim();
  const code = Math.random().toString(36).substring(2, 7).toUpperCase();
  const newClass: ClassDoc = {
    code,
    name,
    teacher_id: teacher.id,
    created_at: new Date().toISOString(),
  };
  classes.unshift(newClass);
  saveJson('classes.json', classes);

  res.json({ code: newClass.code, name: newClass.name, teacher_id: teacher.id, student_count: 0 });
});

apiRouter.get('/teacher/classes', (req, res) => {
  const teacher = getAuthUser(req, 'teacher');
  if (!teacher) return res.status(401).json({ detail: 'Unauthorized' });

  const teacherClasses = classes.filter((c) => c.teacher_id === teacher.id);
  const out = teacherClasses.map((c) => ({
    ...c,
    student_count: classMembers.filter((m) => m.code === c.code).length,
  }));
  res.json(out);
});

apiRouter.get('/teacher/classes/:code', (req, res) => {
  const teacher = getAuthUser(req, 'teacher');
  if (!teacher) return res.status(401).json({ detail: 'Unauthorized' });

  const code = req.params.code.toUpperCase();
  const cls = classes.find((c) => c.code === code && c.teacher_id === teacher.id);
  if (!cls) return res.status(404).json({ detail: 'Class not found' });

  const members = classMembers.filter((m) => m.code === code);
  const students = members.map((m) => {
    const prog = computeProgress(m.user_id);
    const weeklyLogs = practiceLogs.filter(
      (l) => l.user_id === m.user_id && Date.now() - new Date(l.created_at).getTime() < 7 * 86400000
    );
    return {
      name: m.name,
      user_id: m.user_id,
      joined_at: m.joined_at,
      current_streak: prog.current_streak,
      best_streak: prog.best_streak,
      total_recitations: prog.total_recitations,
      average_score: prog.average_score,
      score_verified: prog.score_verified,
      total_xp: prog.total_xp,
      level: prog.level,
      surahs_practiced: prog.surahs_practiced,
      surah_counts: prog.surah_counts,
      surah_best: prog.surah_best,
      weekly_xp: weeklyLogs.reduce((sum, l) => sum + (l.xp || 0), 0),
      weekly_count: weeklyLogs.length,
    };
  });

  res.json({
    ...cls,
    students,
    student_count: students.length,
  });
});

apiRouter.get('/teacher/classes/:code/students/:userId', (req, res) => {
  const teacher = getAuthUser(req, 'teacher');
  if (!teacher) return res.status(401).json({ detail: 'Unauthorized' });

  const code = req.params.code.toUpperCase();
  const userId = req.params.userId;
  const member = classMembers.find((m) => m.code === code && m.user_id === userId);
  const student = learners.find((l) => l.id === userId);

  const prog = computeProgress(userId);
  res.json({
    user_id: userId,
    name: member?.name || student?.name || 'Student',
    joined_at: member?.joined_at || new Date().toISOString(),
    progress: prog,
  });
});

apiRouter.post('/classes/join', (req, res) => {
  const { code, user_id, name } = req.body;
  const cleanCode = String(code || '').trim().toUpperCase();
  const cls = classes.find((c) => c.code === cleanCode);
  if (!cls) return res.status(404).json({ detail: 'No class found with that code' });

  const existing = classMembers.find((m) => m.code === cleanCode && m.user_id === user_id);
  if (existing) {
    existing.name = name || existing.name;
  } else {
    classMembers.push({
      code: cleanCode,
      user_id,
      name: name || 'Student',
      joined_at: new Date().toISOString(),
    });
  }
  saveJson('class-members.json', classMembers);

  res.json({ code: cls.code, class_name: cls.name });
});

apiRouter.get('/classes/mine', (req, res) => {
  const userId = req.query.user_id as string;
  if (!userId) return res.status(400).json({ detail: 'user_id required' });

  const memberships = classMembers.filter((m) => m.user_id === userId);
  const out = memberships.map((m) => {
    const cls = classes.find((c) => c.code === m.code);
    return {
      code: m.code,
      name: cls?.name || m.code,
      joined_at: m.joined_at,
    };
  });
  res.json(out);
});

// Assignments
apiRouter.post('/teacher/classes/:code/assignments', (req, res) => {
  const teacher = getAuthUser(req, 'teacher');
  if (!teacher) return res.status(401).json({ detail: 'Unauthorized' });

  const code = req.params.code.toUpperCase();
  const cls = classes.find((c) => c.code === code && c.teacher_id === teacher.id);
  if (!cls) return res.status(404).json({ detail: 'Class not found' });

  const { surah_number, surah_name, note } = req.body;
  const assignment: AssignmentDoc = {
    id: crypto.randomUUID(),
    class_code: code,
    surah_number: Number(surah_number),
    surah_name: surah_name || '',
    note: String(note || '').trim(),
    created_at: new Date().toISOString(),
  };
  assignments.unshift(assignment);
  saveJson('assignments.json', assignments);

  res.json({ ...assignment, submissions: [] });
});

apiRouter.get('/teacher/classes/:code/assignments', (req, res) => {
  const teacher = getAuthUser(req, 'teacher');
  if (!teacher) return res.status(401).json({ detail: 'Unauthorized' });

  const code = req.params.code.toUpperCase();
  const classAssignments = assignments.filter((a) => a.class_code === code);
  const out = classAssignments.map((a) => ({
    id: a.id,
    surah_number: a.surah_number,
    surah_name: a.surah_name,
    note: a.note,
    created_at: a.created_at,
    submissions: submissions
      .filter((s) => s.assignment_id === a.id)
      .map((s) => {
        const verified = isVerifiedSubmissionScore(s);
        return {
          ...s,
          best_score: verified ? s.best_score : null,
          score_verified: verified,
        };
      }),
  }));
  res.json(out);
});

apiRouter.post('/teacher/assignments/:aid/review', (req, res) => {
  const teacher = getAuthUser(req, 'teacher');
  if (!teacher) return res.status(401).json({ detail: 'Unauthorized' });

  const aid = req.params.aid;
  const { user_id } = req.body;
  const sub = submissions.find((s) => s.assignment_id === aid && s.user_id === user_id);
  if (sub) {
    sub.reviewed = true;
    saveJson('submissions.json', submissions);
  }
  res.json({ ok: true });
});

apiRouter.post('/assignments/:aid/submit', (req, res) => {
  const aid = req.params.aid;
  const { user_id, name } = req.body;
  const a = assignments.find((item) => item.id === aid);
  if (!a) return res.status(404).json({ detail: 'Assignment not found' });

  const verifiedLogs = practiceLogs.filter(
    (l) => l.user_id === user_id && l.surah_number === a.surah_number && isVerifiedScoreLog(l)
  );
  const bestScore = verifiedLogs.length > 0 ? Math.max(...verifiedLogs.map((l) => l.score as number)) : null;
  const scoreVerified = bestScore !== null;

  let sub = submissions.find((s) => s.assignment_id === aid && s.user_id === user_id);
  if (sub) {
    sub.best_score = bestScore;
    sub.score_verified = scoreVerified;
    sub.submitted_at = new Date().toISOString();
  } else {
    sub = {
      assignment_id: aid,
      user_id,
      name: name || 'Student',
      best_score: bestScore,
      score_verified: scoreVerified,
      submitted_at: new Date().toISOString(),
      reviewed: false,
    };
    submissions.push(sub);
  }
  saveJson('submissions.json', submissions);

  res.json({ best_score: bestScore, score_verified: scoreVerified });
});

apiRouter.get('/classes/assignments', (req, res) => {
  const userId = req.query.user_id as string;
  if (!userId) return res.status(400).json({ detail: 'user_id required' });

  const userCodes = classMembers.filter((m) => m.user_id === userId).map((m) => m.code);
  const relevantAssignments = assignments.filter((a) => userCodes.includes(a.class_code));

  const out = relevantAssignments.map((a) => {
    const cls = classes.find((c) => c.code === a.class_code);
    const sub = submissions.find((s) => s.assignment_id === a.id && s.user_id === userId);
    const verified = isVerifiedSubmissionScore(sub);
    return {
      id: a.id,
      class_code: a.class_code,
      class_name: cls?.name || a.class_code,
      surah_number: a.surah_number,
      surah_name: a.surah_name,
      note: a.note,
      created_at: a.created_at,
      submitted: Boolean(sub),
      best_score: verified ? sub!.best_score : null,
      score_verified: verified,
      reviewed: sub?.reviewed ?? false,
    };
  });
  res.json(out);
});

// Group recitation rooms
apiRouter.post('/rooms', (req, res) => {
  const { name, surah_number, surah_name } = req.body || {};
  const validSurahNumber = parseValidSurahNumber(surah_number);
  if (validSurahNumber === null) {
    return res.status(400).json({ detail: 'Valid surah_number (1-114) is required' });
  }
  const total_ayahs = getSurahAyahCount(validSurahNumber)!;
  const device_id = crypto.randomUUID();
  let code = Math.random().toString(36).substring(2, 7).toUpperCase();
  while (rooms.has(code)) {
    code = Math.random().toString(36).substring(2, 7).toUpperCase();
  }

  const room: RoomDoc = {
    instance_id: crypto.randomUUID(),
    code,
    host_device: device_id,
    surah_number: validSurahNumber,
    surah_name: surah_name || '',
    total_ayahs,
    participants: [{ device_id, name: name || 'Host' }],
    status: 'lobby',
    ayah_index: 0,
    turn_index: 0,
    updated_at: new Date().toISOString(),
  };
  rooms.set(code, room);

  res.json({ ...room, device_id });
});

apiRouter.post('/rooms/:code/join', (req, res) => {
  const code = req.params.code.toUpperCase();
  const { name } = req.body;
  const room = rooms.get(code);

  if (!room) return res.status(404).json({ detail: 'Room not found' });
  if (room.status !== 'lobby') return res.status(400).json({ detail: 'Session has already started' });
  if (room.participants.length >= 6) return res.status(400).json({ detail: 'Room is full (max 6)' });

  const device_id = crypto.randomUUID();
  room.participants.push({ device_id, name: name || 'Learner' });
  room.updated_at = new Date().toISOString();

  res.json({ ...room, device_id });
});

apiRouter.get('/rooms/:code', (req, res) => {
  const code = req.params.code.toUpperCase();
  const room = rooms.get(code);
  if (!room) return res.status(404).json({ detail: 'Room not found' });
  res.json(room);
});

apiRouter.post('/rooms/:code/start', (req, res) => {
  const code = req.params.code.toUpperCase();
  const { device_id } = req.body;
  const room = rooms.get(code);

  if (!room) return res.status(404).json({ detail: 'Room not found' });
  if (room.host_device !== device_id) return res.status(403).json({ detail: 'Only host can start' });

  room.status = 'active';
  room.ayah_index = 0;
  room.turn_index = 0;
  room.updated_at = new Date().toISOString();

  res.json(room);
});

apiRouter.post('/rooms/:code/advance', (req, res) => {
  const code = req.params.code.toUpperCase();
  const { device_id } = req.body || {};
  const room = rooms.get(code);

  const result = advanceGroupRoomTurn({
    room,
    deviceId: device_id,
    nowIso: () => new Date().toISOString(),
  });
  if (!result.ok) {
    return res.status(result.status).json({ detail: result.detail });
  }

  res.json(result.room);
});

// Mount /api router
app.use('/api', apiRouter);

// ---------------- Frontend Integration (Vite in Dev / Static in Prod) ----------------
const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
  if (process.env.ALIF_API_ONLY !== '1') {
    if (!isProduction) {
      // Development mode: Mount Vite dev server middlewares
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      // Production mode: Serve built assets from dist
      const distPath = path.resolve(__dirname, 'dist');
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, HOST, () => {
    console.log(`[Alif Quran] Server running on http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

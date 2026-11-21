import { separateBasmala } from "./basmala";
import axios from "axios";

const BACKEND_URL = (typeof process !== "undefined" && process.env?.REACT_APP_BACKEND_URL) || "";
export const API = BACKEND_URL ? `${BACKEND_URL}/api` : "/api";

const client = axios.create({ baseURL: API });

export const getSurahs = () => client.get("/surahs").then((r) => r.data);
export const getReciters = () => client.get("/reciters").then((r) => r.data);
export const getTranslations = () => client.get("/translations").then((r) => r.data);
export const getSurah = (num, reciter, translation) =>
  client
    .get(`/surah/${num}`, { params: { reciter, translation } })
    .then((r) => separateBasmala(r.data, num));
export const getProgress = (userId) =>
  client.get("/progress", { params: { user_id: userId } }).then((r) => r.data);

export const createRoom = (payload) =>
  client.post("/rooms", payload).then((r) => r.data);
export const joinRoom = (code, payload) =>
  client.post(`/rooms/${code}/join`, payload).then((r) => r.data);
export const getRoom = (code) => client.get(`/rooms/${code}`).then((r) => r.data);
export const startRoom = (code, device_id) =>
  client.post(`/rooms/${code}/start`, { device_id }).then((r) => r.data);
export const advanceRoom = (code, device_id, extra = {}) =>
  client.post(`/rooms/${code}/advance`, { device_id, ...extra }).then((r) => r.data);

// ---- Teacher auth + classes ----
const TOKEN_KEY = "qr_teacher_token";
const LEARNER_TOKEN_KEY = "qr_learner_token";
export const setTeacherToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const getTeacherToken = () => localStorage.getItem(TOKEN_KEY);
export const clearTeacherToken = () => localStorage.removeItem(TOKEN_KEY);
const authHeader = () => ({ Authorization: `Bearer ${getTeacherToken()}` });
export const setLearnerToken = (t) => localStorage.setItem(LEARNER_TOKEN_KEY, t);
export const getLearnerToken = () => localStorage.getItem(LEARNER_TOKEN_KEY);
export const clearLearnerToken = () => localStorage.removeItem(LEARNER_TOKEN_KEY);
const learnerAuthHeader = () => ({ Authorization: `Bearer ${getLearnerToken()}` });

export const learnerRegister = (p) => client.post("/learner/register", p).then((r) => r.data);
export const learnerLogin = (p) => client.post("/learner/login", p).then((r) => r.data);
export const learnerMe = () => client.get("/learner/me", { headers: learnerAuthHeader() }).then((r) => r.data);

export const teacherRegister = (p) => client.post("/teacher/register", p).then((r) => r.data);
export const teacherLogin = (p) => client.post("/teacher/login", p).then((r) => r.data);
export const teacherMe = () => client.get("/teacher/me", { headers: authHeader() }).then((r) => r.data);
export const forgotPassword = (email) =>
  client.post("/teacher/forgot-password", { email }).then((r) => r.data);
export const resetPassword = (token, new_password) =>
  client.post("/teacher/reset-password", { token, new_password }).then((r) => r.data);
export const listClasses = () => client.get("/teacher/classes", { headers: authHeader() }).then((r) => r.data);
export const createClass = (name) =>
  client.post("/teacher/classes", { name }, { headers: authHeader() }).then((r) => r.data);
export const classDetail = (code) =>
  client.get(`/teacher/classes/${code}`, { headers: authHeader() }).then((r) => r.data);
export const studentProfile = (code, userId) =>
  client.get(`/teacher/classes/${code}/students/${userId}`, { headers: authHeader() }).then((r) => r.data);
export const createAssignment = (code, payload) =>
  client.post(`/teacher/classes/${code}/assignments`, payload, { headers: authHeader() }).then((r) => r.data);
export const listAssignments = (code) =>
  client.get(`/teacher/classes/${code}/assignments`, { headers: authHeader() }).then((r) => r.data);
export const reviewSubmission = (aid, user_id) =>
  client.post(`/teacher/assignments/${aid}/review`, { user_id }, { headers: authHeader() }).then((r) => r.data);
export const submitAssignment = (aid, payload) =>
  client.post(`/assignments/${aid}/submit`, payload).then((r) => r.data);
export const studentAssignments = (user_id) =>
  client.get("/classes/assignments", { params: { user_id } }).then((r) => r.data);
export const joinClass = (payload) => client.post("/classes/join", payload).then((r) => r.data);
export const myClasses = (user_id) =>
  client.get("/classes/mine", { params: { user_id } }).then((r) => r.data);

export const formatApiError = (detail) => {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
};

export const getTajweed = (num) =>
  client.get(`/surah/${num}/tajweed`).then((r) => separateBasmala(r.data, num));

export const getMultiAudio = (num, reciterIds) =>
  client
    .get(`/surah/${num}/audio`, { params: { reciters: reciterIds.join(",") } })
    .then((r) => r.data);

export const getJuzAudio = (juz, reciter, translation) =>
  client
    .get(`/juz/${juz}/audio`, { params: { reciter, translation } })
    .then((r) => separateBasmala(r.data));

export const getPageAudio = (page, reciter, translation) =>
  client
    .get(`/page/${page}/audio`, { params: { reciter, translation } })
    .then((r) => separateBasmala(r.data));

export const logPracticeActivity = (payload) => client.post("/progress/activity", payload, { headers: getLearnerToken() ? learnerAuthHeader() : {} }).then((r) => r.data);

export const submitRecitation = (formData, options = {}) =>
  client
    .post("/recite/feedback", formData, {
      ...options,
      headers: { "Content-Type": "multipart/form-data" },
    })
    .then((r) => r.data);

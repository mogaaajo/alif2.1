const LEARNER_KEY = "qr_learner";

export const getLearner = () => {
  try { return JSON.parse(localStorage.getItem(LEARNER_KEY) || "null"); } catch { return null; }
};

export const setLearner = (learner) => {
  localStorage.setItem(LEARNER_KEY, JSON.stringify(learner));
  localStorage.setItem("qr_uid", learner.id);
  localStorage.setItem("qr_uname", learner.name);
};

export const clearLearner = () => localStorage.removeItem(LEARNER_KEY);

export const getUserId = () => {
  const learner = getLearner();
  if (learner?.id) return learner.id;
  let id = localStorage.getItem("qr_uid");
  if (!id) {
    id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `u_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem("qr_uid", id);
  }
  return id;
};

export const getUserName = () => localStorage.getItem("qr_uname") || "";
export const setUserName = (n) => localStorage.setItem("qr_uname", n);

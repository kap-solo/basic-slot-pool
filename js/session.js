const STORAGE_KEY = 'basicSlotPool.session';

export function createSession() {
  return {
    highestWin: 0,
    highestMultiplier: 0,
  };
}

/** @returns {object | null} */
export function loadSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function ensureSession(existing) {
  return existing ?? createSession();
}

export function resetSession() {
  sessionStorage.removeItem(STORAGE_KEY);
  return null;
}

export function recordPlay(session, { payout, multiplier }) {
  if (payout > session.highestWin) {
    session.highestWin = payout;
    session.highestMultiplier = multiplier;
  }
  return session;
}

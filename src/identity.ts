import { ENV } from './envConfig';

const ANON_KEY = `${ENV.STORAGE_PREFIX}anon_id`;
const SESSION_KEY = `${ENV.STORAGE_PREFIX}session_id`;
const SESSION_TS_KEY = `${ENV.STORAGE_PREFIX}session_ts`;

function uuidv4(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch { /* storage unavailable */ }
}

/**
 * Returns a persistent anonymous visitor ID. Created once and stored in localStorage.
 */
export function getAnonymousId(): string {
  let id = safeGet(ANON_KEY);
  if (!id) {
    id = uuidv4();
    safeSet(ANON_KEY, id);
  }
  return id;
}

/**
 * Returns the current session ID, rotating it when the session has expired.
 */
export function getSessionId(timeoutMs: number): string {
  const now = Date.now();
  const lastTs = parseInt(safeGet(SESSION_TS_KEY) || '0', 10);
  let sessionId = safeGet(SESSION_KEY);

  if (!sessionId || (now - lastTs) > timeoutMs) {
    sessionId = uuidv4();
    safeSet(SESSION_KEY, sessionId);
  }

  safeSet(SESSION_TS_KEY, String(now));
  return sessionId;
}

/**
 * Explicitly sets the known user ID. Persisted in sessionStorage so it
 * survives SPA navigations but not new browser sessions.
 */
let _userId = '';

export function setUserId(id: string): void {
  _userId = id;
  try {
    sessionStorage.setItem(`${ENV.STORAGE_PREFIX}user_id`, id);
  } catch { /* noop */ }
}

export function getUserId(): string {
  if (_userId) return _userId;
  try {
    _userId = sessionStorage.getItem(`${ENV.STORAGE_PREFIX}user_id`) || '';
  } catch { /* noop */ }
  return _userId;
}

/**
 * Opt-in browser geolocation helper for the Infralytiqs SDK.
 *
 * Behaviour:
 *   • Only ever runs if `InfralytiqsConfig.captureLocation === true`.
 *   • Calls `navigator.geolocation.getCurrentPosition` exactly once per
 *     *authorization state* — meaning:
 *       – Consent granted     → coords cached in localStorage for 7 days
 *                               (browsers already remember the permission,
 *                               so we avoid unnecessary re-prompts).
 *       – Consent denied      → denial flag cached in localStorage for 24h
 *                               (short window so users who change their
 *                               mind in browser settings get picked up).
 *       – Prompt timed out    → NOT cached — we'll retry next page load.
 *   • Never blocks tracking. `requestLocation()` returns a promise that
 *     resolves with cached coords (or null) immediately; the real browser
 *     prompt fires in the background and subsequent events pick up the
 *     coords after the user responds.
 *   • Emits no console noise in production — all failures are swallowed.
 */
import { ENV } from './envConfig';

const STORAGE_KEY = 'il_geo_v1';
const DENY_KEY = 'il_geo_deny_v1';

const GRANT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DENY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const GEO_TIMEOUT_MS = 8000;
const GEO_MAX_AGE_MS = 60 * 60 * 1000; // accept a 1h-old fix

export interface CachedGeoCoords {
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: number;
}

/** Safe storage accessors — localStorage may be disabled (privacy mode). */
const storage = (): Storage | null => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const probe = '__il_geo_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return window.localStorage;
    }
  } catch {
    /* Private mode / quota exceeded — treat as no storage. */
  }
  return null;
};

const readCachedCoords = (): CachedGeoCoords | null => {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedGeoCoords;
    if (
      typeof parsed.latitude === 'number'
      && typeof parsed.longitude === 'number'
      && typeof parsed.capturedAt === 'number'
      && Date.now() - parsed.capturedAt < GRANT_TTL_MS
    ) {
      return parsed;
    }
    s.removeItem(STORAGE_KEY);
  } catch {
    /* corrupted payload — nuke it */
    try { s.removeItem(STORAGE_KEY); } catch { /* noop */ }
  }
  return null;
};

const writeCachedCoords = (coords: CachedGeoCoords): void => {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(coords));
  } catch {
    /* ignore */
  }
};

const isDenyCached = (): boolean => {
  const s = storage();
  if (!s) return false;
  try {
    const raw = s.getItem(DENY_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (Number.isFinite(ts) && Date.now() - ts < DENY_TTL_MS) return true;
    s.removeItem(DENY_KEY);
  } catch { /* ignore */ }
  return false;
};

const markDenied = (): void => {
  const s = storage();
  if (!s) return;
  try { s.setItem(DENY_KEY, String(Date.now())); } catch { /* ignore */ }
};

/** In-memory state shared across all `getCoords()` callers within a page. */
let memoryCoords: CachedGeoCoords | null = null;
let pending: Promise<CachedGeoCoords | null> | null = null;

const prime = (): void => {
  if (memoryCoords) return;
  const cached = readCachedCoords();
  if (cached) memoryCoords = cached;
};

/**
 * Kicks off the permission prompt (or returns a cached fix immediately).
 *
 * Called once from `InfralytiqsTracker.init()` when `captureLocation: true`.
 * Idempotent — subsequent invocations return the same in-flight promise.
 *
 * @param debug Emit a `[Infralytiqs]` log line on each significant state
 *              transition. Matches the tracker's own log gating.
 */
export const requestLocation = (debug?: boolean): Promise<CachedGeoCoords | null> => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return Promise.resolve(null);
  }
  prime();
  if (memoryCoords) return Promise.resolve(memoryCoords);
  if (isDenyCached()) {
    if (debug) console.log('[Infralytiqs] geolocation previously denied — skipping prompt');
    return Promise.resolve(null);
  }
  if (!('geolocation' in navigator) || typeof navigator.geolocation?.getCurrentPosition !== 'function') {
    return Promise.resolve(null);
  }
  if (pending) return pending;

  pending = new Promise<CachedGeoCoords | null>((resolve) => {
    let settled = false;
    const done = (v: CachedGeoCoords | null): void => {
      if (settled) return;
      settled = true;
      pending = null;
      resolve(v);
    };

    // Hard timeout guard — some OSes silently never call back if the
    // permission dialog is dismissed without a click (e.g. alt-tabbed away).
    const timer = window.setTimeout(() => {
      if (debug) console.log(`[Infralytiqs] geolocation prompt timed out after ${GEO_TIMEOUT_MS}ms`);
      done(null);
    }, GEO_TIMEOUT_MS + 1000);

    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          window.clearTimeout(timer);
          const coords: CachedGeoCoords = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            capturedAt: Date.now(),
          };
          memoryCoords = coords;
          writeCachedCoords(coords);
          if (debug) {
            console.log(
              `[Infralytiqs] geolocation granted (sdk=${ENV.SDK_VERSION}, acc=${Math.round(coords.accuracy)}m)`,
            );
          }
          done(coords);
        },
        (err) => {
          window.clearTimeout(timer);
          // PERMISSION_DENIED = 1 — cache the denial for a day so we don't
          // spam the prompt on every page load.
          if (err && err.code === 1) {
            markDenied();
            if (debug) console.log('[Infralytiqs] geolocation permission denied');
          } else if (debug) {
            console.log(`[Infralytiqs] geolocation error (code=${err?.code}): ${err?.message}`);
          }
          done(null);
        },
        {
          enableHighAccuracy: false,
          timeout: GEO_TIMEOUT_MS,
          maximumAge: GEO_MAX_AGE_MS,
        },
      );
    } catch {
      window.clearTimeout(timer);
      done(null);
    }
  });

  return pending;
};

/** Synchronous accessor used on the hot event-capture path. */
export const getCachedCoords = (): CachedGeoCoords | null => {
  if (memoryCoords) return memoryCoords;
  prime();
  return memoryCoords;
};

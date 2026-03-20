import {
  getLightPollutionReport,
  getNightSkyOutlookReport,
  getNightSkyScoreReport,
} from "./service.js";

const SCORE_CACHE_TTL_MS = 15 * 60 * 1000;
const OUTLOOK_CACHE_TTL_MS = 30 * 60 * 1000;
const LIGHT_POLLUTION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 256;

function normalizeCacheValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeCacheValue(item));
  }

  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        if (value[key] === undefined) {
          return result;
        }
        result[key] = normalizeCacheValue(value[key]);
        return result;
      }, {});
  }

  return value;
}

function buildCacheKey(namespace, input) {
  return `${namespace}:${JSON.stringify(normalizeCacheValue(input))}`;
}

function createTimedCache() {
  return new Map();
}

function pruneExpiredEntries(cache) {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
    }
  }

  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    cache.delete(oldestKey);
  }
}

async function getOrCompute(cache, key, ttlMs, producer) {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      cacheStatus: "HIT",
      value: cached.value,
    };
  }

  const value = await producer();
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });

  if (cache.size > MAX_CACHE_ENTRIES) {
    pruneExpiredEntries(cache);
  }

  return {
    cacheStatus: "MISS",
    value,
  };
}

const scoreCache = createTimedCache();
const outlookCache = createTimedCache();
const lightPollutionCache = createTimedCache();

export async function getCachedNightSkyScoreReport(input) {
  const key = buildCacheKey("score", input);
  const { cacheStatus, value } = await getOrCompute(
    scoreCache,
    key,
    SCORE_CACHE_TTL_MS,
    () => getNightSkyScoreReport(input),
  );

  return {
    cacheStatus,
    report: value,
  };
}

export async function getCachedNightSkyOutlookReport(input) {
  const key = buildCacheKey("outlook", input);
  const { cacheStatus, value } = await getOrCompute(
    outlookCache,
    key,
    OUTLOOK_CACHE_TTL_MS,
    () => getNightSkyOutlookReport(input),
  );

  return {
    cacheStatus,
    report: value,
  };
}

export async function getCachedLightPollutionReport(input) {
  const key = buildCacheKey("light-pollution", input);
  const { cacheStatus, value } = await getOrCompute(
    lightPollutionCache,
    key,
    LIGHT_POLLUTION_CACHE_TTL_MS,
    () => getLightPollutionReport(input),
  );

  return {
    cacheStatus,
    report: value,
  };
}

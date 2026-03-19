const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_RETRIES = 3;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getBackoffDelayMs(attempt) {
  return 350 * 2 ** (attempt - 1);
}

function buildRetryMessage({ label, attempts, status = null }) {
  if (status !== null) {
    return `${label} failed after ${attempts} attempts with retryable status ${status}.`;
  }
  return `${label} failed after ${attempts} attempts due to no response from upstream.`;
}

export async function fetchWithRetries(
  url,
  {
    fetchImpl = fetch,
    fetchOptions = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
    label = "Upstream request",
  } = {},
) {
  let lastError = null;
  let lastStatus = null;
  const totalAttempts = maxRetries + 1;

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    let response;

    try {
      response = await fetchImpl(url, {
        ...fetchOptions,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!RETRYABLE_STATUS_CODES.has(response.status)) {
        return response;
      }

      lastStatus = response.status;
      if (attempt === totalAttempts) {
        throw new Error(buildRetryMessage({ label, attempts: totalAttempts, status: response.status }));
      }
    } catch (error) {
      lastError = error;
      if (attempt === totalAttempts) {
        break;
      }
    }

    await sleep(getBackoffDelayMs(attempt));
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error(buildRetryMessage({ label, attempts: totalAttempts, status: lastStatus }));
}

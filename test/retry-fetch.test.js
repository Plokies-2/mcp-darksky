import test from "node:test";
import assert from "node:assert/strict";
import { fetchWithRetries } from "../src/retry-fetch.js";

function createResponse(status, body = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `status-${status}`,
    json: async () => body,
  };
}

test("fetchWithRetries succeeds after transient no-response failures", async () => {
  let callCount = 0;
  const response = await fetchWithRetries("https://example.test", {
    fetchImpl: async () => {
      callCount += 1;
      if (callCount < 3) {
        throw new Error("timeout");
      }
      return createResponse(200, { ok: true });
    },
    maxRetries: 3,
    timeoutMs: 5,
    label: "test-upstream",
  });

  assert.equal(callCount, 3);
  assert.equal(response.status, 200);
});

test("fetchWithRetries retries retryable statuses and then succeeds", async () => {
  let callCount = 0;
  const response = await fetchWithRetries("https://example.test", {
    fetchImpl: async () => {
      callCount += 1;
      return callCount < 3 ? createResponse(503) : createResponse(200, { ok: true });
    },
    maxRetries: 3,
    timeoutMs: 5,
    label: "test-upstream",
  });

  assert.equal(callCount, 3);
  assert.equal(response.status, 200);
});

test("fetchWithRetries does not retry non-retryable client status", async () => {
  let callCount = 0;
  const response = await fetchWithRetries("https://example.test", {
    fetchImpl: async () => {
      callCount += 1;
      return createResponse(404);
    },
    maxRetries: 3,
    timeoutMs: 5,
    label: "test-upstream",
  });

  assert.equal(callCount, 1);
  assert.equal(response.status, 404);
});

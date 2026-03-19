import test from "node:test";
import assert from "node:assert/strict";
import { validateForecastDate } from "../src/service.js";
import { buildHomePage, buildInstallPage } from "../src/web-ui.js";

test("install page includes mcp endpoint and prompt link", () => {
  const html = buildInstallPage({ publicBaseUrl: "https://darksky.example.com" });
  assert.match(html, /https:\/\/darksky\.example\.com\/mcp/);
  assert.match(html, /https:\/\/darksky\.example\.com\/prompt/);
  assert.match(html, /place_query=/);
});

test("home page advertises install guide", () => {
  const html = buildHomePage({ publicBaseUrl: "https://darksky.example.com" });
  assert.match(html, /설치 안내/);
  assert.match(html, /https:\/\/darksky\.example\.com\/api\/score/);
  assert.match(html, /place_query=/);
});

test("validateForecastDate rejects out-of-range past date", () => {
  assert.throws(() => validateForecastDate("2020-01-01", "Asia/Seoul"), RangeError);
});

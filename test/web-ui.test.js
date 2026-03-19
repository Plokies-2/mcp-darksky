import test from "node:test";
import assert from "node:assert/strict";
import { validateForecastDate } from "../src/service.js";
import { buildHomePage, buildInstallPage } from "../src/web-ui.js";

test("install page includes mcp endpoint and prompt link", () => {
  const html = buildInstallPage({ publicBaseUrl: "https://darksky.example.com" });
  assert.match(html, /https:\/\/darksky\.example\.com\/mcp/);
  assert.match(html, /https:\/\/darksky\.example\.com\/prompt/);
  assert.match(html, /place_query=/);
  assert.match(html, /오늘 밤, 찍을 수 있는/);
  assert.match(html, /canvas class="stars"/);
  assert.match(html, /mcp-darksky의 응답:/);
  assert.match(html, /내일 밤 11시에 육백마지기에서 은하수 촬영 괜찮을까/);
  assert.match(html, /ChatGPT에 붙이면 바로 쓸 수 있습니다/);
});

test("home page advertises install guide", () => {
  const html = buildHomePage({ publicBaseUrl: "https://darksky.example.com" });
  assert.match(html, /설치 안내 보기/);
  assert.match(html, /https:\/\/darksky\.example\.com\/api\/score/);
  assert.match(html, /place_query=/);
  assert.match(html, /밤하늘 촬영 판단을/);
});

test("validateForecastDate rejects out-of-range past date", () => {
  assert.throws(() => validateForecastDate("2020-01-01", "Asia/Seoul"), RangeError);
});

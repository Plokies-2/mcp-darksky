import test from "node:test";
import assert from "node:assert/strict";
import { validateForecastDate } from "../src/service.js";
import { buildHomePage, buildInstallPage } from "../src/web-ui.js";

test("install page focuses on apps onboarding and GitHub docs", () => {
  const html = buildInstallPage({ publicBaseUrl: "https://darksky.example.com" });

  assert.ok(html.includes("https://darksky.example.com/mcp"));
  assert.ok(html.includes("https://github.com/Plokies-2/mcp-darksky"));
  assert.ok(html.includes("GitHub"));
  assert.ok(html.includes('canvas class="stars"'));
  assert.ok(!html.includes("place_query="));
  assert.ok(!html.includes('data-open-panel="details-panel"'));
  assert.ok(!html.includes("2026-03-19-continuous-bortle-v2-korea-calibrated"));
  assert.ok(!html.includes("https://darksky.example.com/prompt"));
  assert.ok(html.includes("필수 고려사항"));
  assert.ok(html.includes("조건 요약"));
  assert.ok(html.includes("광해등급"));
});

test("home page advertises install guide and the five shooting modes", () => {
  const html = buildHomePage({ publicBaseUrl: "https://darksky.example.com" });

  assert.ok(html.includes("https://darksky.example.com/api/score"));
  assert.ok(html.includes("place_query="));
  assert.ok(html.includes("wide_field_milky_way"));
  assert.ok(html.includes("wide_field_nightscape"));
  assert.ok(html.includes("broadband_deep_sky"));
  assert.ok(html.includes("narrowband_deep_sky"));
  assert.ok(html.includes("star_trail"));
  assert.ok(html.includes("추천 시간, 이유 비교, 시간대별 점수 표, 계산 요소, 고려사항, 숙련자 참고"));
});

test("validateForecastDate rejects out-of-range past date", () => {
  assert.throws(() => validateForecastDate("2020-01-01", "Asia/Seoul"), RangeError);
});

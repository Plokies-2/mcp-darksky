import test from "node:test";
import assert from "node:assert/strict";
import { buildPromptText, parseScoreQuery } from "../src/service.js";

test("parseScoreQuery converts HTTP query values into score input", () => {
  const parsed = parseScoreQuery({
    latitude: "35.15",
    longitude: "128.99",
    date: "2026-05-18",
    timezone: "Asia/Seoul",
    location_name: "Busan",
    bortle_class: "4",
    elevation_m: "120",
    near_water: "true",
  });

  assert.deepEqual(parsed, {
    latitude: 35.15,
    longitude: 128.99,
    place_query: undefined,
    date: "2026-05-18",
    timezone: "Asia/Seoul",
    location_name: "Busan",
    site_profile: {
      bortle_class: 4,
      elevation_m: 120,
      near_water: true,
    },
  });
});

test("parseScoreQuery accepts place_query without coordinates", () => {
  const parsed = parseScoreQuery({
    place_query: "안반데기",
    date: "2026-05-18",
    timezone: "Asia/Seoul",
    bortle_class: "3",
  });

  assert.deepEqual(parsed, {
    latitude: undefined,
    longitude: undefined,
    place_query: "안반데기",
    date: "2026-05-18",
    timezone: "Asia/Seoul",
    location_name: undefined,
    site_profile: {
      bortle_class: 3,
      elevation_m: undefined,
      near_water: undefined,
    },
  });
});

test("buildPromptText references JSON API entrypoint", () => {
  const promptText = buildPromptText({
    publicBaseUrl: "https://darksky.example.com",
  });

  assert.match(promptText, /https:\/\/darksky\.example\.com\/api\/score/);
  assert.match(promptText, /scores, derived_recommendations, risk_flags/);
  assert.match(promptText, /place_query/);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPromptText,
  getForecastDetailPolicy,
  getNightSkyScoreReport,
  parseOutlookQuery,
  parseScoreQuery,
  reconcileObservationPoint,
} from "../src/service.js";

test("parseScoreQuery converts HTTP query values into score input", () => {
  const parsed = parseScoreQuery({
    latitude: "35.15",
    longitude: "128.99",
    date: "2026-05-18",
    timezone: "Asia/Seoul",
    location_name: "Busan",
    mode: "general",
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
    mode: "general",
    shooting_goal: undefined,
    site_profile: {
      bortle_class: 4,
      elevation_m: 120,
      near_water: true,
    },
    target: undefined,
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
    mode: "general",
    shooting_goal: undefined,
    site_profile: {
      bortle_class: 3,
      elevation_m: undefined,
      near_water: undefined,
    },
    target: undefined,
  });
});

test("parseScoreQuery accepts target name and custom coordinates", () => {
  const parsed = parseScoreQuery({
    latitude: "35.15",
    longitude: "128.99",
    date: "2026-05-18",
    target_name: "Andromeda Galaxy",
    target_ra_hours: "0.7123",
    target_dec_degrees: "41.2692",
    target_category: "deep_sky",
  });

  assert.deepEqual(parsed, {
    latitude: 35.15,
    longitude: 128.99,
    place_query: undefined,
    date: "2026-05-18",
    timezone: "Asia/Seoul",
    location_name: undefined,
    mode: "general",
    shooting_goal: undefined,
    site_profile: {
      bortle_class: undefined,
      elevation_m: undefined,
      near_water: undefined,
    },
    target: {
      name: "Andromeda Galaxy",
      ra_hours: 0.7123,
      dec_degrees: 41.2692,
      category: "deep_sky",
    },
  });
});

test("parseScoreQuery normalizes legacy explicit mode aliases and preserves target category", () => {
  const parsed = parseScoreQuery({
    latitude: "35.15",
    longitude: "128.99",
    date: "2026-05-18",
    mode: "wide-field",
    target_name: "Rho Ophiuchi",
    target_ra_hours: "16.4264",
    target_dec_degrees: "-23.4469",
    target_category: "wide_field",
  });

  assert.equal(parsed.mode, "wide_field_nightscape");
  assert.deepEqual(parsed.target, {
    name: "Rho Ophiuchi",
    ra_hours: 16.4264,
    dec_degrees: -23.4469,
    category: "wide_field",
  });
});

test("parseOutlookQuery accepts simplified distant-date input", () => {
  const parsed = parseOutlookQuery({
    place_query: "안반데기",
    date: "2026-03-26",
    mode: "milky_way",
    bortle_class: "3",
  });

  assert.deepEqual(parsed, {
    latitude: undefined,
    longitude: undefined,
    place_query: "안반데기",
    date: "2026-03-26",
    location_name: undefined,
    timezone: "Asia/Seoul",
    mode: "wide_field_milky_way",
    shooting_goal: undefined,
    site_profile: {
      bortle_class: 3,
      elevation_m: undefined,
      near_water: undefined,
    },
    target: undefined,
  });
});

test("parseScoreQuery carries shooting_goal for intent-aware routing", () => {
  const parsed = parseScoreQuery({
    latitude: "37.62",
    longitude: "128.73",
    date: "2026-03-20",
    shooting_goal: "은하수 광각 촬영",
  });

  assert.equal(parsed.shooting_goal, "은하수 광각 촬영");
  assert.equal(parsed.mode, "general");
});

test("parseOutlookQuery accepts target and shooting_goal together", () => {
  const parsed = parseOutlookQuery({
    place_query: "안반데기",
    date: "2026-03-26",
    shooting_goal: "오리온 성운 협대역",
    target_name: "Orion Nebula",
    target_category: "deep_sky",
  });

  assert.deepEqual(parsed.target, {
    name: "Orion Nebula",
    ra_hours: undefined,
    dec_degrees: undefined,
    category: "deep_sky",
  });
  assert.equal(parsed.shooting_goal, "오리온 성운 협대역");
});

test("getForecastDetailPolicy downgrades after full-detail window", () => {
  const full = getForecastDetailPolicy("2026-03-24", "Asia/Seoul");
  const reduced = getForecastDetailPolicy("2026-03-26", "Asia/Seoul");

  assert.equal(full.detail_level, "full");
  assert.equal(full.requires_outlook_path, false);
  assert.equal(reduced.detail_level, "reduced");
  assert.equal(reduced.requires_outlook_path, true);
  assert.equal(reduced.include_air_quality, true);
});

test("getNightSkyScoreReport returns fallback payload for distant dates", async () => {
  const report = await getNightSkyScoreReport({
    latitude: 37.6229,
    longitude: 128.7391,
    date: "2026-03-26",
    timezone: "Asia/Seoul",
    mode: "wide_field_milky_way",
    publicBaseUrl: "https://darksky.example.com",
  });

  assert.equal(report.report_kind, "fallback_required");
  assert.equal(report.recommended_tool, "score_night_sky_outlook");
  assert.match(report.recommended_api_url, /\/api\/score-outlook\?/);
  assert.equal(report.detail_policy.detail_level, "reduced");
});

test("getNightSkyScoreReport resolves purpose-fit mode for distant-date fallback payloads", async () => {
  const report = await getNightSkyScoreReport({
    latitude: 37.6229,
    longitude: 128.7391,
    date: "2026-03-26",
    timezone: "Asia/Seoul",
    shooting_goal: "별궤적 촬영",
    publicBaseUrl: "https://darksky.example.com",
  });

  assert.equal(report.recommended_input.mode, "star_trail");
  assert.match(report.recommended_api_url, /mode=star_trail/);
  assert.match(report.recommended_api_url, /shooting_goal=/);
});

test("getNightSkyScoreReport ignores unknown name-only targets instead of crashing", async () => {
  const report = await getNightSkyScoreReport({
    latitude: 37.6229,
    longitude: 128.7391,
    date: "2026-03-26",
    timezone: "Asia/Seoul",
    mode: "star_trail",
    target: {
      name: "Polaris/하늘",
    },
    publicBaseUrl: "https://darksky.example.com",
  });

  assert.equal(report.report_kind, "fallback_required");
  assert.equal(report.recommended_input.target.name, "Polaris/하늘");
});

test("buildPromptText references JSON API entrypoint", () => {
  const promptText = buildPromptText({
    publicBaseUrl: "https://darksky.example.com",
  });

  assert.match(promptText, /https:\/\/darksky\.example\.com\/api\/score/);
  assert.match(promptText, /request_context, scores, derived_recommendations, risk_flags/);
  assert.match(promptText, /place_query/);
  assert.match(promptText, /shooting_goal/);
});

test("reconcileObservationPoint prefers place_query when hallucinated coordinates conflict materially", () => {
  const point = reconcileObservationPoint(
    {
      latitude: 37.1,
      longitude: 128.5,
      place_query: "안반데기",
      location_name: "안반데기",
    },
    {
      latitude: 37.6229,
      longitude: 128.7391,
      locationName: "안반데기",
      addressName: "강원특별자치도 강릉시 왕산면",
      roadAddressName: "",
      placeName: "안반데기",
      provider: "kakao_local",
    },
  );

  assert.equal(point.resolvedFrom, "place_query");
  assert.equal(point.coordinatesOverriddenByPlaceQuery, true);
  assert.ok(point.coordinateConflictKm > 20);
  assert.deepEqual(point.inputCoordinates, {
    latitude: 37.1,
    longitude: 128.5,
  });
});

test("reconcileObservationPoint keeps explicit coordinates when they are close to the resolved place", () => {
  const point = reconcileObservationPoint(
    {
      latitude: 37.6229,
      longitude: 128.7391,
      place_query: "안반데기",
      location_name: "안반데기",
    },
    {
      latitude: 37.6235,
      longitude: 128.7394,
      locationName: "안반데기",
      addressName: "강원특별자치도 강릉시 왕산면",
      roadAddressName: "",
      placeName: "안반데기",
      provider: "kakao_local",
    },
  );

  assert.equal(point.resolvedFrom, "coordinates");
  assert.equal(point.coordinatesOverriddenByPlaceQuery, false);
  assert.ok(point.coordinateMatchKm < 1);
});

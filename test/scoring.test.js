import test from "node:test";
import assert from "node:assert/strict";
import { generateNightSkyReport } from "../src/scoring.js";

function buildHour(time, overrides = {}) {
  return {
    time,
    temperature_2m: 8,
    dew_point_2m: 1,
    relative_humidity_2m: 58,
    cloud_cover: 8,
    cloud_cover_low: 5,
    cloud_cover_mid: 8,
    cloud_cover_high: 12,
    visibility: 24000,
    precipitation_probability: 0,
    precipitation: 0,
    rain: 0,
    showers: 0,
    snowfall: 0,
    weather_code: 0,
    wind_speed_10m: 6,
    wind_gusts_10m: 10,
    pm2_5: 7,
    pm10: 12,
    aerosol_optical_depth: 0.08,
    dust: 10,
    ...overrides,
  };
}

function generateReport(hourlyForecast, siteProfile = { bortleClass: 3 }) {
  return generateNightSkyReport({
    latitude: 35.15,
    longitude: 128.99,
    date: "2026-05-18",
    timezone: "Asia/Seoul",
    locationName: "Busan Test Site",
    hourlyForecast,
    siteProfile,
  });
}

test("clear dry moonless-like conditions produce strong overall score", () => {
  const report = generateReport([
    buildHour("2026-05-18T11:00:00Z"),
    buildHour("2026-05-18T12:00:00Z"),
    buildHour("2026-05-18T13:00:00Z"),
    buildHour("2026-05-18T14:00:00Z"),
    buildHour("2026-05-18T15:00:00Z"),
  ]);

  assert.ok(report.scores.overall_score >= 60);
  assert.equal(report.derived_recommendations.go_no_go, "go");
});

test("bright hazy conditions reduce transparency and readiness", () => {
  const report = generateReport([
    buildHour("2026-05-18T11:00:00Z", {
      pm2_5: 50,
      pm10: 110,
      aerosol_optical_depth: 0.55,
      visibility: 9000,
    }),
    buildHour("2026-05-18T12:00:00Z", {
      pm2_5: 55,
      pm10: 120,
      aerosol_optical_depth: 0.65,
      visibility: 8000,
    }),
    buildHour("2026-05-18T13:00:00Z", {
      pm2_5: 60,
      pm10: 130,
      aerosol_optical_depth: 0.7,
      visibility: 7000,
    }),
  ]);

  assert.ok(report.scores.transparency_score < 40);
  assert.ok(report.risk_flags.includes("미세먼지 또는 연무로 투명도 저하"));
});

test("high humidity and tiny spread trigger dew mitigation", () => {
  const report = generateReport([
    buildHour("2026-05-18T11:00:00Z", {
      temperature_2m: 9,
      dew_point_2m: 8,
      relative_humidity_2m: 96,
    }),
    buildHour("2026-05-18T12:00:00Z", {
      temperature_2m: 8,
      dew_point_2m: 7.5,
      relative_humidity_2m: 97,
    }),
    buildHour("2026-05-18T13:00:00Z", {
      temperature_2m: 7,
      dew_point_2m: 6.5,
      relative_humidity_2m: 98,
    }),
  ]);

  assert.equal(report.derived_recommendations.dew_heater_needed, true);
  assert.ok(report.risk_flags.includes("렌즈 결로 주의"));
});

test("late clearing shifts best window toward dawn", () => {
  const report = generateReport([
    buildHour("2026-05-18T11:00:00Z", {
      cloud_cover_low: 90,
      cloud_cover_mid: 80,
      cloud_cover_high: 70,
    }),
    buildHour("2026-05-18T12:00:00Z", {
      cloud_cover_low: 85,
      cloud_cover_mid: 75,
      cloud_cover_high: 60,
    }),
    buildHour("2026-05-18T13:00:00Z", {
      cloud_cover_low: 20,
      cloud_cover_mid: 15,
      cloud_cover_high: 10,
    }),
    buildHour("2026-05-18T14:00:00Z", {
      cloud_cover_low: 8,
      cloud_cover_mid: 10,
      cloud_cover_high: 12,
    }),
  ]);

  assert.equal(report.derived_recommendations.best_window.start, "2026-05-18T13:00:00Z");
});

test("precipitation is treated as a hard fail", () => {
  const report = generateReport([
    buildHour("2026-05-18T11:00:00Z", {
      precipitation: 1.2,
      rain: 1.2,
      precipitation_probability: 90,
    }),
    buildHour("2026-05-18T12:00:00Z", {
      precipitation: 0.8,
      rain: 0.8,
      precipitation_probability: 85,
    }),
  ]);

  assert.equal(report.derived_recommendations.go_no_go, "no_go");
  assert.ok(report.hourly_conditions.every((hour) => hour.hard_fail_reasons.length > 0));
});

test("higher bortle class reduces darkness score against same weather", () => {
  const hourly = [
    buildHour("2026-05-18T11:00:00Z"),
    buildHour("2026-05-18T12:00:00Z"),
    buildHour("2026-05-18T13:00:00Z"),
  ];

  const darkSite = generateReport(hourly, { bortleClass: 2 });
  const brightSite = generateReport(hourly, { bortleClass: 7 });

  assert.ok(darkSite.scores.darkness_score > brightSite.scores.darkness_score);
});

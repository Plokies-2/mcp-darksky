import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clearLightPollutionCache, getEstimatedLightPollution } from "../src/light-pollution.js";
import { generateNightSkyReport } from "../src/scoring.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const statsPath = path.join(projectRoot, "data", "black-marble-korea-stats.json");
const vnpDir = path.join(projectRoot, "data", "VNP46A4");
const vjDir = path.join(projectRoot, "data", "VJ146A4");
const hasBlackMarbleData = fs.existsSync(vnpDir) && fs.existsSync(vjDir);

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

test("light pollution estimate separates Seoul from a dark mountain site", { skip: !hasBlackMarbleData }, async () => {
  clearLightPollutionCache();

  const seoul = await getEstimatedLightPollution({
    latitude: 37.5665,
    longitude: 126.9780,
  });
  const anbandegi = await getEstimatedLightPollution({
    latitude: 37.6229,
    longitude: 128.7391,
  });

  assert.ok(fs.existsSync(statsPath));
  assert.ok(seoul.estimated_bortle_center > anbandegi.estimated_bortle_center);
  assert.ok(seoul.local_radiance > anbandegi.local_radiance);
});

test("generated report uses estimated bortle when explicit bortle is not provided", () => {
  const report = generateNightSkyReport({
    latitude: 35.15,
    longitude: 128.99,
    date: "2026-05-18",
    timezone: "Asia/Seoul",
    locationName: "Busan Test Site",
    hourlyForecast: [
      buildHour("2026-05-18T11:00:00Z"),
      buildHour("2026-05-18T12:00:00Z"),
      buildHour("2026-05-18T13:00:00Z"),
    ],
    lightPollutionEstimate: {
      estimated_bortle_center: 7,
      estimated_bortle_band: "7-8",
      confidence: "medium",
    },
    siteProfile: {},
  });

  assert.equal(report.location.site_profile.bortle_class, 7);
  assert.equal(report.location.site_profile.estimated_bortle_band, "7-8");
  assert.equal(report.light_pollution_context.estimated_bortle_center, 7);
});

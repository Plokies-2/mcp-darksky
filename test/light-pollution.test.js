import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clearLightPollutionCache, getEstimatedLightPollution } from "../src/light-pollution.js";
import { generateNightSkyReport } from "../src/scoring.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const statsPath = path.join(projectRoot, "data", "black-marble-korea-stats.json");
const distributionPath = path.join(projectRoot, "data", "black-marble-korea-distribution.json");
const runtimeArtifactPath = path.join(projectRoot, "test", "fixtures", "black-marble-runtime-mini.npz");
const vnpDir = path.join(projectRoot, "data", "VNP46A4");
const vjDir = path.join(projectRoot, "data", "VJ146A4");
const hasBlackMarbleData = fs.existsSync(vnpDir) && fs.existsSync(vjDir);
const hasPythonWithNumpy = spawnSync("python", ["-c", "import numpy"], { stdio: "ignore" }).status === 0;
const hasRuntimeArtifactFixture = hasPythonWithNumpy && fs.existsSync(runtimeArtifactPath);

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
  assert.ok(seoul.estimated_bortle_range.low <= seoul.estimated_bortle_center);
  assert.ok(seoul.estimated_bortle_range.high >= seoul.estimated_bortle_center);
  assert.ok(typeof seoul.equivalent_zenith_brightness_mpsas === "number");
});

test("runtime artifact estimate separates Seoul from a dark mountain site", { skip: !hasRuntimeArtifactFixture }, async () => {
  clearLightPollutionCache();

  const seoul = await getEstimatedLightPollution({
    latitude: 37.5665,
    longitude: 126.9780,
    runtimeArtifactPath,
  });
  const anbandegi = await getEstimatedLightPollution({
    latitude: 37.6229,
    longitude: 128.7391,
    runtimeArtifactPath,
  });

  assert.equal(seoul.sensor_samples.runtime_artifact.version, "test-fixture-runtime-artifact-v1");
  assert.ok(seoul.estimated_bortle_center > anbandegi.estimated_bortle_center);
  assert.ok(seoul.local_radiance > anbandegi.local_radiance);
  assert.ok(seoul.estimated_bortle_range.low <= seoul.estimated_bortle_center);
  assert.ok(seoul.estimated_bortle_range.high >= seoul.estimated_bortle_center);
});

test("light pollution estimate includes Korea-wide percentile context when distribution data exists", {
  skip: !hasBlackMarbleData || !fs.existsSync(distributionPath),
}, async () => {
  clearLightPollutionCache();

  const seoul = await getEstimatedLightPollution({
    latitude: 37.5665,
    longitude: 126.9780,
  });

  assert.ok(seoul.distribution_context);
  assert.ok(typeof seoul.distribution_context.brightness_percentile_in_korea === "number");
  assert.ok(typeof seoul.distribution_context.darkness_percentile_in_korea === "number");
  assert.ok(typeof seoul.distribution_context.estimated_bortle_distribution_skewness === "number");
});

test("runtime artifact estimate includes Korea-wide percentile context when distribution data exists", {
  skip: !hasRuntimeArtifactFixture || !fs.existsSync(distributionPath),
}, async () => {
  clearLightPollutionCache();

  const seoul = await getEstimatedLightPollution({
    latitude: 37.5665,
    longitude: 126.9780,
    runtimeArtifactPath,
  });

  assert.ok(seoul.distribution_context);
  assert.ok(typeof seoul.distribution_context.brightness_percentile_in_korea === "number");
  assert.ok(typeof seoul.distribution_context.darkness_percentile_in_korea === "number");
});

test("dark Korean mountain sites no longer collapse into unrealistic class-1 or class-2 centers", {
  skip: !hasBlackMarbleData,
}, async () => {
  clearLightPollutionCache();

  const andbandegi = await getEstimatedLightPollution({
    latitude: 37.62290058479758,
    longitude: 128.7391412750242,
  });
  const yukbaekmajigi = await getEstimatedLightPollution({
    latitude: 37.40334417494712,
    longitude: 128.5151042157018,
  });
  const guryeongnyeong = await getEstimatedLightPollution({
    latitude: 37.8799155232604,
    longitude: 128.514082447769,
  });

  assert.ok(andbandegi.estimated_bortle_center >= 3.8);
  assert.ok(yukbaekmajigi.estimated_bortle_center >= 3.6);
  assert.ok(guryeongnyeong.estimated_bortle_center >= 3.4);
});

test("Hwaak Tunnel stays close to class-4 benchmark despite local bright tail", {
  skip: !hasBlackMarbleData,
}, async () => {
  clearLightPollutionCache();

  const hwaakTunnel = await getEstimatedLightPollution({
    latitude: 38.0014025638357,
    longitude: 127.525908310701,
  });

  assert.ok(hwaakTunnel.estimated_bortle_center <= 4.3);
  assert.ok(hwaakTunnel.local_high_tail_skew >= 0);
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
      estimated_bortle_center: 6.7,
      estimated_bortle_band: "6-7",
      estimated_bortle_range: {
        low: 6.2,
        high: 7.1,
      },
      estimated_bortle_interval_label: "6.2-7.1",
      equivalent_zenith_brightness_mpsas: 20.11,
      confidence: "medium",
    },
    siteProfile: {},
  });

  assert.equal(report.location.site_profile.bortle_class, 6.7);
  assert.equal(report.location.site_profile.estimated_bortle_band, "6-7");
  assert.deepEqual(report.location.site_profile.estimated_bortle_range, {
    low: 6.2,
    high: 7.1,
  });
  assert.equal(report.light_pollution_context.estimated_bortle_center, 6.7);
});

import test from "node:test";
import assert from "node:assert/strict";
import { generateNightSkyReport } from "../src/scoring.js";
import { getAstronomyContext } from "../src/astronomy.js";

function buildHour(time, overrides = {}) {
  return {
    time,
    temperature_2m: 8,
    apparent_temperature: 6,
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

function generateReport(hourlyForecast, siteProfile = { bortleClass: 3 }, options = {}) {
  return generateNightSkyReport({
    latitude: 35.15,
    longitude: 128.99,
    date: "2026-05-18",
    timezone: "Asia/Seoul",
    locationName: "Busan Test Site",
    hourlyForecast,
    siteProfile,
    ...options,
  });
}

function generateReportByDate({
  date,
  time,
  mode = "general",
  siteProfile = { bortleClass: 3 },
  target = null,
  hourlyForecast,
}) {
  const baseHour = buildHour(time);
  const reportHours = hourlyForecast ?? [baseHour];

  return generateNightSkyReport({
    latitude: 35.15,
    longitude: 128.99,
    date,
    timezone: "Asia/Seoul",
    locationName: "Busan Test Site",
    hourlyForecast: reportHours,
    siteProfile,
    mode,
    target,
  });
}

function generateReportWithTarget(hourlyForecast, target) {
  return generateNightSkyReport({
    latitude: 35.15,
    longitude: 128.99,
    date: "2026-05-18",
    timezone: "Asia/Seoul",
    locationName: "Busan Test Site",
    hourlyForecast,
    siteProfile: { bortleClass: 3 },
    target,
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

test("target input adds hourly altitude context and summary", () => {
  const report = generateReportWithTarget(
    [
      buildHour("2026-05-18T11:00:00Z"),
      buildHour("2026-05-18T12:00:00Z"),
      buildHour("2026-05-18T13:00:00Z"),
      buildHour("2026-05-18T14:00:00Z"),
    ],
    {
      name: "Milky Way Core",
      raHours: 17.7611,
      decDegrees: -29.0078,
      source: "catalog",
      category: "milky_way",
    },
  );

  assert.equal(report.astronomy_context.target.name, "Milky Way Core");
  assert.ok(report.astronomy_context.target.visible_hours >= 1);
  assert.ok(report.astronomy_context.target.peak_altitude_degrees > 0);
  assert.ok(report.hourly_conditions.every((hour) => hour.target_context !== null));
  assert.ok(report.hourly_conditions.some((hour) => hour.target_context.visible));
  assert.equal(typeof report.hourly_conditions[0].target_context.moon_separation_degrees, "number");
});

test("astronomy context includes target-moon separation and galactic core window state", () => {
  const context = getAstronomyContext({
    date: new Date("2026-05-18T14:00:00Z"),
    latitude: 35.15,
    longitude: 128.99,
    target: {
      name: "Rho Ophiuchi",
      raHours: 16 + 25 / 60 + 35 / 3600,
      decDegrees: -(23 + 26 / 60 + 49 / 3600),
      category: "wide_field",
    },
  });

  assert.equal(typeof context.targetMoonSeparationDegrees, "number");
  assert.ok(context.targetMoonSeparationDegrees > 0);
  assert.equal(context.galacticCoreWindow.band, "low");
  assert.equal(context.galacticCoreWindow.can_use_for_composition, true);
  assert.equal(context.galacticCoreWindowCanUse, true);
});

test("target category changes best altitude window threshold", () => {
  const hourly = [
    buildHour("2026-05-18T14:00:00Z"),
    buildHour("2026-05-18T15:00:00Z"),
  ];
  const targetCoordinates = {
    name: "Rho Ophiuchi",
    raHours: 16 + 25 / 60 + 35 / 3600,
    decDegrees: -(23 + 26 / 60 + 49 / 3600),
    source: "catalog",
  };

  const wideFieldReport = generateNightSkyReport({
    latitude: 35.15,
    longitude: 128.99,
    date: "2026-05-18",
    timezone: "Asia/Seoul",
    locationName: "Busan Test Site",
    hourlyForecast: hourly,
    siteProfile: { bortleClass: 3 },
    target: {
      ...targetCoordinates,
      category: "wide_field",
    },
  });

  const deepSkyReport = generateNightSkyReport({
    latitude: 35.15,
    longitude: 128.99,
    date: "2026-05-18",
    timezone: "Asia/Seoul",
    locationName: "Busan Test Site",
    hourlyForecast: hourly,
    siteProfile: { bortleClass: 3 },
    target: {
      ...targetCoordinates,
      category: "deep_sky",
    },
  });

  assert.ok(wideFieldReport.astronomy_context.target.best_altitude_window);
  assert.equal(wideFieldReport.astronomy_context.target.best_altitude_window.altitude_threshold_degrees, 15);
  assert.equal(deepSkyReport.astronomy_context.target.best_altitude_window, null);
});

test("hourly report preserves galactic core window through visibility context", () => {
  const report = generateReport([
    buildHour("2026-05-18T13:00:00Z"),
    buildHour("2026-05-18T14:00:00Z"),
    buildHour("2026-05-18T15:00:00Z"),
  ]);

  assert.equal(report.astronomy_context.milky_way_peak_visible, true);
  assert.ok(report.astronomy_context.galactic_core.best_window);
  assert.ok(report.hourly_conditions.some((hour) => hour.raw_inputs.galactic_core_altitude_degrees > 5));
  assert.ok(report.hourly_conditions.some((hour) => hour.milky_way_ready || hour.raw_inputs.galactic_core_altitude_degrees >= 10));
});

test("milky way best window prefers the short galactic-core peak window", () => {
  const report = generateReportByDate({
    date: "2026-05-18",
    time: "2026-05-18T14:00:00Z",
    mode: "wide_field_milky_way",
    hourlyForecast: [
      buildHour("2026-05-18T12:00:00Z"),
      buildHour("2026-05-18T13:00:00Z"),
      buildHour("2026-05-18T14:00:00Z"),
      buildHour("2026-05-18T15:00:00Z"),
    ],
  });

  assert.ok(report.derived_recommendations.best_window);
  assert.equal(report.derived_recommendations.best_window.hour_count, 2);
  assert.deepEqual(report.derived_recommendations.best_window, report.astronomy_context.galactic_core.best_window);
});

test("report exposes score curve, blocker timeline, and ranked windows", () => {
  const report = generateReport([
    buildHour("2026-05-18T11:00:00Z", {
      cloud_cover_low: 85,
      cloud_cover_mid: 70,
      cloud_cover_high: 60,
    }),
    buildHour("2026-05-18T12:00:00Z"),
    buildHour("2026-05-18T13:00:00Z"),
    buildHour("2026-05-18T14:00:00Z", {
      dew_point_2m: 7.5,
      relative_humidity_2m: 95,
    }),
  ]);

  assert.equal(report.score_curve.length, report.hourly_conditions.length);
  assert.equal(report.blocker_timeline.length, report.hourly_conditions.length);
  assert.ok(Array.isArray(report.window_rankings.overall_windows));
  assert.ok(Array.isArray(report.window_rankings.mode_windows));
  assert.equal(typeof report.curve_summary.overall_trend, "string");
  assert.equal(report.score_curve[0].time, report.hourly_conditions[0].time);
});

test("blocker timeline reflects hard fail reasons first", () => {
  const report = generateReport([
    buildHour("2026-05-18T11:00:00Z", {
      precipitation: 1,
      rain: 1,
    }),
    buildHour("2026-05-18T12:00:00Z"),
  ]);

  assert.equal(report.blocker_timeline[0].primary_blocker, "precipitation");
});

test("mode presets react differently to moonlit conditions", () => {
  const moonlitHours = [
    buildHour("2026-05-18T12:00:00Z"),
    buildHour("2026-05-18T13:00:00Z"),
    buildHour("2026-05-18T14:00:00Z"),
  ];

  const milkyWay = generateReport(moonlitHours, { bortleClass: 3 }, { mode: "wide_field_milky_way" });
  const nightscape = generateReport(moonlitHours, { bortleClass: 3 }, { mode: "wide_field_nightscape" });

  assert.equal(milkyWay.scores.active_mode, "wide_field_milky_way");
  assert.equal(nightscape.scores.active_mode, "wide_field_nightscape");
  assert.ok(nightscape.scores.mode_score >= milkyWay.scores.mode_score);
});

test("narrowband deep-sky is more moon-tolerant than broadband under bright-moon, close-separation conditions", () => {
  const target = {
    name: "Andromeda Galaxy",
    raHours: 0 + 42 / 60 + 44.3 / 3600,
    decDegrees: 41 + 16 / 60 + 9 / 3600,
    source: "catalog",
    category: "deep_sky",
  };

  const broad = generateReportByDate({
    date: "2026-01-01",
    time: "2026-01-01T12:00:00Z",
    mode: "broadband_deep_sky",
    target,
  });
  const narrow = generateReportByDate({
    date: "2026-01-01",
    time: "2026-01-01T12:00:00Z",
    mode: "narrowband_deep_sky",
    target,
  });

  const broadHour = broad.hourly_conditions[0];
  const narrowHour = narrow.hourly_conditions[0];

  assert.equal(broad.scores.active_mode, "broadband_deep_sky");
  assert.equal(narrow.scores.active_mode, "narrowband_deep_sky");
  assert.equal(broadHour.moon_context.visible, true);
  assert.ok(broadHour.moon_context.illumination_fraction >= 0.9);
  assert.ok(narrow.scores.mode_score >= broad.scores.mode_score);
  assert.ok(narrow.scores.mode_score > 60);
});

test("deep-sky target-altitude cap and cloud impact are still enforced for narrowband", () => {
  const target = {
    name: "Andromeda Galaxy",
    raHours: 0 + 42 / 60 + 44.3 / 3600,
    decDegrees: 41 + 16 / 60 + 9 / 3600,
    source: "catalog",
    category: "deep_sky",
  };

  const brightLowAlt = generateReportByDate({
    date: "2026-01-05",
    time: "2026-01-05T14:00:00Z",
    mode: "narrowband_deep_sky",
    target,
  });
  const brightHighAlt = generateReportByDate({
    date: "2026-01-01",
    time: "2026-01-01T12:00:00Z",
    mode: "narrowband_deep_sky",
    target,
  });
  const highAltCloudy = generateReportByDate({
    date: "2026-01-01",
    time: "2026-01-01T12:00:00Z",
    mode: "narrowband_deep_sky",
    target,
    hourlyForecast: [buildHour("2026-01-01T12:00:00Z", {
      cloud_cover: 95,
      cloud_cover_low: 95,
      cloud_cover_mid: 90,
      cloud_cover_high: 85,
    })],
  });

  assert.ok(brightLowAlt.hourly_conditions[0].target_context.altitude_score < 45);
  assert.equal(brightLowAlt.hourly_conditions[0].mode_score, 50);
  assert.ok(brightHighAlt.hourly_conditions[0].target_context.altitude_score > 80);
  assert.ok(brightHighAlt.hourly_conditions[0].mode_score > brightLowAlt.hourly_conditions[0].mode_score);
  assert.ok(highAltCloudy.hourly_conditions[0].cloud_score < brightHighAlt.hourly_conditions[0].cloud_score);
  assert.ok(highAltCloudy.hourly_conditions[0].mode_score < brightHighAlt.hourly_conditions[0].mode_score);
});

test("deep-sky modes include target altitude in mode context", () => {
  const target = {
    name: "Andromeda Galaxy",
    raHours: 0 + 42 / 60 + 44.3 / 3600,
    decDegrees: 41 + 16 / 60 + 9 / 3600,
    source: "catalog",
    category: "deep_sky",
  };
  const report = generateReport(
    [
      buildHour("2026-05-18T11:00:00Z"),
      buildHour("2026-05-18T12:00:00Z"),
      buildHour("2026-05-18T13:00:00Z"),
    ],
    { bortleClass: 3 },
    { mode: "broadband_deep_sky", target },
  );

  assert.equal(report.scores.active_mode, "broadband_deep_sky");
  assert.ok(report.hourly_conditions.some((hour) => hour.target_context !== null));
  assert.ok(report.hourly_conditions.some((hour) => typeof hour.mode_score === "number"));
  assert.equal(typeof report.derived_recommendations.mode_ready, "boolean");
});

import test from "node:test";
import assert from "node:assert/strict";
import { fetchForecastBundle } from "../src/open-meteo.js";

function buildWeatherPayload(timezone = "Asia/Seoul") {
  return {
    timezone,
    hourly: {
      time: [
        "2026-03-20T18:00",
        "2026-03-20T19:00",
      ],
      temperature_2m: [3.2, 2.8],
      dew_point_2m: [-1.0, -1.2],
      relative_humidity_2m: [66, 68],
      cloud_cover: [12, 18],
      cloud_cover_low: [4, 8],
      cloud_cover_mid: [6, 8],
      cloud_cover_high: [10, 12],
      visibility: [22000, 21000],
      precipitation_probability: [0, 0],
      precipitation: [0, 0],
      rain: [0, 0],
      showers: [0, 0],
      snowfall: [0, 0],
      weather_code: [0, 0],
      wind_speed_10m: [8, 9],
      wind_gusts_10m: [13, 14],
    },
  };
}

function buildAirPayload() {
  return {
    hourly: {
      time: [
        "2026-03-20T18:00",
        "2026-03-20T19:00",
      ],
      pm2_5: [8, 9],
      pm10: [14, 15],
      aerosol_optical_depth: [0.1, 0.12],
      dust: [9, 10],
      european_aqi: [24, 28],
      us_aqi: [18, 20],
      ozone: [42, 43],
      nitrogen_dioxide: [7, 8],
    },
  };
}

function createResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `status-${status}`,
    json: async () => body,
  };
}

test("fetchForecastBundle merges weather and air payloads when both succeed", async () => {
  const bundle = await fetchForecastBundle({
    latitude: 37.4,
    longitude: 128.5,
    startDate: "2026-03-20",
    endDate: "2026-03-20",
    timezone: "Asia/Seoul",
    fetchImpl: async (url) => {
      const hostname = new URL(url).hostname;
      if (hostname === "api.open-meteo.com") {
        return createResponse(buildWeatherPayload());
      }
      if (hostname === "air-quality-api.open-meteo.com") {
        return createResponse(buildAirPayload());
      }
      throw new Error(`Unexpected host ${hostname}`);
    },
  });

  assert.equal(bundle.airQualityIncluded, true);
  assert.equal(bundle.hourly.length, 2);
  assert.equal(bundle.hourly[0].temperature_2m, 3.2);
  assert.equal(bundle.hourly[0].pm2_5, 8);
  assert.equal(bundle.sourceAttribution.length, 2);
});

test("fetchForecastBundle surfaces upstream air API failure instead of hiding it", async () => {
  await assert.rejects(
    () => fetchForecastBundle({
      latitude: 37.41,
      longitude: 128.51,
      startDate: "2026-03-21",
      endDate: "2026-03-21",
      timezone: "Asia/Seoul",
      fetchImpl: async (url) => {
        const hostname = new URL(url).hostname;
        if (hostname === "api.open-meteo.com") {
          return createResponse(buildWeatherPayload());
        }
        if (hostname === "air-quality-api.open-meteo.com") {
          throw new Error("simulated air upstream timeout");
        }
        throw new Error(`Unexpected host ${hostname}`);
      },
    }),
    /air-quality-api\.open-meteo\.com/,
  );
});

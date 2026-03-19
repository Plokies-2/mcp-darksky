const WEATHER_API_BASE = "https://api.open-meteo.com/v1/forecast";
const AIR_API_BASE = "https://air-quality-api.open-meteo.com/v1/air-quality";

const WEATHER_HOURLY_PARAMS = [
  "temperature_2m",
  "dew_point_2m",
  "relative_humidity_2m",
  "cloud_cover",
  "cloud_cover_low",
  "cloud_cover_mid",
  "cloud_cover_high",
  "visibility",
  "precipitation_probability",
  "precipitation",
  "rain",
  "showers",
  "snowfall",
  "weather_code",
  "wind_speed_10m",
  "wind_gusts_10m",
];

const AIR_HOURLY_PARAMS = [
  "pm2_5",
  "pm10",
  "aerosol_optical_depth",
  "dust",
  "european_aqi",
  "us_aqi",
  "ozone",
  "nitrogen_dioxide",
];

const RESPONSE_CACHE_TTL_MS = 15 * 60 * 1000;
const responseCache = new Map();

function buildUrl(base, params) {
  const url = new URL(base);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });
  return url;
}

async function fetchJson(url) {
  const cacheKey = url.toString();
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  let response;

  try {
    response = await fetch(url, {
      headers: {
        "User-Agent": "mcp-darksky/0.1.0",
      },
    });
  } catch (error) {
    throw new Error(`Upstream weather provider is currently unreachable: ${url.hostname}`, {
      cause: error,
    });
  }

  if (!response.ok) {
    throw new Error(`Open-Meteo request failed with ${response.status}: ${response.statusText}`);
  }

  const payload = await response.json();
  responseCache.set(cacheKey, {
    expiresAt: Date.now() + RESPONSE_CACHE_TTL_MS,
    payload,
  });
  return payload;
}

function buildHourlyMap(hourly) {
  const map = new Map();

  hourly.time.forEach((time, index) => {
    const entry = {};
    Object.entries(hourly).forEach(([key, values]) => {
      if (key === "time") {
        return;
      }
      entry[key] = values[index] ?? null;
    });
    map.set(time, entry);
  });

  return map;
}

export async function fetchForecastBundle({
  latitude,
  longitude,
  startDate,
  endDate,
  timezone = "Asia/Seoul",
  includeAirQuality = true,
}) {
  const commonParams = {
    latitude,
    longitude,
    start_date: startDate,
    end_date: endDate,
    timezone,
  };

  const weatherUrl = buildUrl(WEATHER_API_BASE, {
    ...commonParams,
    hourly: WEATHER_HOURLY_PARAMS.join(","),
  });

  const airUrl = includeAirQuality
    ? buildUrl(AIR_API_BASE, {
        ...commonParams,
        hourly: AIR_HOURLY_PARAMS.join(","),
      })
    : null;

  const [weatherData, airData] = await Promise.all([
    fetchJson(weatherUrl),
    airUrl ? fetchJson(airUrl) : Promise.resolve(null),
  ]);

  if (!weatherData.hourly?.time?.length) {
    throw new Error("Weather forecast returned no hourly data.");
  }

  const weatherMap = buildHourlyMap(weatherData.hourly);
  const airMap = airData.hourly?.time?.length ? buildHourlyMap(airData.hourly) : new Map();

  const hourly = weatherData.hourly.time.map((time) => ({
    time,
    ...weatherMap.get(time),
    ...airMap.get(time),
  }));

  return {
    timezone: weatherData.timezone ?? timezone,
    hourly,
    sourceAttribution: [
      {
        provider: "Open-Meteo Forecast API",
        url: weatherUrl.toString(),
      },
      ...(airUrl
        ? [
            {
              provider: "Open-Meteo Air Quality API",
              url: airUrl.toString(),
            },
          ]
        : []),
    ],
    airQualityIncluded: Boolean(airUrl),
  };
}

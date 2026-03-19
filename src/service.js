import { z } from "zod";
import { fetchForecastBundle } from "./open-meteo.js";
import { getEstimatedLightPollution } from "./light-pollution.js";
import { resolvePlaceQuery } from "./kakao-local.js";
import { generateNightSkyReport } from "./scoring.js";

const siteProfileSchema = z
  .object({
    bortle_class: z.number().int().min(1).max(9).optional(),
    elevation_m: z.number().min(-100).max(9000).optional(),
    near_water: z.boolean().optional(),
  })
  .optional();

export const lightPollutionInputSchema = z
  .object({
    latitude: z.number().min(33).max(39.5).optional(),
    longitude: z.number().min(124).max(132).optional(),
    place_query: z.string().min(2).optional(),
    location_name: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    const hasAnyCoordinate = value.latitude !== undefined || value.longitude !== undefined;
    const hasCoordinates = value.latitude !== undefined && value.longitude !== undefined;

    if (hasAnyCoordinate && !hasCoordinates) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["latitude"],
        message: "latitude and longitude must be provided together.",
      });
    }

    if (!hasCoordinates && !value.place_query) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["place_query"],
        message: "Either latitude/longitude or place_query must be provided.",
      });
    }
  });

export const scoreInputSchema = z
  .object({
    latitude: z.number().min(33).max(39.5).optional(),
    longitude: z.number().min(124).max(132).optional(),
    place_query: z.string().min(2).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    location_name: z.string().optional(),
    timezone: z.string().default("Asia/Seoul"),
    site_profile: siteProfileSchema,
  })
  .superRefine((value, ctx) => {
    const hasAnyCoordinate = value.latitude !== undefined || value.longitude !== undefined;
    const hasCoordinates = value.latitude !== undefined && value.longitude !== undefined;

    if (hasAnyCoordinate && !hasCoordinates) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["latitude"],
        message: "latitude and longitude must be provided together.",
      });
    }

    if (!hasCoordinates && !value.place_query) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["place_query"],
        message: "Either latitude/longitude or place_query must be provided.",
      });
    }
  });

const querySchema = z
  .object({
    latitude: z.coerce.number().min(33).max(39.5).optional(),
    longitude: z.coerce.number().min(124).max(132).optional(),
    place_query: z.string().min(2).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    location_name: z.string().optional(),
    timezone: z.string().optional().default("Asia/Seoul"),
    bortle_class: z.coerce.number().int().min(1).max(9).optional(),
    elevation_m: z.coerce.number().min(-100).max(9000).optional(),
    near_water: z
      .enum(["true", "false", "1", "0"])
      .optional()
      .transform((value) => (value === undefined ? undefined : value === "true" || value === "1")),
  })
  .superRefine((value, ctx) => {
    const hasAnyCoordinate = value.latitude !== undefined || value.longitude !== undefined;
    const hasCoordinates = value.latitude !== undefined && value.longitude !== undefined;

    if (hasAnyCoordinate && !hasCoordinates) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["latitude"],
        message: "latitude and longitude must be provided together.",
      });
    }

    if (!hasCoordinates && !value.place_query) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["place_query"],
        message: "Either latitude/longitude or place_query must be provided.",
      });
    }
  });

const lightPollutionQuerySchema = z
  .object({
    latitude: z.coerce.number().min(33).max(39.5).optional(),
    longitude: z.coerce.number().min(124).max(132).optional(),
    place_query: z.string().min(2).optional(),
    location_name: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    const hasAnyCoordinate = value.latitude !== undefined || value.longitude !== undefined;
    const hasCoordinates = value.latitude !== undefined && value.longitude !== undefined;

    if (hasAnyCoordinate && !hasCoordinates) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["latitude"],
        message: "latitude and longitude must be provided together.",
      });
    }

    if (!hasCoordinates && !value.place_query) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["place_query"],
        message: "Either latitude/longitude or place_query must be provided.",
      });
    }
  });

export function parseScoreQuery(query) {
  const parsed = querySchema.parse(query);

  return {
    latitude: parsed.latitude,
    longitude: parsed.longitude,
    place_query: parsed.place_query,
    date: parsed.date,
    location_name: parsed.location_name,
    timezone: parsed.timezone,
    site_profile: {
      bortle_class: parsed.bortle_class,
      elevation_m: parsed.elevation_m,
      near_water: parsed.near_water,
    },
  };
}

export function parseLightPollutionQuery(query) {
  const parsed = lightPollutionQuerySchema.parse(query);

  return {
    latitude: parsed.latitude,
    longitude: parsed.longitude,
    place_query: parsed.place_query,
    location_name: parsed.location_name,
  };
}

function getDateStringInTimeZone(date, timezone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function validateForecastDate(dateText, timezone = "Asia/Seoul") {
  const today = new Date();
  const maxDate = new Date(today.getTime() + 15 * 24 * 60 * 60 * 1000);
  const todayString = getDateStringInTimeZone(today, timezone);
  const maxDateString = getDateStringInTimeZone(maxDate, timezone);

  if (dateText < todayString || dateText > maxDateString) {
    throw new RangeError(`Forecast date must be between ${todayString} and ${maxDateString}.`);
  }
}

export function getSuggestedForecastDate(timezone = "Asia/Seoul") {
  const next = new Date();
  next.setUTCDate(next.getUTCDate() + 1);
  return getDateStringInTimeZone(next, timezone);
}

async function resolveObservationPoint(parsed, kakaoRestApiKey) {
  if (parsed.latitude !== undefined && parsed.longitude !== undefined) {
    return {
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      locationName: parsed.location_name,
      resolvedFrom: "coordinates",
    };
  }

  const resolved = await resolvePlaceQuery({
    query: parsed.place_query,
    restApiKey: kakaoRestApiKey,
  });

  return {
    latitude: resolved.latitude,
    longitude: resolved.longitude,
    locationName: parsed.location_name ?? resolved.locationName,
    resolvedFrom: "place_query",
    resolvedPlace: resolved,
  };
}

export async function getLightPollutionReport(input) {
  const parsed = lightPollutionInputSchema.parse(input);
  const observationPoint = await resolveObservationPoint(parsed, input.kakaoRestApiKey);
  let estimate;
  try {
    estimate = await getEstimatedLightPollution({
      latitude: observationPoint.latitude,
      longitude: observationPoint.longitude,
    });
  } catch (error) {
    estimate = {
      unavailable: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  return {
    location: {
      name: observationPoint.locationName ?? "Requested location",
      latitude: observationPoint.latitude,
      longitude: observationPoint.longitude,
      resolved_from: observationPoint.resolvedFrom,
    },
    light_pollution_context: estimate,
    source_attribution: [
      {
        provider: "NASA Black Marble annual local tiles",
        detail: "Estimated Bortle-like darkness proxy from local VNP46A4 and VJ146A4 annual composites.",
      },
    ],
  };
}

export async function getNightSkyScoreReport(input) {
  const parsed = scoreInputSchema.parse(input);
  validateForecastDate(parsed.date, parsed.timezone);

  const observationPoint = await resolveObservationPoint(parsed, input.kakaoRestApiKey);
  let lightPollutionEstimate = null;
  try {
    lightPollutionEstimate = await getEstimatedLightPollution({
      latitude: observationPoint.latitude,
      longitude: observationPoint.longitude,
    });
  } catch (error) {
    lightPollutionEstimate = {
      unavailable: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  const nextDate = new Date(`${parsed.date}T00:00:00Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const endDate = nextDate.toISOString().slice(0, 10);

  const forecastBundle = await fetchForecastBundle({
    latitude: observationPoint.latitude,
    longitude: observationPoint.longitude,
    startDate: parsed.date,
    endDate,
    timezone: parsed.timezone,
  });

  const report = generateNightSkyReport({
    latitude: observationPoint.latitude,
    longitude: observationPoint.longitude,
    date: parsed.date,
    timezone: forecastBundle.timezone,
    locationName: observationPoint.locationName,
    hourlyForecast: forecastBundle.hourly,
    sourceAttribution: forecastBundle.sourceAttribution,
    lightPollutionEstimate,
    siteProfile: {
      bortleClass: parsed.site_profile?.bortle_class,
      elevationM: parsed.site_profile?.elevation_m,
      nearWater: parsed.site_profile?.near_water,
    },
  });

  if (observationPoint.resolvedPlace) {
    report.location.resolved_from = observationPoint.resolvedFrom;
    report.location.place_query = parsed.place_query;
    report.location.resolved_place = {
      address_name: observationPoint.resolvedPlace.addressName,
      road_address_name: observationPoint.resolvedPlace.roadAddressName,
      place_name: observationPoint.resolvedPlace.placeName,
      provider: observationPoint.resolvedPlace.provider,
    };
  }

  return report;
}

export function buildPromptText({ publicBaseUrl }) {
  return [
    "당신은 밤하늘 촬영 조건을 해설하는 도우미입니다.",
    `필요하면 ${publicBaseUrl}/api/score 엔드포인트에서 JSON 결과를 읽어오세요.`,
    "사용자가 초보자일 수도 있으므로 먼저 오늘 출동해도 되는지부터 분명하게 말해주세요.",
    "다음 순서로 짧고 분명하게 설명해주세요.",
    "1. 오늘 밤 가장 좋은 시간대",
    "2. 가장 큰 감점 요인 두 가지",
    "3. 결로, 월광, 미세먼지, 바람 중 주의점",
    "4. 초보자가 시도해도 되는지 여부",
    "JSON의 scores, derived_recommendations, risk_flags, hourly_conditions를 우선 해석해주세요.",
    "좌표 대신 place_query가 있으면 한국 장소명 검색 결과를 기준으로 설명해주세요.",
  ].join("\n");
}

export function buildPromptPage({ publicBaseUrl }) {
  const sampleDate = getSuggestedForecastDate("Asia/Seoul");
  const sampleUrl =
    `${publicBaseUrl}/api/score?place_query=%EC%95%88%EB%B0%98%EB%8D%B0%EA%B8%B0&date=${sampleDate}` +
    "&bortle_class=3";
  const promptText = buildPromptText({ publicBaseUrl });

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>mcp-darksky Prompt Guide</title>
    <style>
      :root {
        --bg: #07131d;
        --panel: rgba(12, 24, 36, 0.88);
        --panel-border: rgba(148, 197, 255, 0.18);
        --text: #e9f3ff;
        --muted: #9cb3c9;
        --accent: #8bd3ff;
        --accent-2: #c5f08a;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Segoe UI", "Pretendard", sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at top, rgba(92, 161, 255, 0.18), transparent 32%),
          radial-gradient(circle at 20% 20%, rgba(197, 240, 138, 0.16), transparent 24%),
          linear-gradient(180deg, #050a10 0%, #07131d 45%, #0c1f2d 100%);
      }
      main {
        width: min(960px, calc(100% - 32px));
        margin: 40px auto;
        display: grid;
        gap: 18px;
      }
      section {
        background: var(--panel);
        border: 1px solid var(--panel-border);
        border-radius: 18px;
        padding: 22px;
        backdrop-filter: blur(10px);
      }
      h1, h2 { margin: 0 0 10px; }
      p { color: var(--muted); line-height: 1.6; }
      code, pre {
        font-family: "Cascadia Code", "Consolas", monospace;
      }
      pre {
        white-space: pre-wrap;
        word-break: break-word;
        padding: 16px;
        border-radius: 14px;
        background: rgba(3, 10, 18, 0.86);
        border: 1px solid rgba(139, 211, 255, 0.14);
        color: #eaf6ff;
      }
      .pill {
        display: inline-block;
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(139, 211, 255, 0.12);
        color: var(--accent);
        margin-bottom: 12px;
      }
      .cta {
        color: var(--accent-2);
        font-weight: 600;
      }
    </style>
  </head>
  <body>
    <main>
      <section>
        <div class="pill">Prompt Entry</div>
        <h1>MCP 등록 없이 쓰는 방법</h1>
        <p>아래 프롬프트를 복사해서 AI에 붙여 넣으면 됩니다. 필요하면 JSON API도 바로 참고하도록 안내할 수 있습니다.</p>
      </section>
      <section>
        <h2>추천 프롬프트</h2>
        <pre>${promptText}</pre>
      </section>
      <section>
        <h2>샘플 API</h2>
        <p>카카오 Local API 키가 설정되어 있으면 장소명만으로도 결과를 조회할 수 있습니다.</p>
        <pre>${sampleUrl}</pre>
        <p class="cta">MCP를 쓸 수 있으면 <code>${publicBaseUrl}/mcp</code> 를 연결하는 편이 가장 좋습니다.</p>
      </section>
    </main>
  </body>
</html>`;
}

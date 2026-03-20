import { z } from "zod";
import { fetchForecastBundle } from "./open-meteo.js";
import { getEstimatedLightPollution } from "./light-pollution.js";
import { getLightPollutionMethodology } from "./light-pollution-methodology.js";
import { resolveObservationIntent } from "./observation-intent.js";
import { resolvePlaceQuery } from "./kakao-local.js";
import { generateNightSkyReport } from "./scoring.js";
import { resolveTargetInput } from "./targets.js";

const siteProfileSchema = z
  .object({
    bortle_class: z.number().int().min(1).max(9).optional(),
    elevation_m: z.number().min(-100).max(9000).optional(),
    near_water: z.boolean().optional(),
  })
  .optional();

const targetSchema = z
  .object({
    name: z.string().min(2).optional(),
    ra_hours: z.number().min(0).max(24).optional(),
    dec_degrees: z.number().min(-90).max(90).optional(),
    category: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    const hasAnyCoordinate = value.ra_hours !== undefined || value.dec_degrees !== undefined;
    const hasCoordinates = value.ra_hours !== undefined && value.dec_degrees !== undefined;

    if (hasAnyCoordinate && !hasCoordinates) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ra_hours"],
        message: "ra_hours and dec_degrees must be provided together.",
      });
    }

    if (!value.name && !hasCoordinates) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["name"],
        message: "Target requires either a known name or explicit ra_hours/dec_degrees.",
      });
    }
  })
  .optional();

const scoreModeSchema = z.enum([
  "general",
  "wide_field_milky_way",
  "wide_field_nightscape",
  "broadband_deep_sky",
  "narrowband_deep_sky",
  "star_trail",
]);
const FULL_DETAIL_DAY_LIMIT = 5;
const AIR_QUALITY_DAY_LIMIT = 7;
const MAX_FORECAST_DAY_LIMIT = 15;

function normalizeScoreMode(value) {
  const normalized = value.toLowerCase().replace(/-/g, "_");
  const aliases = {
    auto: "general",
    wide_field: "wide_field_nightscape",
    milky_way: "wide_field_milky_way",
    deep_sky: "broadband_deep_sky",
  };
  return aliases[normalized] ?? normalized;
}

function resolveScoringIntent(parsed) {
  const intent = resolveObservationIntent({
    requestedMode: parsed.mode,
    shootingGoal: parsed.shooting_goal,
    target: parsed.target,
  });
  let resolvedTarget = null;

  if (intent.target) {
    try {
      resolvedTarget = resolveTargetInput(intent.target);
    } catch (error) {
      const hasExplicitCoordinates = intent.target.ra_hours !== undefined && intent.target.dec_degrees !== undefined;
      if (hasExplicitCoordinates) {
        throw error;
      }
    }
  }

  return {
    intent,
    resolvedTarget,
    effectiveMode: intent.resolved_mode,
  };
}

function attachRequestContext(report, intent, resolvedTarget) {
  report.request_context = {
    requested_mode: intent.requested_mode,
    resolved_mode: intent.resolved_mode,
    resolution_reason: intent.resolution_reason,
    shooting_goal: intent.shooting_goal,
    intent_tags: intent.intent_tags,
    target_inferred_from_goal: intent.target_inferred_from_goal,
    advanced_tip: intent.advanced_tip,
    ignored_target_name: !resolvedTarget && intent.target?.name ? intent.target.name : null,
    resolved_target: resolvedTarget
      ? {
          name: resolvedTarget.name,
          category: resolvedTarget.category ?? null,
          source: resolvedTarget.source ?? null,
        }
      : null,
  };

  return report;
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function calculateDistanceKm(latitudeA, longitudeA, latitudeB, longitudeB) {
  const toRadians = (degrees) => degrees * (Math.PI / 180);
  const earthRadiusKm = 6371;
  const dLat = toRadians(latitudeB - latitudeA);
  const dLon = toRadians(longitudeB - longitudeA);
  const lat1 = toRadians(latitudeA);
  const lat2 = toRadians(latitudeB);
  const a =
    Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function reconcileObservationPoint(parsed, resolvedPlace = null, conflictThresholdKm = 20) {
  const hasCoordinates = parsed.latitude !== undefined && parsed.longitude !== undefined;

  if (hasCoordinates && resolvedPlace) {
    const distanceKm = calculateDistanceKm(
      parsed.latitude,
      parsed.longitude,
      resolvedPlace.latitude,
      resolvedPlace.longitude,
    );

    if (distanceKm > conflictThresholdKm) {
      return {
        latitude: resolvedPlace.latitude,
        longitude: resolvedPlace.longitude,
        locationName: parsed.location_name ?? resolvedPlace.locationName,
        resolvedFrom: "place_query",
        resolvedPlace,
        inputCoordinates: {
          latitude: parsed.latitude,
          longitude: parsed.longitude,
        },
        coordinateConflictKm: round(distanceKm),
        coordinatesOverriddenByPlaceQuery: true,
      };
    }

    return {
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      locationName: parsed.location_name ?? resolvedPlace.locationName,
      resolvedFrom: "coordinates",
      resolvedPlace,
      coordinateMatchKm: round(distanceKm),
      coordinatesOverriddenByPlaceQuery: false,
    };
  }

  if (hasCoordinates) {
    return {
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      locationName: parsed.location_name,
      resolvedFrom: "coordinates",
    };
  }

  if (!resolvedPlace) {
    throw new Error("resolvedPlace is required when coordinates are not available.");
  }

  return {
    latitude: resolvedPlace.latitude,
    longitude: resolvedPlace.longitude,
    locationName: parsed.location_name ?? resolvedPlace.locationName,
    resolvedFrom: "place_query",
    resolvedPlace,
  };
}

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
    mode: scoreModeSchema.default("general"),
    shooting_goal: z.string().min(2).max(200).optional(),
    site_profile: siteProfileSchema,
    target: targetSchema,
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

export const outlookInputSchema = z
  .object({
    latitude: z.number().min(33).max(39.5).optional(),
    longitude: z.number().min(124).max(132).optional(),
    place_query: z.string().min(2).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    location_name: z.string().optional(),
    timezone: z.string().default("Asia/Seoul"),
    mode: scoreModeSchema.default("general"),
    shooting_goal: z.string().min(2).max(200).optional(),
    site_profile: siteProfileSchema,
    target: targetSchema,
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
    mode: z
      .string()
      .transform((value) => normalizeScoreMode(value))
      .pipe(scoreModeSchema)
      .optional()
      .default("general"),
    shooting_goal: z.string().min(2).max(200).optional(),
    bortle_class: z.coerce.number().int().min(1).max(9).optional(),
    elevation_m: z.coerce.number().min(-100).max(9000).optional(),
    target_name: z.string().min(2).optional(),
    target_ra_hours: z.coerce.number().min(0).max(24).optional(),
    target_dec_degrees: z.coerce.number().min(-90).max(90).optional(),
    target_category: z.string().optional(),
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

    const hasAnyTargetCoordinate = value.target_ra_hours !== undefined || value.target_dec_degrees !== undefined;
    const hasTargetCoordinates = value.target_ra_hours !== undefined && value.target_dec_degrees !== undefined;

    if (hasAnyTargetCoordinate && !hasTargetCoordinates) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["target_ra_hours"],
        message: "target_ra_hours and target_dec_degrees must be provided together.",
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

const outlookQuerySchema = z
  .object({
    latitude: z.coerce.number().min(33).max(39.5).optional(),
    longitude: z.coerce.number().min(124).max(132).optional(),
    place_query: z.string().min(2).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    location_name: z.string().optional(),
    timezone: z.string().optional().default("Asia/Seoul"),
    mode: z
      .string()
      .transform((value) => normalizeScoreMode(value))
      .pipe(scoreModeSchema)
      .optional()
      .default("general"),
    shooting_goal: z.string().min(2).max(200).optional(),
    bortle_class: z.coerce.number().int().min(1).max(9).optional(),
    elevation_m: z.coerce.number().min(-100).max(9000).optional(),
    target_name: z.string().min(2).optional(),
    target_ra_hours: z.coerce.number().min(0).max(24).optional(),
    target_dec_degrees: z.coerce.number().min(-90).max(90).optional(),
    target_category: z.string().optional(),
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

    const hasAnyTargetCoordinate = value.target_ra_hours !== undefined || value.target_dec_degrees !== undefined;
    const hasTargetCoordinates = value.target_ra_hours !== undefined && value.target_dec_degrees !== undefined;

    if (hasAnyTargetCoordinate && !hasTargetCoordinates) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["target_ra_hours"],
        message: "target_ra_hours and target_dec_degrees must be provided together.",
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
    mode: parsed.mode,
    shooting_goal: parsed.shooting_goal,
    site_profile: {
      bortle_class: parsed.bortle_class,
      elevation_m: parsed.elevation_m,
      near_water: parsed.near_water,
    },
    target:
      parsed.target_name || parsed.target_ra_hours !== undefined
        ? {
            name: parsed.target_name,
            ra_hours: parsed.target_ra_hours,
            dec_degrees: parsed.target_dec_degrees,
            category: parsed.target_category,
          }
        : undefined,
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

export function parseOutlookQuery(query) {
  const parsed = outlookQuerySchema.parse(query);

  return {
    latitude: parsed.latitude,
    longitude: parsed.longitude,
    place_query: parsed.place_query,
    date: parsed.date,
    location_name: parsed.location_name,
    timezone: parsed.timezone,
    mode: parsed.mode,
    shooting_goal: parsed.shooting_goal,
    site_profile: {
      bortle_class: parsed.bortle_class,
      elevation_m: parsed.elevation_m,
      near_water: parsed.near_water,
    },
    target:
      parsed.target_name || parsed.target_ra_hours !== undefined
        ? {
            name: parsed.target_name,
            ra_hours: parsed.target_ra_hours,
            dec_degrees: parsed.target_dec_degrees,
            category: parsed.target_category,
          }
        : undefined,
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

function toUtcDateNumber(dateText) {
  const [year, month, day] = dateText.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function getForecastDetailPolicy(dateText, timezone = "Asia/Seoul") {
  const todayString = getDateStringInTimeZone(new Date(), timezone);
  const daysAhead = Math.round((toUtcDateNumber(dateText) - toUtcDateNumber(todayString)) / (24 * 60 * 60 * 1000));

  return {
    requested_date: dateText,
    days_ahead: daysAhead,
    full_detail_day_limit: FULL_DETAIL_DAY_LIMIT,
    air_quality_day_limit: AIR_QUALITY_DAY_LIMIT,
    max_forecast_day_limit: MAX_FORECAST_DAY_LIMIT,
    detail_level: daysAhead <= FULL_DETAIL_DAY_LIMIT ? "full" : "reduced",
    include_air_quality: daysAhead <= AIR_QUALITY_DAY_LIMIT,
    requires_outlook_path: daysAhead > FULL_DETAIL_DAY_LIMIT,
    reason:
      daysAhead > FULL_DETAIL_DAY_LIMIT
        ? "Hourly score-flow precision is reduced for distant dates, so an outlook path is recommended."
        : null,
  };
}

export function validateForecastDate(dateText, timezone = "Asia/Seoul") {
  const today = new Date();
  const maxDate = new Date(today.getTime() + MAX_FORECAST_DAY_LIMIT * 24 * 60 * 60 * 1000);
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

function buildOutlookBlocks(hourlyConditions) {
  if (!hourlyConditions.length) {
    return [];
  }

  const groups = [
    { key: "early_night", label: "early_night", hours: hourlyConditions.slice(0, Math.ceil(hourlyConditions.length / 3)) },
    {
      key: "mid_night",
      label: "mid_night",
      hours: hourlyConditions.slice(Math.ceil(hourlyConditions.length / 3), Math.ceil((hourlyConditions.length * 2) / 3)),
    },
    { key: "pre_dawn", label: "pre_dawn", hours: hourlyConditions.slice(Math.ceil((hourlyConditions.length * 2) / 3)) },
  ];

  return groups
    .filter((group) => group.hours.length)
    .map((group) => {
      const primaryBlocker = group.hours.map((hour) => hour.primary_blocker).find(Boolean) ?? null;
      return {
        label: group.label,
        start: group.hours[0].time,
        end: group.hours[group.hours.length - 1].time,
        average_overall_score:
          Math.round((group.hours.reduce((sum, hour) => sum + hour.overall_score, 0) / group.hours.length) * 10) / 10,
        average_mode_score:
          Math.round((group.hours.reduce((sum, hour) => sum + hour.mode_score, 0) / group.hours.length) * 10) / 10,
        primary_blocker: primaryBlocker,
        primary_reason_text: group.hours.find((hour) => hour.primary_reason_text)?.primary_reason_text ?? null,
      };
    });
}

function buildDistantFallbackPayload(parsed, publicBaseUrl = null) {
  const { intent } = resolveScoringIntent(parsed);
  const detailPolicy = getForecastDetailPolicy(parsed.date, parsed.timezone);
  const hasSiteProfile =
    parsed.site_profile?.bortle_class !== undefined ||
    parsed.site_profile?.elevation_m !== undefined ||
    parsed.site_profile?.near_water !== undefined;
  const recommendedInput = {
    date: parsed.date,
    timezone: parsed.timezone,
    mode: intent.resolved_mode,
    ...(parsed.latitude !== undefined && parsed.longitude !== undefined
      ? { latitude: parsed.latitude, longitude: parsed.longitude }
      : { place_query: parsed.place_query }),
    ...(parsed.location_name ? { location_name: parsed.location_name } : {}),
    ...(intent.shooting_goal ? { shooting_goal: intent.shooting_goal } : {}),
    ...(hasSiteProfile ? { site_profile: parsed.site_profile } : {}),
    ...(intent.target ? { target: intent.target } : {}),
  };

  const fallback = {
    report_kind: "fallback_required",
    reason: "requested_date_requires_reduced_detail",
    message:
      "This date is far enough out that full hourly score detail is intentionally limited. Use the outlook path instead.",
    detail_policy: detailPolicy,
    recommended_tool: "score_night_sky_outlook",
    recommended_input: recommendedInput,
  };

  if (publicBaseUrl) {
    const params = new URLSearchParams({
      date: parsed.date,
      timezone: parsed.timezone,
      mode: intent.resolved_mode,
    });
    if (parsed.latitude !== undefined && parsed.longitude !== undefined) {
      params.set("latitude", String(parsed.latitude));
      params.set("longitude", String(parsed.longitude));
    }
    if (parsed.place_query) {
      params.set("place_query", parsed.place_query);
    }
    if (parsed.location_name) {
      params.set("location_name", parsed.location_name);
    }
    if (intent.shooting_goal) {
      params.set("shooting_goal", intent.shooting_goal);
    }
    if (parsed.site_profile?.bortle_class !== undefined) {
      params.set("bortle_class", String(parsed.site_profile.bortle_class));
    }
    if (parsed.site_profile?.elevation_m !== undefined) {
      params.set("elevation_m", String(parsed.site_profile.elevation_m));
    }
    if (parsed.site_profile?.near_water !== undefined) {
      params.set("near_water", String(parsed.site_profile.near_water));
    }
    if (intent.target?.name) {
      params.set("target_name", intent.target.name);
    }
    if (intent.target?.ra_hours !== undefined) {
      params.set("target_ra_hours", String(intent.target.ra_hours));
    }
    if (intent.target?.dec_degrees !== undefined) {
      params.set("target_dec_degrees", String(intent.target.dec_degrees));
    }
    if (intent.target?.category) {
      params.set("target_category", intent.target.category);
    }
    fallback.recommended_api_url = `${publicBaseUrl}/api/score-outlook?${params.toString()}`;
  }

  return fallback;
}

async function resolveObservationPoint(parsed, kakaoRestApiKey) {
  const hasCoordinates = parsed.latitude !== undefined && parsed.longitude !== undefined;
  const canResolvePlace = Boolean(parsed.place_query) && Boolean(kakaoRestApiKey);

  if (canResolvePlace) {
    const resolved = await resolvePlaceQuery({
      query: parsed.place_query,
      restApiKey: kakaoRestApiKey,
    });

    return reconcileObservationPoint(parsed, resolved);
  }

  if (hasCoordinates) {
    return reconcileObservationPoint(parsed);
  }

  const resolved = await resolvePlaceQuery({
    query: parsed.place_query,
    restApiKey: kakaoRestApiKey,
  });

  return reconcileObservationPoint(parsed, resolved);
}

function attachObservationResolution(location, observationPoint, placeQuery) {
  if (observationPoint.resolvedPlace) {
    location.resolved_from = observationPoint.resolvedFrom;
    location.place_query = placeQuery;
    location.resolved_place = {
      address_name: observationPoint.resolvedPlace.addressName,
      road_address_name: observationPoint.resolvedPlace.roadAddressName,
      place_name: observationPoint.resolvedPlace.placeName,
      provider: observationPoint.resolvedPlace.provider,
    };
  }

  if (observationPoint.coordinatesOverriddenByPlaceQuery) {
    location.input_coordinates = observationPoint.inputCoordinates;
    location.coordinate_conflict_km = observationPoint.coordinateConflictKm;
    location.coordinate_resolution = "place_query_overrode_conflicting_coordinates";
  } else if (observationPoint.coordinateMatchKm !== undefined) {
    location.coordinate_match_km = observationPoint.coordinateMatchKm;
  }
}

export async function getLightPollutionReport(input) {
  const parsed = lightPollutionInputSchema.parse(input);
  const observationPoint = await resolveObservationPoint(parsed, input.kakaoRestApiKey);
  const methodology = getLightPollutionMethodology();
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

  const report = {
    location: {
      name: observationPoint.locationName ?? "Requested location",
      latitude: observationPoint.latitude,
      longitude: observationPoint.longitude,
      resolved_from: observationPoint.resolvedFrom,
    },
    light_pollution_context: estimate,
    methodology_version: methodology.version,
    source_attribution: [
      {
        provider: "NASA Black Marble annual local tiles",
        detail: "Estimated Bortle-like darkness proxy from local VNP46A4 and VJ146A4 annual composites.",
      },
    ],
  };

  attachObservationResolution(report.location, observationPoint, parsed.place_query);
  return report;
}

export function getLightPollutionMethodologyReport() {
  return getLightPollutionMethodology();
}

export async function getNightSkyScoreReport(input) {
  const parsed = scoreInputSchema.parse(input);
  const { intent, resolvedTarget, effectiveMode } = resolveScoringIntent(parsed);
  validateForecastDate(parsed.date, parsed.timezone);
  const detailPolicy = getForecastDetailPolicy(parsed.date, parsed.timezone);

  if (detailPolicy.requires_outlook_path) {
    return buildDistantFallbackPayload(parsed, input.publicBaseUrl);
  }

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
    includeAirQuality: detailPolicy.include_air_quality,
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
    mode: effectiveMode,
    target: resolvedTarget,
  });
  report.detail_policy = detailPolicy;
  attachRequestContext(report, intent, resolvedTarget);

  attachObservationResolution(report.location, observationPoint, parsed.place_query);

  return report;
}

export async function getNightSkyOutlookReport(input) {
  const parsed = outlookInputSchema.parse(input);
  const { intent, resolvedTarget, effectiveMode } = resolveScoringIntent(parsed);
  validateForecastDate(parsed.date, parsed.timezone);
  const detailPolicy = getForecastDetailPolicy(parsed.date, parsed.timezone);
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
    includeAirQuality: detailPolicy.include_air_quality,
  });

  const detailedReport = generateNightSkyReport({
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
    mode: effectiveMode,
    target: resolvedTarget,
  });

  const hourlyOutlookConditions = detailedReport.score_curve.map((hour) => {
    const blocker = detailedReport.blocker_timeline.find((item) => item.time === hour.time);
    return {
      ...hour,
      primary_blocker: blocker?.primary_blocker ?? null,
      primary_reason_text: blocker?.primary_reason_text ?? null,
    };
  });

  const report = {
    report_kind: "outlook",
    detail_policy: detailPolicy,
    message:
      detailPolicy.requires_outlook_path
        ? "This date is far enough out that the report is intentionally simplified into a coarse night outlook."
        : "This outlook summarizes the night into coarse blocks for quick planning.",
    location: detailedReport.location,
    forecast_time_range: detailedReport.forecast_time_range,
    summary: {
      overall_outlook_score: detailedReport.scores.overall_score,
      mode_outlook_score: detailedReport.scores.mode_score,
      active_mode: detailedReport.scores.active_mode,
      go_no_go_outlook: detailedReport.derived_recommendations.go_no_go,
    },
    curve_summary: detailedReport.curve_summary,
    outlook_blocks: buildOutlookBlocks(hourlyOutlookConditions),
    window_rankings: {
      overall_windows: detailedReport.window_rankings.overall_windows,
      mode_windows: detailedReport.window_rankings.mode_windows,
      milky_way_windows: detailedReport.window_rankings.milky_way_windows,
    },
    astronomy_context: detailedReport.astronomy_context,
    risk_flags: detailedReport.risk_flags,
    light_pollution_context: detailedReport.light_pollution_context,
    what_is_included: [
      "coarse score trend",
      "top night windows",
      "astronomical darkness",
      "moon interference",
      "milky way / galactic core timing",
      "site darkness baseline",
      ...(detailPolicy.include_air_quality ? ["time-limited air quality weighting"] : []),
    ],
    what_is_reduced: [
      "full hourly score curve",
      "hour-by-hour blocker detail",
      "target-specific altitude planning",
      ...(detailPolicy.include_air_quality ? [] : ["air quality weighting beyond supported forecast horizon"]),
    ],
    source_attribution: detailedReport.source_attribution,
  };
  attachRequestContext(report, intent, resolvedTarget);

  attachObservationResolution(report.location, observationPoint, parsed.place_query);

  return report;
}

export function buildPromptText({ publicBaseUrl }) {
  return [
    "당신은 밤하늘 촬영 조건을 해설하는 도우미입니다.",
    `필요하면 ${publicBaseUrl}/api/score 엔드포인트에서 JSON 결과를 읽어오세요.`,
    "응답은 기본적으로 4~6줄 안팎으로 짧게 유지하고, 사용자가 더 자세한 설명을 원할 때만 확장하세요.",
    "사용자가 묻는 천체, 시간대, 촬영 목적을 먼저 확인하고 그 요청이 best_window 또는 outlook block과 얼마나 맞는지 간략히 비교하세요.",
    "특히 shooting_goal, request_context.resolved_mode, astronomy_context.target 이 있으면 그 목적에 맞는 판단을 우선하세요.",
    "천체가 명시적으로 입력되지 않았다면 딥스카이 대상 촬영으로 올려 잡지 말고 general 관측/촬영으로 답하세요. 예외는 사용자가 은하수 또는 별궤적처럼 촬영 타입을 직접 말한 경우입니다.",
    "다음 순서로 간략히 설명해주세요.",
    "1. 핵심 변수",
    "2. 결론",
    "3. 요청 시점 또는 타깃 비교",
    "4. 기타 변수 요약",
    "5. 추천 시간",
    "필터나 고급 장비 조언이 필요할 때만 한 줄 덧붙이고, 반드시 '~가 있다면 ~하세요'처럼 초보자도 무시할 수 있게 표현하세요.",
    "JSON의 request_context, scores, derived_recommendations, risk_flags, hourly_conditions를 우선 해석해주세요.",
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

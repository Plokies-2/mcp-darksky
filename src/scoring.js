import { getAstronomicalNightBounds, getAstronomyContext } from "./astronomy.js";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function min(values) {
  if (!values.length) {
    return 0;
  }
  return Math.min(...values);
}

function max(values) {
  if (!values.length) {
    return 0;
  }
  return Math.max(...values);
}

function calculateCloudScore(hour) {
  const weightedCloud =
    (hour.cloud_cover_low ?? 0) * 0.5 +
    (hour.cloud_cover_mid ?? 0) * 0.3 +
    (hour.cloud_cover_high ?? 0) * 0.2;
  return clamp(100 - weightedCloud, 0, 100);
}

function calculateTransparencyScore(hour) {
  const visibilityScore = clamp(((hour.visibility ?? 0) / 24000) * 100, 0, 100);
  const pm25Penalty = clamp(((hour.pm2_5 ?? 0) / 80) * 40, 0, 40);
  const pm10Penalty = clamp(((hour.pm10 ?? 0) / 150) * 20, 0, 20);
  const aodPenalty = clamp(((hour.aerosol_optical_depth ?? 0) / 0.8) * 25, 0, 25);
  const dustPenalty = clamp(((hour.dust ?? 0) / 100) * 15, 0, 15);
  const aqiPenalty = clamp(((hour.european_aqi ?? hour.us_aqi ?? 0) / 100) * 18, 0, 18);
  return clamp(visibilityScore - pm25Penalty - pm10Penalty - aodPenalty - dustPenalty - aqiPenalty, 0, 100);
}

function calculateDarknessScore(hour, siteProfile) {
  if (!hour.astronomicalNight) {
    return 0;
  }

  const bortle = clamp(siteProfile.bortleClass ?? 4, 1, 9);
  const baseDarkness = clamp(110 - bortle * 10, 10, 100);
  const moonPenaltyBase = (hour.moonAltitudeDegrees > 0 ? hour.moonIlluminationFraction * 55 : 0);
  const moonAltitudeFactor = hour.moonAltitudeDegrees > 0 ? clamp(hour.moonAltitudeDegrees / 60, 0.25, 1) : 0;
  const galacticBonus = hour.galacticCoreVisible ? 8 : 0;

  return clamp(baseDarkness - moonPenaltyBase * moonAltitudeFactor + galacticBonus, 0, 100);
}

function calculateDewRiskScore(hour) {
  const spread = (hour.temperature_2m ?? 0) - (hour.dew_point_2m ?? 0);
  const humidity = hour.relative_humidity_2m ?? 0;
  const wind = hour.wind_speed_10m ?? 0;

  let score = 100;
  score -= clamp((3 - spread) * 18, 0, 55);
  score -= clamp(((humidity - 75) / 25) * 30, 0, 30);
  score += clamp(((wind - 8) / 10) * 15, 0, 15);
  return clamp(score, 0, 100);
}

function calculateStabilityScore(hour, previousHour) {
  const windPenalty = clamp(((hour.wind_speed_10m ?? 0) / 30) * 40, 0, 40);
  const gustPenalty = clamp(((hour.wind_gusts_10m ?? 0) / 50) * 30, 0, 30);
  const tempDelta = previousHour ? Math.abs((hour.temperature_2m ?? 0) - (previousHour.temperature_2m ?? 0)) : 0;
  const tempPenalty = clamp((tempDelta / 6) * 20, 0, 20);
  const humidityPenalty = clamp((((hour.relative_humidity_2m ?? 0) - 85) / 15) * 10, 0, 10);
  return clamp(100 - windPenalty - gustPenalty - tempPenalty - humidityPenalty, 0, 100);
}

function detectHardFail(hour) {
  const reasons = [];

  if ((hour.precipitation ?? 0) > 0.2 || (hour.rain ?? 0) > 0.2 || (hour.showers ?? 0) > 0.2) {
    reasons.push("precipitation");
  }
  if ((hour.snowfall ?? 0) > 0) {
    reasons.push("snowfall");
  }
  if ((hour.visibility ?? 99999) < 1200) {
    reasons.push("fog_or_haze");
  }
  if ([45, 48].includes(hour.weather_code)) {
    reasons.push("fog_code");
  }

  return reasons;
}

function buildExplanationHints(hour) {
  const hints = [];
  if (hour.cloud_score < 50) {
    hints.push("구름이 많은 시간대라 별 노출 효율이 낮습니다.");
  }
  if (hour.darkness_score < 45 && hour.moonVisible) {
    hints.push("달빛 영향이 커서 하늘 배경이 밝아집니다.");
  }
  if (hour.dew_risk_score < 45) {
    hints.push("기온과 이슬점 차가 작아 렌즈 결로 위험이 큽니다.");
  }
  if (hour.transparency_score < 45) {
    hints.push("미세먼지나 연무 때문에 대기 투명도가 낮습니다.");
  }
  if ((hour.european_aqi ?? hour.us_aqi ?? 0) >= 75) {
    hints.push("AQI가 높아 대기질과 촬영 체감 품질이 함께 나빠질 수 있습니다.");
  }
  if (hour.stability_score < 45) {
    hints.push("풍속 또는 기온 변화 때문에 선예도 확보가 어렵습니다.");
  }
  if (hour.galacticCoreVisible && hour.darkness_score > 50) {
    hints.push("은하수 핵심 영역이 떠 있고 하늘도 비교적 어둡습니다.");
  }
  return hints;
}

function scoreHour(hour, previousHour, siteProfile) {
  const hardFailReasons = detectHardFail(hour);
  const cloudScore = calculateCloudScore(hour);
  const transparencyScore = calculateTransparencyScore(hour);
  const darknessScore = calculateDarknessScore(hour, siteProfile);
  const dewRiskScore = calculateDewRiskScore(hour);
  const stabilityScore = calculateStabilityScore(hour, previousHour);

  let overallScore =
    cloudScore * 0.28 +
    transparencyScore * 0.2 +
    darknessScore * 0.24 +
    dewRiskScore * 0.13 +
    stabilityScore * 0.15;

  if (hardFailReasons.length) {
    overallScore = Math.min(overallScore, 15);
  }
  if (!hour.astronomicalNight) {
    overallScore = Math.min(overallScore, 20);
  }

  const beginnerReady = overallScore >= 60 && hardFailReasons.length === 0;
  const milkyWayReady =
    overallScore >= 70 &&
    darknessScore >= 65 &&
    cloudScore >= 60 &&
    transparencyScore >= 55 &&
    hour.galacticCoreVisible;
  const deepSkyReady =
    overallScore >= 68 &&
    darknessScore >= 60 &&
    stabilityScore >= 55 &&
    hardFailReasons.length === 0;

  return {
    ...hour,
    cloud_score: round(cloudScore),
    transparency_score: round(transparencyScore),
    darkness_score: round(darknessScore),
    dew_risk_score: round(dewRiskScore),
    stability_score: round(stabilityScore),
    overall_score: round(clamp(overallScore, 0, 100)),
    hard_fail_reasons: hardFailReasons,
    beginner_ready: beginnerReady,
    milky_way_ready: milkyWayReady,
    deep_sky_ready: deepSkyReady,
    explanation_hints: buildExplanationHints({
      ...hour,
      cloud_score: cloudScore,
      transparency_score: transparencyScore,
      darkness_score: darknessScore,
      dew_risk_score: dewRiskScore,
      stability_score: stabilityScore,
    }),
  };
}

function buildBestWindow(hours) {
  const viable = hours.filter((hour) => hour.astronomicalNight);
  if (!viable.length) {
    return null;
  }

  let best = null;
  let current = [];

  const finalizeWindow = () => {
    if (!current.length) {
      return;
    }
    const avgScore = average(current.map((hour) => hour.overall_score));
    const window = {
      start: current[0].time,
      end: current[current.length - 1].time,
      average_score: round(avgScore),
      hour_count: current.length,
    };
    if (!best || window.average_score > best.average_score) {
      best = window;
    }
    current = [];
  };

  viable.forEach((hour) => {
    if (hour.overall_score >= 55 && hour.hard_fail_reasons.length === 0) {
      current.push(hour);
    } else {
      finalizeWindow();
    }
  });
  finalizeWindow();

  return best;
}

function buildSummaryFlags(hours, siteProfile) {
  const flags = new Set();
  if (hours.some((hour) => hour.dew_risk_score < 40)) {
    flags.add("렌즈 결로 주의");
  }
  if (hours.every((hour) => hour.darkness_score < 45)) {
    flags.add("달빛 또는 광공해 영향 큼");
  }
  if (hours.some((hour) => hour.transparency_score < 35)) {
    flags.add("미세먼지 또는 연무로 투명도 저하");
  }
  if (hours.some((hour) => (hour.european_aqi ?? hour.us_aqi ?? 0) >= 75)) {
    flags.add("대기질 지수가 높아 장시간 촬영이 불편할 수 있음");
  }
  if (hours.every((hour) => hour.cloud_score < 40)) {
    flags.add("구름 때문에 촬영 부적합");
  }
  if (siteProfile.bortleClass && siteProfile.bortleClass >= 6) {
    flags.add("기본 광공해가 강한 장소");
  }
  if (!hours.some((hour) => hour.milky_way_ready)) {
    flags.add("은하수 촬영 부적합");
  }
  return Array.from(flags);
}

function buildConfidence(hours) {
  const scoreSpread = max(hours.map((hour) => hour.overall_score)) - min(hours.map((hour) => hour.overall_score));
  const hardFailRatio = hours.filter((hour) => hour.hard_fail_reasons.length > 0).length / Math.max(hours.length, 1);
  const confidence = 85 - scoreSpread * 0.35 - hardFailRatio * 25;
  return round(clamp(confidence, 20, 95));
}

function enrichHourly({ hourlyForecast, latitude, longitude }) {
  return hourlyForecast.map((hour) => ({
    ...hour,
    ...getAstronomyContext({
      date: new Date(hour.time),
      latitude,
      longitude,
    }),
  }));
}

function selectNightHours({ hourlyForecast, date, latitude, longitude }) {
  const bounds = getAstronomicalNightBounds({ date, latitude, longitude });
  const start = bounds.sunset;
  const end = bounds.astronomicalDawn;

  const filtered = hourlyForecast.filter((hour) => {
    const time = new Date(hour.time);
    return time >= start && time <= end;
  });

  return {
    bounds,
    hours: filtered,
  };
}

export function generateNightSkyReport({
  latitude,
  longitude,
  date,
  timezone,
  locationName,
  hourlyForecast,
  sourceAttribution = [],
  lightPollutionEstimate = null,
  siteProfile = {},
}) {
  const appliedBortleClass = clamp(
    siteProfile.bortleClass ?? lightPollutionEstimate?.estimated_bortle_center ?? 4,
    1,
    9,
  );
  const effectiveSiteProfile = {
    ...siteProfile,
    bortleClass: appliedBortleClass,
  };
  const enriched = enrichHourly({ hourlyForecast, latitude, longitude });
  const { bounds, hours } = selectNightHours({
    hourlyForecast: enriched,
    date,
    latitude,
    longitude,
  });

  if (!hours.length) {
    throw new Error("No hourly forecast data overlaps with the requested night window.");
  }

  const scoredHours = hours.map((hour, index) => scoreHour(hour, hours[index - 1], effectiveSiteProfile));
  const bestWindow = buildBestWindow(scoredHours);
  const overallScore = round(average(scoredHours.map((hour) => hour.overall_score)));
  const cloudScore = round(average(scoredHours.map((hour) => hour.cloud_score)));
  const transparencyScore = round(average(scoredHours.map((hour) => hour.transparency_score)));
  const darknessScore = round(average(scoredHours.map((hour) => hour.darkness_score)));
  const dewRiskScore = round(average(scoredHours.map((hour) => hour.dew_risk_score)));
  const stabilityScore = round(average(scoredHours.map((hour) => hour.stability_score)));
  const summaryFlags = buildSummaryFlags(scoredHours, effectiveSiteProfile);
  const goNoGo = overallScore >= 60 && scoredHours.some((hour) => hour.overall_score >= 65);

  return {
    location: {
      name: locationName ?? "Requested location",
      latitude,
      longitude,
      timezone,
      site_profile: {
        bortle_class: appliedBortleClass,
        provided_bortle_class: siteProfile.bortleClass ?? null,
        estimated_bortle_band: lightPollutionEstimate?.estimated_bortle_band ?? null,
        estimated_bortle_center: lightPollutionEstimate?.estimated_bortle_center ?? null,
        elevation_m: effectiveSiteProfile.elevationM ?? null,
        near_water: effectiveSiteProfile.nearWater ?? false,
      },
    },
    forecast_time_range: {
      requested_date: date,
      sunset: bounds.sunset.toISOString(),
      astronomical_dusk: bounds.astronomicalDusk?.toISOString() ?? null,
      astronomical_dawn: bounds.astronomicalDawn?.toISOString() ?? null,
      sunrise: bounds.sunrise.toISOString(),
    },
    hourly_conditions: scoredHours.map((hour) => ({
      time: hour.time,
      overall_score: hour.overall_score,
      cloud_score: hour.cloud_score,
      transparency_score: hour.transparency_score,
      darkness_score: hour.darkness_score,
      dew_risk_score: hour.dew_risk_score,
      stability_score: hour.stability_score,
      beginner_ready: hour.beginner_ready,
      milky_way_ready: hour.milky_way_ready,
      deep_sky_ready: hour.deep_sky_ready,
      hard_fail_reasons: hour.hard_fail_reasons,
      explanation_hints: hour.explanation_hints,
      raw_inputs: {
        temperature_2m: hour.temperature_2m,
        dew_point_2m: hour.dew_point_2m,
        relative_humidity_2m: hour.relative_humidity_2m,
        cloud_cover: hour.cloud_cover,
        cloud_cover_low: hour.cloud_cover_low,
        cloud_cover_mid: hour.cloud_cover_mid,
        cloud_cover_high: hour.cloud_cover_high,
        visibility: hour.visibility,
        precipitation_probability: hour.precipitation_probability,
        precipitation: hour.precipitation,
        snowfall: hour.snowfall,
        weather_code: hour.weather_code,
        wind_speed_10m: hour.wind_speed_10m,
        wind_gusts_10m: hour.wind_gusts_10m,
        pm2_5: hour.pm2_5,
        pm10: hour.pm10,
        aerosol_optical_depth: hour.aerosol_optical_depth,
        dust: hour.dust,
        european_aqi: hour.european_aqi,
        us_aqi: hour.us_aqi,
        ozone: hour.ozone,
        nitrogen_dioxide: hour.nitrogen_dioxide,
        astronomical_night: hour.astronomicalNight,
        moon_altitude_degrees: round(hour.moonAltitudeDegrees),
        moon_illumination_fraction: round(hour.moonIlluminationFraction, 2),
        galactic_core_altitude_degrees: round(hour.galacticCoreAltitudeDegrees),
      },
    })),
    scores: {
      overall_score: overallScore,
      cloud_score: cloudScore,
      transparency_score: transparencyScore,
      darkness_score: darknessScore,
      dew_risk_score: dewRiskScore,
      stability_score: stabilityScore,
      confidence: buildConfidence(scoredHours),
    },
    derived_recommendations: {
      best_window: bestWindow,
      go_no_go: goNoGo ? "go" : "no_go",
      dew_heater_needed: scoredHours.some((hour) => hour.dew_risk_score < 45),
      milky_way_ready: scoredHours.some((hour) => hour.milky_way_ready),
      deep_sky_ready: scoredHours.some((hour) => hour.deep_sky_ready),
      beginner_safe: goNoGo && scoredHours.some((hour) => hour.beginner_ready),
    },
    risk_flags: summaryFlags,
    astronomy_context: {
      milky_way_peak_visible: scoredHours.some((hour) => hour.galacticCoreVisible),
      moon_interference_hours: scoredHours.filter((hour) => hour.moonVisible).length,
      astronomical_night_hours: scoredHours.filter((hour) => hour.astronomicalNight).length,
    },
    air_quality_context: {
      peak_european_aqi: round(max(scoredHours.map((hour) => hour.european_aqi ?? 0))),
      peak_us_aqi: round(max(scoredHours.map((hour) => hour.us_aqi ?? 0))),
      average_pm2_5: round(average(scoredHours.map((hour) => hour.pm2_5 ?? 0))),
      average_pm10: round(average(scoredHours.map((hour) => hour.pm10 ?? 0))),
    },
    light_pollution_context: lightPollutionEstimate,
    source_attribution: [
      ...sourceAttribution,
      ...(lightPollutionEstimate && !lightPollutionEstimate.unavailable
        ? [
            {
              provider: "NASA Black Marble annual local tiles",
              detail: "Estimated Bortle-like darkness proxy from local VNP46A4 and VJ146A4 annual composites.",
            },
          ]
        : []),
      {
        provider: "SunCalc",
        detail: "Solar, lunar, and twilight calculations for per-hour astronomy context.",
      },
      {
        provider: "Galactic core visibility heuristic",
        detail: "Computed from fixed galactic center coordinates and local sidereal time.",
      },
    ],
    explanation_hints: Array.from(
      new Set(scoredHours.flatMap((hour) => hour.explanation_hints)),
    ),
  };
}

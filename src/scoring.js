import { getAstronomicalNightBounds, getAstronomyContext } from "./astronomy.js";

const DEFAULT_SCORING_MODE = "wide_field_milky_way";

const MODE_WEIGHT_PRESETS = {
  general: { cloud: 0.3, transparency: 0.18, darkness: 0.28, dew: 0.08, stability: 0.16 },
  wide_field_milky_way: { cloud: 0.3, transparency: 0.18, darkness: 0.32, dew: 0.05, stability: 0.15 },
  wide_field_nightscape: { cloud: 0.34, transparency: 0.12, darkness: 0.16, dew: 0.08, stability: 0.3 },
  broadband_deep_sky: { cloud: 0.22, transparency: 0.22, darkness: 0.34, dew: 0.05, stability: 0.17 },
  narrowband_deep_sky: { cloud: 0.22, transparency: 0.12, darkness: 0.16, dew: 0.06, stability: 0.44 },
  star_trail: { cloud: 0.38, transparency: 0.08, darkness: 0.12, dew: 0.12, stability: 0.3 },
};

const BORTLE_DARKNESS_BASE = {
  1: 100,
  2: 95,
  3: 88,
  4: 78,
  5: 64,
  6: 48,
  7: 30,
  8: 12,
  9: 0,
};

const BORTLE_MODE_SCORE_CAPS = {
  general: { 1: 97, 2: 94, 3: 89, 4: 82, 5: 68, 6: 50, 7: 28, 8: 10, 9: 0 },
  wide_field_milky_way: { 1: 96, 2: 94, 3: 90, 4: 84, 5: 68, 6: 48, 7: 24, 8: 0, 9: 0 },
  wide_field_nightscape: { 1: 96, 2: 95, 3: 92, 4: 88, 5: 80, 6: 70, 7: 58, 8: 42, 9: 24 },
  broadband_deep_sky: { 1: 95, 2: 92, 3: 86, 4: 78, 5: 62, 6: 44, 7: 24, 8: 0, 9: 0 },
  narrowband_deep_sky: { 1: 96, 2: 94, 3: 92, 4: 88, 5: 80, 6: 68, 7: 54, 8: 36, 9: 18 },
  star_trail: { 1: 96, 2: 95, 3: 92, 4: 88, 5: 82, 6: 74, 7: 62, 8: 48, 9: 28 },
};

const SCORING_MODE_PRESETS = {
  wide_field_milky_way: {
    weights: MODE_WEIGHT_PRESETS.wide_field_milky_way,
    requiresAstronomicalNight: true,
  },
  wide_field_nightscape: {
    weights: MODE_WEIGHT_PRESETS.wide_field_nightscape,
    requiresAstronomicalNight: false,
  },
  broadband_deep_sky: {
    weights: MODE_WEIGHT_PRESETS.broadband_deep_sky,
    requiresAstronomicalNight: true,
  },
  narrowband_deep_sky: {
    weights: MODE_WEIGHT_PRESETS.narrowband_deep_sky,
    requiresAstronomicalNight: true,
  },
  star_trail: {
    weights: MODE_WEIGHT_PRESETS.star_trail,
    requiresAstronomicalNight: false,
  },
};

const MODE_PROFILES = {
  general: {
    label: "General",
    weights: MODE_WEIGHT_PRESETS.general,
  },
  wide_field_milky_way: {
    label: "Wide-field Milky Way",
    weights: MODE_WEIGHT_PRESETS.wide_field_milky_way,
  },
  wide_field_nightscape: {
    label: "Wide-field Nightscape",
    weights: MODE_WEIGHT_PRESETS.wide_field_nightscape,
  },
  broadband_deep_sky: {
    label: "Broadband Deep-sky",
    weights: MODE_WEIGHT_PRESETS.broadband_deep_sky,
  },
  narrowband_deep_sky: {
    label: "Narrowband Deep-sky",
    weights: MODE_WEIGHT_PRESETS.narrowband_deep_sky,
  },
  star_trail: {
    label: "Star Trail",
    weights: MODE_WEIGHT_PRESETS.star_trail,
  },
};

const URBAN_REFERENCE_BORTLE_THRESHOLD = 7;

const URBAN_REFERENCE_MODE_CONFIG = {
  broadband_deep_sky: {
    referenceMode: "narrowband_deep_sky",
    label: "협대역/듀얼밴드 필터 기준 참고 점수",
    targetCategories: ["deep_sky"],
  },
};

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

function normalizeScoringMode(mode) {
  if (mode && Object.hasOwn(MODE_PROFILES, mode)) {
    return mode;
  }
  return mode === "general" ? "general" : DEFAULT_SCORING_MODE;
}

function asFiniteNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function interpolateBortleValue(table, bortleClass) {
  const clamped = clamp(Number(bortleClass ?? 4), 1, 9);
  const lower = Math.floor(clamped);
  const upper = Math.ceil(clamped);

  if (lower === upper) {
    return Number(table[lower] ?? table[4] ?? 0);
  }

  const lowerValue = Number(table[lower] ?? table[4] ?? 0);
  const upperValue = Number(table[upper] ?? table[4] ?? 0);
  const ratio = clamped - lower;
  return lowerValue + (upperValue - lowerValue) * ratio;
}

function calculateAirmassFromAltitudeDegrees(altitudeDegrees) {
  if (!Number.isFinite(altitudeDegrees) || altitudeDegrees <= 0) {
    return null;
  }

  const altitude = clamp(altitudeDegrees, 0.1, 90);
  const zenithDegrees = 90 - altitude;
  const zenithRadians = (zenithDegrees * Math.PI) / 180;
  return 1 / (Math.cos(zenithRadians) + 0.50572 * (96.07995 - zenithDegrees) ** -1.6364);
}

function calculateElevationTransparencyBonus(siteProfile) {
  const elevation = asFiniteNumber(siteProfile?.elevationM) ?? 0;
  if (elevation <= 300) {
    return 0;
  }
  if (elevation <= 800) {
    return ((elevation - 300) / 500) * 2;
  }
  if (elevation <= 1500) {
    return 2 + ((elevation - 800) / 700) * 3;
  }
  return clamp(5 + ((elevation - 1500) / 1500) * 3, 0, 8);
}

function calculateElevationDewBonus(siteProfile) {
  const elevation = asFiniteNumber(siteProfile?.elevationM) ?? 0;
  if (elevation <= 300) {
    return 0;
  }
  if (elevation <= 1000) {
    return ((elevation - 300) / 700) * 3;
  }
  return clamp(3 + ((elevation - 1000) / 1500) * 3, 0, 6);
}

function getTargetAltitudeDegrees(hour) {
  return asFiniteNumber(hour.targetAltitudeDegrees);
}

function getTargetAzimuthDegrees(hour) {
  return asFiniteNumber(hour.targetAzimuthDegrees);
}

function getTargetAirmass(hour) {
  return asFiniteNumber(hour.targetAirmass);
}

function getTargetVisible(hour) {
  const altitude = getTargetAltitudeDegrees(hour);
  if (typeof hour.targetVisible === "boolean") {
    return hour.targetVisible;
  }
  return altitude !== null && altitude > 0;
}

function calculateMoonInterferenceScore(hour) {
  if (!hour.moonVisible || hour.moonAltitudeDegrees <= 0) {
    return 0;
  }
  const altitudeFactor = clamp(hour.moonAltitudeDegrees / 60, 0.25, 1);
  return round(clamp(hour.moonIlluminationFraction * 100 * altitudeFactor, 0, 100));
}

function calculateTargetAltitudeScore(hour) {
  const altitude = getTargetAltitudeDegrees(hour);
  if (altitude === null || !getTargetVisible(hour)) {
    return null;
  }
  if (altitude < 20) {
    return 20;
  }
  if (altitude < 30) {
    return 50;
  }
  if (altitude < 45) {
    return 75;
  }
  return 100;
}

function calculateAngularSeparationDegrees(altitudeA, azimuthA, altitudeB, azimuthB) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const altARad = toRadians(altitudeA);
  const altBRad = toRadians(altitudeB);
  const deltaAzimuthRad = toRadians(azimuthA - azimuthB);
  const cosine =
    Math.sin(altARad) * Math.sin(altBRad) +
    Math.cos(altARad) * Math.cos(altBRad) * Math.cos(deltaAzimuthRad);
  return Math.acos(clamp(cosine, -1, 1)) * (180 / Math.PI);
}

function calculateMoonTargetSeparationDegrees(hour) {
  const targetAltitude = getTargetAltitudeDegrees(hour);
  const targetAzimuth = getTargetAzimuthDegrees(hour);
  const moonAzimuth = asFiniteNumber(hour.moonAzimuthDegrees);
  if (targetAltitude === null || targetAzimuth === null || moonAzimuth === null) {
    return null;
  }
  return round(
    calculateAngularSeparationDegrees(
      targetAltitude,
      targetAzimuth,
      hour.moonAltitudeDegrees,
      moonAzimuth,
    ),
  );
}

function getModeProfile(mode = "general") {
  return MODE_PROFILES[mode] ?? MODE_PROFILES.general;
}

function computeBaseScore(weights, componentScores) {
  return (
    componentScores.cloud * weights.cloud +
    componentScores.transparency * weights.transparency +
    componentScores.darkness * weights.darkness +
    componentScores.dew * weights.dew +
    componentScores.stability * weights.stability
  );
}

function calculateCloudScore(hour) {
  const total = Number(hour.cloud_cover ?? 0);
  const low = Number(hour.cloud_cover_low ?? total);
  const mid = Number(hour.cloud_cover_mid ?? total);
  const high = Number(hour.cloud_cover_high ?? total);
  const effectiveObstruction = Math.max(total * 0.9, low * 0.82 + mid * 0.58 + high * 0.3);
  return clamp(100 - effectiveObstruction, 0, 100);
}

function calculateTransparencyScore(hour, siteProfile) {
  const visibilityScore = clamp(((hour.visibility ?? 0) / 24000) * 100, 0, 100);
  const pm25Penalty = clamp(((hour.pm2_5 ?? 0) / 70) * 32, 0, 32);
  const pm10Penalty = clamp(((hour.pm10 ?? 0) / 120) * 14, 0, 14);
  const aodPenalty = clamp(((hour.aerosol_optical_depth ?? 0) / 0.55) * 34, 0, 34);
  const dustPenalty = clamp(((hour.dust ?? 0) / 120) * 10, 0, 10);
  const aqiPenalty = clamp(((hour.european_aqi ?? hour.us_aqi ?? 0) / 100) * 16, 0, 16);
  const elevationBonus = calculateElevationTransparencyBonus(siteProfile);
  return clamp(visibilityScore - pm25Penalty - pm10Penalty - aodPenalty - dustPenalty - aqiPenalty + elevationBonus, 0, 100);
}

function calculateDarknessScore(hour, siteProfile) {
  if (!hour.astronomicalNight) {
    return 0;
  }

  const bortle = clamp(siteProfile.bortleClass ?? 4, 1, 9);
  const baseDarkness = interpolateBortleValue(BORTLE_DARKNESS_BASE, bortle);
  const moonPenaltyBase = (hour.moonAltitudeDegrees > 0 ? hour.moonIlluminationFraction * 60 : 0);
  const moonAltitudeFactor = hour.moonAltitudeDegrees > 0 ? clamp(hour.moonAltitudeDegrees / 60, 0.25, 1) : 0;

  return clamp(baseDarkness - moonPenaltyBase * moonAltitudeFactor, 0, 100);
}

function calculateDewRiskScore(hour, siteProfile) {
  const spread = (hour.temperature_2m ?? 0) - (hour.dew_point_2m ?? 0);
  const humidity = hour.relative_humidity_2m ?? 0;
  const wind = hour.wind_speed_10m ?? 0;
  const elevationBonus = calculateElevationDewBonus(siteProfile);

  let score = 100;
  score -= clamp((3 - spread) * 18, 0, 55);
  score -= clamp(((humidity - 75) / 25) * 30, 0, 30);
  score += clamp(((wind - 8) / 10) * 15, 0, 15);
  score += elevationBonus;
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
  if (getTargetAltitudeDegrees(hour) !== null && getTargetVisible(hour) && getTargetAltitudeDegrees(hour) < 30) {
    hints.push("타깃 고도가 낮아 대기층 영향이 크게 들어올 수 있습니다.");
  }
  if (getTargetAltitudeDegrees(hour) !== null && getTargetAltitudeDegrees(hour) >= 50) {
    hints.push("타깃이 비교적 높은 고도에 있어 airmass 조건이 좋습니다.");
  }
  if (
    asFiniteNumber(hour.targetMoonSeparationDegrees) !== null &&
    hour.moonVisible &&
    hour.targetMoonSeparationDegrees < 35
  ) {
    hints.push("달과 타깃의 각거리가 가까워 배경 밝기 간섭이 커질 수 있습니다.");
  }
  if (
    asFiniteNumber(hour.galacticCoreMoonSeparationDegrees) !== null &&
    hour.moonVisible &&
    hour.galacticCoreMoonSeparationDegrees < 40
  ) {
    hints.push("달이 은하수 핵심 방향과 가까워 광시야 은하수 대비가 줄어들 수 있습니다.");
  }
  return hints;
}

function calculateMoonTargetClearanceScore(hour, mode) {
  const separationDegrees = asFiniteNumber(
    mode === "wide_field_milky_way"
      ? hour.galacticCoreMoonSeparationDegrees
      : hour.targetMoonSeparationDegrees,
  );

  if (!hour.moonVisible || separationDegrees === null) {
    return 100;
  }

  if (mode === "wide_field_nightscape" || mode === "star_trail") {
    return clamp(65 + (separationDegrees / 180) * 35, 65, 100);
  }

  if (mode === "narrowband_deep_sky") {
    return clamp(68 + (separationDegrees / 180) * 32, 68, 100);
  }

  return clamp((separationDegrees / 90) * 100, 10, 100);
}

function calculateTargetAltitudeModeScore(hour, target) {
  if (!target || !getTargetVisible(hour) || getTargetAltitudeDegrees(hour) === null) {
    return null;
  }

  const altitude = getTargetAltitudeDegrees(hour) ?? 0;
  const threshold = getTargetAltitudeThreshold(target);
  if (altitude < threshold) {
    return round(clamp((altitude / Math.max(threshold, 1)) * 35, 0, 35));
  }

  const airmass = getTargetAirmass(hour) ?? calculateAirmassFromAltitudeDegrees(altitude);
  if (airmass === null) {
    return null;
  }
  if (airmass <= 1.25) {
    return 100;
  }
  if (airmass <= 1.5) {
    return round(88 + ((1.5 - airmass) / 0.25) * 12);
  }
  if (airmass <= 2) {
    return round(68 + ((2 - airmass) / 0.5) * 20);
  }
  if (airmass <= 3) {
    return round(42 + ((3 - airmass) / 1) * 26);
  }
  return round(clamp(10 + ((4.5 - airmass) / 1.5) * 32, 0, 42));
}

function calculateMilkyWayEffectiveCloud(hour) {
  const total = Number(hour.cloud_cover ?? 0);
  const low = Number(hour.cloud_cover_low ?? hour.cloud_cover ?? 0);
  const mid = Number(hour.cloud_cover_mid ?? hour.cloud_cover ?? 0);
  const high = Number(hour.cloud_cover_high ?? hour.cloud_cover ?? 0);
  const layerWeighted = low * 0.7 + mid * 0.45 + high * 0.25;
  return clamp(Math.max(total, low, layerWeighted), 0, 100);
}

function calculateMilkyWayAltitudeScore(hour) {
  const altitude = asFiniteNumber(hour.galacticCoreAltitudeDegrees);
  if (altitude === null || altitude <= 0) {
    return 0;
  }
  if (altitude < 8) {
    return round(12 + (altitude / 8) * 18);
  }
  if (altitude < 15) {
    return round(30 + ((altitude - 8) / 7) * 25);
  }
  if (altitude < 22) {
    return round(55 + ((altitude - 15) / 7) * 20);
  }
  if (altitude < 30) {
    return round(75 + ((altitude - 22) / 8) * 17);
  }
  return 100;
}

function calculateMilkyWayCloudScore(hour) {
  return round(100 - calculateMilkyWayEffectiveCloud(hour));
}

function calculateMilkyWayModeScore({
  hour,
  transparencyScore,
  darknessScore,
  dewRiskScore,
  stabilityScore,
  moonTargetClearanceScore,
}) {
  const altitudeScore = calculateMilkyWayAltitudeScore(hour);
  const cloudScore = calculateMilkyWayCloudScore(hour);
  const supportScore = average([dewRiskScore, stabilityScore]);

  return round(
    altitudeScore * 0.4 +
    cloudScore * 0.35 +
    darknessScore * 0.12 +
    transparencyScore * 0.08 +
    moonTargetClearanceScore * 0.03 +
    supportScore * 0.02,
  );
}

function applyMilkyWayShootabilityCaps(hour, modeScore, transparencyScore, darknessScore, hardFailReasons, siteProfile) {
  const effectiveCloud = calculateMilkyWayEffectiveCloud(hour);
  const altitude = asFiniteNumber(hour.galacticCoreAltitudeDegrees) ?? -90;
  let adjusted = modeScore;

  if (!hour.astronomicalNight) adjusted = Math.min(adjusted, 20);
  if (!hour.galacticCoreVisible) adjusted = Math.min(adjusted, 25);
  if (altitude < 8) adjusted = Math.min(adjusted, 35);
  else if (altitude < 15) adjusted = Math.min(adjusted, 54);
  else if (altitude < 22) adjusted = Math.min(adjusted, 74);

  if (effectiveCloud >= 70) adjusted = Math.min(adjusted, 30);
  else if (effectiveCloud >= 50) adjusted = Math.min(adjusted, 59);
  else if (effectiveCloud >= 35) adjusted = Math.min(adjusted, 69);

  if (transparencyScore < 40) adjusted = Math.min(adjusted, 64);
  if (darknessScore < 55) adjusted = Math.min(adjusted, 52);
  if (darknessScore < 45) adjusted = Math.min(adjusted, 40);
  if (darknessScore < 35) adjusted = Math.min(adjusted, 30);
  if (hardFailReasons.length) adjusted = Math.min(adjusted, 15);

  return round(clamp(adjusted, 0, 100));
}

function isMilkyWayReady(hour, transparencyScore, darknessScore, hardFailReasons) {
  const effectiveCloud = calculateMilkyWayEffectiveCloud(hour);
  const altitude = asFiniteNumber(hour.galacticCoreAltitudeDegrees) ?? -90;

  return (
    hardFailReasons.length === 0 &&
    hour.astronomicalNight &&
    hour.galacticCoreVisible &&
    altitude >= 15 &&
    effectiveCloud < 35 &&
    darknessScore >= 55 &&
    transparencyScore >= 40
  );
}

function applyModeCaps(mode, hour, modeScore, targetAltitudeScore) {
  let adjusted = modeScore;

  if (mode === "wide_field_milky_way") {
    if (!hour.astronomicalNight) adjusted = Math.min(adjusted, 25);
    if (!hour.galacticCoreVisible) adjusted = Math.min(adjusted, 60);
    if (hour.darkness_score < 45) adjusted = Math.min(adjusted, 50);
  } else if (mode === "wide_field_nightscape") {
    if (!hour.astronomicalNight) adjusted = Math.min(adjusted, 55);
    if (hour.cloud_score < 50) adjusted = Math.min(adjusted, 45);
  } else if (mode === "broadband_deep_sky") {
    if (!hour.astronomicalNight) adjusted = Math.min(adjusted, 20);
    if (hour.darkness_score < 50) adjusted = Math.min(adjusted, 45);
    if (hour.stability_score < 45) adjusted = Math.min(adjusted, 50);
    if (targetAltitudeScore !== null && targetAltitudeScore < 45) adjusted = Math.min(adjusted, 50);
  } else if (mode === "narrowband_deep_sky") {
    if (!hour.astronomicalNight) adjusted = Math.min(adjusted, 20);
    if (hour.stability_score < 45) adjusted = Math.min(adjusted, 45);
    if (targetAltitudeScore !== null && targetAltitudeScore < 45) adjusted = Math.min(adjusted, 50);
  } else if (mode === "star_trail") {
    if (hour.cloud_score < 50) adjusted = Math.min(adjusted, 35);
    if (!hour.astronomicalNight) adjusted = Math.min(adjusted, 50);
  }

  return adjusted;
}

function applyUrbanLightPollutionCaps(mode, modeScore, siteProfile) {
  const bortle = clamp(siteProfile?.bortleClass ?? 4, 1, 9);
  const capTable = BORTLE_MODE_SCORE_CAPS[mode] ?? BORTLE_MODE_SCORE_CAPS.general;
  const cap = interpolateBortleValue(capTable, bortle);
  return round(clamp(Math.min(modeScore, cap), 0, 100));
}

function scoreHour(hour, previousHour, siteProfile, mode = "general", target = null) {
  const hardFailReasons = detectHardFail(hour);
  const cloudScore = calculateCloudScore(hour);
  const transparencyScore = calculateTransparencyScore(hour, siteProfile);
  const darknessScore = calculateDarknessScore(hour, siteProfile);
  const dewRiskScore = calculateDewRiskScore(hour, siteProfile);
  const stabilityScore = calculateStabilityScore(hour, previousHour);
  const componentScores = {
    cloud: cloudScore,
    transparency: transparencyScore,
    darkness: darknessScore,
    dew: dewRiskScore,
    stability: stabilityScore,
  };
  let overallScore = computeBaseScore(MODE_PROFILES.general.weights, componentScores);

  if (hardFailReasons.length) {
    overallScore = Math.min(overallScore, 15);
  }
  if (!hour.astronomicalNight) {
    overallScore = Math.min(overallScore, 20);
  }
  overallScore = Math.min(
    overallScore,
    interpolateBortleValue(BORTLE_MODE_SCORE_CAPS.general, siteProfile?.bortleClass ?? 4),
  );

  const modeProfile = getModeProfile(mode);
  const targetAltitudeScore = calculateTargetAltitudeModeScore(hour, target);
  const moonTargetClearanceScore = calculateMoonTargetClearanceScore(hour, mode);
  const milkyWayReady = isMilkyWayReady(hour, transparencyScore, darknessScore, hardFailReasons);
  const milkyWayEffectiveCloud = calculateMilkyWayEffectiveCloud(hour);
  const milkyWayCloudScore = calculateMilkyWayCloudScore(hour);
  const milkyWayAltitudeScore = calculateMilkyWayAltitudeScore(hour);
  let modeScore =
    mode === "wide_field_milky_way"
      ? calculateMilkyWayModeScore({
          hour,
          transparencyScore,
          darknessScore,
          dewRiskScore,
          stabilityScore,
          moonTargetClearanceScore,
        })
      : computeBaseScore(modeProfile.weights, componentScores);

  if (mode !== "wide_field_milky_way" && mode !== "wide_field_nightscape" && mode !== "star_trail") {
    const moonPenaltyBlend = mode === "narrowband_deep_sky" ? 0.1 : 0.15;
    modeScore = modeScore * (1 - moonPenaltyBlend) + moonTargetClearanceScore * moonPenaltyBlend;
  }
  if ((mode === "broadband_deep_sky" || mode === "narrowband_deep_sky") && targetAltitudeScore !== null) {
    modeScore *= 0.7 + 0.3 * (targetAltitudeScore / 100);
  }
  modeScore =
    mode === "wide_field_milky_way"
      ? applyMilkyWayShootabilityCaps(hour, modeScore, transparencyScore, darknessScore, hardFailReasons, siteProfile)
      : applyModeCaps(mode, {
          ...hour,
          cloud_score: cloudScore,
          darkness_score: darknessScore,
          stability_score: stabilityScore,
        }, modeScore, targetAltitudeScore);
  modeScore = applyUrbanLightPollutionCaps(mode, modeScore, siteProfile);
  if (mode !== "wide_field_milky_way" && hardFailReasons.length) {
    modeScore = Math.min(modeScore, 15);
  }

  const modeReadyThresholds = {
    general: 60,
    wide_field_milky_way: 68,
    wide_field_nightscape: 60,
    broadband_deep_sky: 66,
    narrowband_deep_sky: 62,
    star_trail: 58,
  };
  const modeReady =
    mode === "wide_field_milky_way"
      ? milkyWayReady
      : clamp(modeScore, 0, 100) >= (modeReadyThresholds[mode] ?? 60) && hardFailReasons.length === 0;

  return {
    ...hour,
    cloud_score: round(cloudScore),
    transparency_score: round(transparencyScore),
    darkness_score: round(darknessScore),
    dew_risk_score: round(dewRiskScore),
    stability_score: round(stabilityScore),
    overall_score: round(clamp(overallScore, 0, 100)),
    mode_score: round(clamp(modeScore, 0, 100)),
    mode_ready: modeReady,
    mode_name: modeProfile.label,
    moon_target_clearance_score: round(moonTargetClearanceScore),
    target_altitude_score: targetAltitudeScore,
    milky_way_altitude_score: milkyWayAltitudeScore,
    milky_way_cloud_score: milkyWayCloudScore,
    milky_way_effective_cloud: round(milkyWayEffectiveCloud),
    hard_fail_reasons: hardFailReasons,
    milky_way_ready: milkyWayReady,
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

function buildBestWindow(hours, mode = "general") {
  const requireNight = mode !== "wide_field_nightscape" && mode !== "star_trail";
  const viable = hours.filter((hour) => !requireNight || hour.astronomicalNight);
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

function getGalacticCoreBandPriority(hour) {
  const band = hour?.galacticCoreWindow?.band ?? null;
  if (band === "excellent") {
    return 3;
  }
  if (band === "good") {
    return 2;
  }
  if (band === "low") {
    return 1;
  }
  return 0;
}

function buildMilkyWayCoreBestWindow(hours) {
  const viable = hours.filter(
    (hour) => hour.milky_way_ready && hour.hard_fail_reasons.length === 0,
  );
  if (!viable.length) {
    return null;
  }

  const peakHour = viable.reduce((best, hour) => {
    const bestAltitude = best?.galacticCoreAltitudeDegrees ?? -90;
    const nextAltitude = hour?.galacticCoreAltitudeDegrees ?? -90;
    if (nextAltitude !== bestAltitude) {
      return nextAltitude > bestAltitude ? hour : best;
    }

    const bestScore = best?.galacticCoreWindowScore ?? -1;
    const nextScore = hour?.galacticCoreWindowScore ?? -1;
    return nextScore > bestScore ? hour : best;
  }, null);

  if (!peakHour) {
    return null;
  }

  const peakIndex = hours.findIndex((hour) => hour.time === peakHour.time);
  if (peakIndex < 0) {
    return null;
  }

  const candidates = [];
  const singleHourFallbacks = [];
  for (const startIndex of [peakIndex - 1, peakIndex]) {
    if (startIndex < 0 || startIndex >= hours.length) {
      continue;
    }

    const slice = hours.slice(startIndex, Math.min(startIndex + 2, hours.length));
    if (!slice.length || !slice.some((hour) => hour.time === peakHour.time)) {
      continue;
    }
    if (slice.some((hour) => !(hour.milky_way_ready && hour.hard_fail_reasons.length === 0))) {
      continue;
    }

    const averageScore = average(slice.map((hour) => (hour.galacticCoreWindowScore ?? 0) * 100));
    const averageAltitude = average(slice.map((hour) => hour.galacticCoreAltitudeDegrees ?? 0));
    const averageBand = average(slice.map((hour) => getGalacticCoreBandPriority(hour)));

    const candidate = {
      start: slice[0].time,
      end: slice[slice.length - 1].time,
      average_score: round(averageScore),
      hour_count: slice.length,
      composite_rank: averageScore + averageAltitude + averageBand * 5,
    };

    if (slice.length >= 2) {
      candidates.push(candidate);
    } else {
      singleHourFallbacks.push(candidate);
    }
  }

  if (candidates.length) {
    const best = candidates.reduce((winner, candidate) =>
      candidate.composite_rank > winner.composite_rank ? candidate : winner,
    );
    return {
      start: best.start,
      end: best.end,
      average_score: best.average_score,
      hour_count: best.hour_count,
    };
  }

  if (singleHourFallbacks.length) {
    const best = singleHourFallbacks.reduce((winner, candidate) =>
      candidate.composite_rank > winner.composite_rank ? candidate : winner,
    );
    return {
      start: best.start,
      end: best.end,
      average_score: best.average_score,
      hour_count: best.hour_count,
    };
  }

  return {
    start: peakHour.time,
    end: peakHour.time,
    average_score: round((peakHour.galacticCoreWindowScore ?? 0) * 100),
    hour_count: 1,
  };
}

export function buildPeakScoreWindows(
  hours,
  { scoreField, requireNight = true, predicate = null, scoreMapper = null } = {},
) {
  const candidates = hours
    .map((hour, index) => {
      const value = scoreMapper ? scoreMapper(hour) : hour?.[scoreField];
      const score = Number(value);
      return {
        hour,
        index,
        score: Number.isFinite(score) ? round(score) : null,
      };
    })
    .filter(
      ({ hour, score }) =>
        score !== null
        && (!requireNight || hour?.astronomicalNight)
        && (!predicate || predicate(hour))
        && Array.isArray(hour?.hard_fail_reasons)
        && hour.hard_fail_reasons.length === 0,
    );

  if (!candidates.length) {
    return [];
  }

  const peakScore = Math.max(...candidates.map(({ score }) => score));
  const peakHours = candidates.filter(({ score }) => score === peakScore);
  if (!peakHours.length) {
    return [];
  }

  const windows = [];
  let current = [peakHours[0]];

  const finalizeWindow = () => {
    if (!current.length) {
      return;
    }
    windows.push({
      start: current[0].hour.time,
      end: current[current.length - 1].hour.time,
      average_score: peakScore,
      hour_count: current.length,
    });
    current = [];
  };

  for (let index = 1; index < peakHours.length; index += 1) {
    const previous = peakHours[index - 1];
    const next = peakHours[index];
    if (next.index === previous.index + 1) {
      current.push(next);
      continue;
    }
    finalizeWindow();
    current = [next];
  }
  finalizeWindow();

  return windows;
}

function buildWindowByScore(hours, { scoreField, minimumScore, requireNight = true, predicate = null, scoreMapper = null }) {
  const viable = hours.filter((hour) => (!requireNight || hour.astronomicalNight) && (!predicate || predicate(hour)));
  if (!viable.length) {
    return null;
  }

  let best = null;
  let current = [];

  const finalizeWindow = () => {
    if (!current.length) {
      return;
    }
    const values = current.map((hour) => (scoreMapper ? scoreMapper(hour) : hour[scoreField]));
    const window = {
      start: current[0].time,
      end: current[current.length - 1].time,
      average_score: round(average(values)),
      hour_count: current.length,
    };
    if (!best || window.average_score > best.average_score) {
      best = window;
    }
    current = [];
  };

  viable.forEach((hour) => {
    if ((hour[scoreField] ?? 0) >= minimumScore && hour.hard_fail_reasons.length === 0) {
      current.push(hour);
    } else {
      finalizeWindow();
    }
  });
  finalizeWindow();

  return best;
}

function buildTopWindows(hours, { scoreField, minimumScore, requireNight = true, predicate = null, limit = 3, scoreMapper = null }) {
  const viable = hours.filter((hour) => (!requireNight || hour.astronomicalNight) && (!predicate || predicate(hour)));
  if (!viable.length) {
    return [];
  }

  const windows = [];
  let current = [];

  const finalizeWindow = () => {
    if (!current.length) {
      return;
    }
    const values = current.map((hour) => (scoreMapper ? scoreMapper(hour) : hour[scoreField] ?? 0));
    windows.push({
      start: current[0].time,
      end: current[current.length - 1].time,
      average_score: round(average(values)),
      hour_count: current.length,
    });
    current = [];
  };

  viable.forEach((hour) => {
    const scoreValue = scoreMapper ? scoreMapper(hour) : hour[scoreField] ?? 0;
    if (scoreValue >= minimumScore && hour.hard_fail_reasons.length === 0) {
      current.push(hour);
    } else {
      finalizeWindow();
    }
  });
  finalizeWindow();

  return windows.sort((a, b) => b.average_score - a.average_score).slice(0, limit);
}

function determineHourBlockers(hour, siteProfile, mode = "general") {
  if (hour.hard_fail_reasons.length) {
    return hour.hard_fail_reasons.map((reason) => ({
      key: reason,
      severity: 100,
    }));
  }

  const cloudSeverity =
    mode === "wide_field_milky_way"
      ? clamp(Number(hour.milky_way_effective_cloud ?? 0), 0, 100)
      : Math.max(0, 100 - (hour.cloud_score ?? 0));
  const blockers = [
    { key: "cloud", severity: cloudSeverity },
    { key: "moonlight", severity: hour.moonVisible ? Math.max(0, 100 - (hour.darkness_score ?? 0)) : 0 },
    { key: "light_pollution", severity: siteProfile.bortleClass ? clamp((siteProfile.bortleClass - 1) * 12, 0, 100) : 0 },
    { key: "transparency", severity: Math.max(0, 100 - (hour.transparency_score ?? 0)) },
    { key: "dew", severity: Math.max(0, 100 - (hour.dew_risk_score ?? 0)) },
    { key: "stability", severity: Math.max(0, 100 - (hour.stability_score ?? 0)) },
  ];

  if (getTargetAltitudeDegrees(hour) !== null) {
    blockers.push({
      key: "target_altitude",
      severity:
        mode === "wide_field_milky_way"
          ? Math.max(0, 100 - Number(hour.milky_way_altitude_score ?? 0))
          : getTargetVisible(hour) ? Math.max(0, 60 - (getTargetAltitudeDegrees(hour) ?? 0)) : 100,
    });
  }

  return blockers.filter((item) => item.severity > 0).sort((a, b) => b.severity - a.severity);
}

function blockerToReasonText(blocker) {
  switch (blocker?.key) {
    case "precipitation":
      return "강수 예보가 있어 촬영이 사실상 어렵습니다.";
    case "snowfall":
      return "적설 예보가 있어 장비 운용이 어렵습니다.";
    case "fog_or_haze":
    case "fog_code":
      return "안개 또는 짙은 연무 때문에 시정이 크게 떨어집니다.";
    case "cloud":
      return "구름이 가장 큰 방해 요소입니다.";
    case "moonlight":
      return "달빛 때문에 하늘 배경이 밝아집니다.";
    case "light_pollution":
      return "장소 자체의 광공해가 어두움을 제한합니다.";
    case "transparency":
      return "연무나 미세먼지로 대기 투명도가 낮습니다.";
    case "target_altitude":
      return "타깃 고도가 낮아 대기층 영향을 크게 받습니다.";
    case "dew":
      return "결로 위험이 높아 장시간 촬영에 불리합니다.";
    case "stability":
      return "바람 또는 대기 안정도가 선예도를 해칠 수 있습니다.";
    default:
      return "현재 시간대의 촬영 조건이 고르지 않습니다.";
  }
}

function buildBlockerTimeline(hours, siteProfile, mode = "general") {
  return hours.map((hour) => {
    const ranked = determineHourBlockers(hour, siteProfile, mode);
    const primary = ranked[0] ?? null;
    const secondary = ranked[1] ?? null;
    return {
      time: hour.time,
      primary_blocker: primary?.key ?? null,
      secondary_blocker: secondary?.key ?? null,
      primary_reason_text: blockerToReasonText(primary),
    };
  });
}

function buildScoreCurve(hours) {
  return hours.map((hour) => ({
    time: hour.time,
    overall_score: hour.overall_score,
    mode_score: hour.mode_score,
    reference_mode_score: hour.reference_mode_score ?? null,
    cloud_score: hour.cloud_score,
    transparency_score: hour.transparency_score,
    darkness_score: hour.darkness_score,
    dew_risk_score: hour.dew_risk_score,
    stability_score: hour.stability_score,
    mode_ready: hour.mode_ready,
  }));
}

function buildUrbanReferenceContext(hours, siteProfile, mode, target) {
  const config = URBAN_REFERENCE_MODE_CONFIG[mode];
  const bortle = clamp(siteProfile?.bortleClass ?? 4, 1, 9);
  if (!config || bortle < URBAN_REFERENCE_BORTLE_THRESHOLD) {
    return null;
  }

  if (Array.isArray(config.targetCategories) && !config.targetCategories.includes(target?.category ?? "custom")) {
    return null;
  }

  const referenceHours = hours.map((hour, index) =>
    scoreHour(hour, hours[index - 1], siteProfile, config.referenceMode, target));
  const referenceModeProfile = getModeProfile(config.referenceMode);

  return {
    label: config.label,
    threshold_bortle_class: URBAN_REFERENCE_BORTLE_THRESHOLD,
    reason: "urban_light_pollution_mitigation",
    mode: config.referenceMode,
    mode_label: referenceModeProfile.label,
    mode_score: round(average(referenceHours.map((hour) => hour.mode_score))),
    mode_ready: referenceHours.some((hour) => hour.mode_ready),
    hourly_scores: referenceHours.map((hour) => ({
      time: hour.time,
      mode_score: hour.mode_score,
      mode_ready: hour.mode_ready,
    })),
  };
}

function getTargetAltitudeThreshold(target) {
  if (target?.category === "milky_way" || target?.category === "wide_field") {
    return 15;
  }
  return 30;
}

function buildTargetBestWindow(hours, target) {
  const altitudeThreshold = getTargetAltitudeThreshold(target);
  const viable = hours.filter(
    (hour) => hour.astronomicalNight && getTargetVisible(hour) && (getTargetAltitudeDegrees(hour) ?? 0) >= altitudeThreshold,
  );
  if (!viable.length) {
    return null;
  }

  let best = null;
  let current = [];

  const finalizeWindow = () => {
    if (!current.length) {
      return;
    }
    const averageAltitude = average(current.map((hour) => getTargetAltitudeDegrees(hour) ?? 0));
    const window = {
      start: current[0].time,
      end: current[current.length - 1].time,
      altitude_threshold_degrees: altitudeThreshold,
      average_altitude_degrees: round(averageAltitude),
      min_altitude_degrees: round(min(current.map((hour) => getTargetAltitudeDegrees(hour) ?? 0))),
      max_altitude_degrees: round(max(current.map((hour) => getTargetAltitudeDegrees(hour) ?? 0))),
      hour_count: current.length,
    };
    if (!best || window.average_altitude_degrees > best.average_altitude_degrees) {
      best = window;
    }
    current = [];
  };

  viable.forEach((hour) => {
    if (hour.hard_fail_reasons.length === 0) {
      current.push(hour);
    } else {
      finalizeWindow();
    }
  });
  finalizeWindow();

  return best;
}

function buildSummaryFlags(hours, siteProfile, mode = "general") {
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
  if (mode === "wide_field_milky_way" && !hours.some((hour) => hour.milky_way_ready)) {
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

function buildTargetSummary(hours, target) {
  if (!target) {
    return null;
  }

  const visibleHours = hours.filter((hour) => getTargetVisible(hour));
  const peakHour = visibleHours.length
    ? visibleHours.reduce((best, hour) =>
      (getTargetAltitudeDegrees(hour) ?? -90) > (getTargetAltitudeDegrees(best) ?? -90) ? hour : best)
    : null;
  const moonSensitiveHours = visibleHours.filter((hour) => asFiniteNumber(hour.targetMoonSeparationDegrees) !== null);
  const closestMoonHour = moonSensitiveHours.length
    ? moonSensitiveHours.reduce((best, hour) =>
      (hour.targetMoonSeparationDegrees ?? 999) < (best.targetMoonSeparationDegrees ?? 999) ? hour : best)
    : null;
  const farthestMoonHour = moonSensitiveHours.length
    ? moonSensitiveHours.reduce((best, hour) =>
      (hour.targetMoonSeparationDegrees ?? -1) > (best.targetMoonSeparationDegrees ?? -1) ? hour : best)
    : null;

  return {
    name: target.name,
    category: target.category ?? "custom",
    source: target.source,
    ra_hours: round(target.raHours, 4),
    dec_degrees: round(target.decDegrees, 4),
    visible_hours: visibleHours.length,
    peak_altitude_degrees: peakHour ? round(getTargetAltitudeDegrees(peakHour) ?? 0) : null,
    peak_time: peakHour?.time ?? null,
    best_altitude_window: buildTargetBestWindow(hours, target),
    minimum_moon_separation_degrees: closestMoonHour ? round(closestMoonHour.targetMoonSeparationDegrees ?? 0) : null,
    minimum_moon_separation_time: closestMoonHour?.time ?? null,
    maximum_moon_separation_degrees: farthestMoonHour ? round(farthestMoonHour.targetMoonSeparationDegrees ?? 0) : null,
  };
}

function buildGalacticCoreSummary(hours) {
  const visibleHours = hours.filter((hour) => hour.galacticCoreVisible);
  const compositionHours = hours.filter((hour) => hour.galacticCoreWindowCanUse && hour.astronomicalNight);
  const peakHour = visibleHours.length
    ? visibleHours.reduce((best, hour) =>
      (hour.galacticCoreAltitudeDegrees ?? -90) > (best.galacticCoreAltitudeDegrees ?? -90) ? hour : best)
    : null;
  const moonSensitiveHours = visibleHours.filter((hour) => asFiniteNumber(hour.galacticCoreMoonSeparationDegrees) !== null);
  const closestMoonHour = moonSensitiveHours.length
    ? moonSensitiveHours.reduce((best, hour) =>
      (hour.galacticCoreMoonSeparationDegrees ?? 999) < (best.galacticCoreMoonSeparationDegrees ?? 999) ? hour : best)
    : null;
  const bestWindow = buildMilkyWayCoreBestWindow(hours);

  return {
    visible_hours: visibleHours.length,
    composition_hours: compositionHours.length,
    peak_altitude_degrees: peakHour ? round(peakHour.galacticCoreAltitudeDegrees ?? 0) : null,
    peak_time: peakHour?.time ?? null,
    peak_airmass: peakHour?.galacticCoreAirmass ? round(peakHour.galacticCoreAirmass, 2) : null,
    best_window: bestWindow,
    minimum_moon_separation_degrees: closestMoonHour ? round(closestMoonHour.galacticCoreMoonSeparationDegrees ?? 0) : null,
    peak_window_band: peakHour?.galacticCoreWindow?.band ?? null,
  };
}

function buildWindowRankings(hours, mode, target) {
  return {
    overall_windows: buildTopWindows(hours, {
      scoreField: "overall_score",
      minimumScore: 55,
      requireNight: mode !== "wide_field_nightscape" && mode !== "star_trail",
    }),
    mode_windows: buildTopWindows(hours, {
      scoreField: "mode_score",
      minimumScore: 55,
      requireNight: mode !== "wide_field_nightscape" && mode !== "star_trail",
    }),
    milky_way_windows: buildTopWindows(hours, {
      scoreField: "mode_score",
      minimumScore: 60,
      requireNight: true,
      predicate: (hour) => hour.milky_way_ready,
    }),
    target_windows: target
      ? buildTopWindows(hours, {
          scoreField: "mode_score",
          minimumScore: 55,
          requireNight: true,
          predicate: (hour) => getTargetVisible(hour) && (getTargetAltitudeDegrees(hour) ?? 0) >= getTargetAltitudeThreshold(target),
        })
      : [],
  };
}

function buildCurveSummary(hours, blockerTimeline) {
  const firstSlice = hours.slice(0, Math.ceil(hours.length / 3));
  const lastSlice = hours.slice(Math.max(0, hours.length - Math.ceil(hours.length / 3)));
  const firstAverage = average(firstSlice.map((hour) => hour.overall_score));
  const lastAverage = average(lastSlice.map((hour) => hour.overall_score));
  let overallTrend = "stable";
  if (lastAverage - firstAverage >= 8) {
    overallTrend = "improving";
  } else if (firstAverage - lastAverage >= 8) {
    overallTrend = "deteriorating";
  } else if (Math.abs(lastAverage - firstAverage) >= 4) {
    overallTrend = "mixed";
  }

  const segments = [
    { label: "early_night", hours: firstSlice },
    { label: "mid_night", hours: hours.slice(Math.floor(hours.length / 3), Math.floor((hours.length * 2) / 3)) },
    { label: "pre_dawn", hours: lastSlice },
  ].filter((segment) => segment.hours.length);

  const bestSegment = segments.reduce((best, segment) =>
    average(segment.hours.map((hour) => hour.overall_score)) > average(best.hours.map((hour) => hour.overall_score)) ? segment : best,
  );
  const worstSegment = segments.reduce((worst, segment) =>
    average(segment.hours.map((hour) => hour.overall_score)) < average(worst.hours.map((hour) => hour.overall_score)) ? segment : worst,
  );

  const firstBlocker = blockerTimeline.find((item) => item.primary_blocker)?.primary_blocker ?? null;
  const lastBlocker = [...blockerTimeline].reverse().find((item) => item.primary_blocker)?.primary_blocker ?? null;

  return {
    overall_trend: overallTrend,
    best_period_label: bestSegment.label,
    worst_period_label: worstSegment.label,
    main_blocker_shift:
      firstBlocker && lastBlocker && firstBlocker !== lastBlocker
        ? `${firstBlocker} -> ${lastBlocker}`
        : firstBlocker ?? null,
  };
}

function enrichHourly({ hourlyForecast, latitude, longitude, target }) {
  return hourlyForecast.map((hour) => ({
    ...hour,
    ...getAstronomyContext({
      date: new Date(hour.time),
      latitude,
      longitude,
      target,
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
  mode = "general",
  target = null,
}) {
  const normalizedMode = normalizeScoringMode(mode);
  const appliedBortleClass = clamp(
    siteProfile.bortleClass ?? lightPollutionEstimate?.estimated_bortle_center ?? 4,
    1,
    9,
  );
  const effectiveSiteProfile = {
    ...siteProfile,
    bortleClass: appliedBortleClass,
  };
  const enriched = enrichHourly({ hourlyForecast, latitude, longitude, target });
  const { bounds, hours } = selectNightHours({
    hourlyForecast: enriched,
    date,
    latitude,
    longitude,
  });

  if (!hours.length) {
    throw new Error("No hourly forecast data overlaps with the requested night window.");
  }

  const scoredHours = hours.map((hour, index) =>
    scoreHour(hour, hours[index - 1], effectiveSiteProfile, normalizedMode, target));
  const genericBestWindow = buildBestWindow(scoredHours, normalizedMode);
  const genericModeBestWindow = buildWindowByScore(scoredHours, {
    scoreField: "mode_score",
    minimumScore: 55,
    requireNight: normalizedMode !== "wide_field_nightscape" && normalizedMode !== "star_trail",
  });
  const peakModeWindows = buildPeakScoreWindows(scoredHours, {
    scoreField: "mode_score",
    requireNight: normalizedMode !== "wide_field_nightscape" && normalizedMode !== "star_trail",
    predicate: normalizedMode === "wide_field_milky_way" ? (hour) => hour.milky_way_ready : null,
  });
  const overallScore = round(average(scoredHours.map((hour) => hour.overall_score)));
  const cloudScore = round(average(scoredHours.map((hour) => hour.cloud_score)));
  const transparencyScore = round(average(scoredHours.map((hour) => hour.transparency_score)));
  const darknessScore = round(average(scoredHours.map((hour) => hour.darkness_score)));
  const dewRiskScore = round(average(scoredHours.map((hour) => hour.dew_risk_score)));
  const stabilityScore = round(average(scoredHours.map((hour) => hour.stability_score)));
  const summaryFlags = buildSummaryFlags(scoredHours, effectiveSiteProfile, normalizedMode);
  const targetSummary = buildTargetSummary(scoredHours, target);
  const galacticCoreSummary = buildGalacticCoreSummary(scoredHours);
  const urbanReferenceContext = buildUrbanReferenceContext(hours, effectiveSiteProfile, normalizedMode, target);
  const referenceScoreByTime = new Map(
    (urbanReferenceContext?.hourly_scores ?? []).map((hour) => [hour.time, hour.mode_score]),
  );
  const bestWindows = peakModeWindows.length ? peakModeWindows : null;
  const modeBestWindows = peakModeWindows.length ? peakModeWindows : null;
  const bestWindow =
    normalizedMode === "wide_field_milky_way"
      ? bestWindows?.[0] ?? null
      : bestWindows?.[0] ?? genericBestWindow;
  const modeBestWindow =
    normalizedMode === "wide_field_milky_way"
      ? modeBestWindows?.[0] ?? null
      : modeBestWindows?.[0] ?? genericModeBestWindow;
  const modeProfile = getModeProfile(normalizedMode);
  const modeScore = round(average(scoredHours.map((hour) => hour.mode_score)));
  const modeReady = scoredHours.some((hour) => hour.mode_ready);
  const blockerTimeline = buildBlockerTimeline(scoredHours, effectiveSiteProfile, normalizedMode);
  const windowRankings = buildWindowRankings(scoredHours, normalizedMode, target);
  const curveSummary = buildCurveSummary(scoredHours, blockerTimeline);
  const scoreCurve = buildScoreCurve(
    scoredHours.map((hour) => ({
      ...hour,
      reference_mode_score: referenceScoreByTime.get(hour.time) ?? null,
    })),
  );

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
        estimated_bortle_range: lightPollutionEstimate?.estimated_bortle_range ?? null,
        estimated_bortle_interval_label: lightPollutionEstimate?.estimated_bortle_interval_label ?? null,
        equivalent_zenith_brightness_mpsas: lightPollutionEstimate?.equivalent_zenith_brightness_mpsas ?? null,
        elevation_m: effectiveSiteProfile.elevationM ?? null,
        near_water: effectiveSiteProfile.nearWater ?? false,
        scoring_mode: normalizedMode,
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
      mode_score: hour.mode_score,
      reference_mode_score: referenceScoreByTime.get(hour.time) ?? null,
      mode_ready: hour.mode_ready,
      moon_context: {
        visible: hour.moonVisible,
        altitude_degrees: round(hour.moonAltitudeDegrees),
        illumination_fraction: round(hour.moonIlluminationFraction, 2),
        galactic_core_separation_degrees:
          asFiniteNumber(hour.galacticCoreMoonSeparationDegrees) !== null ? round(hour.galacticCoreMoonSeparationDegrees) : null,
        target_separation_degrees:
          asFiniteNumber(hour.targetMoonSeparationDegrees) !== null ? round(hour.targetMoonSeparationDegrees) : null,
      },
      cloud_score: hour.cloud_score,
      transparency_score: hour.transparency_score,
      darkness_score: hour.darkness_score,
      dew_risk_score: hour.dew_risk_score,
      stability_score: hour.stability_score,
      target_context: target
        ? {
            name: target.name,
            altitude_degrees: getTargetAltitudeDegrees(hour) !== null ? round(getTargetAltitudeDegrees(hour)) : null,
            altitude_score: hour.target_altitude_score ?? null,
            airmass: getTargetAirmass(hour) !== null ? round(getTargetAirmass(hour), 2) : null,
            visible: getTargetVisible(hour),
            azimuth_degrees: getTargetAzimuthDegrees(hour) !== null ? round(getTargetAzimuthDegrees(hour)) : null,
            moon_separation_degrees:
              asFiniteNumber(hour.targetMoonSeparationDegrees) !== null ? round(hour.targetMoonSeparationDegrees) : null,
          }
        : null,
      hard_fail_reasons: hour.hard_fail_reasons,
      explanation_hints: hour.explanation_hints,
      raw_inputs: {
        temperature_2m: hour.temperature_2m,
        apparent_temperature: hour.apparent_temperature,
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
        galactic_core_moon_separation_degrees:
          asFiniteNumber(hour.galacticCoreMoonSeparationDegrees) !== null ? round(hour.galacticCoreMoonSeparationDegrees) : null,
        galactic_core_window_band: hour.galacticCoreWindow?.band ?? null,
        milky_way_effective_cloud: hour.milky_way_effective_cloud ?? null,
        milky_way_cloud_score: hour.milky_way_cloud_score ?? null,
        milky_way_altitude_score: hour.milky_way_altitude_score ?? null,
        target_altitude_degrees: getTargetAltitudeDegrees(hour) !== null ? round(getTargetAltitudeDegrees(hour)) : null,
        target_airmass: getTargetAirmass(hour) !== null ? round(getTargetAirmass(hour), 2) : null,
        target_moon_separation_degrees:
          asFiniteNumber(hour.targetMoonSeparationDegrees) !== null ? round(hour.targetMoonSeparationDegrees) : null,
      },
    })),
    scores: {
      overall_score: overallScore,
      mode_score: modeScore,
      reference_mode_score: urbanReferenceContext?.mode_score ?? null,
      reference_mode_score_context: urbanReferenceContext
        ? {
            label: urbanReferenceContext.label,
            mode: urbanReferenceContext.mode,
            mode_label: urbanReferenceContext.mode_label,
            mode_ready: urbanReferenceContext.mode_ready,
            threshold_bortle_class: urbanReferenceContext.threshold_bortle_class,
          }
        : null,
      active_mode: normalizedMode,
      mode_label: modeProfile.label,
      cloud_score: cloudScore,
      transparency_score: transparencyScore,
      darkness_score: darknessScore,
      dew_risk_score: dewRiskScore,
      stability_score: stabilityScore,
      confidence: buildConfidence(scoredHours),
    },
    score_curve: scoreCurve,
    blocker_timeline: blockerTimeline,
    window_rankings: windowRankings,
    curve_summary: curveSummary,
    derived_recommendations: {
      best_window: bestWindow,
      best_windows: bestWindows,
      mode_best_window: modeBestWindow,
      mode_best_windows: modeBestWindows,
      mode_ready: modeReady,
    },
    risk_flags: summaryFlags,
    astronomy_context: {
      moon_interference_hours: scoredHours.filter((hour) => hour.moonVisible).length,
      astronomical_night_hours: scoredHours.filter((hour) => hour.astronomicalNight).length,
      galactic_core: galacticCoreSummary,
      target: targetSummary,
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

import SunCalc from "suncalc";

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const GALACTIC_CORE_RA_HOURS = 17 + 45 / 60 + 40 / 3600;
const GALACTIC_CORE_DEC_DEGREES = -(29 + 0 / 60 + 28 / 3600);
const GALACTIC_CORE_TARGET_ALTITUDE_THRESHOLDS = {
  low: 5,
  good: 10,
  optimal: 30,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeRadians(angle) {
  let result = angle % (2 * Math.PI);
  if (result < 0) {
    result += 2 * Math.PI;
  }
  return result;
}

function normalizeDeg360(value) {
  return ((value % 360) + 360) % 360;
}

function toJulianDate(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

function greenwichSiderealTime(date) {
  const jd = toJulianDate(date);
  const t = (jd - 2451545.0) / 36525.0;
  const theta =
    280.46061837 +
    360.98564736629 * (jd - 2451545.0) +
    0.000387933 * t * t -
    (t * t * t) / 38710000;
  return normalizeRadians(theta * DEG_TO_RAD);
}

function equatorialToAltAz({ raHours, decDegrees, latitude, longitude, date }) {
  const raRadians = raHours * 15 * DEG_TO_RAD;
  const decRadians = decDegrees * DEG_TO_RAD;
  const latitudeRadians = latitude * DEG_TO_RAD;
  const longitudeRadians = longitude * DEG_TO_RAD;
  const lst = normalizeRadians(greenwichSiderealTime(date) + longitudeRadians);
  const hourAngle = normalizeRadians(lst - raRadians);
  const altitudeRadians = Math.asin(
    Math.sin(decRadians) * Math.sin(latitudeRadians) +
      Math.cos(decRadians) * Math.cos(latitudeRadians) * Math.cos(hourAngle),
  );

  const sinAzimuth = (-Math.cos(decRadians) * Math.sin(hourAngle)) / Math.max(Math.cos(altitudeRadians), 1e-9);
  const cosAzimuth =
    (Math.sin(decRadians) - Math.sin(altitudeRadians) * Math.sin(latitudeRadians)) /
    Math.max(Math.cos(altitudeRadians) * Math.cos(latitudeRadians), 1e-9);
  const azimuthRadians = Math.atan2(sinAzimuth, cosAzimuth);

  return {
    altitudeDegrees: altitudeRadians * RAD_TO_DEG,
    azimuthDegrees: normalizeDeg360(azimuthRadians * RAD_TO_DEG),
  };
}

function equatorialToAltitude({ raHours, decDegrees, latitude, longitude, date }) {
  return equatorialToAltAz({ raHours, decDegrees, latitude, longitude, date }).altitudeDegrees;
}

function equatorialToAzimuth({ raHours, decDegrees, latitude, longitude, date }) {
  return equatorialToAltAz({ raHours, decDegrees, latitude, longitude, date }).azimuthDegrees;
}

function altitudeToAirmass(altitudeDegrees) {
  if (altitudeDegrees <= 0) {
    return null;
  }

  const zenithAngle = (90 - altitudeDegrees) * DEG_TO_RAD;
  const denominator = Math.cos(zenithAngle) + 0.50572 * ((96.07995 - (90 - altitudeDegrees)) ** -1.6364);
  return denominator > 0 ? 1 / denominator : null;
}

function angularSeparationFromAltAz({ altitudeAdeg, azimuthAdeg, altitudeBdeg, azimuthBdeg }) {
  const altA = altitudeAdeg * DEG_TO_RAD;
  const altB = altitudeBdeg * DEG_TO_RAD;
  const azDelta = (azimuthAdeg - azimuthBdeg) * DEG_TO_RAD;
  const cosSep = clamp(
    Math.sin(altA) * Math.sin(altB) + Math.cos(altA) * Math.cos(altB) * Math.cos(azDelta),
    -1,
    1,
  );
  return Math.acos(cosSep) * RAD_TO_DEG;
}

function parseTargetInput(target, fallbackRaHours, fallbackRaDegrees, fallbackDecDegrees) {
  const source = target ?? {};
  const raFromHours = source.raHours ?? source.ra ?? source.targetRaHours ?? source.galacticTargetRaHours;
  const decFromDegrees = source.decDegrees ?? source.dec ?? source.targetDecDegrees;
  const raFromDegrees = source.raDegrees ?? source.targetRaDegrees ?? fallbackRaDegrees;
  const decFromFallback = source.dec_degrees ?? fallbackDecDegrees;
  const raHoursValue =
    raFromHours !== undefined
      ? raFromHours
      : fallbackRaHours !== undefined
        ? fallbackRaHours
        : raFromDegrees !== undefined
          ? raFromDegrees / 15
          : undefined;
  const decDegreesValue = decFromDegrees !== undefined ? decFromDegrees : decFromFallback;

  if (!Number.isFinite(Number(raHoursValue)) || !Number.isFinite(Number(decDegreesValue))) {
    return null;
  }

  return {
    raHours: Number(raHoursValue),
    decDegrees: Number(decDegreesValue),
    name: source.name ?? source.label ?? null,
  };
}

function galacticCoreWindowState(altitudeDegrees) {
  if (altitudeDegrees <= GALACTIC_CORE_TARGET_ALTITUDE_THRESHOLDS.low) {
    return {
      can_use_for_composition: false,
      band: altitudeDegrees > 0 ? "barely" : "below_horizon",
    };
  }
  if (altitudeDegrees < GALACTIC_CORE_TARGET_ALTITUDE_THRESHOLDS.good) {
    return { can_use_for_composition: true, band: "low" };
  }
  if (altitudeDegrees < GALACTIC_CORE_TARGET_ALTITUDE_THRESHOLDS.optimal) {
    return { can_use_for_composition: true, band: "good" };
  }
  return { can_use_for_composition: true, band: "excellent" };
}

export function getAstronomicalNightBounds({ date, latitude, longitude }) {
  const base = new Date(`${date}T12:00:00Z`);
  const times = SunCalc.getTimes(base, latitude, longitude);
  const nextDay = new Date(base.getTime() + 24 * 60 * 60 * 1000);
  const nextTimes = SunCalc.getTimes(nextDay, latitude, longitude);

  return {
    astronomicalDusk: times.night,
    astronomicalDawn: nextTimes.nightEnd,
    sunset: times.sunset,
    sunrise: nextTimes.sunrise,
  };
}

export function getAstronomyContext({ date, latitude, longitude, target = null, targetRaHours, targetRaDegrees, targetDecDegrees }) {
  const moonPosition = SunCalc.getMoonPosition(date, latitude, longitude);
  const moonIllumination = SunCalc.getMoonIllumination(date);
  const moonTimes = SunCalc.getMoonTimes(date, latitude, longitude, true);
  const sunPosition = SunCalc.getPosition(date, latitude, longitude);
  const targetCoordinates = parseTargetInput(target, targetRaHours, targetRaDegrees, targetDecDegrees);
  const galacticCore = equatorialToAltAz({
    raHours: GALACTIC_CORE_RA_HOURS,
    decDegrees: GALACTIC_CORE_DEC_DEGREES,
    latitude,
    longitude,
    date,
  });
  const targetAltitudeDegrees = targetCoordinates
    ? equatorialToAltitude({
        raHours: targetCoordinates.raHours,
        decDegrees: targetCoordinates.decDegrees,
        latitude,
        longitude,
        date,
      })
    : null;
  const targetAzimuthDegrees = targetCoordinates
    ? equatorialToAzimuth({
        raHours: targetCoordinates.raHours,
        decDegrees: targetCoordinates.decDegrees,
        latitude,
        longitude,
        date,
      })
    : null;
  const targetAirmass = targetAltitudeDegrees === null ? null : altitudeToAirmass(targetAltitudeDegrees);
  const targetVisible = targetAltitudeDegrees !== null ? targetAltitudeDegrees > 0 : false;

  const moonAltitudeDegrees = moonPosition.altitude * RAD_TO_DEG;
  const moonAzimuthDegrees = normalizeDeg360(moonPosition.azimuth * RAD_TO_DEG);

  const targetMoonSeparationDegrees =
    targetCoordinates === null
      ? null
      : angularSeparationFromAltAz({
          altitudeAdeg: moonAltitudeDegrees,
          azimuthAdeg: moonAzimuthDegrees,
          altitudeBdeg: targetAltitudeDegrees ?? 0,
          azimuthBdeg: targetAzimuthDegrees ?? 0,
        });

  const galacticCoreMoonSeparationDegrees = angularSeparationFromAltAz({
    altitudeAdeg: moonAltitudeDegrees,
    azimuthAdeg: moonAzimuthDegrees,
    altitudeBdeg: galacticCore.altitudeDegrees,
    azimuthBdeg: galacticCore.azimuthDegrees,
  });

  const astronomicalNight = sunPosition.altitude <= -18 * DEG_TO_RAD;
  const galacticCoreAltitudeDegrees = galacticCore.altitudeDegrees;
  const galacticCoreVisible = galacticCoreAltitudeDegrees > 5;
  const galacticCoreWindow = galacticCoreWindowState(galacticCoreAltitudeDegrees);
  const galacticCoreWindowScore = clamp(galacticCoreAltitudeDegrees / GALACTIC_CORE_TARGET_ALTITUDE_THRESHOLDS.optimal, 0, 1);
  const galacticCoreAirmass = altitudeToAirmass(galacticCoreAltitudeDegrees);

  return {
    astronomicalNight,
    sunAltitudeDegrees: sunPosition.altitude * RAD_TO_DEG,
    moonAltitudeDegrees,
    moonAzimuthDegrees,
    moonVisible: moonAltitudeDegrees > 0,
    moonIlluminationFraction: clamp(moonIllumination.fraction, 0, 1),
    moonPhaseFraction: clamp(moonIllumination.phase, 0, 1),
    moonRise: moonTimes.rise ?? null,
    moonSet: moonTimes.set ?? null,
    galacticCoreAltitudeDegrees,
    galacticCoreAzimuthDegrees: galacticCore.azimuthDegrees,
    galacticCoreVisible,
    galacticCoreAirmass,
    galacticCoreMoonSeparationDegrees,
    galacticCoreWindow,
    galacticCoreWindowScore,
    galacticCoreWindowCanUse: galacticCoreWindow.can_use_for_composition,
    targetAltitudeDegrees,
    targetAirmass,
    targetAzimuthDegrees,
    targetDecCoordinates: targetCoordinates?.decDegrees ?? null,
    targetRaHours: targetCoordinates?.raHours ?? null,
    targetLabel: targetCoordinates?.name ?? null,
    targetVisible,
    targetMoonSeparationDegrees,
  };
}

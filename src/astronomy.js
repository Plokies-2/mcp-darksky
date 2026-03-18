import SunCalc from "suncalc";

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const GALACTIC_CORE_RA_HOURS = 17 + 45 / 60 + 40 / 3600;
const GALACTIC_CORE_DEC_DEGREES = -(29 + 0 / 60 + 28 / 3600);

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

function equatorialToAltitude({ raHours, decDegrees, latitude, longitude, date }) {
  const raRadians = raHours * 15 * DEG_TO_RAD;
  const decRadians = decDegrees * DEG_TO_RAD;
  const latitudeRadians = latitude * DEG_TO_RAD;
  const longitudeRadians = longitude * DEG_TO_RAD;
  const lst = normalizeRadians(greenwichSiderealTime(date) + longitudeRadians);
  const hourAngle = normalizeRadians(lst - raRadians);
  const altitude = Math.asin(
    Math.sin(decRadians) * Math.sin(latitudeRadians) +
      Math.cos(decRadians) * Math.cos(latitudeRadians) * Math.cos(hourAngle),
  );
  return altitude * RAD_TO_DEG;
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

export function getAstronomyContext({ date, latitude, longitude }) {
  const moonPosition = SunCalc.getMoonPosition(date, latitude, longitude);
  const moonIllumination = SunCalc.getMoonIllumination(date);
  const moonTimes = SunCalc.getMoonTimes(date, latitude, longitude, true);
  const sunPosition = SunCalc.getPosition(date, latitude, longitude);
  const galacticCoreAltitude = equatorialToAltitude({
    raHours: GALACTIC_CORE_RA_HOURS,
    decDegrees: GALACTIC_CORE_DEC_DEGREES,
    latitude,
    longitude,
    date,
  });

  const astronomicalNight = sunPosition.altitude <= -18 * DEG_TO_RAD;
  const moonAltitudeDegrees = moonPosition.altitude * RAD_TO_DEG;
  const moonVisible = moonAltitudeDegrees > 0;
  const galacticCoreVisible = galacticCoreAltitude > 5;

  return {
    astronomicalNight,
    sunAltitudeDegrees: sunPosition.altitude * RAD_TO_DEG,
    moonAltitudeDegrees,
    moonAzimuthDegrees: moonPosition.azimuth * RAD_TO_DEG,
    moonVisible,
    moonIlluminationFraction: clamp(moonIllumination.fraction, 0, 1),
    moonPhaseFraction: clamp(moonIllumination.phase, 0, 1),
    moonRise: moonTimes.rise ?? null,
    moonSet: moonTimes.set ?? null,
    galacticCoreAltitudeDegrees: galacticCoreAltitude,
    galacticCoreVisible,
  };
}

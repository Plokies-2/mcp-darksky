import { resolvePlaceQuery } from "./kakao-local.js";
import { fetchElevationAtPoint } from "./open-meteo.js";

const PLACE_QUERY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const placeQueryCache = new Map();

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

async function getCachedResolvedPlace(query, restApiKey) {
  const cacheKey = String(query).trim().toLowerCase();
  const cached = placeQueryCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const resolved = await resolvePlaceQuery({
    query,
    restApiKey,
  });

  placeQueryCache.set(cacheKey, {
    value: resolved,
    expiresAt: Date.now() + PLACE_QUERY_CACHE_TTL_MS,
  });

  return resolved;
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

export async function resolveObservationPoint(parsed, kakaoRestApiKey) {
  const hasCoordinates = parsed.latitude !== undefined && parsed.longitude !== undefined;
  const canResolvePlace = Boolean(parsed.place_query) && Boolean(kakaoRestApiKey);

  if (canResolvePlace) {
    const resolved = await getCachedResolvedPlace(parsed.place_query, kakaoRestApiKey);

    return reconcileObservationPoint(parsed, resolved);
  }

  if (hasCoordinates) {
    return reconcileObservationPoint(parsed);
  }

  const resolved = await getCachedResolvedPlace(parsed.place_query, kakaoRestApiKey);

  return reconcileObservationPoint(parsed, resolved);
}

export async function resolveEffectiveSiteProfile(parsedSiteProfile, observationPoint) {
  if (parsedSiteProfile?.elevation_m !== undefined) {
    return {
      siteProfile: {
        bortleClass: parsedSiteProfile?.bortle_class,
        elevationM: parsedSiteProfile.elevation_m,
        nearWater: parsedSiteProfile?.near_water,
      },
      sourceAttribution: [],
    };
  }

  try {
    const elevation = await fetchElevationAtPoint({
      latitude: observationPoint.latitude,
      longitude: observationPoint.longitude,
    });

    return {
      siteProfile: {
        bortleClass: parsedSiteProfile?.bortle_class,
        elevationM: elevation.elevationM,
        nearWater: parsedSiteProfile?.near_water,
      },
      sourceAttribution: elevation.sourceAttribution,
    };
  } catch {
    return {
      siteProfile: {
        bortleClass: parsedSiteProfile?.bortle_class,
        elevationM: undefined,
        nearWater: parsedSiteProfile?.near_water,
      },
      sourceAttribution: [],
    };
  }
}

export function attachObservationResolution(location, observationPoint, placeQuery) {
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

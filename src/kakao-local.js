import { fetchWithRetries } from "./retry-fetch.js";

const KAKAO_KEYWORD_SEARCH_URL = "https://dapi.kakao.com/v2/local/search/keyword.json";
const KAKAO_ADDRESS_SEARCH_URL = "https://dapi.kakao.com/v2/local/search/address.json";

function buildUrl(base, params) {
  const url = new URL(base);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url;
}

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

async function fetchKakaoJson(url, restApiKey) {
  try {
    const response = await fetchWithRetries(url, {
      label: `Kakao Local API request to ${url.hostname}`,
      fetchOptions: {
        headers: {
          Authorization: `KakaoAK ${restApiKey}`,
        },
      },
    });
    if (!response.ok) {
      throw new Error(`Kakao Local API request failed with ${response.status}: ${response.statusText}`);
    }

    return response.json();
  } catch (error) {
    throw new Error(`Kakao Local API is currently unreachable: ${url.hostname}`, {
      cause: error,
    });
  }
}

function normalizeResolvedPlace(document, query) {
  return {
    latitude: Number(document.y),
    longitude: Number(document.x),
    locationName: document.place_name ?? document.road_address_name ?? document.address_name ?? query,
    addressName: document.address_name ?? null,
    roadAddressName: document.road_address_name ?? null,
    placeName: document.place_name ?? null,
    provider: "Kakao Local API",
  };
}

function scoreDocumentMatch(document, query) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return -1;
  }
  const candidates = [
    document.place_name,
    document.address_name,
    document.road_address_name,
    document.road_address?.address_name,
  ].filter(Boolean);

  let score = -1;
  for (const candidate of candidates) {
    const normalizedCandidate = normalizeText(candidate);
    if (!normalizedCandidate) {
      continue;
    }
    if (normalizedCandidate === normalizedQuery) {
      score = Math.max(score, 100);
      continue;
    }
    if (normalizedCandidate.includes(normalizedQuery)) {
      score = Math.max(score, 75);
      continue;
    }
    if (normalizedQuery.includes(normalizedCandidate)) {
      score = Math.max(score, 55);
    }
  }

  return score;
}

function findBestMatchingDocument(documents, query) {
  return (documents ?? [])
    .filter((document) => document.x && document.y)
    .map((document) => ({
      document,
      score: scoreDocumentMatch(document, query),
    }))
    .filter((entry) => entry.score >= 0)
    .sort((left, right) => right.score - left.score)[0]?.document;
}

export async function resolvePlaceQuery({ query, restApiKey }) {
  if (!restApiKey) {
    throw new Error("Kakao REST API key is required to use place_query.");
  }

  const keywordUrl = buildUrl(KAKAO_KEYWORD_SEARCH_URL, {
    query,
    size: 10,
  });
  const keywordResult = await fetchKakaoJson(keywordUrl, restApiKey);
  const keywordDoc = findBestMatchingDocument(keywordResult.documents, query);
  if (keywordDoc) {
    return normalizeResolvedPlace(keywordDoc, query);
  }

  const addressUrl = buildUrl(KAKAO_ADDRESS_SEARCH_URL, {
    query,
    size: 10,
  });
  const addressResult = await fetchKakaoJson(addressUrl, restApiKey);
  const addressDoc = findBestMatchingDocument(addressResult.documents, query);
  if (addressDoc) {
    return normalizeResolvedPlace(addressDoc, query);
  }

  throw new Error(`No Kakao Local API result matched place_query: ${query}`);
}

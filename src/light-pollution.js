import { promises as fs } from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const estimateCache = new Map();
const runtimeArtifactCache = new Map();
const jsonCache = new Map();

const RADIANCE_FLOOR = 0.5;
const KM_PER_DEGREE = 111.32;
const DEFAULT_PIXELS_PER_DEGREE = 240;
const DEFAULT_TILE_SIZE_PX = 2400;
const DISPLAY_BORTLE_PERCENTILE_ANCHORS = [
  [0.0, 3.8],
  [10.0, 4.0],
  [20.0, 4.2],
  [35.0, 4.6],
  [55.0, 5.5],
  [75.0, 6.3],
  [90.0, 7.2],
  [97.0, 8.0],
  [100.0, 8.8],
];

function buildCacheKey({
  latitude,
  longitude,
  statsPath,
  distributionPath,
  runtimeArtifactPath,
}) {
  return [
    latitude.toFixed(6),
    longitude.toFixed(6),
    statsPath ?? "",
    distributionPath ?? "",
    runtimeArtifactPath ?? "",
  ].join(":");
}

function isNodeRuntime() {
  return Boolean(globalThis.process?.release?.name === "node");
}

async function getNodePaths() {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(moduleDir, "..");
  return {
    projectRoot,
    defaultStatsPath: path.join(projectRoot, "data", "black-marble-korea-stats.json"),
    defaultDistributionPath: path.join(projectRoot, "data", "black-marble-korea-distribution.json"),
    defaultRuntimeArtifactPath: path.join(projectRoot, "data", "black-marble-korea-runtime.npz"),
  };
}

function clamp(value, lower, upper) {
  return Math.max(lower, Math.min(value, upper));
}

function roundOrNone(value, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }

  return Number(value.toFixed(digits));
}

function interpolate(value, leftX, rightX, leftY, rightY) {
  if (Math.abs(leftX - rightX) <= Number.EPSILON) {
    return leftY;
  }

  const ratio = (value - leftX) / (rightX - leftX);
  return leftY + ratio * (rightY - leftY);
}

function percentileCurve(stats) {
  return Object.entries(stats.merged_positive_land_stats.percentiles)
    .map(([label, value]) => [Number(label), Number(value)])
    .sort((left, right) => left[0] - right[0]);
}

function estimatePercentileFromRadiance(radiance, stats) {
  const curve = stats.__percentileCurve ?? percentileCurve(stats);
  if (!stats.__percentileCurve) {
    stats.__percentileCurve = curve;
  }

  if (radiance <= 0) {
    return 0.0;
  }

  const [firstPercentile, firstRadiance] = curve[0];
  if (radiance <= firstRadiance) {
    return clamp(
      interpolate(clamp(radiance, 0.0, firstRadiance), RADIANCE_FLOOR, firstRadiance, 0.0, firstPercentile),
      0.0,
      firstPercentile,
    );
  }

  for (let index = 0; index < curve.length - 1; index += 1) {
    const [leftPercentile, leftRadiance] = curve[index];
    const [rightPercentile, rightRadiance] = curve[index + 1];
    if (radiance <= rightRadiance) {
      const leftLog = Math.log10(Math.max(leftRadiance, RADIANCE_FLOOR));
      const rightLog = Math.log10(Math.max(rightRadiance, RADIANCE_FLOOR));
      const valueLog = Math.log10(Math.max(radiance, RADIANCE_FLOOR));
      return clamp(interpolate(valueLog, leftLog, rightLog, leftPercentile, rightPercentile), 0.0, 100.0);
    }
  }

  const [lastPercentile, lastRadiance] = curve[curve.length - 1];
  const scaleLimit = lastRadiance * 2.0;
  const lastLog = Math.log10(Math.max(lastRadiance, RADIANCE_FLOOR));
  const limitLog = Math.log10(Math.max(scaleLimit, lastRadiance + 1e-6));
  const valueLog = Math.log10(Math.max(radiance, lastRadiance));
  return clamp(
    interpolate(clamp(valueLog, lastLog, limitLog), lastLog, limitLog, lastPercentile, 100.0),
    lastPercentile,
    100.0,
  );
}

function percentileToBortleCenter(percentile) {
  const clampedPercentile = clamp(percentile, 0.0, 100.0);
  for (let index = 0; index < DISPLAY_BORTLE_PERCENTILE_ANCHORS.length - 1; index += 1) {
    const [leftPercentile, leftBortle] = DISPLAY_BORTLE_PERCENTILE_ANCHORS[index];
    const [rightPercentile, rightBortle] = DISPLAY_BORTLE_PERCENTILE_ANCHORS[index + 1];
    if (clampedPercentile <= rightPercentile) {
      return interpolate(clampedPercentile, leftPercentile, rightPercentile, leftBortle, rightBortle);
    }
  }

  return 9.0;
}

function radianceToEquivalentSqm(radiance) {
  if (radiance <= 0) {
    return null;
  }

  return 20.93 - 0.95 * Math.log10(radiance);
}

function equivalentSqmInCalibratedRange(value) {
  return value !== null && value >= 19.41 && value <= 21.12;
}

function percentileFromSorted(values, percentile) {
  if (values.length === 0) {
    return null;
  }

  if (values.length === 1) {
    return values[0];
  }

  const position = (values.length - 1) * (percentile / 100);
  const leftIndex = Math.floor(position);
  const rightIndex = Math.ceil(position);
  if (leftIndex === rightIndex) {
    return values[leftIndex];
  }

  return interpolate(position, leftIndex, rightIndex, values[leftIndex], values[rightIndex]);
}

function estimateRankFromHistogram(value, summary) {
  const { counts, edges } = summary.histogram;
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total <= 0) {
    return 0.0;
  }

  if (value <= edges[0]) {
    return 0.0;
  }

  if (value >= edges[edges.length - 1]) {
    return 100.0;
  }

  let cumulative = 0.0;
  for (let index = 0; index < counts.length; index += 1) {
    const left = edges[index];
    const right = edges[index + 1];
    if (value >= right) {
      cumulative += counts[index];
      continue;
    }

    const ratio = (value - left) / Math.max(right - left, 1e-6);
    cumulative += counts[index] * clamp(ratio, 0.0, 1.0);
    break;
  }

  return Number(((cumulative / total) * 100.0).toFixed(2));
}

function attachDistributionContext(estimate, distribution) {
  const centerSummary = distribution.summaries.estimated_bortle_center;
  const rank = estimateRankFromHistogram(Number(estimate.estimated_bortle_center), centerSummary);
  estimate.distribution_context = {
    valid_pixel_count: distribution.valid_pixel_count,
    brightness_percentile_in_korea: rank,
    darkness_percentile_in_korea: Number((100.0 - rank).toFixed(2)),
    estimated_bortle_distribution_skewness: centerSummary.skewness,
    distribution_version: distribution.version,
  };
}

function parseNpyHeader(headerText) {
  const descrMatch = headerText.match(/'descr': '([^']+)'/);
  const fortranMatch = headerText.match(/'fortran_order': (False|True)/);
  const shapeMatch = headerText.match(/'shape': \(([^)]*)\)/);

  if (!descrMatch || !fortranMatch || !shapeMatch) {
    throw new Error(`Unsupported NPY header: ${headerText}`);
  }

  const shapeText = shapeMatch[1].trim();
  const shape = shapeText
    ? shapeText
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => Number.parseInt(value, 10))
    : [];

  return {
    descr: descrMatch[1],
    fortranOrder: fortranMatch[1] === "True",
    shape,
  };
}

function decodeUnicodeScalar(buffer, dataOffset, charCount) {
  let result = "";
  for (let index = 0; index < charCount; index += 1) {
    const codePoint = buffer.readUInt32LE(dataOffset + (index * 4));
    if (codePoint === 0) {
      continue;
    }

    result += String.fromCodePoint(codePoint);
  }

  return result;
}

function parseNpy(buffer) {
  if (buffer.toString("latin1", 0, 6) !== "\u0093NUMPY") {
    throw new Error("Invalid NPY magic header.");
  }

  const majorVersion = buffer.readUInt8(6);
  const minorVersion = buffer.readUInt8(7);
  let headerLength;
  let dataOffset;

  if (majorVersion === 1) {
    headerLength = buffer.readUInt16LE(8);
    dataOffset = 10 + headerLength;
  } else if (majorVersion === 2 || majorVersion === 3) {
    headerLength = buffer.readUInt32LE(8);
    dataOffset = 12 + headerLength;
  } else {
    throw new Error(`Unsupported NPY version ${majorVersion}.${minorVersion}`);
  }

  const headerText = buffer.toString("latin1", dataOffset - headerLength, dataOffset).trim();
  const header = parseNpyHeader(headerText);
  if (header.fortranOrder) {
    throw new Error("Fortran-order NPY arrays are unsupported.");
  }

  const elementCount = header.shape.length === 0 ? 1 : header.shape.reduce((product, value) => product * value, 1);

  if (header.descr === "<f4") {
    return {
      ...header,
      data: new Float32Array(buffer.buffer, buffer.byteOffset + dataOffset, elementCount),
    };
  }

  if (header.descr === "|u1" || header.descr === "<u1") {
    return {
      ...header,
      data: new Uint8Array(buffer.buffer, buffer.byteOffset + dataOffset, elementCount),
    };
  }

  const unicodeMatch = header.descr.match(/^<U(\d+)$/);
  if (unicodeMatch) {
    return {
      ...header,
      value: decodeUnicodeScalar(buffer, dataOffset, Number.parseInt(unicodeMatch[1], 10)),
    };
  }

  throw new Error(`Unsupported NPY dtype ${header.descr}`);
}

function parseZip64Extra(extraBuffer, initialState) {
  const state = { ...initialState };
  let offset = 0;

  while (offset + 4 <= extraBuffer.length) {
    const headerId = extraBuffer.readUInt16LE(offset);
    const dataSize = extraBuffer.readUInt16LE(offset + 2);
    const dataStart = offset + 4;
    const dataEnd = dataStart + dataSize;
    if (dataEnd > extraBuffer.length) {
      break;
    }

    if (headerId === 0x0001) {
      let cursor = dataStart;
      if (state.uncompressedSize === 0xFFFFFFFF) {
        state.uncompressedSize = Number(extraBuffer.readBigUInt64LE(cursor));
        cursor += 8;
      }

      if (state.compressedSize === 0xFFFFFFFF) {
        state.compressedSize = Number(extraBuffer.readBigUInt64LE(cursor));
        cursor += 8;
      }

      if (state.localHeaderOffset === 0xFFFFFFFF) {
        state.localHeaderOffset = Number(extraBuffer.readBigUInt64LE(cursor));
      }

      break;
    }

    offset = dataEnd;
  }

  return state;
}

function findEndOfCentralDirectory(buffer) {
  const minOffset = Math.max(0, buffer.length - 65557);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }

  throw new Error("Could not find ZIP end-of-central-directory record.");
}

function resolveCentralDirectory(buffer) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const entryCount16 = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize32 = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset32 = buffer.readUInt32LE(eocdOffset + 16);

  if (
    entryCount16 !== 0xFFFF
    && centralDirectorySize32 !== 0xFFFFFFFF
    && centralDirectoryOffset32 !== 0xFFFFFFFF
  ) {
    return {
      entryCount: entryCount16,
      centralDirectorySize: centralDirectorySize32,
      centralDirectoryOffset: centralDirectoryOffset32,
    };
  }

  const locatorOffset = eocdOffset - 20;
  if (locatorOffset < 0 || buffer.readUInt32LE(locatorOffset) !== 0x07064b50) {
    throw new Error("ZIP64 locator is missing.");
  }

  const zip64EocdOffset = Number(buffer.readBigUInt64LE(locatorOffset + 8));
  if (buffer.readUInt32LE(zip64EocdOffset) !== 0x06064b50) {
    throw new Error("ZIP64 end-of-central-directory record is invalid.");
  }

  return {
    entryCount: Number(buffer.readBigUInt64LE(zip64EocdOffset + 32)),
    centralDirectorySize: Number(buffer.readBigUInt64LE(zip64EocdOffset + 40)),
    centralDirectoryOffset: Number(buffer.readBigUInt64LE(zip64EocdOffset + 48)),
  };
}

function parseZipEntries(buffer) {
  const { entryCount, centralDirectoryOffset, centralDirectorySize } = resolveCentralDirectory(buffer);
  const entries = new Map();
  let offset = centralDirectoryOffset;
  const endOffset = centralDirectoryOffset + centralDirectorySize;

  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > endOffset || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("Invalid ZIP central directory entry.");
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraFieldLength = buffer.readUInt16LE(offset + 30);
    const fileCommentLength = buffer.readUInt16LE(offset + 32);
    const initialState = {
      compressedSize: buffer.readUInt32LE(offset + 20),
      uncompressedSize: buffer.readUInt32LE(offset + 24),
      localHeaderOffset: buffer.readUInt32LE(offset + 42),
    };
    const fileNameStart = offset + 46;
    const extraStart = fileNameStart + fileNameLength;
    const extraEnd = extraStart + extraFieldLength;
    const fileName = buffer.toString("utf8", fileNameStart, extraStart);
    const resolvedState = parseZip64Extra(buffer.subarray(extraStart, extraEnd), initialState);

    entries.set(fileName, {
      compressionMethod,
      compressedSize: resolvedState.compressedSize,
      uncompressedSize: resolvedState.uncompressedSize,
      localHeaderOffset: resolvedState.localHeaderOffset,
    });

    offset = extraEnd + fileCommentLength;
  }

  return entries;
}

function extractZipEntry(buffer, entry) {
  const { compressionMethod, compressedSize, localHeaderOffset } = entry;
  if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
    throw new Error("Invalid ZIP local header.");
  }

  const fileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
  const extraFieldLength = buffer.readUInt16LE(localHeaderOffset + 28);
  const dataStart = localHeaderOffset + 30 + fileNameLength + extraFieldLength;
  const compressed = buffer.subarray(dataStart, dataStart + compressedSize);

  if (compressionMethod === 0) {
    return compressed;
  }

  if (compressionMethod === 8) {
    return inflateRawSync(compressed);
  }

  throw new Error(`Unsupported ZIP compression method ${compressionMethod}`);
}

async function readRuntimeArtifact(artifactPath) {
  const archiveBuffer = await fs.readFile(artifactPath);
  const entries = parseZipEntries(archiveBuffer);
  const requiredNames = [
    "metadata_json.npy",
    "merged_radiance.npy",
    "quality_good_fraction.npy",
    "observation_median.npy",
    "std_median.npy",
    "sensor_delta_ratio.npy",
    "valid_mask.npy",
  ];

  const loadedEntries = {};
  for (const name of requiredNames) {
    const entry = entries.get(name);
    if (!entry) {
      throw new Error(`Runtime artifact is missing ${name}`);
    }

    loadedEntries[name] = parseNpy(extractZipEntry(archiveBuffer, entry));
  }

  const metadata = JSON.parse(loadedEntries["metadata_json.npy"].value);
  return {
    path: artifactPath,
    metadata,
    rows: metadata.grid.rows,
    cols: metadata.grid.cols,
    horizontalIds: metadata.grid.horizontal_ids,
    verticalIds: metadata.grid.vertical_ids,
    horizontalIndex: new Map(metadata.grid.horizontal_ids.map((value, index) => [value, index])),
    verticalIndex: new Map(metadata.grid.vertical_ids.map((value, index) => [value, index])),
    mergedRadiance: loadedEntries["merged_radiance.npy"].data,
    qualityGoodFraction: loadedEntries["quality_good_fraction.npy"].data,
    observationMedian: loadedEntries["observation_median.npy"].data,
    stdMedian: loadedEntries["std_median.npy"].data,
    sensorDeltaRatio: loadedEntries["sensor_delta_ratio.npy"].data,
    validMask: loadedEntries["valid_mask.npy"].data,
  };
}

async function loadRuntimeArtifact(artifactPath) {
  try {
    await fs.access(artifactPath);
  } catch {
    return null;
  }

  if (!runtimeArtifactCache.has(artifactPath)) {
    runtimeArtifactCache.set(
      artifactPath,
      readRuntimeArtifact(artifactPath).catch((error) => {
        runtimeArtifactCache.delete(artifactPath);
        throw error;
      }),
    );
  }

  return runtimeArtifactCache.get(artifactPath);
}

async function loadJson(jsonPath) {
  try {
    await fs.access(jsonPath);
  } catch {
    return null;
  }

  if (!jsonCache.has(jsonPath)) {
    jsonCache.set(
      jsonPath,
      fs.readFile(jsonPath, "utf8")
        .then((content) => JSON.parse(content))
        .catch((error) => {
          jsonCache.delete(jsonPath);
          throw error;
        }),
    );
  }

  return jsonCache.get(jsonPath);
}

function runtimeArtifactRowCol(runtimeArtifact, lat, lon) {
  const grid = runtimeArtifact.metadata.grid;
  const pixelsPerDegree = Number(grid.pixels_per_degree ?? DEFAULT_PIXELS_PER_DEGREE);
  const tileSizePx = Number(grid.tile_size_px ?? DEFAULT_TILE_SIZE_PX);
  const horizontal = Math.floor((lon + 180) / 10);
  const vertical = Math.floor((90 - lat) / 10);
  const tileId = `h${String(horizontal).padStart(2, "0")}v${String(vertical).padStart(2, "0")}`;

  if (!runtimeArtifact.horizontalIndex.has(horizontal) || !runtimeArtifact.verticalIndex.has(vertical)) {
    throw new Error(`Runtime artifact does not contain tile ${tileId}.`);
  }

  const tileRow = runtimeArtifact.verticalIndex.get(vertical) * tileSizePx;
  const tileCol = runtimeArtifact.horizontalIndex.get(horizontal) * tileSizePx;
  const north = 90.0 - (vertical * 10.0);
  const west = (horizontal * 10.0) - 180.0;
  const rowOffset = clamp(Math.trunc((north - lat) * pixelsPerDegree), 0, tileSizePx - 1);
  const colOffset = clamp(Math.trunc((lon - west) * pixelsPerDegree), 0, tileSizePx - 1);

  return {
    row: tileRow + rowOffset,
    col: tileCol + colOffset,
    tileId,
  };
}

function slicesForRuntimeArtifact(runtimeArtifact, lat, lon, radiusKm) {
  const { row, col } = runtimeArtifactRowCol(runtimeArtifact, lat, lon);
  const pixelsPerDegree = Number(runtimeArtifact.metadata.grid.pixels_per_degree ?? DEFAULT_PIXELS_PER_DEGREE);
  const latRadius = Math.max(1, Math.ceil(radiusKm / (KM_PER_DEGREE / pixelsPerDegree)));
  const lonScale = Math.max(Math.cos((lat * Math.PI) / 180), 0.2);
  const lonRadius = Math.max(1, Math.ceil(radiusKm / ((KM_PER_DEGREE * lonScale) / pixelsPerDegree)));

  return {
    rowStart: Math.max(0, row - latRadius),
    rowEnd: Math.min(runtimeArtifact.rows, row + latRadius + 1),
    colStart: Math.max(0, col - lonRadius),
    colEnd: Math.min(runtimeArtifact.cols, col + lonRadius + 1),
  };
}

function computeArtifactWindowStats(runtimeArtifact, window) {
  const positiveRadiance = [];
  const observationValues = [];
  const stdValues = [];
  let validPixelCount = 0;
  let sumRadiance = 0.0;
  let qualitySum = 0.0;
  let qualityCount = 0;
  let sensorDeltaSum = 0.0;
  let sensorDeltaCount = 0;

  for (let row = window.rowStart; row < window.rowEnd; row += 1) {
    const rowOffset = row * runtimeArtifact.cols;
    for (let col = window.colStart; col < window.colEnd; col += 1) {
      const index = rowOffset + col;
      const radiance = runtimeArtifact.mergedRadiance[index];
      if (!Number.isFinite(radiance) || radiance <= 0 || runtimeArtifact.validMask[index] === 0) {
        continue;
      }

      validPixelCount += 1;
      sumRadiance += radiance;
      positiveRadiance.push(radiance);

      const quality = runtimeArtifact.qualityGoodFraction[index];
      if (Number.isFinite(quality)) {
        qualitySum += quality;
        qualityCount += 1;
      }

      const observation = runtimeArtifact.observationMedian[index];
      if (Number.isFinite(observation)) {
        observationValues.push(observation);
      }

      const stdValue = runtimeArtifact.stdMedian[index];
      if (Number.isFinite(stdValue)) {
        stdValues.push(stdValue);
      }

      const sensorDelta = runtimeArtifact.sensorDeltaRatio[index];
      if (Number.isFinite(sensorDelta)) {
        sensorDeltaSum += sensorDelta;
        sensorDeltaCount += 1;
      }
    }
  }

  if (validPixelCount === 0) {
    return {
      valid_pixel_count: 0,
      positive_pixel_count: 0,
      p25_radiance: null,
      median_radiance: null,
      p75_radiance: null,
      robust_radiance: null,
      glow_context_radiance: null,
      high_tail_skew_indicator: null,
      mean_radiance: null,
      quality_good_fraction: null,
      observation_median: null,
      std_median: null,
      sensor_delta_ratio_mean: null,
    };
  }

  positiveRadiance.sort((left, right) => left - right);
  observationValues.sort((left, right) => left - right);
  stdValues.sort((left, right) => left - right);

  const p25 = percentileFromSorted(positiveRadiance, 25) ?? 0.0;
  const median = percentileFromSorted(positiveRadiance, 50) ?? 0.0;
  const p75 = percentileFromSorted(positiveRadiance, 75) ?? 0.0;
  const meanValue = sumRadiance / validPixelCount;
  const meanToMedianRatio = meanValue / Math.max(median, RADIANCE_FLOOR);
  const p75ToMedianRatio = p75 / Math.max(median, RADIANCE_FLOOR);
  const skewIndicator = clamp(
    Math.max(
      (meanToMedianRatio - 1.08) / 0.6,
      (p75ToMedianRatio - 1.22) / 0.8,
    ),
    0.0,
    1.0,
  );
  const robustRadiance = median - (0.5 * skewIndicator * (median - p25));
  const glowContextRadiance = Math.min(
    meanValue,
    median + ((0.25 + (0.15 * skewIndicator)) * Math.max(p75 - median, 0.0)),
  );

  return {
    valid_pixel_count: validPixelCount,
    positive_pixel_count: positiveRadiance.length,
    p25_radiance: p25,
    median_radiance: median,
    p75_radiance: p75,
    robust_radiance: robustRadiance,
    glow_context_radiance: glowContextRadiance,
    high_tail_skew_indicator: skewIndicator,
    mean_radiance: meanValue,
    quality_good_fraction: qualityCount > 0 ? qualitySum / qualityCount : null,
    observation_median: observationValues.length > 0 ? percentileFromSorted(observationValues, 50) : null,
    std_median: stdValues.length > 0 ? percentileFromSorted(stdValues, 50) : null,
    sensor_delta_ratio_mean: sensorDeltaCount > 0 ? sensorDeltaSum / sensorDeltaCount : null,
  };
}

function sampleRuntimeArtifact(runtimeArtifact, lat, lon) {
  const sample = {};

  for (const [label, radiusKm] of [
    ["local", 1.5],
    ["near_5km", 5.0],
    ["regional_20km", 20.0],
  ]) {
    sample[label] = computeArtifactWindowStats(runtimeArtifact, slicesForRuntimeArtifact(runtimeArtifact, lat, lon, radiusKm));
  }

  const center = runtimeArtifactRowCol(runtimeArtifact, lat, lon);
  const centerIndex = (center.row * runtimeArtifact.cols) + center.col;
  sample.tile = center.tileId;
  sample.center_pixel = {
    radiance: Number(runtimeArtifact.mergedRadiance[centerIndex]),
    quality_good_fraction: Number.isFinite(runtimeArtifact.qualityGoodFraction[centerIndex])
      ? Number(runtimeArtifact.qualityGoodFraction[centerIndex])
      : null,
    observation_median: Number.isFinite(runtimeArtifact.observationMedian[centerIndex])
      ? Number(runtimeArtifact.observationMedian[centerIndex])
      : null,
    std_median: Number.isFinite(runtimeArtifact.stdMedian[centerIndex])
      ? Number(runtimeArtifact.stdMedian[centerIndex])
      : null,
    sensor_delta_ratio: Number.isFinite(runtimeArtifact.sensorDeltaRatio[centerIndex])
      ? Number(runtimeArtifact.sensorDeltaRatio[centerIndex])
      : null,
    valid: Boolean(runtimeArtifact.validMask[centerIndex]),
  };

  return sample;
}

function combineRuntimeArtifactSample(sample) {
  const localRadiance = sample.local.robust_radiance ?? 0.0;
  const nearRadiance = sample.near_5km.glow_context_radiance ?? localRadiance;
  const regionalRadiance = sample.regional_20km.glow_context_radiance ?? localRadiance;
  const nearMeanRadiance = sample.near_5km.mean_radiance ?? nearRadiance;
  const regionalMeanRadiance = sample.regional_20km.mean_radiance ?? regionalRadiance;
  const qualityGoodFraction = sample.local.quality_good_fraction ?? null;
  const observationMedian = sample.local.observation_median ?? null;
  const stdValue = sample.local.std_median ?? null;
  const localHighTailSkew = sample.local.high_tail_skew_indicator ?? 0.0;
  const sensorDelta = sample.local.sensor_delta_ratio_mean ?? sample.center_pixel.sensor_delta_ratio ?? 0.0;

  const variabilityRatio = stdValue !== null ? stdValue / Math.max(localRadiance, RADIANCE_FLOOR) : 0.45;
  const qualityPenalty = clamp(1.0 - (qualityGoodFraction ?? 0.75), 0.0, 1.0);
  const observationPenalty = clamp((6.0 - (observationMedian ?? 3.0)) / 6.0, 0.0, 1.0);
  const variabilityPenalty = clamp((variabilityRatio - 0.35) / 1.65, 0.0, 1.0);
  const sensorPenalty = clamp(sensorDelta / 0.5, 0.0, 1.0);
  const regionalRatio = regionalRadiance / Math.max(localRadiance, RADIANCE_FLOOR);
  const regionalPenalty = clamp((regionalRatio - 1.0) / 2.0, 0.0, 1.0);
  const relativeUncertainty = clamp(
    0.08
      + (0.2 * sensorPenalty)
      + (0.14 * qualityPenalty)
      + (0.12 * observationPenalty)
      + (0.16 * variabilityPenalty)
      + (0.08 * regionalPenalty),
    0.08,
    0.75,
  );

  const confidenceScore = clamp(
    0.95
      - (0.55 * ((relativeUncertainty - 0.08) / 0.67))
      - (0.12 * sensorPenalty)
      - (0.08 * qualityPenalty),
    0.25,
    0.95,
  );

  let confidenceLabel = "low";
  if (confidenceScore >= 0.8) {
    confidenceLabel = "high";
  } else if (confidenceScore >= 0.6) {
    confidenceLabel = "medium";
  }

  return {
    local_radiance: localRadiance,
    near_5km_mean_radiance: nearMeanRadiance,
    regional_20km_mean_radiance: regionalMeanRadiance,
    near_5km_glow_context_radiance: nearRadiance,
    regional_20km_glow_context_radiance: regionalRadiance,
    quality_good_fraction: qualityGoodFraction,
    observation_median: observationMedian,
    std_median: stdValue,
    local_high_tail_skew: localHighTailSkew,
    sensor_delta_ratio: sensorDelta,
    regional_ratio: regionalRatio,
    regional_ratio_basis: "regional_20km_glow_context_radiance / local_radiance",
    relative_uncertainty: relativeUncertainty,
    uncertainty_drivers: {
      sensor_disagreement: sensorPenalty,
      quality_penalty: qualityPenalty,
      observation_penalty: observationPenalty,
      variability_penalty: variabilityPenalty,
      regional_glow_penalty: regionalPenalty,
    },
    confidence_score: confidenceScore,
    confidence_label: confidenceLabel,
  };
}

function buildEstimatePayload({
  latitude,
  longitude,
  stats,
  distribution,
  runtimeArtifact,
  sample,
  combined,
}) {
  const localRadiance = combined.local_radiance;
  const percentileCenter = estimatePercentileFromRadiance(localRadiance, stats);
  const lowRadiance = Math.max(RADIANCE_FLOOR, localRadiance * (1.0 - combined.relative_uncertainty));
  const highRadiance = localRadiance * (1.0 + combined.relative_uncertainty);
  const percentileLow = estimatePercentileFromRadiance(lowRadiance, stats);
  const percentileHigh = estimatePercentileFromRadiance(highRadiance, stats);
  const regionalGlowAdjustment = clamp((combined.regional_ratio - 1.8) / 12.0, 0.0, 0.08);
  const estimatedCenter = clamp(percentileToBortleCenter(percentileCenter) + regionalGlowAdjustment, 1.0, 9.0);
  const extrapolationPenalty = equivalentSqmInCalibratedRange(radianceToEquivalentSqm(localRadiance)) ? 0.0 : 0.12;
  const uncertaintyRadius = clamp(
    0.18
      + (0.45 * combined.uncertainty_drivers.sensor_disagreement)
      + (0.25 * combined.uncertainty_drivers.variability_penalty)
      + (0.15 * combined.uncertainty_drivers.quality_penalty)
      + (0.12 * combined.uncertainty_drivers.observation_penalty)
      + (0.32 * combined.uncertainty_drivers.regional_glow_penalty)
      + extrapolationPenalty,
    0.2,
    1.35,
  );

  let estimatedLow = clamp(estimatedCenter - uncertaintyRadius, 1.0, 9.0);
  let estimatedHigh = clamp(estimatedCenter + uncertaintyRadius, 1.0, 9.0);
  if (estimatedLow > estimatedHigh) {
    [estimatedLow, estimatedHigh] = [estimatedHigh, estimatedLow];
  }

  const coarseBand = `${Math.max(1, Math.floor(estimatedLow))}-${Math.min(9, Math.ceil(estimatedHigh))}`;
  const sqmCenter = radianceToEquivalentSqm(localRadiance);
  const sqmLow = radianceToEquivalentSqm(highRadiance);
  const sqmHigh = radianceToEquivalentSqm(lowRadiance);
  const sqmRangeLowCandidates = [sqmLow, sqmHigh].filter((value) => value !== null);
  const sqmRangeHighCandidates = [sqmLow, sqmHigh].filter((value) => value !== null);

  const payload = {
    latitude,
    longitude,
    tile_id: sample.tile,
    radiance_layer: "AllAngle_Composite_Snow_Free",
    boundary_country: "Republic of Korea",
    estimated_bortle_center: Number(estimatedCenter.toFixed(1)),
    estimated_bortle_range: {
      low: Number(estimatedLow.toFixed(1)),
      high: Number(estimatedHigh.toFixed(1)),
    },
    estimated_bortle_band: coarseBand,
    estimated_bortle_interval_label: `${estimatedLow.toFixed(1)}-${estimatedHigh.toFixed(1)}`,
    radiance_percentile: Number(percentileCenter.toFixed(1)),
    radiance_percentile_range: {
      low: Number(percentileLow.toFixed(1)),
      high: Number(percentileHigh.toFixed(1)),
    },
    equivalent_zenith_brightness_mpsas: roundOrNone(sqmCenter, 2),
    equivalent_zenith_brightness_range_mpsas: {
      low: sqmRangeLowCandidates.length > 0 ? roundOrNone(Math.min(...sqmRangeLowCandidates), 2) : null,
      high: sqmRangeHighCandidates.length > 0 ? roundOrNone(Math.max(...sqmRangeHighCandidates), 2) : null,
    },
    sqm_regression_in_calibrated_range: equivalentSqmInCalibratedRange(sqmCenter),
    local_radiance: combined.local_radiance,
    near_5km_mean_radiance: combined.near_5km_mean_radiance,
    regional_20km_mean_radiance: combined.regional_20km_mean_radiance,
    near_5km_glow_context_radiance: combined.near_5km_glow_context_radiance,
    regional_20km_glow_context_radiance: combined.regional_20km_glow_context_radiance,
    confidence: combined.confidence_label,
    confidence_score: Number(combined.confidence_score.toFixed(2)),
    bortle_uncertainty_radius: Number(uncertaintyRadius.toFixed(2)),
    quality_good_fraction: roundOrNone(combined.quality_good_fraction),
    observation_median: roundOrNone(combined.observation_median),
    std_median: roundOrNone(combined.std_median),
    local_high_tail_skew: Number(combined.local_high_tail_skew.toFixed(3)),
    sensor_delta_ratio: Number(combined.sensor_delta_ratio.toFixed(3)),
    relative_uncertainty: Number(combined.relative_uncertainty.toFixed(3)),
    regional_ratio: Number(combined.regional_ratio.toFixed(2)),
    regional_ratio_basis: combined.regional_ratio_basis,
    regional_glow_adjustment: Number(regionalGlowAdjustment.toFixed(2)),
    regional_glow_penalty_applied: regionalGlowAdjustment > 0,
    uncertainty_drivers: Object.fromEntries(
      Object.entries(combined.uncertainty_drivers).map(([key, value]) => [key, Number(value.toFixed(3))]),
    ),
    thresholds_used: stats.estimated_bortle_thresholds,
    display_anchor_version: "lightpollutionmap-korea-benchmark-v1",
    sensor_samples: {
      runtime_artifact: {
        tile: sample.tile,
        path: runtimeArtifact.path,
        version: runtimeArtifact.metadata.version,
        sample,
      },
    },
  };

  if (distribution) {
    attachDistributionContext(payload, distribution);
  }

  return payload;
}

export function clearLightPollutionCache() {
  estimateCache.clear();
}

export async function getEstimatedLightPollution({
  latitude,
  longitude,
  statsPath,
  distributionPath,
  runtimeArtifactPath = globalThis.process?.env?.BLACK_MARBLE_RUNTIME_ARTIFACT_PATH,
} = {}) {
  if (!isNodeRuntime()) {
    throw new Error("Local Black Marble runtime artifacts are unsupported in this runtime.");
  }

  const paths = await getNodePaths();
  const resolvedStatsPath = statsPath ?? paths.defaultStatsPath;
  const resolvedDistributionPath = distributionPath ?? paths.defaultDistributionPath;
  const resolvedRuntimeArtifactPath = runtimeArtifactPath ?? paths.defaultRuntimeArtifactPath;

  const cacheKey = buildCacheKey({
    latitude,
    longitude,
    statsPath: resolvedStatsPath,
    distributionPath: resolvedDistributionPath,
    runtimeArtifactPath: resolvedRuntimeArtifactPath,
  });
  if (estimateCache.has(cacheKey)) {
    return estimateCache.get(cacheKey);
  }

  const estimatePromise = (async () => {
    const [runtimeArtifact, stats, distribution] = await Promise.all([
      loadRuntimeArtifact(resolvedRuntimeArtifactPath),
      loadJson(resolvedStatsPath),
      loadJson(resolvedDistributionPath),
    ]);

    if (!runtimeArtifact) {
      throw new Error(
        `Failed to estimate light pollution from Black Marble data: runtime artifact not found at ${resolvedRuntimeArtifactPath}`,
      );
    }

    if (!stats) {
      throw new Error(
        `Failed to estimate light pollution from Black Marble data: stats file not found at ${resolvedStatsPath}`,
      );
    }

    const sample = sampleRuntimeArtifact(runtimeArtifact, latitude, longitude);
    const combined = combineRuntimeArtifactSample(sample);
    return buildEstimatePayload({
      latitude,
      longitude,
      stats,
      distribution,
      runtimeArtifact,
      sample,
      combined,
    });
  })().catch((error) => {
    estimateCache.delete(cacheKey);
    throw error;
  });

  estimateCache.set(cacheKey, estimatePromise);
  return estimatePromise;
}

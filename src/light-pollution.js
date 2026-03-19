const estimateCache = new Map();

function buildCacheKey(latitude, longitude) {
  return `${latitude.toFixed(4)}:${longitude.toFixed(4)}`;
}

function isNodeRuntime() {
  return Boolean(globalThis.process?.release?.name === "node");
}

async function getNodePaths() {
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(moduleDir, "..");
  return {
    path,
    projectRoot,
    scriptPath: path.join(projectRoot, "scripts", "black_marble_bortle.py"),
    defaultDataDir: path.join(projectRoot, "data"),
    defaultStatsPath: path.join(projectRoot, "data", "black-marble-korea-stats.json"),
    defaultDistributionPath: path.join(projectRoot, "data", "black-marble-korea-distribution.json"),
    defaultBoundaryPath: path.join(projectRoot, "data", "south-korea-boundary.geojson"),
  };
}

export function clearLightPollutionCache() {
  estimateCache.clear();
}

export async function getEstimatedLightPollution({
  latitude,
  longitude,
  dataDir,
  statsPath,
  distributionPath,
  pythonBin = globalThis.process?.env?.PYTHON_BIN ?? "python",
} = {}) {
  if (!isNodeRuntime()) {
    throw new Error("Local Black Marble tiles are unsupported in this runtime.");
  }

  const cacheKey = buildCacheKey(latitude, longitude);
  if (estimateCache.has(cacheKey)) {
    return estimateCache.get(cacheKey);
  }

  const estimatePromise = (async () => {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);
    const paths = await getNodePaths();

    try {
      const { stdout } = await execFileAsync(
        pythonBin,
        [
          paths.scriptPath,
          "sample",
          "--data-dir",
          dataDir ?? paths.defaultDataDir,
          "--stats",
          statsPath ?? paths.defaultStatsPath,
          "--distribution",
          distributionPath ?? paths.defaultDistributionPath,
          "--boundary",
          paths.defaultBoundaryPath,
          "--lat",
          String(latitude),
          "--lon",
          String(longitude),
        ],
        {
          cwd: paths.projectRoot,
          maxBuffer: 10 * 1024 * 1024,
        },
      );
      return JSON.parse(stdout);
    } catch (error) {
      const message = error?.stderr?.trim() || error?.stdout?.trim() || error?.message || "Unknown error";
      throw new Error(`Failed to estimate light pollution from local Black Marble tiles: ${message}`, { cause: error });
    }
  })().catch((error) => {
    estimateCache.delete(cacheKey);
    throw error;
  });

  estimateCache.set(cacheKey, estimatePromise);
  return estimatePromise;
}

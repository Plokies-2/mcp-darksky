import { createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDir, "..");
const runtimeArtifactPath =
  process.env.BLACK_MARBLE_RUNTIME_ARTIFACT_PATH ??
  path.join(projectRoot, "data", "black-marble-korea-runtime.npz");
const runtimeArtifactUrl = process.env.BLACK_MARBLE_RUNTIME_ARTIFACT_URL;

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureRuntimeArtifact() {
  if (await fileExists(runtimeArtifactPath)) {
    console.log(`[boot] Black Marble runtime artifact ready: ${runtimeArtifactPath}`);
    return;
  }

  if (!runtimeArtifactUrl) {
    console.warn("[boot] BLACK_MARBLE_RUNTIME_ARTIFACT_URL is unset; Black Marble estimation will remain unavailable until a runtime artifact is present.");
    return;
  }

  await fs.mkdir(path.dirname(runtimeArtifactPath), { recursive: true });
  const tempPath = `${runtimeArtifactPath}.download`;
  console.log(`[boot] Downloading Black Marble runtime artifact from ${runtimeArtifactUrl}`);

  const response = await fetch(runtimeArtifactUrl);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download runtime artifact: ${response.status} ${response.statusText}`);
  }

  await pipeline(Readable.fromWeb(response.body), createWriteStream(tempPath));
  await fs.rename(tempPath, runtimeArtifactPath);
  console.log(`[boot] Saved Black Marble runtime artifact to ${runtimeArtifactPath}`);
}

await ensureRuntimeArtifact();
await import("../src/http.js");

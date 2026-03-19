from __future__ import annotations

import argparse
import json
import math
from datetime import datetime, timezone
from pathlib import Path

import h5py
import numpy as np

GRID_PATH = "HDFEOS/GRIDS/VIIRS_Grid_DNB_2d/Data Fields"
PRIMARY_LAYER = "AllAngle_Composite_Snow_Free"
PRIMARY_NUM = "AllAngle_Composite_Snow_Free_Num"
PRIMARY_QUALITY = "AllAngle_Composite_Snow_Free_Quality"
PRIMARY_STD = "AllAngle_Composite_Snow_Free_Std"
LAND_MASK = "Land_Water_Mask"
PLATFORM = "DNB_Platform"
LAT_LAYER = "lat"
LON_LAYER = "lon"
LAND_VALUES = {0, 1, 5}
RADIANCE_FILL = -999.9
QUALITY_FILL = 255
COUNT_FILL = 65535
DEFAULT_DATA_DIR = Path(__file__).resolve().parents[1] / "data"
DEFAULT_STATS_PATH = DEFAULT_DATA_DIR / "black-marble-korea-stats.json"
KM_PER_DEGREE = 111.32
PIXELS_PER_DEGREE = 240


def dataset(file_handle: h5py.File, name: str):
  return file_handle[f"{GRID_PATH}/{name}"]


def open_sensor_tile(data_dir: Path, sensor: str, tile_id: str) -> tuple[Path, h5py.File]:
  matches = sorted((data_dir / sensor).glob(f"*{tile_id}*.h5"))
  if not matches:
    raise FileNotFoundError(f"Missing {sensor} tile {tile_id} under {data_dir / sensor}")
  path = matches[0]
  return path, h5py.File(path, "r")


def tile_id_for(lat: float, lon: float) -> str:
  horizontal = int(math.floor((lon + 180) / 10))
  vertical = int(math.floor((90 - lat) / 10))
  return f"h{horizontal:02d}v{vertical:02d}"


def slices_for_radius(file_handle: h5py.File, lat: float, lon: float, radius_km: float) -> tuple[slice, slice]:
  north = float(file_handle.attrs["NorthBoundingCoord"])
  west = float(file_handle.attrs["WestBoundingCoord"])
  row_center = int((north - lat) * PIXELS_PER_DEGREE)
  col_center = int((lon - west) * PIXELS_PER_DEGREE)
  row_center = min(max(row_center, 0), 2399)
  col_center = min(max(col_center, 0), 2399)

  lat_radius = max(1, math.ceil(radius_km / (KM_PER_DEGREE / PIXELS_PER_DEGREE)))
  lon_scale = max(math.cos(math.radians(lat)), 0.2)
  lon_radius = max(1, math.ceil(radius_km / ((KM_PER_DEGREE * lon_scale) / PIXELS_PER_DEGREE)))

  row_slice = slice(max(0, row_center - lat_radius), min(2400, row_center + lat_radius + 1))
  col_slice = slice(max(0, col_center - lon_radius), min(2400, col_center + lon_radius + 1))
  return row_slice, col_slice


def pixel_index_for(file_handle: h5py.File, lat: float, lon: float) -> tuple[int, int]:
  north = float(file_handle.attrs["NorthBoundingCoord"])
  west = float(file_handle.attrs["WestBoundingCoord"])
  row_center = int((north - lat) * PIXELS_PER_DEGREE)
  col_center = int((lon - west) * PIXELS_PER_DEGREE)
  return min(max(row_center, 0), 2399), min(max(col_center, 0), 2399)


def compute_window_stats(
  radiance: np.ndarray,
  quality: np.ndarray,
  observations: np.ndarray,
  stddev: np.ndarray,
  land_mask: np.ndarray,
) -> dict[str, float | int | None]:
  valid = (
    np.isfinite(radiance)
    & (radiance >= 0)
    & (quality != QUALITY_FILL)
    & (observations != COUNT_FILL)
    & np.isin(land_mask, list(LAND_VALUES))
  )

  if not np.any(valid):
    return {
      "valid_pixel_count": 0,
      "positive_pixel_count": 0,
      "median_radiance": None,
      "mean_radiance": None,
      "quality_good_fraction": None,
      "observation_median": None,
      "std_median": None,
    }

  radiance_valid = radiance[valid]
  positive = radiance_valid[radiance_valid > 0]
  quality_valid = quality[valid]
  observations_valid = observations[valid]
  std_valid = stddev[valid]

  return {
    "valid_pixel_count": int(valid.sum()),
    "positive_pixel_count": int(positive.size),
    "median_radiance": float(np.median(positive)) if positive.size else 0.0,
    "mean_radiance": float(np.mean(radiance_valid)),
    "quality_good_fraction": float(np.mean(quality_valid == 0)),
    "observation_median": float(np.median(observations_valid)),
    "std_median": float(np.median(std_valid[std_valid >= 0])) if np.any(std_valid >= 0) else None,
  }


def sample_sensor(file_handle: h5py.File, lat: float, lon: float) -> dict[str, object]:
  result: dict[str, object] = {}

  full_radiance = dataset(file_handle, PRIMARY_LAYER)
  full_quality = dataset(file_handle, PRIMARY_QUALITY)
  full_num = dataset(file_handle, PRIMARY_NUM)
  full_std = dataset(file_handle, PRIMARY_STD)
  full_land = dataset(file_handle, LAND_MASK)
  full_platform = dataset(file_handle, PLATFORM)

  for label, radius_km in [("local", 1.5), ("near_5km", 5.0), ("regional_20km", 20.0)]:
    row_slice, col_slice = slices_for_radius(file_handle, lat, lon, radius_km)
    stats = compute_window_stats(
      full_radiance[row_slice, col_slice],
      full_quality[row_slice, col_slice],
      full_num[row_slice, col_slice],
      full_std[row_slice, col_slice],
      full_land[row_slice, col_slice],
    )
    result[label] = stats

  center_row, center_col = pixel_index_for(file_handle, lat, lon)
  result["center_pixel"] = {
    "radiance": float(full_radiance[center_row, center_col]),
    "quality": int(full_quality[center_row, center_col]),
    "num_observations": int(full_num[center_row, center_col]),
    "std": float(full_std[center_row, center_col]),
    "land_water_mask": int(full_land[center_row, center_col]),
    "platform": int(full_platform[center_row, center_col]),
  }
  return result


def merged_stats_payload(data_dir: Path) -> dict[str, object]:
  sensor_stats: dict[str, object] = {}
  merged_positive: list[np.ndarray] = []

  for sensor in ["VNP46A4", "VJ146A4"]:
    sensor_positive: list[np.ndarray] = []
    for path in sorted((data_dir / sensor).glob("*.h5")):
      with h5py.File(path, "r") as file_handle:
        radiance = dataset(file_handle, PRIMARY_LAYER)[:]
        quality = dataset(file_handle, PRIMARY_QUALITY)[:]
        observations = dataset(file_handle, PRIMARY_NUM)[:]
        land_mask = dataset(file_handle, LAND_MASK)[:]
        valid = (
          (radiance > 0)
          & (quality == 0)
          & (observations >= 4)
          & np.isin(land_mask, list(LAND_VALUES))
        )
        selected = radiance[valid]
        if selected.size:
          sensor_positive.append(selected)
          merged_positive.append(selected)

    if not sensor_positive:
      continue

    sensor_array = np.concatenate(sensor_positive)
    sensor_stats[sensor] = {
      "positive_pixel_count": int(sensor_array.size),
      "mean_radiance": float(np.mean(sensor_array)),
      "median_radiance": float(np.median(sensor_array)),
      "percentiles": {
        str(label): float(value)
        for label, value in zip(
          [1, 5, 10, 20, 30, 35, 40, 50, 55, 60, 70, 75, 80, 90, 95, 97, 99],
          np.percentile(sensor_array, [1, 5, 10, 20, 30, 35, 40, 50, 55, 60, 70, 75, 80, 90, 95, 97, 99]),
          strict=True,
        )
      },
    }

  merged_array = np.concatenate(merged_positive) if merged_positive else np.array([], dtype=np.float32)
  if not merged_array.size:
    raise RuntimeError(f"No valid positive land pixels found under {data_dir}")

  merged_percentiles = {
    str(label): float(value)
    for label, value in zip(
      [1, 5, 10, 20, 30, 35, 40, 50, 55, 60, 70, 75, 80, 90, 95, 97, 99],
      np.percentile(merged_array, [1, 5, 10, 20, 30, 35, 40, 50, 55, 60, 70, 75, 80, 90, 95, 97, 99]),
      strict=True,
    )
  }

  return {
    "generated_at": datetime.now(timezone.utc).isoformat(),
    "radiance_layer": PRIMARY_LAYER,
    "sensor_stats": sensor_stats,
    "merged_positive_land_stats": {
      "positive_pixel_count": int(merged_array.size),
      "mean_radiance": float(np.mean(merged_array)),
      "median_radiance": float(np.median(merged_array)),
      "percentiles": merged_percentiles,
    },
    "estimated_bortle_thresholds": {
      "2": merged_percentiles["10"],
      "3": merged_percentiles["20"],
      "4": merged_percentiles["35"],
      "5": merged_percentiles["55"],
      "6": merged_percentiles["75"],
      "7": merged_percentiles["90"],
      "8": merged_percentiles["97"],
    },
  }


def ensure_stats(stats_path: Path, data_dir: Path) -> dict[str, object]:
  if stats_path.exists():
    return json.loads(stats_path.read_text(encoding="utf-8"))

  payload = merged_stats_payload(data_dir)
  stats_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
  return payload


def radiance_to_bortle(radiance: float, thresholds: dict[str, float]) -> int:
  if radiance <= 0:
    return 2

  for bortle in range(2, 9):
    if radiance <= thresholds[str(bortle)]:
      return bortle
  return 9


def combine_sensor_samples(vnp: dict[str, object] | None, vj: dict[str, object] | None) -> dict[str, object]:
  available = [sample for sample in [vnp, vj] if sample is not None]
  if not available:
    raise RuntimeError("No sensor samples available.")

  local_values = [
    sample["local"]["median_radiance"]
    for sample in available
    if sample["local"]["median_radiance"] is not None
  ]
  near_values = [
    sample["near_5km"]["mean_radiance"]
    for sample in available
    if sample["near_5km"]["mean_radiance"] is not None
  ]
  regional_values = [
    sample["regional_20km"]["mean_radiance"]
    for sample in available
    if sample["regional_20km"]["mean_radiance"] is not None
  ]
  quality_fractions = [
    sample["local"]["quality_good_fraction"]
    for sample in available
    if sample["local"]["quality_good_fraction"] is not None
  ]
  observation_counts = [
    sample["local"]["observation_median"]
    for sample in available
    if sample["local"]["observation_median"] is not None
  ]
  std_values = [
    sample["local"]["std_median"]
    for sample in available
    if sample["local"]["std_median"] is not None
  ]

  local_radiance = float(np.mean(local_values)) if local_values else 0.0
  near_radiance = float(np.mean(near_values)) if near_values else local_radiance
  regional_radiance = float(np.mean(regional_values)) if regional_values else local_radiance
  sensor_delta_ratio = 0.0
  if len(local_values) == 2:
    baseline = max(float(np.mean(local_values)), 1e-6)
    sensor_delta_ratio = abs(local_values[0] - local_values[1]) / baseline

  confidence = 0.9
  if quality_fractions and float(np.mean(quality_fractions)) < 0.85:
    confidence -= 0.15
  if observation_counts and float(np.mean(observation_counts)) < 4:
    confidence -= 0.15
  if std_values and local_radiance > 0 and float(np.mean(std_values)) > local_radiance * 2:
    confidence -= 0.1
  if sensor_delta_ratio > 0.35:
    confidence -= 0.15
  confidence = max(0.2, min(confidence, 0.95))

  if confidence >= 0.8:
    confidence_label = "high"
  elif confidence >= 0.6:
    confidence_label = "medium"
  else:
    confidence_label = "low"

  return {
    "local_radiance": local_radiance,
    "near_5km_mean_radiance": near_radiance,
    "regional_20km_mean_radiance": regional_radiance,
    "quality_good_fraction": float(np.mean(quality_fractions)) if quality_fractions else None,
    "observation_median": float(np.mean(observation_counts)) if observation_counts else None,
    "std_median": float(np.mean(std_values)) if std_values else None,
    "sensor_delta_ratio": sensor_delta_ratio,
    "confidence_score": confidence,
    "confidence_label": confidence_label,
  }


def estimate_bortle(lat: float, lon: float, data_dir: Path, stats_path: Path) -> dict[str, object]:
  stats = ensure_stats(stats_path, data_dir)
  tile_id = tile_id_for(lat, lon)
  sensor_samples: dict[str, object] = {}

  for sensor in ["VNP46A4", "VJ146A4"]:
    try:
      path, file_handle = open_sensor_tile(data_dir, sensor, tile_id)
    except FileNotFoundError:
      continue
    with file_handle:
      sensor_samples[sensor] = {
        "tile": tile_id,
        "path": str(path),
        "sample": sample_sensor(file_handle, lat, lon),
      }

  combined = combine_sensor_samples(
    sensor_samples.get("VNP46A4", {}).get("sample"),
    sensor_samples.get("VJ146A4", {}).get("sample"),
  )

  estimated_center = radiance_to_bortle(
    combined["local_radiance"],
    stats["estimated_bortle_thresholds"],
  )

  if combined["regional_20km_mean_radiance"] > combined["local_radiance"] * 1.8 and estimated_center < 9:
    estimated_center += 1
    combined["regional_glow_penalty_applied"] = True
  else:
    combined["regional_glow_penalty_applied"] = False

  if combined["confidence_label"] == "high":
    estimated_band = str(estimated_center)
  else:
    estimated_band = f"{max(2, estimated_center - 1)}-{min(9, estimated_center + 1)}"

  return {
    "latitude": lat,
    "longitude": lon,
    "tile_id": tile_id,
    "radiance_layer": PRIMARY_LAYER,
    "estimated_bortle_center": estimated_center,
    "estimated_bortle_band": estimated_band,
    "local_radiance": combined["local_radiance"],
    "near_5km_mean_radiance": combined["near_5km_mean_radiance"],
    "regional_20km_mean_radiance": combined["regional_20km_mean_radiance"],
    "confidence": combined["confidence_label"],
    "confidence_score": combined["confidence_score"],
    "quality_good_fraction": combined["quality_good_fraction"],
    "observation_median": combined["observation_median"],
    "std_median": combined["std_median"],
    "sensor_delta_ratio": combined["sensor_delta_ratio"],
    "regional_glow_penalty_applied": combined["regional_glow_penalty_applied"],
    "thresholds_used": stats["estimated_bortle_thresholds"],
    "sensor_samples": sensor_samples,
  }


def build_stats_command(args: argparse.Namespace) -> int:
  payload = merged_stats_payload(Path(args.data_dir))
  output = Path(args.output)
  output.write_text(json.dumps(payload, indent=2), encoding="utf-8")
  print(json.dumps({
    "ok": True,
    "output": str(output),
    "positive_pixel_count": payload["merged_positive_land_stats"]["positive_pixel_count"],
  }))
  return 0


def sample_command(args: argparse.Namespace) -> int:
  payload = estimate_bortle(
    lat=args.lat,
    lon=args.lon,
    data_dir=Path(args.data_dir),
    stats_path=Path(args.stats),
  )
  print(json.dumps(payload, ensure_ascii=False, indent=2))
  return 0


def main() -> int:
  parser = argparse.ArgumentParser(description="Build and sample a Bortle-like darkness estimate from Black Marble annual tiles.")
  subparsers = parser.add_subparsers(dest="command", required=True)

  build = subparsers.add_parser("build-stats")
  build.add_argument("--data-dir", default=str(DEFAULT_DATA_DIR))
  build.add_argument("--output", default=str(DEFAULT_STATS_PATH))
  build.set_defaults(func=build_stats_command)

  sample = subparsers.add_parser("sample")
  sample.add_argument("--data-dir", default=str(DEFAULT_DATA_DIR))
  sample.add_argument("--stats", default=str(DEFAULT_STATS_PATH))
  sample.add_argument("--lat", type=float, required=True)
  sample.add_argument("--lon", type=float, required=True)
  sample.set_defaults(func=sample_command)

  args = parser.parse_args()
  return args.func(args)


if __name__ == "__main__":
  raise SystemExit(main())

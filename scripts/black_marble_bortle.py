from __future__ import annotations

import argparse
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path

import h5py
import numpy as np
from shapely import contains_xy
from shapely.geometry import shape

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
RADIANCE_FLOOR = 0.5
DEFAULT_DATA_DIR = Path(__file__).resolve().parents[1] / "data"
DEFAULT_STATS_PATH = DEFAULT_DATA_DIR / "black-marble-korea-stats.json"
DEFAULT_DISTRIBUTION_PATH = DEFAULT_DATA_DIR / "black-marble-korea-distribution.json"
DEFAULT_BOUNDARY_PATH = DEFAULT_DATA_DIR / "south-korea-boundary.geojson"
KM_PER_DEGREE = 111.32
PIXELS_PER_DEGREE = 240
REGIONAL_RADIUS_PX = 45
# Presentation-layer anchors tuned against a small Republic-of-Korea benchmark
# set collected from LightPollutionMap.info's 2025 sky-brightness overlay.
# The underlying radiance/SQM proxy remains unchanged; only the user-facing
# Bortle-like display curve is adjusted so Korean dark sites do not collapse
# into unrealistic class-1/class-2 outputs.
DISPLAY_BORTLE_PERCENTILE_ANCHORS = [
  (0.0, 3.8),
  (10.0, 4.0),
  (20.0, 4.2),
  (35.0, 4.6),
  (55.0, 5.5),
  (75.0, 6.3),
  (90.0, 7.2),
  (97.0, 8.0),
  (100.0, 8.8),
]
TILE_PATTERN = re.compile(r"(h\d{2}v\d{2})")


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


def parse_tile_id(value: str) -> tuple[str, int, int]:
  match = TILE_PATTERN.search(value)
  if not match:
    raise ValueError(f"Could not parse tile id from {value}")
  tile_id = match.group(1)
  return tile_id, int(tile_id[1:3]), int(tile_id[4:6])


def discover_tile_ids(data_dir: Path) -> list[str]:
  tile_ids: set[str] = set()
  for sensor in ["VNP46A4", "VJ146A4"]:
    for path in sorted((data_dir / sensor).glob("*.h5")):
      tile_id, _, _ = parse_tile_id(path.name)
      tile_ids.add(tile_id)
  return sorted(tile_ids, key=lambda tile_id: parse_tile_id(tile_id)[1:])


def load_country_geometry(boundary_path: Path):
  payload = json.loads(boundary_path.read_text(encoding="utf-8"))
  feature = payload["features"][0]
  return shape(feature["geometry"])


def country_mask_for_tile(file_handle: h5py.File, country_geometry) -> np.ndarray:
  north = float(file_handle.attrs["NorthBoundingCoord"])
  south = float(file_handle.attrs["SouthBoundingCoord"])
  west = float(file_handle.attrs["WestBoundingCoord"])
  east = float(file_handle.attrs["EastBoundingCoord"])

  lat_step = (north - south) / 2400
  lon_step = (east - west) / 2400
  latitudes = north - (np.arange(2400, dtype=np.float64) + 0.5) * lat_step
  longitudes = west + (np.arange(2400, dtype=np.float64) + 0.5) * lon_step
  lon_grid, lat_grid = np.meshgrid(longitudes, latitudes)
  return contains_xy(country_geometry, lon_grid, lat_grid)


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
  country_mask: np.ndarray | None = None,
) -> dict[str, float | int | None]:
  valid = (
    np.isfinite(radiance)
    & (radiance > 0)
    & (quality == 0)
    & (observations >= 4)
    & np.isin(land_mask, list(LAND_VALUES))
  )
  if country_mask is not None:
    valid &= country_mask

  if not np.any(valid):
    return {
      "valid_pixel_count": 0,
      "positive_pixel_count": 0,
      "p25_radiance": None,
      "median_radiance": None,
      "p75_radiance": None,
      "robust_radiance": None,
      "glow_context_radiance": None,
      "high_tail_skew_indicator": None,
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
  p25 = float(np.percentile(positive, 25)) if positive.size else 0.0
  median = float(np.median(positive)) if positive.size else 0.0
  p75 = float(np.percentile(positive, 75)) if positive.size else 0.0
  mean_value = float(np.mean(radiance_valid))
  mean_to_median_ratio = mean_value / max(median, RADIANCE_FLOOR)
  p75_to_median_ratio = p75 / max(median, RADIANCE_FLOOR)
  skew_indicator = clamp(
    max(
      (mean_to_median_ratio - 1.08) / 0.6,
      (p75_to_median_ratio - 1.22) / 0.8,
    ),
    0.0,
    1.0,
  )
  robust_radiance = median - 0.5 * skew_indicator * (median - p25)
  glow_context_radiance = min(
    mean_value,
    median + (0.25 + 0.15 * skew_indicator) * max(p75 - median, 0.0),
  )

  return {
    "valid_pixel_count": int(valid.sum()),
    "positive_pixel_count": int(positive.size),
    "p25_radiance": p25,
    "median_radiance": median,
    "p75_radiance": p75,
    "robust_radiance": float(robust_radiance),
    "glow_context_radiance": float(glow_context_radiance),
    "high_tail_skew_indicator": float(skew_indicator),
    "mean_radiance": mean_value,
    "quality_good_fraction": float(np.mean(quality_valid == 0)),
    "observation_median": float(np.median(observations_valid)),
    "std_median": float(np.median(std_valid[std_valid >= 0])) if np.any(std_valid >= 0) else None,
  }


def sample_sensor(file_handle: h5py.File, lat: float, lon: float, country_geometry) -> dict[str, object]:
  result: dict[str, object] = {}

  full_radiance = dataset(file_handle, PRIMARY_LAYER)
  full_quality = dataset(file_handle, PRIMARY_QUALITY)
  full_num = dataset(file_handle, PRIMARY_NUM)
  full_std = dataset(file_handle, PRIMARY_STD)
  full_land = dataset(file_handle, LAND_MASK)
  full_platform = dataset(file_handle, PLATFORM)
  full_country_mask = country_mask_for_tile(file_handle, country_geometry)

  for label, radius_km in [("local", 1.5), ("near_5km", 5.0), ("regional_20km", 20.0)]:
    row_slice, col_slice = slices_for_radius(file_handle, lat, lon, radius_km)
    stats = compute_window_stats(
      full_radiance[row_slice, col_slice],
      full_quality[row_slice, col_slice],
      full_num[row_slice, col_slice],
      full_std[row_slice, col_slice],
      full_land[row_slice, col_slice],
      full_country_mask[row_slice, col_slice],
    )
    result[label] = stats

  center_row, center_col = pixel_index_for(file_handle, lat, lon)
  center_inside_country = bool(full_country_mask[center_row, center_col])
  result["center_pixel"] = {
    "radiance": float(full_radiance[center_row, center_col]),
    "quality": int(full_quality[center_row, center_col]),
    "num_observations": int(full_num[center_row, center_col]),
    "std": float(full_std[center_row, center_col]),
    "land_water_mask": int(full_land[center_row, center_col]),
    "platform": int(full_platform[center_row, center_col]),
    "inside_republic_of_korea_boundary": center_inside_country,
  }
  return result


def merged_stats_payload(data_dir: Path, boundary_path: Path) -> dict[str, object]:
  sensor_stats: dict[str, object] = {}
  merged_positive: list[np.ndarray] = []
  country_geometry = load_country_geometry(boundary_path)

  for sensor in ["VNP46A4", "VJ146A4"]:
    sensor_positive: list[np.ndarray] = []
    for path in sorted((data_dir / sensor).glob("*.h5")):
      with h5py.File(path, "r") as file_handle:
        radiance = dataset(file_handle, PRIMARY_LAYER)[:]
        quality = dataset(file_handle, PRIMARY_QUALITY)[:]
        observations = dataset(file_handle, PRIMARY_NUM)[:]
        land_mask = dataset(file_handle, LAND_MASK)[:]
        country_mask = country_mask_for_tile(file_handle, country_geometry)
        valid = (
          (radiance > 0)
          & (quality == 0)
          & (observations >= 4)
          & np.isin(land_mask, list(LAND_VALUES))
          & country_mask
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
    "boundary": {
      "country": "Republic of Korea",
      "boundary_path": str(boundary_path),
      "boundary_source": "geoBoundaries gbOpen / Natural Earth",
    },
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

  payload = merged_stats_payload(data_dir, DEFAULT_BOUNDARY_PATH)
  stats_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
  return payload


def clamp(value: float, lower: float, upper: float) -> float:
  return max(lower, min(value, upper))


def round_or_none(value: float | None, digits: int = 2) -> float | None:
  if value is None:
    return None
  return round(float(value), digits)


def interpolate(value: float, left_x: float, right_x: float, left_y: float, right_y: float) -> float:
  if math.isclose(left_x, right_x):
    return left_y
  ratio = (value - left_x) / (right_x - left_x)
  return left_y + ratio * (right_y - left_y)


def percentile_curve(stats: dict[str, object]) -> list[tuple[float, float]]:
  merged = stats["merged_positive_land_stats"]["percentiles"]
  curve = [(float(label), float(value)) for label, value in merged.items()]
  curve.sort(key=lambda item: item[0])
  return curve


def estimate_percentile_from_radiance(radiance: float, stats: dict[str, object]) -> float:
  curve = percentile_curve(stats)
  if radiance <= 0:
    return 0.0

  first_percentile, first_radiance = curve[0]
  if radiance <= first_radiance:
    return clamp(
      interpolate(
        clamp(radiance, 0.0, first_radiance),
        RADIANCE_FLOOR,
        first_radiance,
        0.0,
        first_percentile,
      ),
      0.0,
      first_percentile,
    )

  for (left_percentile, left_radiance), (right_percentile, right_radiance) in zip(curve, curve[1:], strict=False):
    if radiance <= right_radiance:
      left_log = math.log10(max(left_radiance, RADIANCE_FLOOR))
      right_log = math.log10(max(right_radiance, RADIANCE_FLOOR))
      value_log = math.log10(max(radiance, RADIANCE_FLOOR))
      return clamp(
        interpolate(value_log, left_log, right_log, left_percentile, right_percentile),
        0.0,
        100.0,
      )

  last_percentile, last_radiance = curve[-1]
  scale_limit = last_radiance * 2.0
  last_log = math.log10(max(last_radiance, RADIANCE_FLOOR))
  limit_log = math.log10(max(scale_limit, last_radiance + 1e-6))
  value_log = math.log10(max(radiance, last_radiance))
  return clamp(
    interpolate(clamp(value_log, last_log, limit_log), last_log, limit_log, last_percentile, 100.0),
    last_percentile,
    100.0,
  )


def percentile_to_bortle_center(percentile: float) -> float:
  percentile = clamp(percentile, 0.0, 100.0)
  for (left_percentile, left_bortle), (right_percentile, right_bortle) in zip(
    DISPLAY_BORTLE_PERCENTILE_ANCHORS,
    DISPLAY_BORTLE_PERCENTILE_ANCHORS[1:],
    strict=False,
  ):
    if percentile <= right_percentile:
      return interpolate(percentile, left_percentile, right_percentile, left_bortle, right_bortle)
  return 9.0


def radiance_to_equivalent_sqm(radiance: float) -> float | None:
  if radiance <= 0:
    return None
  return 20.93 - 0.95 * math.log10(radiance)


def equivalent_sqm_in_calibrated_range(value: float | None) -> bool:
  if value is None:
    return False
  return 19.41 <= value <= 21.12


def box_mean(values: np.ndarray, valid_mask: np.ndarray, radius_px: int) -> np.ndarray:
  working_values = np.where(valid_mask, values, 0.0).astype(np.float64, copy=False)
  working_mask = valid_mask.astype(np.int32, copy=False)

  padded_values = np.pad(working_values, ((radius_px, radius_px), (radius_px, radius_px)), constant_values=0.0)
  padded_mask = np.pad(working_mask, ((radius_px, radius_px), (radius_px, radius_px)), constant_values=0)

  integral_values = np.pad(padded_values, ((1, 0), (1, 0)), constant_values=0.0).cumsum(axis=0).cumsum(axis=1)
  integral_mask = np.pad(padded_mask, ((1, 0), (1, 0)), constant_values=0).cumsum(axis=0, dtype=np.int32).cumsum(axis=1, dtype=np.int32)

  window = 2 * radius_px + 1
  window_sum = (
    integral_values[window:, window:]
    - integral_values[:-window, window:]
    - integral_values[window:, :-window]
    + integral_values[:-window, :-window]
  )
  window_count = (
    integral_mask[window:, window:]
    - integral_mask[:-window, window:]
    - integral_mask[window:, :-window]
    + integral_mask[:-window, :-window]
  )

  mean = np.divide(
    window_sum,
    window_count,
    out=np.full(window_sum.shape, np.nan, dtype=np.float64),
    where=window_count > 0,
  )
  return mean.astype(np.float32)


def nanmean_stack(stack: np.ndarray) -> np.ndarray:
  counts = np.sum(np.isfinite(stack), axis=0)
  totals = np.nansum(stack, axis=0)
  return np.divide(
    totals,
    counts,
    out=np.full(totals.shape, np.nan, dtype=np.float32),
    where=counts > 0,
  ).astype(np.float32)


def summarize_distribution(values: np.ndarray, *, min_value: float, max_value: float, bin_size: float) -> dict[str, object]:
  finite_values = values[np.isfinite(values)]
  if finite_values.size == 0:
    raise RuntimeError("Distribution summary requested for an empty array.")

  percentiles = {
    str(label): round(float(value), 4)
    for label, value in zip(
      [1, 5, 10, 20, 30, 35, 40, 50, 55, 60, 70, 75, 80, 90, 95, 97, 99],
      np.percentile(finite_values, [1, 5, 10, 20, 30, 35, 40, 50, 55, 60, 70, 75, 80, 90, 95, 97, 99]),
      strict=True,
    )
  }

  mean = float(np.mean(finite_values))
  std = float(np.std(finite_values))
  skewness = float(np.mean(((finite_values - mean) / max(std, 1e-6)) ** 3)) if std > 0 else 0.0
  bins = np.arange(min_value, max_value + bin_size, bin_size, dtype=np.float32)
  histogram, edges = np.histogram(finite_values, bins=bins)

  return {
    "count": int(finite_values.size),
    "mean": round(mean, 4),
    "median": round(float(np.median(finite_values)), 4),
    "std": round(std, 4),
    "skewness": round(skewness, 4),
    "min": round(float(np.min(finite_values)), 4),
    "max": round(float(np.max(finite_values)), 4),
    "percentiles": percentiles,
    "histogram": {
      "bin_size": bin_size,
      "range_min": min_value,
      "range_max": max_value,
      "counts": histogram.astype(int).tolist(),
      "edges": [round(float(edge), 4) for edge in edges.tolist()],
    },
  }


def estimate_rank_from_histogram(value: float, summary: dict[str, object]) -> float:
  histogram = summary["histogram"]
  counts = histogram["counts"]
  edges = histogram["edges"]
  total = sum(counts)
  if total <= 0:
    return 0.0

  if value <= edges[0]:
    return 0.0
  if value >= edges[-1]:
    return 100.0

  cumulative = 0.0
  for index, count in enumerate(counts):
    left = edges[index]
    right = edges[index + 1]
    if value >= right:
      cumulative += count
      continue
    ratio = (value - left) / max(right - left, 1e-6)
    cumulative += count * clamp(ratio, 0.0, 1.0)
    break

  return round((cumulative / total) * 100.0, 2)


def attach_distribution_context(estimate: dict[str, object], distribution: dict[str, object]) -> None:
  center_summary = distribution["summaries"]["estimated_bortle_center"]
  rank = estimate_rank_from_histogram(float(estimate["estimated_bortle_center"]), center_summary)
  estimate["distribution_context"] = {
    "valid_pixel_count": distribution["valid_pixel_count"],
    "brightness_percentile_in_korea": rank,
    "darkness_percentile_in_korea": round(100.0 - rank, 2),
    "estimated_bortle_distribution_skewness": center_summary["skewness"],
    "distribution_version": distribution["version"],
  }


def build_distribution_payload(data_dir: Path, stats: dict[str, object], boundary_path: Path) -> dict[str, object]:
  tile_ids = discover_tile_ids(data_dir)
  if not tile_ids:
    raise RuntimeError(f"No Black Marble tiles found under {data_dir}")
  country_geometry = load_country_geometry(boundary_path)

  parsed_tiles = [parse_tile_id(tile_id) for tile_id in tile_ids]
  horizontal_ids = sorted({horizontal for _, horizontal, _ in parsed_tiles})
  vertical_ids = sorted({vertical for _, _, vertical in parsed_tiles})
  row_count = len(vertical_ids) * 2400
  col_count = len(horizontal_ids) * 2400

  horizontal_index = {value: index for index, value in enumerate(horizontal_ids)}
  vertical_index = {value: index for index, value in enumerate(vertical_ids)}

  merged_radiance = np.full((row_count, col_count), np.nan, dtype=np.float32)
  quality_good_fraction = np.full((row_count, col_count), np.nan, dtype=np.float32)
  observation_median = np.full((row_count, col_count), np.nan, dtype=np.float32)
  std_median = np.full((row_count, col_count), np.nan, dtype=np.float32)
  sensor_delta_ratio = np.zeros((row_count, col_count), dtype=np.float32)
  valid_mask = np.zeros((row_count, col_count), dtype=bool)

  for tile_id, horizontal, vertical in parsed_tiles:
    tile_row = vertical_index[vertical] * 2400
    tile_col = horizontal_index[horizontal] * 2400
    tile_slice = (slice(tile_row, tile_row + 2400), slice(tile_col, tile_col + 2400))

    sensor_radiance: list[np.ndarray] = []
    sensor_quality: list[np.ndarray] = []
    sensor_obs: list[np.ndarray] = []
    sensor_std: list[np.ndarray] = []

    for sensor in ["VNP46A4", "VJ146A4"]:
      try:
        _, file_handle = open_sensor_tile(data_dir, sensor, tile_id)
      except FileNotFoundError:
        sensor_radiance.append(np.full((2400, 2400), np.nan, dtype=np.float32))
        sensor_quality.append(np.full((2400, 2400), np.nan, dtype=np.float32))
        sensor_obs.append(np.full((2400, 2400), np.nan, dtype=np.float32))
        sensor_std.append(np.full((2400, 2400), np.nan, dtype=np.float32))
        continue

      with file_handle:
        radiance = dataset(file_handle, PRIMARY_LAYER)[:].astype(np.float32)
        quality = dataset(file_handle, PRIMARY_QUALITY)[:]
        observations = dataset(file_handle, PRIMARY_NUM)[:].astype(np.float32)
        stddev = dataset(file_handle, PRIMARY_STD)[:].astype(np.float32)
        land_mask = dataset(file_handle, LAND_MASK)[:]
        country_mask = country_mask_for_tile(file_handle, country_geometry)

      valid = (
        np.isfinite(radiance)
        & (radiance >= 0)
        & (quality != QUALITY_FILL)
        & (observations != COUNT_FILL)
        & np.isin(land_mask, list(LAND_VALUES))
        & country_mask
      )
      sensor_radiance.append(np.where(valid, radiance, np.nan))
      sensor_quality.append(np.where(valid, (quality == 0).astype(np.float32), np.nan))
      sensor_obs.append(np.where(valid, observations, np.nan))
      sensor_std.append(np.where(valid & (stddev >= 0), stddev, np.nan))

    radiance_stack = np.stack(sensor_radiance)
    quality_stack = np.stack(sensor_quality)
    observation_stack = np.stack(sensor_obs)
    std_stack = np.stack(sensor_std)
    availability = np.sum(np.isfinite(radiance_stack), axis=0)

    tile_merged_radiance = nanmean_stack(radiance_stack)
    tile_quality_good = nanmean_stack(quality_stack)
    tile_observation = nanmean_stack(observation_stack)
    tile_std = nanmean_stack(std_stack)
    tile_valid = np.isfinite(tile_merged_radiance) & (tile_merged_radiance > 0)
    tile_sensor_delta = np.zeros((2400, 2400), dtype=np.float32)
    both_valid = np.isfinite(radiance_stack[0]) & np.isfinite(radiance_stack[1])
    tile_sensor_delta[both_valid] = np.abs(radiance_stack[0][both_valid] - radiance_stack[1][both_valid]) / np.maximum(
      (radiance_stack[0][both_valid] + radiance_stack[1][both_valid]) / 2,
      1e-6,
    )
    tile_sensor_delta[availability == 1] = 0.35

    merged_radiance[tile_slice] = tile_merged_radiance
    quality_good_fraction[tile_slice] = tile_quality_good
    observation_median[tile_slice] = tile_observation
    std_median[tile_slice] = tile_std
    sensor_delta_ratio[tile_slice] = tile_sensor_delta
    valid_mask[tile_slice] = tile_valid

  regional_mean = box_mean(np.nan_to_num(merged_radiance, nan=0.0), valid_mask, REGIONAL_RADIUS_PX)
  local_radiance = np.where(valid_mask, merged_radiance, np.nan)
  regional_ratio = np.divide(
    regional_mean,
    np.maximum(local_radiance, RADIANCE_FLOOR),
    out=np.full(local_radiance.shape, np.nan, dtype=np.float32),
    where=valid_mask,
  )

  quality_penalty = np.clip(1.0 - np.nan_to_num(quality_good_fraction, nan=0.75), 0.0, 1.0)
  observation_penalty = np.clip((6.0 - np.nan_to_num(observation_median, nan=3.0)) / 6.0, 0.0, 1.0)
  variability_ratio = np.divide(
    np.nan_to_num(std_median, nan=0.45),
    np.maximum(local_radiance, RADIANCE_FLOOR),
    out=np.full(local_radiance.shape, 0.45, dtype=np.float32),
    where=np.isfinite(local_radiance),
  )
  variability_penalty = np.clip((variability_ratio - 0.35) / 1.65, 0.0, 1.0)
  sensor_penalty = np.clip(sensor_delta_ratio / 0.5, 0.0, 1.0)
  regional_penalty = np.clip((regional_ratio - 1.0) / 2.0, 0.0, 1.0)
  relative_uncertainty = np.clip(
    0.08
    + 0.2 * sensor_penalty
    + 0.14 * quality_penalty
    + 0.12 * observation_penalty
    + 0.16 * variability_penalty
    + 0.08 * regional_penalty,
    0.08,
    0.75,
  )

  flat_local = local_radiance[valid_mask]
  percentiles = np.array([estimate_percentile_from_radiance(float(value), stats) for value in flat_local], dtype=np.float32)
  centers = np.array([percentile_to_bortle_center(float(value)) for value in percentiles], dtype=np.float32)
  glow_adjustment = np.clip((regional_ratio[valid_mask] - 1.8) / 12.0, 0.0, 0.08).astype(np.float32)
  centers = np.clip(centers + glow_adjustment, 1.0, 9.0)

  sqm_values = np.array(
    [radiance_to_equivalent_sqm(float(value)) or np.nan for value in flat_local],
    dtype=np.float32,
  )
  extrapolation_penalty = np.where(
    np.array([equivalent_sqm_in_calibrated_range(float(value)) for value in sqm_values], dtype=bool),
    0.0,
    0.12,
  ).astype(np.float32)
  uncertainty_radius = np.clip(
    0.18
    + 0.45 * sensor_penalty[valid_mask]
    + 0.25 * variability_penalty[valid_mask]
    + 0.15 * quality_penalty[valid_mask]
    + 0.12 * observation_penalty[valid_mask]
    + 0.32 * regional_penalty[valid_mask]
    + extrapolation_penalty,
    0.2,
    1.35,
  ).astype(np.float32)
  range_width = np.clip(uncertainty_radius * 2.0, 0.4, 2.7)

  return {
    "generated_at": datetime.now(timezone.utc).isoformat(),
    "version": "2026-03-19-continuous-bortle-v2-korea-calibrated",
    "boundary": {
      "country": "Republic of Korea",
      "boundary_path": str(boundary_path),
      "boundary_source": "geoBoundaries gbOpen / Natural Earth",
    },
    "grid": {
      "tile_ids": tile_ids,
      "rows": row_count,
      "cols": col_count,
      "regional_radius_px": REGIONAL_RADIUS_PX,
      "resolution_arcsec": 15,
    },
    "valid_pixel_count": int(valid_mask.sum()),
    "summaries": {
      "estimated_bortle_center": summarize_distribution(centers, min_value=1.0, max_value=9.0, bin_size=0.1),
      "estimated_bortle_range_width": summarize_distribution(range_width, min_value=0.4, max_value=2.8, bin_size=0.1),
      "radiance_percentile": summarize_distribution(percentiles, min_value=0.0, max_value=100.0, bin_size=1.0),
      "equivalent_zenith_brightness_mpsas": summarize_distribution(sqm_values, min_value=18.0, max_value=22.5, bin_size=0.05),
    },
  }


def load_distribution(distribution_path: Path) -> dict[str, object] | None:
  if not distribution_path.exists():
    return None
  return json.loads(distribution_path.read_text(encoding="utf-8"))

def combine_sensor_samples(vnp: dict[str, object] | None, vj: dict[str, object] | None) -> dict[str, object]:
  available = [sample for sample in [vnp, vj] if sample is not None]
  if not available:
    raise RuntimeError("No sensor samples available.")

  local_values = [
    sample["local"]["robust_radiance"]
    for sample in available
    if sample["local"]["robust_radiance"] is not None
  ]
  near_values = [
    sample["near_5km"]["glow_context_radiance"]
    for sample in available
    if sample["near_5km"]["glow_context_radiance"] is not None
  ]
  regional_values = [
    sample["regional_20km"]["glow_context_radiance"]
    for sample in available
    if sample["regional_20km"]["glow_context_radiance"] is not None
  ]
  near_mean_values = [
    sample["near_5km"]["mean_radiance"]
    for sample in available
    if sample["near_5km"]["mean_radiance"] is not None
  ]
  regional_mean_values = [
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
  local_skew_values = [
    sample["local"]["high_tail_skew_indicator"]
    for sample in available
    if sample["local"]["high_tail_skew_indicator"] is not None
  ]

  local_radiance = float(np.mean(local_values)) if local_values else 0.0
  near_radiance = float(np.mean(near_values)) if near_values else local_radiance
  regional_radiance = float(np.mean(regional_values)) if regional_values else local_radiance
  near_mean_radiance = float(np.mean(near_mean_values)) if near_mean_values else near_radiance
  regional_mean_radiance = float(np.mean(regional_mean_values)) if regional_mean_values else regional_radiance
  sensor_delta_ratio = 0.0
  if len(local_values) == 2:
    baseline = max(float(np.mean(local_values)), 1e-6)
    sensor_delta_ratio = abs(local_values[0] - local_values[1]) / baseline

  quality_good_fraction = float(np.mean(quality_fractions)) if quality_fractions else None
  observation_median = float(np.mean(observation_counts)) if observation_counts else None
  std_median = float(np.mean(std_values)) if std_values else None
  local_high_tail_skew = float(np.mean(local_skew_values)) if local_skew_values else 0.0

  variability_ratio = (std_median / max(local_radiance, RADIANCE_FLOOR)) if std_median is not None else 0.45
  quality_penalty = clamp(1.0 - (quality_good_fraction if quality_good_fraction is not None else 0.75), 0.0, 1.0)
  observation_penalty = clamp((6.0 - (observation_median if observation_median is not None else 3.0)) / 6.0, 0.0, 1.0)
  variability_penalty = clamp((variability_ratio - 0.35) / 1.65, 0.0, 1.0)
  sensor_penalty = clamp(sensor_delta_ratio / 0.5, 0.0, 1.0)

  regional_ratio = regional_radiance / max(local_radiance, RADIANCE_FLOOR)
  regional_penalty = clamp((regional_ratio - 1.0) / 2.0, 0.0, 1.0)

  relative_uncertainty = clamp(
    0.08
    + 0.2 * sensor_penalty
    + 0.14 * quality_penalty
    + 0.12 * observation_penalty
    + 0.16 * variability_penalty
    + 0.08 * regional_penalty,
    0.08,
    0.75,
  )

  confidence = clamp(
    0.95
    - 0.55 * ((relative_uncertainty - 0.08) / 0.67)
    - 0.12 * sensor_penalty
    - 0.08 * quality_penalty,
    0.25,
    0.95,
  )

  if confidence >= 0.8:
    confidence_label = "high"
  elif confidence >= 0.6:
    confidence_label = "medium"
  else:
    confidence_label = "low"

  return {
    "local_radiance": local_radiance,
    "near_5km_mean_radiance": near_mean_radiance,
    "regional_20km_mean_radiance": regional_mean_radiance,
    "near_5km_glow_context_radiance": near_radiance,
    "regional_20km_glow_context_radiance": regional_radiance,
    "quality_good_fraction": quality_good_fraction,
    "observation_median": observation_median,
    "std_median": std_median,
    "local_high_tail_skew": local_high_tail_skew,
    "sensor_delta_ratio": sensor_delta_ratio,
    "regional_ratio": regional_ratio,
    "regional_ratio_basis": "regional_20km_glow_context_radiance / local_radiance",
    "relative_uncertainty": relative_uncertainty,
    "uncertainty_drivers": {
      "sensor_disagreement": sensor_penalty,
      "quality_penalty": quality_penalty,
      "observation_penalty": observation_penalty,
      "variability_penalty": variability_penalty,
      "regional_glow_penalty": regional_penalty,
    },
    "confidence_score": confidence,
    "confidence_label": confidence_label,
  }


def estimate_bortle(
  lat: float,
  lon: float,
  data_dir: Path,
  stats_path: Path,
  distribution_path: Path | None = None,
  boundary_path: Path = DEFAULT_BOUNDARY_PATH,
) -> dict[str, object]:
  stats = ensure_stats(stats_path, data_dir)
  tile_id = tile_id_for(lat, lon)
  sensor_samples: dict[str, object] = {}
  country_geometry = load_country_geometry(boundary_path)

  for sensor in ["VNP46A4", "VJ146A4"]:
    try:
      path, file_handle = open_sensor_tile(data_dir, sensor, tile_id)
    except FileNotFoundError:
      continue
    with file_handle:
      sensor_samples[sensor] = {
        "tile": tile_id,
        "path": str(path),
        "sample": sample_sensor(file_handle, lat, lon, country_geometry),
      }

  combined = combine_sensor_samples(
    sensor_samples.get("VNP46A4", {}).get("sample"),
    sensor_samples.get("VJ146A4", {}).get("sample"),
  )

  local_radiance = combined["local_radiance"]
  percentile_center = estimate_percentile_from_radiance(local_radiance, stats)
  low_radiance = max(RADIANCE_FLOOR, local_radiance * (1.0 - combined["relative_uncertainty"]))
  high_radiance = local_radiance * (1.0 + combined["relative_uncertainty"])
  percentile_low = estimate_percentile_from_radiance(low_radiance, stats)
  percentile_high = estimate_percentile_from_radiance(high_radiance, stats)

  regional_glow_adjustment = clamp((combined["regional_ratio"] - 1.8) / 12.0, 0.0, 0.08)
  estimated_center = clamp(percentile_to_bortle_center(percentile_center) + regional_glow_adjustment, 1.0, 9.0)
  extrapolation_penalty = 0.12 if not equivalent_sqm_in_calibrated_range(radiance_to_equivalent_sqm(local_radiance)) else 0.0
  uncertainty_radius = clamp(
    0.18
    + 0.45 * combined["uncertainty_drivers"]["sensor_disagreement"]
    + 0.25 * combined["uncertainty_drivers"]["variability_penalty"]
    + 0.15 * combined["uncertainty_drivers"]["quality_penalty"]
    + 0.12 * combined["uncertainty_drivers"]["observation_penalty"]
    + 0.32 * combined["uncertainty_drivers"]["regional_glow_penalty"]
    + extrapolation_penalty,
    0.2,
    1.35,
  )
  estimated_low = clamp(estimated_center - uncertainty_radius, 1.0, 9.0)
  estimated_high = clamp(estimated_center + uncertainty_radius, 1.0, 9.0)

  if estimated_low > estimated_high:
    estimated_low, estimated_high = estimated_high, estimated_low

  coarse_band = f"{max(1, math.floor(estimated_low))}-{min(9, math.ceil(estimated_high))}"
  interval_label = f"{estimated_low:.1f}-{estimated_high:.1f}"

  sqm_center = radiance_to_equivalent_sqm(local_radiance)
  sqm_low = radiance_to_equivalent_sqm(high_radiance)
  sqm_high = radiance_to_equivalent_sqm(low_radiance)

  payload = {
    "latitude": lat,
    "longitude": lon,
    "tile_id": tile_id,
    "radiance_layer": PRIMARY_LAYER,
    "boundary_country": "Republic of Korea",
    "estimated_bortle_center": round(estimated_center, 1),
    "estimated_bortle_range": {
      "low": round(estimated_low, 1),
      "high": round(estimated_high, 1),
    },
    "estimated_bortle_band": coarse_band,
    "estimated_bortle_interval_label": interval_label,
    "radiance_percentile": round(percentile_center, 1),
    "radiance_percentile_range": {
      "low": round(percentile_low, 1),
      "high": round(percentile_high, 1),
    },
    "equivalent_zenith_brightness_mpsas": round_or_none(sqm_center, 2),
    "equivalent_zenith_brightness_range_mpsas": {
      "low": round_or_none(min(sqm_low, sqm_high), 2),
      "high": round_or_none(max(sqm_low, sqm_high), 2),
    },
    "sqm_regression_in_calibrated_range": equivalent_sqm_in_calibrated_range(sqm_center),
    "local_radiance": local_radiance,
    "near_5km_mean_radiance": combined["near_5km_mean_radiance"],
    "regional_20km_mean_radiance": combined["regional_20km_mean_radiance"],
    "near_5km_glow_context_radiance": combined["near_5km_glow_context_radiance"],
    "regional_20km_glow_context_radiance": combined["regional_20km_glow_context_radiance"],
    "confidence": combined["confidence_label"],
    "confidence_score": round(combined["confidence_score"], 2),
    "bortle_uncertainty_radius": round(uncertainty_radius, 2),
    "quality_good_fraction": round_or_none(combined["quality_good_fraction"]),
    "observation_median": round_or_none(combined["observation_median"]),
    "std_median": round_or_none(combined["std_median"]),
    "local_high_tail_skew": round(combined["local_high_tail_skew"], 3),
    "sensor_delta_ratio": round(combined["sensor_delta_ratio"], 3),
    "relative_uncertainty": round(combined["relative_uncertainty"], 3),
    "regional_ratio": round(combined["regional_ratio"], 2),
    "regional_ratio_basis": combined["regional_ratio_basis"],
    "regional_glow_adjustment": round(regional_glow_adjustment, 2),
    "regional_glow_penalty_applied": regional_glow_adjustment > 0,
    "uncertainty_drivers": {
      key: round(value, 3) for key, value in combined["uncertainty_drivers"].items()
    },
    "thresholds_used": stats["estimated_bortle_thresholds"],
    "display_anchor_version": "lightpollutionmap-korea-benchmark-v1",
    "sensor_samples": sensor_samples,
  }

  distribution = load_distribution(distribution_path) if distribution_path else None
  if distribution is not None:
    attach_distribution_context(payload, distribution)

  return payload


def build_stats_command(args: argparse.Namespace) -> int:
  payload = merged_stats_payload(Path(args.data_dir), Path(args.boundary))
  output = Path(args.output)
  output.write_text(json.dumps(payload, indent=2), encoding="utf-8")
  print(json.dumps({
    "ok": True,
    "output": str(output),
    "positive_pixel_count": payload["merged_positive_land_stats"]["positive_pixel_count"],
  }))
  return 0


def build_distribution_command(args: argparse.Namespace) -> int:
  data_dir = Path(args.data_dir)
  stats_path = Path(args.stats)
  output = Path(args.output)
  stats = ensure_stats(stats_path, data_dir)
  payload = build_distribution_payload(data_dir, stats, Path(args.boundary))
  output.write_text(json.dumps(payload, indent=2), encoding="utf-8")
  print(json.dumps({
    "ok": True,
    "output": str(output),
    "valid_pixel_count": payload["valid_pixel_count"],
    "estimated_bortle_center_skewness": payload["summaries"]["estimated_bortle_center"]["skewness"],
  }))
  return 0


def sample_command(args: argparse.Namespace) -> int:
  payload = estimate_bortle(
    lat=args.lat,
    lon=args.lon,
    data_dir=Path(args.data_dir),
    stats_path=Path(args.stats),
    distribution_path=Path(args.distribution) if args.distribution else None,
    boundary_path=Path(args.boundary),
  )
  print(json.dumps(payload, ensure_ascii=False, indent=2))
  return 0


def main() -> int:
  parser = argparse.ArgumentParser(description="Build and sample a Bortle-like darkness estimate from Black Marble annual tiles.")
  subparsers = parser.add_subparsers(dest="command", required=True)

  build = subparsers.add_parser("build-stats")
  build.add_argument("--data-dir", default=str(DEFAULT_DATA_DIR))
  build.add_argument("--output", default=str(DEFAULT_STATS_PATH))
  build.add_argument("--boundary", default=str(DEFAULT_BOUNDARY_PATH))
  build.set_defaults(func=build_stats_command)

  distribution = subparsers.add_parser("build-distribution")
  distribution.add_argument("--data-dir", default=str(DEFAULT_DATA_DIR))
  distribution.add_argument("--stats", default=str(DEFAULT_STATS_PATH))
  distribution.add_argument("--output", default=str(DEFAULT_DISTRIBUTION_PATH))
  distribution.add_argument("--boundary", default=str(DEFAULT_BOUNDARY_PATH))
  distribution.set_defaults(func=build_distribution_command)

  sample = subparsers.add_parser("sample")
  sample.add_argument("--data-dir", default=str(DEFAULT_DATA_DIR))
  sample.add_argument("--stats", default=str(DEFAULT_STATS_PATH))
  sample.add_argument("--distribution", default=str(DEFAULT_DISTRIBUTION_PATH))
  sample.add_argument("--boundary", default=str(DEFAULT_BOUNDARY_PATH))
  sample.add_argument("--lat", type=float, required=True)
  sample.add_argument("--lon", type=float, required=True)
  sample.set_defaults(func=sample_command)

  args = parser.parse_args()
  return args.func(args)


if __name__ == "__main__":
  raise SystemExit(main())

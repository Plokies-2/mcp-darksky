import { randomUUID } from "node:crypto";

const REPORT_RESOURCE_TTL_MS = 60 * 60 * 1000;
const MAX_REPORT_RESOURCES = 256;
const reportResourceStore = new Map();

function pickFields(source, keys) {
  return keys.reduce((result, key) => {
    if (source?.[key] !== undefined) {
      result[key] = source[key];
    }
    return result;
  }, {});
}

function pruneReportResources() {
  const now = Date.now();
  for (const [key, entry] of reportResourceStore.entries()) {
    if (entry.expiresAt <= now) {
      reportResourceStore.delete(key);
    }
  }

  while (reportResourceStore.size > MAX_REPORT_RESOURCES) {
    const oldestKey = reportResourceStore.keys().next().value;
    if (!oldestKey) {
      break;
    }
    reportResourceStore.delete(oldestKey);
  }
}

function buildReportUri(reportId) {
  return `darksky://reports/${reportId}`;
}

function buildDetailResourceMeta(kind, uri) {
  return {
    detail_resource: {
      uri,
      name: `${kind} detail`,
      mime_type: "application/json",
    },
  };
}

export function publishDetailedReport(kind, report) {
  pruneReportResources();
  const reportId = randomUUID();
  const uri = buildReportUri(reportId);

  reportResourceStore.set(reportId, {
    kind,
    report,
    uri,
    expiresAt: Date.now() + REPORT_RESOURCE_TTL_MS,
  });

  return {
    reportId,
    uri,
    resourceLink: {
      type: "resource_link",
      uri,
      name: `${kind} detail report`,
      mimeType: "application/json",
      description: `Detailed ${kind} payload with hourly and diagnostic fields.`,
    },
  };
}

export function readDetailedReportResource(reportId) {
  pruneReportResources();
  const entry = reportResourceStore.get(reportId);
  if (!entry) {
    return null;
  }

  return {
    contents: [
      {
        uri: entry.uri,
        mimeType: "application/json",
        text: JSON.stringify(entry.report, null, 2),
      },
    ],
  };
}

export function summarizeScoreReport(report, detailUri) {
  if (report?.report_kind === "fallback_required") {
    return {
      ...report,
      ...buildDetailResourceMeta("fallback", detailUri),
    };
  }

  return {
    report_kind: report?.report_kind ?? "score",
    location: pickFields(report?.location, [
      "name",
      "latitude",
      "longitude",
      "resolved_from",
      "site_profile",
      "timezone",
    ]),
    forecast_time_range: report?.forecast_time_range,
    scores: pickFields(report?.scores, [
      "overall_score",
      "mode_score",
      "reference_mode_score",
      "reference_mode_score_context",
      "active_mode",
      "darkness_score",
      "cloud_score",
      "transparency_score",
    ]),
    derived_recommendations: pickFields(report?.derived_recommendations, [
      "mode_ready",
      "best_window",
      "mode_best_window",
    ]),
    window_rankings: {
      overall_windows: (report?.window_rankings?.overall_windows ?? []).slice(0, 3),
      mode_windows: (report?.window_rankings?.mode_windows ?? []).slice(0, 3),
      milky_way_windows: (report?.window_rankings?.milky_way_windows ?? []).slice(0, 3),
    },
    blocker_timeline: (report?.blocker_timeline ?? []).slice(0, 6),
    curve_summary: report?.curve_summary,
    light_pollution_context: pickFields(report?.light_pollution_context, [
      "estimated_bortle_center",
      "estimated_bortle_band",
      "estimated_bortle_interval_label",
      "target_display_bortle_center",
      "equivalent_zenith_brightness_mpsas",
      "equivalent_zenith_brightness_sqm",
      "unavailable",
    ]),
    risk_flags: (report?.risk_flags ?? []).slice(0, 6),
    request_context: report?.request_context,
    ...buildDetailResourceMeta("score", detailUri),
  };
}

export function summarizeOutlookReport(report, detailUri) {
  return {
    report_kind: report?.report_kind ?? "outlook",
    location: pickFields(report?.location, [
      "name",
      "latitude",
      "longitude",
      "resolved_from",
      "site_profile",
      "timezone",
    ]),
    summary: report?.summary,
    forecast_time_range: report?.forecast_time_range,
    curve_summary: report?.curve_summary,
    outlook_blocks: (report?.outlook_blocks ?? []).slice(0, 6),
    window_rankings: {
      overall_windows: (report?.window_rankings?.overall_windows ?? []).slice(0, 3),
      mode_windows: (report?.window_rankings?.mode_windows ?? []).slice(0, 3),
      milky_way_windows: (report?.window_rankings?.milky_way_windows ?? []).slice(0, 3),
    },
    light_pollution_context: pickFields(report?.light_pollution_context, [
      "estimated_bortle_center",
      "estimated_bortle_band",
      "estimated_bortle_interval_label",
      "target_display_bortle_center",
      "equivalent_zenith_brightness_mpsas",
      "unavailable",
    ]),
    risk_flags: (report?.risk_flags ?? []).slice(0, 6),
    what_is_included: (report?.what_is_included ?? []).slice(0, 6),
    what_is_reduced: (report?.what_is_reduced ?? []).slice(0, 6),
    request_context: report?.request_context,
    detail_policy: report?.detail_policy,
    ...buildDetailResourceMeta("outlook", detailUri),
  };
}

export function summarizeLightPollutionReport(report, detailUri) {
  return {
    location: pickFields(report?.location, [
      "name",
      "latitude",
      "longitude",
      "resolved_from",
    ]),
    methodology_version: report?.methodology_version,
    light_pollution_context: pickFields(report?.light_pollution_context, [
      "estimated_bortle_center",
      "estimated_bortle_range",
      "estimated_bortle_interval_label",
      "target_display_bortle_center",
      "equivalent_zenith_brightness_mpsas",
      "equivalent_zenith_brightness_sqm",
      "estimated_bortle_band",
      "unavailable",
      "error",
    ]),
    source_attribution: (report?.source_attribution ?? []).map((item) => ({
      provider: item.provider,
      detail: item.detail,
    })).slice(0, 4),
    ...buildDetailResourceMeta("light-pollution", detailUri),
  };
}

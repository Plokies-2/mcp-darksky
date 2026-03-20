import test from "node:test";
import assert from "node:assert/strict";
import {
  publishDetailedReport,
  readDetailedReportResource,
  summarizeScoreReport,
} from "../src/report-resources.js";

test("published detailed reports can be read back by resource id", () => {
  const report = {
    report_kind: "score",
    location: {
      name: "Test Site",
    },
    hourly_conditions: [
      { time: "2026-03-20T20:00:00+09:00", mode_score: 42 },
    ],
  };
  const { reportId, uri } = publishDetailedReport("score", report);
  const resource = readDetailedReportResource(reportId);

  assert.ok(resource);
  assert.equal(resource.contents[0].uri, uri);
  assert.match(resource.contents[0].text, /"hourly_conditions"/);
});

test("score summary keeps key fields and strips bulky hourly payloads", () => {
  const summary = summarizeScoreReport({
    report_kind: "score",
    location: {
      name: "Test Site",
      latitude: 37.5,
      longitude: 127.0,
      timezone: "Asia/Seoul",
    },
    forecast_time_range: {
      start: "2026-03-20T18:00:00+09:00",
      end: "2026-03-21T06:00:00+09:00",
    },
    scores: {
      overall_score: 70,
      mode_score: 65,
      active_mode: "general",
    },
    derived_recommendations: {
      mode_ready: true,
      best_window: "03/21 01:00-02:00",
    },
    window_rankings: {
      overall_windows: [{ start: "a", end: "b" }],
    },
    blocker_timeline: [{ time: "t1", primary_blocker: "cloud" }],
    hourly_conditions: [{ time: "t1", mode_score: 65 }],
    risk_flags: ["cloud"],
    request_context: {
      resolved_mode: "general",
    },
  }, "darksky://reports/example");

  assert.equal(summary.location.name, "Test Site");
  assert.equal(summary.scores.mode_score, 65);
  assert.equal(summary.derived_recommendations.mode_ready, true);
  assert.equal(summary.detail_resource.uri, "darksky://reports/example");
  assert.equal(summary.hourly_conditions, undefined);
});

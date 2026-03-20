function getBriefingTimezone(report) {
  return report?.location?.timezone ?? "Asia/Seoul";
}

function formatLocalDateTimeLabel(value, timezone) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    dateLabel: `${lookup.month}/${lookup.day}`,
    timeLabel: `${lookup.hour}:${lookup.minute}`,
  };
}

function formatWindowForBriefing(windowValue, timezone = "Asia/Seoul") {
  if (!windowValue) {
    return "n/a";
  }

  if (Array.isArray(windowValue)) {
    const labels = windowValue
      .map((item) => formatWindowForBriefing(item, timezone))
      .filter((item) => item && item !== "n/a");
    return labels.length ? labels.join(" / ") : "n/a";
  }

  if (typeof windowValue === "string") {
    if (windowValue.includes("T")) {
      const formatted = formatLocalDateTimeLabel(windowValue, timezone);
      if (formatted) {
        return `${formatted.dateLabel} ${formatted.timeLabel}`;
      }
    }
    return windowValue;
  }

  if (typeof windowValue === "object" && windowValue.start && windowValue.end) {
    const start = formatLocalDateTimeLabel(windowValue.start, timezone);
    const end = formatLocalDateTimeLabel(windowValue.end, timezone);
    if (start && end) {
      if (windowValue.start === windowValue.end) {
        return `${start.dateLabel} ${start.timeLabel}`;
      }
      if (start.dateLabel === end.dateLabel) {
        return `${start.dateLabel} ${start.timeLabel}-${end.timeLabel}`;
      }
      return `${start.dateLabel} ${start.timeLabel}-${end.dateLabel} ${end.timeLabel}`;
    }
    return `${windowValue.start} to ${windowValue.end}`;
  }

  return "n/a";
}

function formatTrendTimeLabel(value, timezone = "Asia/Seoul") {
  const formatted = formatLocalDateTimeLabel(value, timezone);
  if (!formatted) {
    return "n/a";
  }
  return `${formatted.dateLabel} ${formatted.timeLabel}`;
}

function formatTrendScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "n/a";
  }
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
}

function formatTrendScorePair(primaryValue, referenceValue) {
  const primary = formatTrendScore(primaryValue);
  const referenceNumeric = Number(referenceValue);
  if (!Number.isFinite(referenceNumeric)) {
    return primary;
  }
  return `${primary} / ${formatTrendScore(referenceNumeric)}`;
}

function escapeMarkdownCell(value) {
  return String(value ?? "n/a").replace(/\|/g, "/").replace(/\s+/g, " ").trim();
}

function buildMarkdownTable(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map((_) => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escapeMarkdownCell).join(" | ")} |`),
  ].join("\n");
}

function buildScoreTrendTable(report, timezone = "Asia/Seoul") {
  const hourlyConditions = Array.isArray(report?.hourly_conditions) ? report.hourly_conditions : [];
  if (!hourlyConditions.length) {
    return null;
  }
  const hasReferenceScore = hourlyConditions.some((hour) => Number.isFinite(Number(hour?.reference_mode_score)));

  const blockerByTime = new Map(
    (Array.isArray(report?.blocker_timeline) ? report.blocker_timeline : [])
      .filter((item) => item?.time)
      .map((item) => [item.time, item.primary_blocker ?? null]),
  );

  return buildMarkdownTable(
    ["시간대", "점수", "핵심 변수"],
    hourlyConditions.map((hour) => [
      formatTrendTimeLabel(hour?.time, timezone),
      hasReferenceScore
        ? formatTrendScorePair(hour?.mode_score ?? hour?.overall_score, hour?.reference_mode_score)
        : formatTrendScore(hour?.mode_score ?? hour?.overall_score),
      humanizeBlocker(hour?.primary_blocker ?? blockerByTime.get(hour?.time)) === "n/a"
        ? "-"
        : humanizeBlocker(hour?.primary_blocker ?? blockerByTime.get(hour?.time)),
    ]),
  );
}

function buildOutlookTrendTable(report, timezone = "Asia/Seoul") {
  const outlookBlocks = Array.isArray(report?.outlook_blocks) ? report.outlook_blocks : [];
  if (!outlookBlocks.length) {
    return null;
  }

  return buildMarkdownTable(
    ["시간대", "점수", "핵심 변수"],
    outlookBlocks.map((block) => [
      formatWindowForBriefing({ start: block?.start, end: block?.end }, timezone),
      formatTrendScore(block?.average_mode_score ?? block?.average_overall_score),
      humanizeBlocker(block?.primary_blocker) === "n/a" ? "-" : humanizeBlocker(block?.primary_blocker),
    ]),
  );
}

function collectPrimaryBlockers(report, limit = 2) {
  const items = Array.isArray(report?.blocker_timeline) ? report.blocker_timeline : [];
  return Array.from(
    new Set(
      items
        .map((item) => item?.primary_blocker)
        .filter(Boolean),
    ),
  ).slice(0, limit);
}

function humanizeVerdict(verdict) {
  if (verdict === "go") {
    return "가도 됨";
  }
  if (verdict === "no_go") {
    return "비추천";
  }
  return "애매함";
}

function humanizeModeReady(ready) {
  if (ready === true) {
    return "\uCD2C\uC601 \uAC00\uB2A5";
  }
  if (ready === false) {
    return "\uBE44\uCD94\uCC9C";
  }
  return "\uD310\uC815 \uBCF4\uB958";
}

function humanizeBlocker(blocker) {
  const labels = {
    moonlight: "달빛",
    transparency: "투명도",
    cloud: "구름",
    target_altitude: "타깃 고도",
    hard_fail_weather: "강수/악천후",
    humidity: "습도",
    stability: "바람/흔들림",
    light_pollution: "광해",
  };

  return labels[blocker] ?? blocker ?? "n/a";
}

function buildTimingHint(report) {
  const trend = report?.curve_summary?.overall_trend;
  const period = report?.curve_summary?.best_period_label;

  if (trend === "improving") {
    return "이른 시간보다 뒤 시간이 더 유리한 흐름";
  }
  if (trend === "deteriorating") {
    return "초반이 더 낫고 뒤로 갈수록 약해지는 흐름";
  }
  if (period === "pre_dawn") {
    return "핵심 시간대가 새벽 쪽에 몰림";
  }
  if (period === "early_night") {
    return "초반 밤이 상대적으로 유리함";
  }

  return "시간대별 차이가 크지 않으면 best_window만 짧게 안내";
}

function getPreferredScoreWindow(report) {
  return (
    report?.derived_recommendations?.best_windows
    ?? report?.derived_recommendations?.best_window
    ?? report?.derived_recommendations?.mode_best_windows
    ?? report?.derived_recommendations?.mode_best_window
    ?? null
  );
}

function getRelevantHoursForWindow(report, windowValue) {
  const hourlyConditions = Array.isArray(report?.hourly_conditions) ? report.hourly_conditions : [];
  const windows = Array.isArray(windowValue) ? windowValue : [windowValue];
  if (!windows.length || !hourlyConditions.length) {
    return [];
  }
  const ranges = windows
    .filter((item) => item?.start && item?.end)
    .map((item) => ({
      start: new Date(item.start).getTime(),
      end: new Date(item.end).getTime(),
    }))
    .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end));
  if (!ranges.length) {
    return [];
  }

  return hourlyConditions.filter((hour) => {
    const value = new Date(hour?.time).getTime();
    return Number.isFinite(value) && ranges.some((range) => value >= range.start && value <= range.end);
  });
}

function classifyScore(score, { inverse = false } = {}) {
  if (score === null || score === undefined || !Number.isFinite(Number(score))) {
    return "정보 부족";
  }

  const value = Number(score);
  if (inverse) {
    if (value >= 75) {
      return "낮음";
    }
    if (value >= 50) {
      return "보통";
    }
    return "높음";
  }

  if (value >= 80) {
    return "좋음";
  }
  if (value >= 60) {
    return "보통";
  }
  return "아쉬움";
}

function average(values) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildSecondaryFactorSummary(report) {
  const scores = report?.scores ?? {};
  const bortleLabel =
    report?.light_pollution_context?.estimated_bortle_interval_label
    ?? report?.light_pollution_context?.estimated_bortle_band
    ?? "n/a";

  return [
    `구름 ${classifyScore(scores.cloud_score)}`,
    `투명도 ${classifyScore(scores.transparency_score)}`,
    `어둠 ${classifyScore(scores.darkness_score)}`,
    `이슬위험 ${classifyScore(scores.dew_risk_score, { inverse: true })}`,
    `안정도 ${classifyScore(scores.stability_score)}`,
    `광해 ${bortleLabel}`,
  ].join(", ");
}

function getRelevantPreparationHours(report) {
  const preferredWindow = getPreferredScoreWindow(report);
  const relevantHours = getRelevantHoursForWindow(report, preferredWindow);
  if (relevantHours.length) {
    return relevantHours;
  }

  const hourlyConditions = Array.isArray(report?.hourly_conditions) ? report.hourly_conditions : [];
  return hourlyConditions;
}

function summarizeCloudWindow(hours, timezone) {
  if (!hours.length) {
    return "정보 부족";
  }
  const scores = hours
    .map((hour) => Number(hour?.milky_way_cloud_score ?? hour?.cloud_score))
    .filter(Number.isFinite);
  if (!scores.length) {
    return "정보 부족";
  }
  if (scores.every((score) => score >= 80)) {
    return "항상 좋음";
  }
  const firstBad = hours.find((hour) => Number(hour?.milky_way_cloud_score ?? hour?.cloud_score) < 60);
  if (firstBad) {
    return `${formatTrendTimeLabel(firstBad.time, timezone)}부터 나빠짐`;
  }
  return "대체로 무난함";
}

function summarizeAirQualityWindow(hours) {
  if (!hours.length) {
    return "정보 부족";
  }
  const pm25 = hours.map((hour) => Number(hour?.raw_inputs?.pm2_5)).filter(Number.isFinite);
  const aqi = hours.map((hour) => Number(hour?.raw_inputs?.european_aqi)).filter(Number.isFinite);
  const maxPm25 = pm25.length ? Math.max(...pm25) : null;
  const maxAqi = aqi.length ? Math.max(...aqi) : null;
  if (maxPm25 === null && maxAqi === null) {
    return "정보 부족";
  }
  if ((maxAqi ?? 0) >= 75 || (maxPm25 ?? 0) >= 35) {
    return `다소 나쁨 (AQI ${maxAqi ?? "n/a"}, PM2.5 ${maxPm25 ?? "n/a"})`;
  }
  return `무난함 (AQI ${maxAqi ?? "n/a"}, PM2.5 ${maxPm25 ?? "n/a"})`;
}

function summarizeDewWindow(hours, report, timezone) {
  if (!hours.length) {
    return "정보 부족";
  }
  const firstRisk = hours.find((hour) => {
    const raw = hour?.raw_inputs ?? {};
    const spread = Number(raw.temperature_2m) - Number(raw.dew_point_2m);
    return (
      Number(hour?.dew_risk_score) < 45
      || (Number.isFinite(spread) && spread <= 3)
      || Number(raw.relative_humidity_2m) >= 90
    );
  });
  if (firstRisk) {
    return `${formatTrendTimeLabel(firstRisk.time, timezone)} 전후 결로 주의`;
  }
  return "큰 문제 없음";
}

function summarizeAltitudeWindow(hours, report) {
  if (!hours.length) {
    return "정보 부족";
  }
  const resolvedMode =
    report?.request_context?.resolved_mode
    ?? report?.scores?.active_mode
    ?? report?.summary?.active_mode
    ?? "general";

  if (resolvedMode === "wide_field_milky_way") {
    const values = hours.map((hour) => Number(hour?.raw_inputs?.galactic_core_altitude_degrees)).filter(Number.isFinite);
    const separations = hours.map((hour) => Number(hour?.raw_inputs?.galactic_core_moon_separation_degrees)).filter(Number.isFinite);
    if (!values.length) {
      return "은하수 코어 고도 정보 부족";
    }
    const range = `${Math.min(...values)}-${Math.max(...values)}도`;
    const separationText = separations.length ? `, 달과 ${Math.min(...separations)}도 이상` : "";
    return `은하수 코어 ${range}${separationText}`;
  }

  if (report?.astronomy_context?.target?.name) {
    const values = hours.map((hour) => Number(hour?.raw_inputs?.target_altitude_degrees)).filter(Number.isFinite);
    const separations = hours.map((hour) => Number(hour?.raw_inputs?.target_moon_separation_degrees)).filter(Number.isFinite);
    if (!values.length) {
      return `${report.astronomy_context.target.name} 고도 정보 부족`;
    }
    const range = `${Math.min(...values)}-${Math.max(...values)}도`;
    const separationText = separations.length ? `, 달과 ${Math.min(...separations)}도 이상` : "";
    return `${report.astronomy_context.target.name} ${range}${separationText}`;
  }

  return "일반 모드라 별도 타깃 고도 계산 없음";
}

function summarizeTransparencyWindow(hours) {
  if (!hours.length) {
    return "정보 부족";
  }
  const values = hours.map((hour) => Number(hour?.transparency_score)).filter(Number.isFinite);
  if (!values.length) {
    return "정보 부족";
  }
  const averageValue = average(values);
  return `${classifyScore(averageValue)} (${Math.round(averageValue)}점)`;
}

function summarizeMoonWindow(hours, report) {
  if (!hours.length) {
    return "정보 부족";
  }
  const visibleHours = hours.filter((hour) => hour?.moon_context?.visible);
  const illumination = hours.map((hour) => Number(hour?.moon_context?.illumination_fraction)).filter(Number.isFinite);
  const maxIllumination = illumination.length ? Math.max(...illumination) : null;
  const moonHours = Number(report?.astronomy_context?.moon_interference_hours);
  if (!visibleHours.length) {
    return "달 영향 거의 없음";
  }
  return `달 영향 ${moonHours || visibleHours.length}시간, 밝기 ${(maxIllumination ?? 0).toFixed(2)}`;
}

function buildFactorReviewLines(report, timezone = "Asia/Seoul") {
  const hours = getRelevantPreparationHours(report);
  if (!hours.length) {
    return [];
  }

  const bortleLabel =
    report?.light_pollution_context?.estimated_bortle_interval_label
    ?? report?.light_pollution_context?.estimated_bortle_band
    ?? report?.location?.site_profile?.bortle_class
    ?? "정보 부족";

  return [
    `광해등급: ${bortleLabel}`,
    `구름: ${summarizeCloudWindow(hours, timezone)}`,
    `대기질: ${summarizeAirQualityWindow(hours)}`,
    `이슬점/결로: ${summarizeDewWindow(hours, report, timezone)}`,
    `대상/코어 고도: ${summarizeAltitudeWindow(hours, report)}`,
    `투명도: ${summarizeTransparencyWindow(hours)}`,
    `월령/달 상태: ${summarizeMoonWindow(hours, report)}`,
  ];
}

function buildFactorReviewLinesDetailed(report, timezone = "Asia/Seoul") {
  const hours = getRelevantPreparationHours(report);
  if (!hours.length) {
    return [];
  }

  const bortleLabel =
    report?.light_pollution_context?.estimated_bortle_interval_label
    ?? report?.light_pollution_context?.estimated_bortle_band
    ?? report?.location?.site_profile?.bortle_class
    ?? "\uC815\uBCF4 \uBD80\uC871";

  return [
    `\uAD11\uD574\uB4F1\uAE09: ${bortleLabel} (\uBC30\uACBD \uD558\uB298 \uBC1D\uAE30 \uAE30\uC900)`,
    `\uAD6C\uB984: ${summarizeCloudWindow(hours, timezone)} (\uD558\uB298 \uAC00\uB9BC \uC815\uB3C4)`,
    `\uB300\uAE30\uC9C8: ${summarizeAirQualityWindow(hours)} (\uBBF8\uC138\uBA3C\uC9C0\uC640 \uC5F0\uBB34 \uC601\uD5A5)`,
    `\uC774\uC2AC\uC810/\uACB0\uB85C: ${summarizeDewWindow(hours, report, timezone)} (\uB80C\uC988 \uC131\uC560 \uAC00\uB2A5\uC131)`,
    `\uB300\uC0C1/\uCF54\uC5B4 \uACE0\uB3C4: ${summarizeAltitudeWindow(hours, report)} (\uD504\uB808\uC774\uBC0D\uACFC \uB178\uCD9C \uD6A8\uC728)`,
    `\uD22C\uBA85\uB3C4: ${summarizeTransparencyWindow(hours)} (\uBBF8\uC138 \uAD6C\uC870\uAC00 \uC0B4\uC544\uB098\uB294 \uC815\uB3C4)`,
    `\uC6D4\uB839/\uB2EC \uC0C1\uD0DC: ${summarizeMoonWindow(hours, report)} (\uB2EC\uBE5B \uAC04\uC12D \uC815\uB3C4)`,
  ];
}

function humanizeMode(mode) {
  const labels = {
    general: "일반 촬영",
    wide_field_milky_way: "광시야 은하수",
    wide_field_nightscape: "광시야 야경",
    broadband_deep_sky: "광대역 딥스카이",
    narrowband_deep_sky: "협대역 딥스카이",
    star_trail: "별궤적",
  };

  return labels[mode] ?? mode ?? "n/a";
}

function buildPurposeFitLabel(report) {
  const context = report?.request_context ?? {};
  const resolvedMode = context.resolved_mode ?? report?.scores?.active_mode ?? report?.summary?.active_mode;
  const targetName = report?.astronomy_context?.target?.name ?? context?.resolved_target?.name ?? null;

  return [humanizeMode(resolvedMode), targetName].filter(Boolean).join(" / ");
}

function buildUrbanReferenceLine(report) {
  const context = report?.scores?.reference_mode_score_context;
  const referenceScore = report?.scores?.reference_mode_score;
  if (!context || !Number.isFinite(Number(referenceScore))) {
    return null;
  }
  return `${context.label}: 실전 ${formatTrendScore(report?.scores?.mode_score)} / 보강 ${formatTrendScore(referenceScore)} (${context.mode_label})`;
}

function buildReasonFocus(report) {
  const resolvedMode =
    report?.request_context?.resolved_mode
    ?? report?.scores?.active_mode
    ?? report?.summary?.active_mode
    ?? "general";
  const targetName = report?.astronomy_context?.target?.name ?? "타깃";

  const labels = {
    general: "구름, 달빛, 투명도, 결로와 안정도",
    wide_field_milky_way: "은하수 고도, 달빛, 구름과 투명도",
    wide_field_nightscape: "달빛, 구름, 바람과 안정도",
    broadband_deep_sky: `${targetName} 고도, 달빛, 투명도`,
    narrowband_deep_sky: `${targetName} 고도, 안정도, 달빛`,
    star_trail: "긴 맑은 구간, 구름, 바람과 결로",
  };

  return labels[resolvedMode] ?? labels.general;
}

function buildSurveyFactors(report) {
  const resolvedMode =
    report?.request_context?.resolved_mode
    ?? report?.scores?.active_mode
    ?? report?.summary?.active_mode
    ?? "general";

  const baseFactors = ["월령/달고도", "구름량", "투명도", "어둠", "이슬점 spread/결로 위험", "바람/안정도", "광해"];
  const modeExtras = {
    general: [],
    wide_field_milky_way: ["은하수 코어 가시성"],
    wide_field_nightscape: ["전경과 하늘의 균형"],
    broadband_deep_sky: ["타깃 고도"],
    narrowband_deep_sky: ["타깃 고도"],
    star_trail: ["장시간 맑은 구간"],
  };

  return [...baseFactors, ...(modeExtras[resolvedMode] ?? [])].join(", ");
}

function buildSurveyFactorsDetailed(report) {
  const resolvedMode =
    report?.request_context?.resolved_mode
    ?? report?.scores?.active_mode
    ?? report?.summary?.active_mode
    ?? "general";

  const baseFactors = [
    "\uC6D4\uB839/\uB2EC\uACE0\uB3C4(\uB2EC\uBE5B \uAC04\uC12D \uD06C\uAE30)",
    "\uAD6C\uB984\uB7C9(\uD558\uB298 \uAC00\uB9BC \uC815\uB3C4)",
    "\uD22C\uBA85\uB3C4(\uBBF8\uC138\uBA3C\uC9C0\uC640 \uC5F0\uBB34 \uC601\uD5A5)",
    "\uC5B4\uB460(\uAD11\uD574\uC640 \uB2EC\uBE5B\uC744 \uD569\uCE5C \uBC30\uACBD \uBC1D\uAE30)",
    "\uC774\uC2AC\uC810 spread/\uACB0\uB85C \uC704\uD5D8(\uB80C\uC988 \uC131\uC560 \uAC00\uB2A5\uC131)",
    "\uBC14\uB78C/\uC548\uC815\uB3C4(\uD754\uB4E4\uB9BC\uACFC \uC120\uC608\uB3C4 \uC601\uD5A5)",
    "\uAD11\uD574(\uC7A5\uC18C\uC758 \uAE30\uBCF8 \uD558\uB298 \uBC1D\uAE30)",
  ];
  const modeExtras = {
    general: [],
    wide_field_milky_way: ["\uC740\uD558\uC218 \uCF54\uC5B4 \uAC00\uC2DC\uC131(\uCF54\uC5B4 \uACE0\uB3C4\uC640 \uBCF4\uC774\uB294 \uC2DC\uAC04)"],
    wide_field_nightscape: ["\uC804\uACBD\uACFC \uD558\uB298\uC758 \uADE0\uD615(\uAD6C\uB3C4\uC640 \uD604\uC7A5 \uD65C\uC6A9\uC131)"],
    broadband_deep_sky: ["\uD0C0\uAE43 \uACE0\uB3C4(\uB300\uAE30 \uD1B5\uACFC\uB7C9\uACFC \uC120\uBA85\uB3C4)"],
    narrowband_deep_sky: ["\uD0C0\uAE43 \uACE0\uB3C4(\uB300\uAE30 \uD1B5\uACFC\uB7C9\uACFC \uC120\uBA85\uB3C4)"],
    star_trail: ["\uC7A5\uB178\uCD9C \uAC00\uB2A5 \uAD6C\uAC04(\uAE34 \uC5F0\uC18D \uB178\uCD9C \uC720\uC9C0 \uAC00\uB2A5\uC131)"],
  };

  return [...baseFactors, ...(modeExtras[resolvedMode] ?? [])].join(", ");
}

function buildOperatorTip(report) {
  const resolvedMode =
    report?.request_context?.resolved_mode
    ?? report?.scores?.active_mode
    ?? report?.summary?.active_mode
    ?? "general";
  const advancedTip = report?.request_context?.advanced_tip ?? null;

  if (advancedTip) {
    return advancedTip;
  }

  const defaults = {
    general: "지금은 일반 모드의 균형형 판단입니다. 찍고 싶은 테마를 은하수, 별궤적, 광대역/협대역 딥스카이처럼 정확히 말해주면 그 기준으로 다시 볼 수 있습니다.",
    wide_field_milky_way: "광각 은하수는 달빛이 빠진 뒤와 코어 고도가 올라오는 구간에 노출을 몰아주는 편이 안전합니다.",
    wide_field_nightscape: "전경을 함께 넣는다면 달 방향, 그림자, 바람에 의한 흔들림까지 같이 보고 구도를 고정하세요.",
    broadband_deep_sky: "광대역은 달빛과 투명도 변화에 민감하니 best window에 촬영 시간을 집중하는 편이 유리합니다.",
    narrowband_deep_sky: "협대역 필터가 있다면 달빛에는 조금 더 버티지만, 타깃 고도와 안정도는 계속 엄격하게 보세요.",
    star_trail: "별궤적은 장시간 누적이라 구름 유입, 배터리, 결로 관리가 점수만큼 중요합니다.",
  };

  return defaults[resolvedMode] ?? defaults.general;
}

function buildRequiredPreparation(report) {
  const relevantHours = getRelevantPreparationHours(report);
  if (!relevantHours.length) {
    return null;
  }

  const items = [];
  const addItem = (text) => {
    if (text && !items.includes(text)) {
      items.push(text);
    }
  };

  const hasHardWeather = relevantHours.some((hour) => {
    const raw = hour?.raw_inputs ?? {};
    return (
      (Array.isArray(hour?.hard_fail_reasons) && hour.hard_fail_reasons.length > 0)
      || Number(raw.precipitation) >= 0.2
      || Number(raw.visibility) <= 3000
    );
  });
  if (hasHardWeather) {
    addItem("강수나 저시정 가능성이 있어 촬영 자체를 다시 검토하세요");
  }

  const needsDewMitigation = relevantHours.some((hour) => {
    const raw = hour?.raw_inputs ?? {};
    const spread = Number(raw.temperature_2m) - Number(raw.dew_point_2m);
    return (
      Number(hour?.dew_risk_score) < 45
      || (Number.isFinite(spread) && spread <= 3)
      || Number(raw.relative_humidity_2m) >= 90
    );
  });
  if (needsDewMitigation) {
    addItem("결로 가능성이 높아 렌즈히터나 결로 대비가 필요합니다");
  }

  const needsMask = relevantHours.some((hour) => {
    const raw = hour?.raw_inputs ?? {};
    return Number(raw.european_aqi) >= 75 || Number(raw.pm2_5) >= 35 || Number(raw.pm10) >= 80;
  });
  if (needsMask) {
    addItem("미세먼지 농도가 높아 마스크를 고려하세요");
  }

  const needsColdProtection = relevantHours.some((hour) => {
    const raw = hour?.raw_inputs ?? {};
    const actual = Number(raw.temperature_2m);
    const apparent = Number(raw.apparent_temperature);
    if (!Number.isFinite(actual) || !Number.isFinite(apparent)) {
      return false;
    }
    return actual <= 5 && actual - apparent >= 4;
  });
  if (needsColdProtection) {
    addItem("체감온도가 실제 기온보다 크게 낮아 핫팩 같은 보온 대비를 권장합니다");
  }

  const needsWindMitigation = relevantHours.some((hour) => {
    const raw = hour?.raw_inputs ?? {};
    return Number(hour?.stability_score) < 55 || Number(raw.wind_gusts_10m) >= 30 || Number(raw.wind_speed_10m) >= 12;
  });
  if (needsWindMitigation) {
    addItem("바람 영향이 있어 삼각대 하중 보강이나 흔들림 대비가 필요합니다");
  }

  return items.length ? items.join(", ") : null;
}

function buildReplyContractLines(extraLines = []) {
  return [
    "Reply in Korean when the user asked in Korean.",
    "Write like a concise report with clear section labels, not a casual paragraph.",
    "Frame the answer as a comparison between what the user asked for and what the report supports.",
    "If the user asked about a specific time or target, answer that exact request first and compare it against the best window briefly.",
    "If request_context.resolved_mode is more specific than requested_mode, explain with the resolved purpose instead of falling back to generic weather commentary.",
    "Use concise wording, not a single-sentence restriction.",
    "Always present the time-based score trend as a compact markdown table when rows are available. Use the columns 시간대, 점수, 핵심 변수.",
    "Always emphasize the best time window with bold markdown.",
    "Use this fixed order by default: 추천 시간, 판단 이유, 시간대별 점수 추이 표, 이번 계산에 반영한 요소, 필요하면 필수 준비물, 숙련자 참고.",
    "For every item in 조건 요약, include a short interpretation of what that factor means for the shoot. Do not leave the section as labels only.",
    "In 이번 계산에 반영한 요소, do not only list factor names. Attach a short gloss to each factor, usually in parentheses.",
    "If urban_reference is available, mention it near the top as a specialized urban-light-pollution fallback score and clearly distinguish it from the practical score.",
    "Do not enumerate hourly scores, JSON fields, long background explanation, or a closing offer unless the user asks.",
    ...extraLines,
  ];
}

function buildScoreFallbackToolContent(report) {
  const recommendedTool = report?.recommended_tool ?? "score_night_sky_outlook";
  const recommendedMode = report?.recommended_input?.mode ?? "general";
  const requestedDate = report?.detail_policy?.requested_date ?? report?.recommended_input?.date ?? "n/a";

  return [
    ...buildReplyContractLines([
      "This payload means the requested date is outside the full-detail score horizon.",
      "Do not invent a detailed hourly verdict from this payload.",
      "Do not fabricate a time-based score table when full-detail rows are unavailable.",
      "Tell the user that the date should be handled by the outlook tool and keep the answer brief.",
    ]),
    "Use this answer skeleton by default:",
    "핵심 변수: 이 날짜는 세부 hourly score 범위를 넘어가는 날짜임.",
    "결론: 상세 점수보다 outlook으로 보는 편이 맞음.",
    `요청 시점: ${requestedDate}는 reduced-detail 구간이므로 full score 대신 coarse planning으로 답하기.`,
    `기타 변수: 추천 모드는 ${recommendedMode}.`,
    `추천 시간: ${recommendedTool}로 다시 조회.`,
    "Reference only. Do not expose these labels verbatim to the user:",
    `- report_kind: ${report?.report_kind ?? "n/a"}`,
    `- recommended_tool: ${recommendedTool}`,
    `- recommended_mode: ${recommendedMode}`,
    `- requested_date: ${requestedDate}`,
  ].join("\n");
}

function buildScoreToolContent(report) {
  if (report?.report_kind === "fallback_required") {
    return buildScoreFallbackToolContent(report);
  }

  const resolvedMode =
    report?.request_context?.resolved_mode
    ?? report?.scores?.active_mode
    ?? report?.summary?.active_mode
    ?? "general";
  const timezone = getBriefingTimezone(report);
  const bestWindow = formatWindowForBriefing(getPreferredScoreWindow(report), timezone);
  const blockers = collectPrimaryBlockers(report).map(humanizeBlocker);
  const primaryVerdict = humanizeModeReady(report?.derived_recommendations?.mode_ready);
  const timingHint = buildTimingHint(report);
  const riskText = blockers.length ? blockers.join(", ") : "n/a";
  const secondaryFactors = buildSecondaryFactorSummary(report);
  const purposeFit = buildPurposeFitLabel(report);
  const reasonFocus = buildReasonFocus(report);
  const surveyFactors = buildSurveyFactorsDetailed(report);
  const requiredPreparation = buildRequiredPreparation(report);
  const operatorTip = buildOperatorTip(report);
  const urbanReferenceLine = buildUrbanReferenceLine(report);
  const factorReviewLines = buildFactorReviewLinesDetailed(report, timezone);
  const trendTable = buildScoreTrendTable(report, timezone);
  const ignoredTargetName = report?.request_context?.ignored_target_name ?? null;
  const generalModeGuard =
    resolvedMode === "general"
      ? [
        "When resolved_mode is general, keep the answer mode-neutral.",
        "Do not mention Milky Way, deep-sky, star-trail, target altitude, or filter advice unless the user explicitly asked for that subtype.",
        "Do not mention missing target planning or target-altitude limitations unless the user explicitly asked about a specific target.",
        "When resolved_mode is general, the final answer must explicitly say that if the user names the shooting theme more precisely, the system can re-check with a more purpose-fit mode.",
      ]
      : [];
  const ignoredTargetGuard = ignoredTargetName
    ? [
        `If ignored_target_name is present, say briefly that target-specific altitude planning was unavailable for '${ignoredTargetName}' and keep the answer focused on location/time conditions.`,
      ]
    : [];

  return [
    ...buildReplyContractLines(
      [
        ...generalModeGuard,
        ...ignoredTargetGuard,
        ...(urbanReferenceLine ? [`If urban_reference is not 'n/a', add a short dedicated line near the top that states: ${urbanReferenceLine}.`] : []),
        "In astrophotography or night-sky contexts, if the user says an ambiguous bare Korean time like '오늘 11시' or '내일 11시' without 오전/오후, interpret it as 23:00 local unless they clearly mean morning, daytime, or noon.",
        "The answer should read like a short field report, with one short paragraph or line per section.",
      ],
    ),
    "Use this answer skeleton by default:",
    `판정: ${primaryVerdict}.`,
    `추천 시간: **${bestWindow}**.`,
    `판단 이유: ${reasonFocus} 중심으로 왜 이 시간이 가장 좋은지 설명하고, 사용자가 물은 시간이나 대상이 있다면 그 조건과 ${bestWindow}를 반드시 비교하기. 필요하면 ${timingHint}와 ${riskText}, ${secondaryFactors}를 참고하기.`,
    ...(factorReviewLines.length ? ["조건 요약:", ...factorReviewLines.map((line) => `- ${line}`)] : []),
    ...(trendTable ? ["시간대별 점수 추이:", trendTable] : []),
    `이번 계산에 반영한 요소: ${surveyFactors}.`,
    ...(requiredPreparation ? [`필수 준비물: ${requiredPreparation}.`] : []),
    `숙련자 참고: ${operatorTip}.`,
    "Reference only. Do not expose these labels verbatim to the user:",
    `- purpose_fit: ${purposeFit || "n/a"}`,
    `- best_window: ${bestWindow}`,
    `- primary_verdict: ${primaryVerdict}`,
    `- timing_hint: ${timingHint}`,
    `- reason_focus: ${reasonFocus}`,
    `- survey_factors: ${surveyFactors}`,
    `- urban_reference: ${urbanReferenceLine ?? "n/a"}`,
    `- main_risks: ${riskText}`,
    `- secondary_factors: ${secondaryFactors}`,
    `- requested_mode: ${report?.request_context?.requested_mode ?? "n/a"}`,
    `- resolved_mode: ${report?.request_context?.resolved_mode ?? report?.scores?.active_mode ?? "n/a"}`,
    `- resolution_reason: ${report?.request_context?.resolution_reason ?? "n/a"}`,
    `- shooting_goal: ${report?.request_context?.shooting_goal ?? "n/a"}`,
    `- ignored_target_name: ${report?.request_context?.ignored_target_name ?? "n/a"}`,
    `- operator_tip: ${operatorTip}`,
  ].join("\n").replaceAll("필수 준비물", "필수 고려사항");
}

function buildOutlookToolContent(report) {
  const resolvedMode =
    report?.request_context?.resolved_mode
    ?? report?.summary?.active_mode
    ?? report?.scores?.active_mode
    ?? "general";
  const timezone = getBriefingTimezone(report);
  const blocks = Array.isArray(report?.outlook_blocks) ? report.outlook_blocks : [];
  const firstBlocker = humanizeBlocker(blocks.find((block) => block?.primary_blocker)?.primary_blocker ?? "n/a");
  const verdict = humanizeModeReady(report?.summary?.mode_ready);
  const bestBlock = formatWindowForBriefing(report?.summary?.best_block ?? report?.summary?.best_block_label, timezone);
  const purposeFit = buildPurposeFitLabel(report);
  const reasonFocus = buildReasonFocus(report);
  const surveyFactors = buildSurveyFactorsDetailed(report);
  const requiredPreparation = buildRequiredPreparation(report);
  const operatorTip = buildOperatorTip(report);
  const factorReviewLines = buildFactorReviewLinesDetailed(report, timezone);
  const trendTable = buildOutlookTrendTable(report, timezone);
  const ignoredTargetName = report?.request_context?.ignored_target_name ?? null;
  const generalModeGuard =
    resolvedMode === "general"
      ? [
          "When resolved_mode is general, keep the answer mode-neutral and planning-focused.",
          "Do not turn a general outlook into Milky Way, deep-sky, target-altitude, or filter-specific advice unless the user explicitly asked for that subtype.",
          "Recommend the best general observing block instead of any genre-specific peak.",
          "Do not mention missing target planning or target-altitude limitations unless the user explicitly asked about a specific target.",
          "When resolved_mode is general, the final answer must explicitly say that if the user names the shooting theme more precisely, the system can re-check with a more purpose-fit mode.",
        ]
      : [];
  const ignoredTargetGuard = ignoredTargetName
    ? [
        `If ignored_target_name is present, say briefly that target-specific altitude planning was unavailable for '${ignoredTargetName}' and keep the answer focused on location/time conditions.`,
      ]
    : [];

  return [
    ...buildReplyContractLines(
      [
        ...generalModeGuard,
        ...ignoredTargetGuard,
        "In astrophotography or night-sky contexts, if the user says an ambiguous bare Korean time like '오늘 11시' or '내일 11시' without 오전/오후, interpret it as 23:00 local unless they clearly mean morning, daytime, or noon.",
        "The answer should read like a short field report, with one short paragraph or line per section.",
      ],
    ),
    "Use this answer skeleton by default:",
    `추천 시간: **${bestBlock ?? "가장 높은 outlook block"}**.`,
    `판단 이유: ${reasonFocus} 중심으로 왜 이 planning block이 가장 좋은지 설명하고, 사용자가 물은 날짜나 시간대가 있다면 그 조건과 ${bestBlock ?? "가장 높은 outlook block"}을 반드시 비교하기. 필요하면 ${firstBlocker}와 outlook score를 참고하기.`,
    ...(factorReviewLines.length ? ["조건 요약:", ...factorReviewLines.map((line) => `- ${line}`)] : []),
    ...(trendTable ? ["시간대별 전망 추이:", trendTable] : []),
    `이번 계산에 반영한 요소: ${surveyFactors}.`,
    ...(requiredPreparation ? [`필수 준비물: ${requiredPreparation}.`] : []),
    `숙련자 참고: ${operatorTip}.`,
    "Reference only. Do not expose these labels verbatim to the user:",
    `- purpose_fit: ${purposeFit || "n/a"}`,
    `- overall_outlook_score: ${report?.summary?.overall_outlook_score ?? "n/a"}`,
    `- strongest_blocker: ${firstBlocker}`,
    `- best_block: ${bestBlock ?? "n/a"}`,
    `- reason_focus: ${reasonFocus}`,
    `- survey_factors: ${surveyFactors}`,
    `- requested_mode: ${report?.request_context?.requested_mode ?? "n/a"}`,
    `- resolved_mode: ${report?.request_context?.resolved_mode ?? report?.summary?.active_mode ?? "n/a"}`,
    `- resolution_reason: ${report?.request_context?.resolution_reason ?? "n/a"}`,
    `- shooting_goal: ${report?.request_context?.shooting_goal ?? "n/a"}`,
    `- ignored_target_name: ${report?.request_context?.ignored_target_name ?? "n/a"}`,
    `- operator_tip: ${operatorTip}`,
    `- outlook_blocks: ${blocks.length}`,
  ].join("\n").replaceAll("필수 준비물", "필수 고려사항");
}

function buildLightPollutionToolContent(report) {
  const context = report?.light_pollution_context ?? {};

  return [
    ...buildReplyContractLines([
      "For this tool, give the estimate first and only one caveat unless the user asks for methodology.",
    ]),
    "Quick facts:",
    `- location: ${report?.location?.name ?? "n/a"}`,
    `- estimated_bortle_center: ${context?.estimated_bortle_center ?? "n/a"}`,
    `- estimated_bortle_band: ${context?.estimated_bortle_band ?? "n/a"}`,
    `- zenith_brightness_mpsas: ${context?.equivalent_zenith_brightness_mpsas ?? "n/a"}`,
  ].join("\n");
}

function buildLinksToolContent(links) {
  return [
    ...buildReplyContractLines([
      "For this tool, mention only the recommended link or endpoint unless the user asks for all of them.",
    ]),
    "Quick facts:",
    `- recommended_tool: ${links?.recommended_tool ?? "n/a"}`,
    `- mcp_endpoint: ${links?.mcp_endpoint ?? "n/a"}`,
    `- json_api_url: ${links?.json_api_url ?? "n/a"}`,
    `- json_outlook_api_url: ${links?.json_outlook_api_url ?? "n/a"}`,
  ].join("\n");
}

function buildMethodologyToolContent() {
  return [
    ...buildReplyContractLines([
      "Summarize the method in plain language and avoid a long checklist unless the user asks for it.",
    ]),
    "Quick facts:",
    "- focus: evidence, guardrails, and limits of the light-pollution estimate",
  ].join("\n");
}

function buildScoringModelToolContent() {
  return [
    ...buildReplyContractLines([
      "Explain only the fields needed for the user's question and avoid describing the full schema by default.",
    ]),
    "Quick facts:",
    "- focus: overall score, best window, blockers, and readiness flags first",
  ].join("\n");
}

export {
  buildLinksToolContent,
  buildLightPollutionToolContent,
  buildMethodologyToolContent,
  buildOutlookToolContent,
  buildScoreToolContent,
  buildScoringModelToolContent,
};

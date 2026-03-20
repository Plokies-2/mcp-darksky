export const APP_WIDGET_URI = "ui://widget/mcp-darksky-widget.html";
export const APP_WIDGET_MIME_TYPE = "text/html;profile=mcp-app";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildWidgetScript() {
  return String.raw`
(() => {
  const app = document.getElementById("app");
  let lastSignature = "";

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function pickPayload(source) {
    if (!isPlainObject(source)) {
      return source;
    }
    if (source.structuredContent) return source.structuredContent;
    if (source.toolOutput) return source.toolOutput;
    if (source.output) return source.output;
    if (source.result) return pickPayload(source.result);
    return source;
  }

  function signatureOf(value) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  function formatNumber(value, digits) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toFixed(digits || 1) : "n/a";
  }

  function formatDateTime(value) {
    if (!value) return "n/a";
    const text = String(value);
    return text.length >= 16 ? text.replace("T", " ").replaceAll("Z", " UTC") : text;
  }

  function renderKeyValue(label, value) {
    return '<div class="kv"><div class="kv-label">' + escapeHtml(label) + '</div><div class="kv-value">' + escapeHtml(value) + '</div></div>';
  }

  function renderChips(items) {
    const values = (items || []).filter(Boolean);
    if (!values.length) {
      return '<div class="muted">No items available.</div>';
    }
    return '<div class="chips">' + values.map((item) => '<span class="chip">' + escapeHtml(item) + '</span>').join("") + '</div>';
  }

  function renderScoreReport(report) {
    const scores = report.scores || {};
    const derived = report.derived_recommendations || {};
    const windows = report.window_rankings || {};
    const blockTimeline = report.blocker_timeline || [];
    const location = report.location || {};
    const forecast = report.forecast_time_range || {};
    const pollution = report.light_pollution_context || {};
    const detailResource = report.detail_resource || null;
    const referenceContext = scores.reference_mode_score_context || null;
    const referenceModeScore =
      scores.reference_mode_score !== undefined && scores.reference_mode_score !== null
        ? formatNumber(scores.reference_mode_score)
        : null;
    const primaryVerdict =
      derived.mode_ready === true
        ? "shootable"
        : derived.mode_ready === false
          ? "not recommended"
          : "planning summary available below.";

    return ''
      + '<section class="panel hero">'
      + '<div class="eyebrow">Night sky score</div>'
      + '<h1>' + escapeHtml(location.name || "Requested location") + '</h1>'
      + '<p class="lede">Primary verdict: ' + escapeHtml(primaryVerdict) + '. Overall ' + escapeHtml(formatNumber(scores.overall_score)) + ' with mode score ' + escapeHtml(formatNumber(scores.mode_score)) + (referenceContext && referenceModeScore ? ' (' + escapeHtml(referenceContext.label) + ' ' + escapeHtml(referenceModeScore) + ')' : '') + '.</p>'
      + '<div class="hero-grid">'
      + renderKeyValue("Forecast window", formatDateTime(forecast.start) + ' to ' + formatDateTime(forecast.end))
      + renderKeyValue("Mode", scores.active_mode || report.mode || "general")
      + renderKeyValue("Darkness", scores.darkness_score !== undefined ? formatNumber(scores.darkness_score) : "n/a")
      + renderKeyValue("Cloud", scores.cloud_score !== undefined ? formatNumber(scores.cloud_score) : "n/a")
      + (detailResource ? renderKeyValue("Detail resource", detailResource.uri || "n/a") : '')
      + (referenceContext && referenceModeScore ? renderKeyValue("Urban reference", referenceContext.mode_label + ' ' + referenceModeScore) : '')
      + '</div>'
      + '</section>'
      + '<section class="grid">'
      + '<article class="panel"><div class="section-title">Recommended windows</div>'
      + renderChips((windows.overall_windows || []).slice(0, 3).map((window) => (window.start || "?") + ' - ' + (window.end || "?")))
      + '</article>'
      + '<article class="panel"><div class="section-title">Primary blockers</div>'
      + renderChips(blockTimeline.slice(0, 4).map((item) => (item.time || "?") + ': ' + (item.primary_blocker || "none")))
      + '</article>'
      + '</section>'
      + '<section class="grid two-up">'
      + '<article class="panel"><div class="section-title">Derived recommendations</div><dl class="list">'
      + (derived.mode_ready !== undefined ? '<div><dt>Primary ready</dt><dd>' + escapeHtml(String(derived.mode_ready)) + '</dd></div>' : "")
      + (derived.best_window ? '<div><dt>Best window</dt><dd>' + escapeHtml(derived.best_window) + '</dd></div>' : "")
      + (derived.mode_best_window ? '<div><dt>Mode window</dt><dd>' + escapeHtml(derived.mode_best_window) + '</dd></div>' : "")
      + '</dl></article>'
      + '<article class="panel"><div class="section-title">Light pollution</div><dl class="list">'
      + (pollution.estimated_bortle_center !== undefined ? '<div><dt>Estimated Bortle center</dt><dd>' + escapeHtml(formatNumber(pollution.estimated_bortle_center)) + '</dd></div>' : "")
      + (pollution.equivalent_zenith_brightness_mpsas !== undefined ? '<div><dt>Zenith brightness</dt><dd>' + escapeHtml(formatNumber(pollution.equivalent_zenith_brightness_mpsas)) + '</dd></div>' : "")
      + (pollution.estimated_bortle_band ? '<div><dt>Band</dt><dd>' + escapeHtml(pollution.estimated_bortle_band) + '</dd></div>' : "")
      + '</dl></article>'
      + '</section>';
  }

  function renderFallbackReport(report) {
    const detailPolicy = report.detail_policy || {};
    const recommendedInput = report.recommended_input || {};
    const detailResource = report.detail_resource || null;
    return ''
      + '<section class="panel hero">'
      + '<div class="eyebrow">Night sky score</div>'
      + '<h1>Reduced-detail forecast</h1>'
      + '<p class="lede">' + escapeHtml(report.message || "This report uses the fallback path.") + '</p>'
      + '<div class="hero-grid">'
      + renderKeyValue("Recommended tool", report.recommended_tool || "score_night_sky_outlook")
      + renderKeyValue("Detail level", detailPolicy.detail_level || "reduced")
      + renderKeyValue("Days ahead", detailPolicy.days_ahead !== undefined ? String(detailPolicy.days_ahead) : "n/a")
      + renderKeyValue("Reason", report.reason || "n/a")
      + (detailResource ? renderKeyValue("Detail resource", detailResource.uri || "n/a") : '')
      + '</div>'
      + '</section>'
      + '<section class="grid two-up">'
      + '<article class="panel"><div class="section-title">Recommended input</div><dl class="list">'
      + (recommendedInput.date ? '<div><dt>Date</dt><dd>' + escapeHtml(recommendedInput.date) + '</dd></div>' : "")
      + (recommendedInput.timezone ? '<div><dt>Timezone</dt><dd>' + escapeHtml(recommendedInput.timezone) + '</dd></div>' : "")
      + (recommendedInput.mode ? '<div><dt>Mode</dt><dd>' + escapeHtml(recommendedInput.mode) + '</dd></div>' : "")
      + '</dl></article>'
      + '<article class="panel"><div class="section-title">Policy</div><dl class="list">'
      + (detailPolicy.full_detail_day_limit !== undefined ? '<div><dt>Full detail limit</dt><dd>' + escapeHtml(String(detailPolicy.full_detail_day_limit)) + '</dd></div>' : "")
      + (detailPolicy.max_forecast_day_limit !== undefined ? '<div><dt>Forecast limit</dt><dd>' + escapeHtml(String(detailPolicy.max_forecast_day_limit)) + '</dd></div>' : "")
      + (detailPolicy.reason ? '<div><dt>Note</dt><dd>' + escapeHtml(detailPolicy.reason) + '</dd></div>' : "")
      + '</dl></article>'
      + '</section>';
  }

  function renderOutlookReport(report) {
    const summary = report.summary || {};
    const blocks = report.outlook_blocks || [];
    const windows = report.window_rankings || {};
    const include = report.what_is_included || [];
    const reduced = report.what_is_reduced || [];
    const detailResource = report.detail_resource || null;

    const primaryVerdict =
      summary.mode_ready === true
        ? "shootable"
        : summary.mode_ready === false
          ? "not recommended"
          : "planning summary available below.";

    return ''
      + '<section class="panel hero">'
      + '<div class="eyebrow">Night outlook</div>'
      + '<h1>' + escapeHtml(report.location && report.location.name ? report.location.name : "Requested location") + '</h1>'
      + '<p class="lede">Coarse planning view for ' + escapeHtml(summary.active_mode || "general") + ' mode. Overall outlook score ' + escapeHtml(formatNumber(summary.overall_outlook_score)) + '.</p>'
      + '<div class="hero-grid">'
      + renderKeyValue("Primary verdict", primaryVerdict)
      + renderKeyValue("Block count", String(blocks.length))
      + renderKeyValue("Air quality", include.some((item) => String(item).includes("air quality")) ? "included" : "skipped")
      + renderKeyValue("Detail level", report.detail_policy && report.detail_policy.detail_level ? report.detail_policy.detail_level : "coarse")
      + (detailResource ? renderKeyValue("Detail resource", detailResource.uri || "n/a") : '')
      + '</div>'
      + '</section>'
      + '<section class="grid two-up">'
      + '<article class="panel"><div class="section-title">Outlook blocks</div><div class="stack">'
      + (blocks.length ? blocks.map((block) => '<div class="block"><strong>' + escapeHtml(block.label || "block") + '</strong><span>' + escapeHtml(block.start || "?") + ' - ' + escapeHtml(block.end || "?") + '</span><span>' + escapeHtml(formatNumber(block.average_overall_score)) + ' overall</span></div>').join("") : '<div class="muted">No outlook blocks available.</div>')
      + '</div></article>'
      + '<article class="panel"><div class="section-title">Top windows</div>'
      + renderChips((windows.overall_windows || []).slice(0, 4).map((window) => (window.start || "?") + ' - ' + (window.end || "?")))
      + '<div class="section-title compact">Included</div>'
      + renderChips(include.slice(0, 4))
      + '<div class="section-title compact">Reduced</div>'
      + renderChips(reduced.slice(0, 4))
      + '</article>'
      + '</section>';
  }

  function renderLightPollutionReport(report) {
    const context = report.light_pollution_context || {};
    const location = report.location || {};
    const firstSource = report.source_attribution && report.source_attribution.length ? report.source_attribution[0].provider : "n/a";
    const detailResource = report.detail_resource || null;

    return ''
      + '<section class="panel hero">'
      + '<div class="eyebrow">Light pollution</div>'
      + '<h1>' + escapeHtml(location.name || "Requested location") + '</h1>'
      + '<p class="lede">' + (context.unavailable ? "Estimate unavailable." : "Estimated darkness proxy from local Black Marble inputs.") + '</p>'
      + '<div class="hero-grid">'
      + renderKeyValue("Coordinates", formatNumber(location.latitude, 4) + ', ' + formatNumber(location.longitude, 4))
      + renderKeyValue("Methodology", report.methodology_version || "n/a")
      + renderKeyValue("Resolved from", location.resolved_from || "n/a")
      + renderKeyValue("Source", firstSource)
      + (detailResource ? renderKeyValue("Detail resource", detailResource.uri || "n/a") : '')
      + '</div>'
      + '</section>'
      + '<section class="grid two-up">'
      + '<article class="panel"><div class="section-title">Estimate</div><dl class="list">'
      + (context.estimated_bortle_center !== undefined ? '<div><dt>Bortle center</dt><dd>' + escapeHtml(formatNumber(context.estimated_bortle_center)) + '</dd></div>' : "")
      + (context.estimated_bortle_range ? '<div><dt>Range</dt><dd>' + escapeHtml(context.estimated_bortle_range) + '</dd></div>' : "")
      + (context.equivalent_zenith_brightness_mpsas !== undefined ? '<div><dt>Zenith brightness</dt><dd>' + escapeHtml(formatNumber(context.equivalent_zenith_brightness_mpsas)) + '</dd></div>' : "")
      + (context.equivalent_zenith_brightness_sqm !== undefined ? '<div><dt>SQM</dt><dd>' + escapeHtml(formatNumber(context.equivalent_zenith_brightness_sqm)) + '</dd></div>' : "")
      + '</dl></article>'
      + '<article class="panel"><div class="section-title">Notes</div><p class="muted">' + escapeHtml(context.error || "Presentation-layer estimate only.") + '</p>'
      + renderChips((report.source_attribution || []).map((item) => item.provider))
      + '</article>'
      + '</section>';
  }

  function renderRawJson(value) {
    return '<section class="panel hero"><div class="eyebrow">Tool output</div><h1>Raw JSON fallback</h1><p class="lede">The payload shape is not one of the known report types, so the widget is showing the raw result.</p></section><section class="panel"><pre>' + escapeHtml(JSON.stringify(value, null, 2)) + '</pre></section>';
  }

  function renderFromPayload(payload) {
    const normalized = pickPayload(payload);
    const signature = signatureOf(normalized);
    if (signature === lastSignature) return;
    lastSignature = signature;

    if (!app) return;

    if (!isPlainObject(normalized)) {
      app.innerHTML = renderRawJson(normalized);
      return;
    }

    if (normalized.report_kind === "fallback_required") {
      app.innerHTML = renderFallbackReport(normalized);
      return;
    }

    if (normalized.report_kind === "outlook" || isPlainObject(normalized.summary)) {
      app.innerHTML = renderOutlookReport(normalized);
      return;
    }

    if (isPlainObject(normalized.light_pollution_context) || normalized.methodology_version) {
      app.innerHTML = renderLightPollutionReport(normalized);
      return;
    }

    if (isPlainObject(normalized.scores) || isPlainObject(normalized.derived_recommendations)) {
      app.innerHTML = renderScoreReport(normalized);
      return;
    }

    app.innerHTML = renderRawJson(normalized);
  }

  function ingest(event) {
    const data = event && event.data;
    if (!data || typeof data !== "object") return;
    const candidate = data.toolOutput || data.output || data.result || data.payload || data;
    if (data.type && !String(data.type).includes("tool") && !String(data.type).includes("result")) return;
    renderFromPayload(candidate);
  }

  function bootstrap() {
    const host = window.openai || {};
    if (host.toolOutput) {
      renderFromPayload(host.toolOutput);
    } else if (host.widgetState) {
      renderFromPayload(host.widgetState);
    } else {
      app.innerHTML = '<section class="panel hero"><div class="eyebrow">mcp-darksky</div><h1>Awaiting tool output</h1><p class="lede">This widget will update when ChatGPT delivers a tool result.</p></section><section class="panel"><div class="muted">If the host exposes a payload later, the view will switch automatically.</div></section>';
    }
  }

  window.addEventListener("message", ingest);
  bootstrap();

  let ticks = 0;
  const timer = window.setInterval(() => {
    ticks += 1;
    const host = window.openai || {};
    if (host.toolOutput) {
      renderFromPayload(host.toolOutput);
      window.clearInterval(timer);
    } else if (ticks > 20) {
      window.clearInterval(timer);
    }
  }, 250);
})();
  `;
}

export function buildAppWidgetPage({
  title = "mcp-darksky",
  widgetUri = APP_WIDGET_URI,
  widgetMimeType = APP_WIDGET_MIME_TYPE,
} = {}) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <meta name="widget-uri" content="${escapeHtml(widgetUri)}" />
    <meta name="widget-mime-type" content="${escapeHtml(widgetMimeType)}" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        --bg: #07111d;
        --bg-2: #0d1a2b;
        --panel: rgba(10, 18, 31, 0.84);
        --panel-border: rgba(164, 195, 255, 0.14);
        --text: #edf4ff;
        --muted: #9db0cb;
        --accent: #86bfff;
        --accent-2: #c7f08d;
        --shadow: 0 22px 70px rgba(0, 0, 0, 0.35);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(134, 191, 255, 0.16), transparent 26%),
          radial-gradient(circle at 78% 8%, rgba(199, 240, 141, 0.08), transparent 18%),
          linear-gradient(180deg, var(--bg) 0%, var(--bg-2) 100%);
        font-family: Inter, "Segoe UI", system-ui, sans-serif;
      }
      .page {
        width: min(1080px, calc(100% - 24px));
        margin: 0 auto;
        padding: 18px 0 24px;
      }
      .panel {
        border: 1px solid var(--panel-border);
        background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.03)), var(--panel);
        border-radius: 22px;
        padding: 18px;
        box-shadow: var(--shadow), inset 0 1px 0 rgba(255, 255, 255, 0.03);
        backdrop-filter: blur(16px);
      }
      .hero {
        position: relative;
        overflow: hidden;
        margin-bottom: 14px;
      }
      .hero::after {
        content: "";
        position: absolute;
        inset: auto -10% -40% auto;
        width: 18rem;
        height: 18rem;
        background: radial-gradient(circle, rgba(134, 191, 255, 0.12), transparent 65%);
        pointer-events: none;
      }
      .eyebrow {
        color: var(--accent);
        text-transform: uppercase;
        letter-spacing: 0.12em;
        font-size: 11px;
        font-weight: 700;
      }
      h1 {
        margin: 10px 0 8px;
        font-size: clamp(28px, 4vw, 46px);
        line-height: 1;
        letter-spacing: -0.05em;
      }
      .lede {
        margin: 0;
        color: var(--muted);
        line-height: 1.6;
      }
      .hero-grid,
      .grid {
        display: grid;
        gap: 12px;
      }
      .hero-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        margin-top: 16px;
      }
      .two-up {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        margin-top: 12px;
      }
      .section-title {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        color: var(--muted);
        margin-bottom: 10px;
      }
      .section-title.compact {
        margin-top: 14px;
      }
      .kv {
        display: grid;
        gap: 5px;
        padding: 14px 15px;
        border-radius: 18px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.06);
      }
      .kv-label {
        color: var(--muted);
        font-size: 12px;
      }
      .kv-value {
        font-weight: 650;
        line-height: 1.4;
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .chip {
        display: inline-flex;
        align-items: center;
        min-height: 30px;
        padding: 0 11px;
        border-radius: 999px;
        border: 1px solid rgba(134, 191, 255, 0.18);
        background: rgba(134, 191, 255, 0.08);
        color: var(--text);
        font-size: 13px;
      }
      .stack {
        display: grid;
        gap: 10px;
      }
      .block {
        display: grid;
        gap: 4px;
        padding: 12px 14px;
        border-radius: 16px;
        background: rgba(255,255,255,0.04);
      }
      .block strong {
        font-size: 14px;
      }
      .list {
        display: grid;
        gap: 10px;
        margin: 0;
      }
      .list div {
        display: grid;
        gap: 4px;
        padding: 12px 14px;
        border-radius: 16px;
        background: rgba(255,255,255,0.04);
      }
      dt {
        color: var(--muted);
        font-size: 12px;
      }
      dd {
        margin: 0;
        font-weight: 650;
      }
      .muted {
        color: var(--muted);
        line-height: 1.65;
      }
      pre {
        margin: 0;
        overflow: auto;
        padding: 4px 2px 0;
        white-space: pre-wrap;
        word-break: break-word;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 12px;
        line-height: 1.6;
        color: #dbe7fb;
      }
      @media (max-width: 820px) {
        .hero-grid,
        .two-up {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <div id="app" aria-live="polite"></div>
    </main>
    <script>${buildWidgetScript()}</script>
  </body>
</html>`;
}

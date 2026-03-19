const METHODOLOGY = {
  version: "2026-03-19-continuous-bortle-v2-korea-calibrated",
  summary:
    "Continuous Bortle-like proxy derived from annual NASA Black Marble radiance percentiles across the Republic of Korea, with a Korea-specific display calibration benchmarked against LightPollutionMap.info and an uncertainty interval widened by sensor disagreement, radiance variability, and quality flags.",
  outputs: {
    estimated_bortle_center:
      "Continuous Bortle-like center on the 1-9 scale. This is an estimated proxy, not an official measured Bortle class.",
    estimated_bortle_range:
      "Estimated low/high interval on the Bortle-like scale. Wider intervals indicate weaker confidence or stronger local variability.",
    radiance_percentile:
      "Relative percentile of the local annual snow-free radiance within merged Korea land pixels from VNP46A4 and VJ146A4.",
    confidence:
      "Qualitative confidence derived from uncertainty width, sensor disagreement, and Black Marble quality indicators.",
  },
  evidence_sources: [
    {
      id: "falchi2016",
      citation: "Falchi et al. (2016), The new world atlas of artificial night sky brightness.",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4928945/",
      role: "Canonical VIIRS-based artificial sky brightness reference and interpretation anchor.",
    },
    {
      id: "duriscoe2018",
      citation: "Duriscoe et al. (2018), A simplified model of all-sky artificial sky glow derived from VIIRS Day/Night band data.",
      url: "https://repository.library.noaa.gov/view/noaa/21007/noaa_21007_DS1.pdf",
      role: "Supports deriving continuous sky-quality indicators from VIIRS radiance instead of relying on a purely categorical class.",
    },
    {
      id: "barentine2022",
      citation: "Barentine (2022), Night sky brightness measurement, quality assessment and monitoring.",
      url: "https://www.nature.com/articles/s41550-022-01756-2",
      role: "Frames the distinction between subjective Bortle classes and objective measured night-sky brightness metrics.",
    },
    {
      id: "hung2022",
      citation: "Hung (2022), Identifying distinct metrics for assessing night sky brightness.",
      url: "https://academic.oup.com/mnras/article/511/4/5683/6374878",
      role: "Supports treating Bortle as correlated with, but not identical to, quantitative sky-brightness metrics.",
    },
    {
      id: "zheng2025",
      citation: "Zheng et al. (2025), Machine-Learning-Based Monitoring of Night Sky Brightness Using Sky Quality Meters and Multi-Source Remote Sensing.",
      url: "https://www.mdpi.com/2072-4292/17/8/1332",
      role: "Supports uncertainty-aware modeling and the importance of multi-factor interpretation.",
    },
    {
      id: "lightpollutionmap2025",
      citation: "LightPollutionMap.info, Sky Brightness (2025) point-inspection panel.",
      url: "https://www.lightpollutionmap.info/",
      role: "Provides the Korean user-expectation benchmark used to calibrate the Bortle-like display curve without altering the raw radiance layers.",
    },
  ],
  mapping_strategy: [
    "Use annual snow-free Black Marble radiance as the stable baseline signal.",
    "Apply the same Republic-of-Korea boundary, quality==0, observations>=4, and land-only gates to both corpus building and live point sampling.",
    "Use a skew-aware robust local radiance in the 1.5 km window so tunnel roads or a few bright pixels do not dominate dark mountain sites.",
    "Use a robust regional glow context in the 5 km and 20 km windows so a few bright outliers do not over-inflate surrounding glow.",
    "Transform local radiance into a Korea-relative percentile in log space to avoid overreacting to the long bright-tail distribution.",
    "Map percentile anchors onto a continuous 1-9 Bortle-like axis using a Korea-specific display curve tuned against a small LightPollutionMap.info benchmark table.",
    "Apply only a modest bounded regional glow adjustment when the surrounding 20 km radiance is much brighter than the local pixel.",
    "Defer DEM or terrain-shielding corrections until benchmark residuals show a repeated terrain-driven bias that the simpler calibration layers cannot explain.",
  ],
  uncertainty_sources: [
    "VNP46A4 and VJ146A4 sensor disagreement at the same coordinate.",
    "Local radiance variability from the Black Marble standard-deviation layer.",
    "Observation-count weakness and non-good quality fractions in the local window.",
    "Regional glow dominance, which makes zenith-only interpretation less certain for field observers.",
    "Known literature caveats including spectral mismatch, aerosol effects, and LED under-response in VIIRS-derived products.",
  ],
  guardrails: [
    "Never present the output as an official or measured Bortle class.",
    "Keep user-facing wording on 'estimated', 'proxy', or 'Bortle-like'.",
    "Treat the continuous center and range as an interpretation layer over annual radiance, not as direct SQM replacement.",
    "Require citations and release checks to stay attached to the methodology for future changes.",
    "Do not add terrain shielding just because mountain sites exist; add it only after benchmark evidence shows it is the next real bottleneck.",
  ],
  release_checks: [
    "Run the light-pollution unit tests and smoke tests on representative urban and dark-sky coordinates.",
    "Verify the methodology document and citations still match the implemented fields.",
    "Confirm uncertainty intervals widen when data quality degrades or sensor disagreement rises.",
    "Confirm all public API and MCP descriptions still use estimated wording.",
  ],
};

export function getLightPollutionMethodology() {
  return JSON.parse(JSON.stringify(METHODOLOGY));
}

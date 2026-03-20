# Light-Pollution Estimator Execution-Monitoring Guide

## Scope
This guide covers:
- `estimate_light_pollution` MCP tool
- `describe_light_pollution_method` MCP tool
- `GET /api/light-pollution`
- `GET /api/light-pollution/method`

## Evidence sources
- Primary annual radiance source: NASA Black Marble `VNP46A4` and `VJ146A4`
- Distribution domain: Republic of Korea boundary mask only
- Geocoder/context source: Kakao Local for `place_query`
- Review references:
  - Falchi et al. (2016)
  - Duriscoe et al. (2018)
  - Barentine (2022)
  - Hung (2022)
  - Zheng et al. (2025)

For every release, capture:
- source product year and version
- output artifact checksum
- statistics file checksum
- artifact provenance or storage record

## Execution process
1. Load the prepared Korea-ready runtime artifact and supporting stats bundle.
2. Validate bounds, pixel counts, nodata handling, and threshold generation.
3. Sample runtime coordinates from the prepared artifact.
4. Derive:
   - local radiance
   - regional context
   - continuous estimated Bortle-like center
   - estimated Bortle-like range
   - equivalent zenith brightness proxy
   - confidence
5. Expose the result with explicit estimated wording and methodology metadata.

## Monitoring goals
- Catch broken or stale source artifacts.
- Catch accidental changes that overclaim the science.
- Catch regressions where uncertainty no longer widens under low-quality inputs.
- Keep evidence sources attached to every public method description.

## Automated validation checks
- Artifact and stats file load successfully.
- Urban coordinates remain brighter than dark-sky coordinates.
- Estimated center always lies inside the estimated range.
- Range width is positive and finite.
- Higher radiance never yields a darker Bortle-like center.
- Methodology metadata still cites core papers and guardrails.
- Public wording still says estimated or Bortle-like, not measured or official.

## Human review checklist
- Does the change stay on a continuous proxy first and a categorical interpretation second?
- Does it avoid claiming an official Bortle class?
- Does it note VIIRS spectral and atmospheric limitations?
- Does it widen uncertainty when sensor disagreement, low counts, or high variability appear?
- Does it keep the methodology endpoint and document in sync with the implementation?

## Release gates
1. `npm test`
2. Confirm the runtime artifact and stats files are the intended release inputs
3. Manual smoke on at least:
   - one bright urban site
   - one dark rural or mountain site
   - one invalid-input case
4. Review `GET /api/light-pollution/method` or `describe_light_pollution_method`
5. Confirm all user-facing labels still say estimated or Bortle-like

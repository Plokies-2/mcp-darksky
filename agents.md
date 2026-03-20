# Agent Notes

## Korean Encoding Rules

- Treat PowerShell terminal output as potentially unreliable for Korean text. `Get-Content` and inline script output may show mojibake even when the file itself is valid UTF-8.
- When Korean text looks broken in terminal output, do not assume the file is corrupted. Verify with tests, targeted file reads, or a browser/rendered page before rewriting content.
- Prefer `apply_patch` for Korean text edits and keep files in UTF-8. Avoid shell pipelines that rewrite files through unknown encodings.
- If `apply_patch` fails because the surrounding Korean text is mojibake in terminal output, patch around stable ASCII anchors such as function names, schema keys, import lines, or nearby English strings instead of trying to match the broken Hangul literally.
- When inspecting a Korean-heavy file, prefer short line-numbered reads, targeted `rg` searches, tests, or rendered HTML over broad copy-paste from terminal output. Do not use mojibake terminal text as the source of truth for replacements.
- Before concluding that a Korean prompt, README, or UI string is actually broken, cross-check with a browser page, widget render, or application response. We previously hit false alarms where the terminal view was broken but the file and rendered output were correct.
- Do not mass-rewrite Korean strings just to "normalize" terminal-visible mojibake. Only edit the exact phrase that needs to change, and verify the rendered result afterward.
- When updating tests that include Korean text, favor stable structural assertions, English control strings, or semantic markers where possible so terminal encoding noise does not cause unnecessary churn.
- When passing Korean strings through inline PowerShell or Node snippets, prefer Unicode escape sequences like `\uC548\uBC18\uB370\uAE30` instead of raw Hangul literals.
- For matching or assertions in tests, prefer stable semantic checks over terminal-visible Korean output when possible.
- If a prompt page or README contains Korean and the terminal view is suspicious, verify the rendered HTML or application response rather than trusting console glyphs.
- Keep environment variable names ASCII-only. Do not encode Korean labels into `.env` keys or shell variable names.

## LightPollutionMap.info Benchmark Workflow

- Use `Light pollution map` only as a user-expectation benchmark for display calibration. Do not describe it as scientific ground truth.
- Always benchmark against the `Sky Brightness` overlay and record the year shown in the panel. Current workflow used `Sky Brightness (2025)`.
- Prefer coordinate search over place-name search inside the site.
  - Enter coordinates as `lat, lon` in the top search box.
  - This is more stable than Korean place names and avoids search ambiguity.
- Reliable extraction path:
  1. Open [LightPollutionMap.info](https://www.lightpollutionmap.info/).
  2. Search exact coordinates in `lat, lon` format.
  3. Wait for the `Zenith (Sky brightness) info (...)` panel to appear.
  4. Read and store:
     - `Coordinates`
     - `SQM`
     - `Brightness`
     - `Artif. bright.`
     - `Ratio`
     - `Bortle`
     - `Elevation`
- For Playwright/browser automation, the point-inspection panel can be parsed from the text block that contains `Zenith (Sky brightness) info`.
  - Useful regexes:
    - `SQM\\s+([0-9.]+)`
    - `Brightness\\s+([0-9.]+)`
    - `Artif\\. bright\\.\\s+([0-9.]+)`
    - `Ratio\\s+([0-9.]+)`
    - `Bortle\\s+class\\s+([0-9\\-]+)`
    - `Elevation\\s+([0-9.]+)`
- The site produces a lot of ad/console noise. Ignore unrelated console errors unless they block the point-inspection panel itself.
- When collecting Korean benchmark points, resolve the place with Kakao first if needed, then benchmark by coordinates on LightPollutionMap.info.
- Store benchmark data in [`data/lightpollutionmap-korea-benchmarks.json`](/Users/song7/Desktop/school/2026-1/projects/mcp_darksky/data/lightpollutionmap-korea-benchmarks.json).
- If the site shows categorical `Bortle 8-9` instead of a single number, keep the raw label and choose a `target_display_bortle_center` separately for our display calibration.
- Keep the calibration presentation-layer only.
  - Do not rewrite raw Black Marble radiance to match `.info`.
  - Do not claim the benchmark proves the physical correctness of the radiance model.

## Terrain-Model Decision Rule

- Do not add DEM / terrain shielding by default just because Korean dark sites are mountainous.
- First check benchmark residuals against the current Korean benchmark set.
  - If display-center residuals are still mostly small (roughly `<= 0.3`) and not clearly one-sided by terrain, terrain shielding is probably not the next bottleneck.
- Prefer these lower-cost fixes first:
  - anchor recalibration
  - local skew-aware robust radiance
  - robust regional glow context
  - benchmark-table expansion
- Only revisit DEM when at least one of these becomes true:
  - mountain dark sites repeatedly show the same one-sided bias
  - the benchmark set grows and terrain-correlated error still remains
  - the estimator is being upgraded from a heuristic Bortle-like proxy to a fuller zenith sky-brightness propagation model

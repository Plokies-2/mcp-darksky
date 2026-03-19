# Agent Notes

## Korean Encoding Rules

- Treat PowerShell terminal output as potentially unreliable for Korean text. `Get-Content` and inline script output may show mojibake even when the file itself is valid UTF-8.
- When Korean text looks broken in terminal output, do not assume the file is corrupted. Verify with tests, targeted file reads, or a browser/rendered page before rewriting content.
- Prefer `apply_patch` for Korean text edits and keep files in UTF-8. Avoid shell pipelines that rewrite files through unknown encodings.
- When passing Korean strings through inline PowerShell or Node snippets, prefer Unicode escape sequences like `\uC548\uBC18\uB370\uAE30` instead of raw Hangul literals.
- For matching or assertions in tests, prefer stable semantic checks over terminal-visible Korean output when possible.
- If a prompt page or README contains Korean and the terminal view is suspicious, verify the rendered HTML or application response rather than trusting console glyphs.
- Keep environment variable names ASCII-only. Do not encode Korean labels into `.env` keys or shell variable names.

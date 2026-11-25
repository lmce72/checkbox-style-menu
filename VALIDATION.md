# Checkbox Style Menu 1.3.1

## Changes

- Share the existing themed menu between Live Preview and Reading view through `CheckboxMenuHost`; no second menu implementation.
- Track the document position of a held checkbox and resolve its current DOM input when the long-press timer fires.
- Dismiss menus and remove overlays when the editor document changes or its view is destroyed.
- Guard asynchronous menu rendering after dismissal and release the Markdown render child with its menu.
- Keep menu gestures from reaching the underlying editor, support clicks after long-press release, and add Enter/Space/Escape handling.
- Resolve Reading-view task locations with section metadata and `data-line`; reject stale writes instead of guessing among identical task descriptions. Use an open editor when available, otherwise use atomic `Vault.process`.
- Accept `-`, `*`, `+`, ordered `.`/`)`, nested, and blockquoted task markers. Only change the marker character.
- Keep the existing published plugin ID and upstream attribution. The minimum Obsidian version is 1.1.0 because `Vault.process` was introduced in that API version.

## Checks on 2026-11-25

Environment: Linux desktop, Obsidian 1.15.1, independent empty vault, independent user-data directory, loopback CDP through chrome-devtools-mcp. No automatic checkbox tests were run against the personal vault.

- `npm run build`: passed.
- `npm run lint`: passed.
- `npm test`: 18 parser and marker-preservation cases passed.
- Synthetic fixture with only this plugin: 12 editor interaction cases, 6 Reading-view task mappings, and 2 lifecycle cases passed.
- Integration fixture with Multistate Checkboxes 1.0.9 and Tasks 8.6.0: the 12 editor interaction cases and 6 Reading-view task mappings passed.
- A disposable copy of a local long note (31,743 characters, 294 tasks), with the user's checkbox settings and relevant Tasks state/date settings: both reported sequences passed with right-click and long-press. The first checkbox was clicked twice before selecting Important either on that checkbox or the next one. Actual Markdown symbols were checked, including `[x]` → `[!]`. Reading-view right-click and long-press writes were also checked.
- Original 1.3.0 reproduced a stale menu/overlay after an editor document edit; 1.3.1 dismissed it. A forced input-node replacement during a hold also passed in the repaired build.

## Repeating the runtime checks

`tests/runtime-regression.cjs` exports a self-contained async function `(app, scenario)` for `editor`, `reading`, and `lifecycle`. It requires an isolated vault with `checkbox-style-test-` in its path, creates only synthetic fixtures there, and can be serialized with `Function.toString()` into a chrome-devtools-mcp `evaluate_script` call. First verify the runtime vault's absolute path. Install the built plugin before each comparison and enable companion plugins as needed.

Runtime tests replay DOM press/release/click events and inspect saved Markdown. Offscreen rendering was advanced explicitly where the isolated window did not receive animation frames. This is not evidence of physical mouse or touch-device testing.

## Remaining limits

- The user's original intermittent two-click failure did not reproduce consistently in 1.3.0 under event replay. The repaired build passed the supplied sequences and fixes independently reproducible stale-state failures; feedback from normal use remains necessary.
- No physical mobile-device or floating-window verification; no runtime checks on Obsidian 1.1.0 itself.
- Dynamically generated Tasks-query results are intentionally excluded from Reading-view mapping; edit their source tasks instead.
- Existing Tasks date/custom-status caveats still apply. Custom cycles in Reading view have not had physical pointer/keyboard validation.
- Existing npm dependency audit findings were not addressed by this focused fix.

# Chat History

## 2026-04-11 - FE/Processing Stability + Card UX hardening

- Fixed FE proposal card assembly to use current-turn proposal calls only and stabilized rationale/source mapping.
- Deduped workflow `tool_executed` event persistence by call ID to prevent duplicate lifecycle artifacts.
- Hardened FE UI rendering against malformed persisted `ui` payloads causing runtime crashes.
- Added FE left-pane card dedupe to suppress duplicate lifecycle cards.
- Improved FE apply error UX by showing structured status cards with clean backend error text.
- Added targeted regression tests across backend/frontend for proposal slicing, dedupe, hydrate sanitization, and error rendering.

### Commit pattern

- Applied one-file-per-commit for all touched files in this change set.

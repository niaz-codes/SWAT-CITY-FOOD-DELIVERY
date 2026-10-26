# Duplicate Code Removal Guide (for AI agents)

## Goal

Remove duplicated code without changing behaviour.

## Procedure

1. **Search** for repeated logic: similar function names, copy-pasted widgets/layouts, repeated API calls, repeated validation, repeated currency/date formatting.
2. **Group** duplicates and pick one canonical implementation (best tested, most general).
3. **Move** it to `/common` (or the owning feature module).
4. **Replace** all copies with imports/calls to the canonical version.
5. **Delete** dead code and unused imports, files, assets, and layouts.
6. **Run** build + tests after each group. Commit separately.

## Typical duplicates to look for

- Price/currency formatting (Rs. 1,200)
- Phone/email validation
- API client setup, headers, error handling
- Order status labels and colours
- Restaurant card / menu item card UI
- Loading / empty / error views
- Payment method selection UI and logic
- Duplicate XML layouts or styles (Android) / repeated widgets (Flutter)

## Do NOT

- Merge code that only looks similar but has different business meaning.
- Refactor payment/auth logic without tests.
- Change public API contracts silently.

## Report format

After cleanup, list: files removed, functions merged, files changed, and tests run.

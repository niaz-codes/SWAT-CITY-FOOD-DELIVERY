# Coding Standards

- Meaningful names; one responsibility per class/function.
- Max ~40 lines per function; max ~300 lines per file where possible.
- No magic numbers/strings: put them in `constants`.
- Strings go in localisation files (English/Urdu).
- Handle loading, empty, and error states on every screen.
- Catch errors at the service layer; show friendly messages.
- Comments explain WHY, not WHAT.
- Commits: `feat:`, `fix:`, `refactor:`, `docs:`.
- Branches: `feature/<name>`, `fix/<name>`.

# CLAUDE.md

## Pull requests

- Open PRs as drafts. Once there are no more tests you want to run on a PR (CI is green and
  nothing else needs verifying), mark it ready for review without waiting to be asked.

## Delegating work

- When a task is worth splitting up or handing off, prefer nested workers (subagents started from within
  the current session) over creating new sessions. Start a separate session only when a nested worker
  can't do the job or the user asks for one.

## CI

- A pull request that changes only documentation (Markdown files, anything under `docs/`) or only
  comments and whitespace in C/C++ files skips the macOS build, the visual tests and the unit tests; their
  jobs show as "skipped". `Check: Needs build` (`.github/workflows/check_needs_build.yml`) decides, using
  `buildscripts/ci/tools/needs_build.py`. Comment changes in other file types (QML, CMake, scripts) still
  build, and so does a run that is started by hand.

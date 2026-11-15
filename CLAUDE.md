# CLAUDE.md

## Pull requests

- Open PRs as drafts. Once there are no more tests you want to run on a PR (CI is green and
  nothing else needs verifying), mark it ready for review without waiting to be asked.

## Delegating work

- When a task is worth splitting up or handing off, prefer nested workers (subagents started from within
  the current session) over creating new sessions. Start a separate session only when a nested worker
  can't do the job or the user asks for one.

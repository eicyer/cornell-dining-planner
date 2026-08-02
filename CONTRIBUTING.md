# Commit conventions

- **Author**: all commits are authored as `eicyer <124095333+eicyer@users.noreply.github.com>`. This repo has a local `user.name`/`user.email` git config override already set, so a plain `git commit` in this checkout uses it automatically — no need to pass `--author` by hand. If you're on a different clone/machine, set the same local override before committing (don't touch global git config for it).
- **Commit often.** Small, incremental commits as work actually progresses — not one giant batched commit at the end of a session.
- **Title**: a short, descriptive summary line in imperative mood (e.g. "Add USDA nutrition lookup to enrichment pipeline", not "added stuff" or "wip").
- **Body**: a few short bullet points describing what changed and, where it's not obvious from the diff, why. Skip the body for genuinely trivial commits.

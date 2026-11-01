# Commit conventions

- **Author**: all commits are authored as `eicyer <124095333+eicyer@users.noreply.github.com>`. This repo has a local `user.name`/`user.email` git config override already set, so a plain `git commit` in this checkout uses it automatically — no need to pass `--author` by hand. If you're on a different clone/machine, set the same local override before committing (don't touch global git config for it).
- **Commit often.** Small, incremental commits as work actually progresses — not one giant batched commit at the end of a session.
- **Title**: a short, descriptive summary line in imperative mood (e.g. "Add USDA nutrition lookup to enrichment pipeline", not "added stuff" or "wip").
- **Body**: a few short bullet points describing what changed and, where it's not obvious from the diff, why. Skip the body for genuinely trivial commits.

# Pre-commit hook (optional)

`.githooks/pre-commit` runs the frontend typecheck (`npm run typecheck`, the same command CI runs) when a commit stages frontend TypeScript, `tsconfig.json` or `package.json`. It's opt-in per clone:

```bash
git config core.hooksPath .githooks
```

It needs `frontend/node_modules` (`npm ci`) and Node 22.13+. Backend- and docs-only commits skip it. Use `git commit --no-verify` to bypass it once. CI is still the real gate.

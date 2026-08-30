---
name: full-code-review
description: Three-axis review of the diff since a fixed point — Standards (repo conventions + Fowler smell baseline), Spec (does it match the relevant ADR/issue), and Invariants (this project's specific architecture rules from CLAUDE.md — nutrition-per-100g, LLM-never-adjusts-numbers, Soft-Preference-never-filters, USDA-match-no-reestimate, server-recomputes-nutrition, AYCE-only scope). Runs all three as parallel sub-agents. Use before merging backend meal-crafting/nutrition/preference changes, or whenever asked for a full code review of this repo.
tools: Read, Grep, Glob, Bash, Agent
model: opus
---

You review the diff between `HEAD` and a fixed point the caller supplies, along three independent axes, and report them side by side without merging or reranking findings across axes. This is the standard two-axis `code-review` process (Standards + Spec) plus a third axis specific to this repo (Invariants).

## 1. Pin the fixed point

Whatever the caller said is the fixed point — a commit SHA, branch, tag, `main`, `HEAD~5`. If none was given, use `main`.

Capture once: `git diff <fixed-point>...HEAD` (three-dot, against the merge-base) and `git log <fixed-point>..HEAD --oneline`. Confirm the ref resolves (`git rev-parse <fixed-point>`) and the diff is non-empty before spawning anything — a bad ref should fail here, not inside three parallel sub-agents.

## 2. Identify the spec source

This repo has no issue tracker integration — its spec is `docs/adr/`. In order:

1. An ADR under `docs/adr/` whose title/content matches the files or concepts touched by the diff (grep `docs/adr/` for the touched module names — e.g. a diff touching `meal_crafting.py` maps to `0003`/`0008`; `preference_scoring.py`/`preference_parsing.py` maps to `0009`/`0011`; `usda.py`/`llm_enrichment.py` maps to `0001`/`0002`).
2. A path the caller passed explicitly.
3. Issue references in the commit messages, if any.
4. If nothing is found, note that and let the Spec sub-agent report "no spec available" rather than guessing.

## 3. Identify the standards sources

`CLAUDE.md`, `CONTRIBUTING.md`, `CONTEXT.md` (domain-term usage counts as a standard here). Read `CLAUDE.md` now — you need its "Architecture invariants" section verbatim for step 5.

On top of whatever's documented, the Standards axis always carries this fixed smell baseline (Fowler, _Refactoring_ ch.3) — paste it into that sub-agent's prompt in full, it has no other access to it:

- **Mysterious Name** — a function/variable/type whose name doesn't reveal what it does or holds. → rename it; if no honest name comes, the design's murky.
- **Duplicated Code** — the same logic shape appears in more than one hunk or file. → extract the shared shape, call it from both.
- **Feature Envy** — a method reaching into another object's data more than its own. → move the method onto the data it envies.
- **Data Clumps** — the same few fields/params keep travelling together. → bundle them into one type.
- **Primitive Obsession** — a primitive/string standing in for a domain concept that deserves its own type. → give the concept its own small type.
- **Repeated Switches** — the same switch/if-cascade on the same type recurs across the change. → replace with polymorphism, or one shared map.
- **Shotgun Surgery** — one logical change forces scattered edits across many files. → gather what changes together into one module.
- **Divergent Change** — one file/module is edited for several unrelated reasons. → split so each module changes for one reason.
- **Speculative Generality** — abstraction/params/hooks added for needs the spec doesn't have. → delete it; inline back until a real need shows.
- **Message Chains** — long `a.b().c().d()` navigation the caller shouldn't depend on. → hide the walk behind one method.
- **Middle Man** — a class/function that mostly just delegates onward. → cut it, call the real target direct.
- **Refused Bequest** — a subclass/implementer that ignores or overrides most of what it inherits. → drop the inheritance, use composition.

Two rules: a documented repo standard always overrides a baseline smell it endorses; every baseline smell is a judgement call (never a hard violation), while a documented-standard breach can be a hard violation. Skip anything tooling already enforces (lint, typecheck).

## 4. Spawn three sub-agents in parallel

Send a single message with three `Agent` tool calls, `general-purpose` for all three.

**Standards** — give it: the diff command + commit list, the standards-source files found in step 3, the smell baseline pasted in full. Brief: "Report, per file/hunk where relevant: (a) every place the diff violates a documented standard, citing the standard (file + rule); (b) any baseline smell spotted, named and quoted. Mark documented-standard breaches as possible hard violations; baseline smells are always judgement calls. Skip anything tooling enforces. Under 400 words."

**Spec** — give it: the diff command + commit list, the path/contents of the ADR(s) or issue found in step 2. Brief: "Report: (a) requirements the ADR's decision calls for that are missing or partial; (b) behavior in the diff not called for anywhere (scope creep); (c) requirements that look implemented but wrong. Quote the ADR line for each finding. If no spec source was found, say so and stop. Under 400 words."

**Invariants** — give it: the diff command + commit list, the exact "Architecture invariants" section text you read from `CLAUDE.md` in step 3, pasted in full. Brief: "This project has six architecture invariants (below). For each one that's actually relevant to the files touched by this diff, check whether the diff violates it — quote the hunk. Do not report on invariants whose files/modules aren't touched; say plainly if none apply. These are correctness rules, not style — treat any violation as a hard finding, not a judgement call. Under 400 words.\n\n<paste the invariants section here>"

## 5. Aggregate

Report the three sub-agent outputs verbatim (lightly cleaned) under `## Standards`, `## Spec`, `## Invariants` headings. Do not merge, rerank, or resolve conflicts across axes — a change can cleanly pass one axis and fail another, and collapsing them hides that.

End with one line per axis: finding count and the worst issue in that axis, if any. Do not pick one overall winner across axes.

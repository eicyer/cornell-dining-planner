# Editorial for a tracker: three bounded exceptions, tap-not-swipe rows, bars not rings

The tracking pivot (wayfinder map #49) copies MyFitnessPal's *layout* but keeps the Editorial identity of `frontend/Design.md` (ticket #62). The pivot's builds (ADRs 0023–0032) already needed things Design.md's "Don't do this" list forbids or doesn't cover: a pinned summary that content scrolls under, bottom trays, an ink rule to start a section, and rows denser than a menu card. Each was handled locally in code. This ADR makes them explicit rules, so the next screen doesn't relax them further by accident.

## Decision

`frontend/Design.md` gets a **Tracker exceptions** list, the only relaxations of its rules:

1. **Pinned surfaces** (`CalorieSummary`, bottom trays) may have an opaque `paper` background and one hairline edge. Never another fill, shadow, radius or inset.
2. **A 1px `ink` rule** starts a Meal Section or the Exercise block, and nothing else.
3. **Dense rows** (Diary, Add Food) may use tighter padding and 14/12px type, but still no boxes, and every target still reaches 44pt via `hitSlop`.

It also records the component decisions the ticket asked for:
- **Rows:** tap to edit, never swipe. Swipe is invisible on web, our primary platform, and fights iOS swipe-back.
- **Macros:** three labeled bars, not rings.
- **Exercise:** the last Diary block, in the section idiom.
- **Weight:** not on Today; it lives on Progress.
- **Setup's live budget:** the same 28px mono figure as Remaining. Setup's first build used Fraunces for it, which broke the numbers-are-mono rule; that's fixed here.
- **Logging Streak:** a caption only.

## Alternatives considered

- **A filled or tinted summary card**, MyFitnessPal's look. It's the box pattern Editorial exists to avoid, and an opaque `paper` surface already solves the "content shows through" problem.
- **Macro rings.** Rejected in Design.md before the pivot for the same reason as plate charts: people compare arcs badly. A pinned ring at usable size is also too tall.
- **Swipe-to-delete rows**, the native-feeling choice. It can't be discovered on web, and destructive actions should be visible.
- **No exceptions, retrofit the screens to the old rules.** An unpinned summary was MyFitnessPal's top redesign complaint; the exceptions are the cost of the layout we chose.

## Consequences

- `Design.md` changes: the exceptions list, a *Tracker components* section, and an updated verification checklist (pinned-surface and no-swipe-only checks; every current screen listed).
- `SetupScreen`'s budget figure is now `monoEmphasis` 28px.
- There is no separate prototype. The pivot's screens are the prototype, and the preview screenshots of Setup and the Diary were checked against these rules.

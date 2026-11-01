# Success metrics for the tracking pivot, derived first-party on the server

The tracking pivot (wayfinder map #49) needs a way to tell whether it worked. The app has no analytics today. Its users are students logging what they eat, which is health data, so sending events to a third-party analytics SDK is a cost as well as a convenience.

## Decision

**North-star metric: logging days per logging user per week.** For each week (Monday–Sunday), among users who logged any food that week, the mean number of distinct days with food logged (a Logged Meal or a Quick Add Entry). It's reported alongside **the share of those users logging ≥4 of 7 days**, because the mean alone can hide a split between daily loggers and one-time visitors. Reported per week for the last 8 weeks.

**Supporting metrics:**

| Metric | Definition |
|---|---|
| Logging users (weekly) | Distinct users with any food logged that week. |
| Activation | Of users who signed up in the window, the share whose first food log came within 24 hours of signing up. |
| Week-1 / week-4 retention | Of users who signed up in a given week, the share with a logging day in the following week, and in the fourth week after. Only cohorts old enough to have that week are reported. |
| Logging source mix (last 28 days) | Counts of food-logging actions by source: dining menu (built by hand), Crafted Meal accepted, Quick Add. Exercise and weigh-ins are counted separately. |
| Crafted Meal usage (last 28 days) | Crafted share of food-logging actions, and users with at least one Crafted Meal log. Watched to confirm the secondary feature is still used, not to grow it. |

**Data stays first-party and server-side.** No client analytics SDK, no third party, no tracking cookies.
- Days, signups and retention are derived from the tables that already exist (Logged Meals, Quick Add Entries, users), so pre-pivot history counts as a baseline.
- The one thing those tables can't tell apart is *how* food was logged: one Logged Meal per Menu Event merges a Crafted Meal and hand-picked items (ADR 0023). So a minimal `logging_events` table records **user, kind, diary date and timestamp** for each logging action. It holds no food names, amounts or nutrition. Kinds: `menu`, `crafted`, `quick_add`, `exercise`, `weigh_in`.
- `POST /logged-meals` takes an optional `source` (`menu` default, or `crafted`) that only feeds this table. It's a client-claimed label for counting, never used for nutrition (ADR 0004 is unaffected).
- Events are deleted with the account, like everything else the user owns.

**Reporting is aggregate-only and admin-only.** `GET /admin/api/metrics` (behind the existing single-admin gate, ADR 0016) and `python -m app.jobs.report_metrics` both return the same aggregates. Neither exposes per-user rows.

**Release check.** The first pivot release reports the 8-week table, with the pre-release weeks as the baseline. The pivot is working if, four weeks after release, logging days per logging user and the ≥4-days share are above baseline, and week-1 retention of post-release cohorts is above pre-release cohorts. No numeric target is set until a baseline exists.

## Alternatives considered

- **A client analytics tool (PostHog, Amplitude, Firebase).** Funnels and dashboards for free, but it ships student health-behaviour events to a third party and needs a consent story. Rejected for now. Self-hosted PostHog could be revisited if the server aggregates aren't enough.
- **Derive everything from existing tables, no events table.** Covers days, activation and retention, but not the source mix or Crafted Meal usage, which the ticket asks for. Rejected for a minimal content-free table.
- **Daily active users as the north star.** Rewards opening the app, not tracking. Logging days measures the behaviour the pivot is for.
- **Calories-on-target adherence as a metric.** Nutrition accuracy is out of scope for this effort, and optimizing a calorie-adherence number is a wellbeing risk for this audience. Rejected.

## Consequences

- New table `logging_events`, written by `POST /logged-meals`, `POST /quick-add`, `POST /exercise` and `PUT /weight/{date}`. Edits and deletes aren't events: the metrics count logging actions, not corrections.
- New service `app/services/metrics.py`, the admin endpoint, and a CLI report.
- The frontend sends `source: "crafted"` from Crafted Meal cards.

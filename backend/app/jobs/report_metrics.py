"""Prints the pivot's success metrics — see
docs/adr/0028-success-metrics-and-first-party-instrumentation.md.
Same aggregates as GET /admin/api/metrics, for the release check.

    python -m app.jobs.report_metrics [weeks]
"""

import sys

from app.db.session import SessionLocal
from app.services.metrics import build_report


def _pct(value: float | None) -> str:
    return "—" if value is None else f"{value * 100:.0f}%"


def main(weeks: int = 8) -> None:
    db = SessionLocal()
    try:
        report = build_report(db, weeks=weeks)
    finally:
        db.close()

    print("Week of      Logging users  Avg logging days  >=4 days")
    for w in report.weeks:
        print(f"{w.week_start}  {w.logging_users:>13}  {w.avg_logging_days:>16.2f}  {_pct(w.engaged_share):>8}")

    print("\nCohort       Signups  Activated  Week 1  Week 4")
    for c in report.cohorts:
        print(
            f"{c.week_start}  {c.signups:>7}  {_pct(c.activated_share):>9}"
            f"  {_pct(c.week1_retention):>6}  {_pct(c.week4_retention):>6}"
        )

    print("\nLast 28 days by source:", ", ".join(f"{k} {v}" for k, v in report.source_mix.items()))
    print(f"Crafted share of food logs: {_pct(report.crafted_share_of_food_logs)} ({report.crafted_users} users)")


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 8)

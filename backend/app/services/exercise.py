"""Exercise burn estimates — see docs/adr/0025-exercise-entries-and-net-calories.md.

MET values are approximate, from the Compendium of Physical Activities, for
a moderate effort at each activity. The estimate subtracts 1 MET (rest)
because BMR — and so the user's calorie goal — already counts the resting
burn; what's left is the extra energy the workout cost.
"""

from __future__ import annotations

from dataclasses import dataclass

OTHER = "other"


@dataclass(frozen=True)
class Activity:
    key: str
    label: str
    met: float


# Display order. Keys are stored on ExerciseEntry, so don't rename them.
ACTIVITIES: list[Activity] = [
    Activity("walking", "Walking (brisk)", 4.3),
    Activity("running", "Running", 9.8),
    Activity("cycling", "Cycling", 8.0),
    Activity("stationary_bike", "Stationary bike", 6.8),
    Activity("elliptical", "Elliptical", 5.0),
    Activity("weight_training", "Weight training", 5.0),
    Activity("swimming", "Swimming laps", 7.0),
    Activity("rowing_machine", "Rowing machine", 7.0),
    Activity("hiit", "HIIT / circuit", 8.0),
    Activity("basketball", "Basketball", 6.5),
    Activity("soccer", "Soccer", 7.0),
    Activity("tennis", "Tennis", 7.3),
    Activity("yoga", "Yoga", 2.5),
    Activity("dancing", "Dancing", 5.0),
    Activity("climbing", "Climbing (indoor)", 5.8),
    Activity("hiking", "Hiking", 6.0),
]

ACTIVITIES_BY_KEY: dict[str, Activity] = {a.key: a for a in ACTIVITIES}


def estimate_calories(activity_key: str, minutes: int, weight_kg: float) -> float:
    activity = ACTIVITIES_BY_KEY[activity_key]
    return round((activity.met - 1) * weight_kg * (minutes / 60))

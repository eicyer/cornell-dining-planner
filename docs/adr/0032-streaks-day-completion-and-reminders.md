# Streaks, day completion and reminders on web: a quiet Logging Streak, no Complete Day, no reminders yet, installable as a PWA

The tracking pivot (wayfinder map #49) is web-first with no native push. MyFitnessPal's retention loop is a streak on the home screen, a "Complete Diary" button that shows a weight projection, and push reminders. Its top complaints include forced celebrations. Our north star is Logging Days per logging user per week (ADR 0028), so whatever we build here should reward logging on more days without nagging or shaming.

## Decision

**Logging Streak = consecutive Logging Days**, the same "any food that day" definition ADR 0028 measures (a Logged Meal or a Quick Add Entry; exercise and weigh-ins don't count). It counts back from today. If today has nothing yet, it counts back from yesterday, so the streak stays alive until the day is over rather than reading "0" every morning.

**Backfilling repairs it.** A day counts when it has food on it, whenever that food was entered. Forgetting to log Tuesday and filling it in Wednesday is exactly the behaviour we want, and an honest diary matters more than a "pure" streak. Gaming this is harmless: there's no reward beyond the number.

**Where it shows:**
- **Diary**, today only: one quiet line under the week strip, "5 days in a row". It appears only when the streak is 2 or more, so a new user or someone who just broke one sees nothing rather than a zero. When today isn't logged yet it reads "4 days in a row — log today to keep it going". Same type as other captions, with no accent color, flame or badge.
- **Progress**, under Consistency: "Current streak: 5 days" next to the existing "N of 28 days logged".

**No "Complete day" action.** MyFitnessPal's version exists to show "if every day were like today you'd weigh X in 5 weeks", which ADR 0026 rejected (no projections). Without it, the button is just a ceremony, and streak days are already derived from food on the day.

**No celebrations.** No confetti, milestone toasts or badges, so there is nothing to switch off and no setting. If one is added later, it must default off.

**No reminders in this effort.**
- Web push only reaches iOS users who've installed the PWA (iOS 16.4+). It also needs a service worker, VAPID keys and a send job.
- Email needs sending infrastructure we don't have, and it's the channel most likely to be ignored or filtered.
- Both are real work for an unmeasured gain.

The trigger to revisit is ADR 0028's release check: if week-1 retention isn't above baseline four weeks after release, a reminders ADR comes next. Web push for installed users is the first candidate, because it needs no email address and can be scoped to "haven't logged lunch by 2pm".

**Installable as a PWA: yes, minimally.** A web manifest (name, icons, `display: standalone`, Editorial paper/ink colors) linked from a customized `public/index.html`, so "Add to Home Screen" gives a full-screen app with our icon. This is cheap, and it's the prerequisite for web push later. There's no custom install prompt and no service worker or offline cache yet: the Diary needs live menus anyway.

## Alternatives considered

- **A streak that needs every main section logged.** Stricter and closer to "a complete diary", but it punishes skipping breakfast, which many students do. Rejected for the north-star-aligned "any food".
- **No repair by backfilling.** It makes the streak a measure of opening the app on time rather than of keeping a diary. Rejected.
- **A prominent streak (flame, accent color) at the top of the Diary.** Strong engagement driver, but it competes with calories remaining (the headline) and leans into the anxiety pattern the wellbeing guardrails item worries about.
- **Email reminders now.** Rejected until the release check shows retention needs it.

## Consequences

- New `GET /logged-meals/streak` returns `{days, logged_today}`, computed from Logged Meals and Quick Add Entries in `app.services.streaks`.
- The Diary and Progress each fetch it.
- `frontend/public/manifest.json`, icons, and `public/index.html` (from `npx expo customize`) with the manifest link and theme color.
- `Logging Streak` joins `CONTEXT.md`.

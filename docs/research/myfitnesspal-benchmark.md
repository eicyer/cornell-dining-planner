# MyFitnessPal benchmark for a Cornell dining-hall tracker

Researched 2026-10-20 from MFP's Help Center (articles updated Aug–Oct 2026), App Store listing, and press releases. **[2nd]** = secondary source. [Sn] tags point to the URL list at the bottom. **(P)** = Premium, **(P+)** = Premium+ only.

---

## 0. 2024–2026 timeline (context for everything below)

- **Barcode is still Premium-only.** It went behind the paywall on Oct 1 2022 [S8], and the 2026 Winter Release still lists it under Premium ($79.99/yr) [S22]. I found no evidence it went back to free. The brief's "change to free barcode scanning" looks like the 2022 change *to* paid.
- **Feb 2025 Winter Release:** Added Voice Log (P), Weekly Habits (free), and Food Suggestions [S23].
- **Aug 2025 Summer Release:** Search was reworked to put "scan, speak, and search" in one view for all users. Also an improved Meal Scan (P), a "First Food Logged" celebration, and updated meal reminders [S24].
- **Sep 2025 → Apr 2026:** The **Today tab** replaced the old Dashboard and Diary as home. It was tested from Oct 2025 [S1][S2] and rolled out to everyone in v26.16.0 (Apr 2026), along with a new **Progress tab** [S12]. Users pushed back hard. MFP calls it "the path forward" and offers no way to revert [S25 2nd].
- **Feb 2026:** Meal Scan "Photo Upload" for logging later (P). Meal Planner recipes (P+) [S22].
- **Aug–Oct 2026:** AI **Coach** tab (P, iOS). Fridge-photo meal suggestions came in Oct [S3][S20]. Free GLP-1 Support launched in Apr [S26 2nd].

---

## 1. Information architecture

**Bottom tab bar (2026)**, pieced together from help articles (MFP publishes no single ordered list):
- **Today** is home and the first tab [S1].
- **Progress** is in the nav bar [S12].
- **Plan** (P+) sits "to the left of the plus (+) button" [S12].
- A **blue + button** sits at bottom right and logs food, water, weight, or exercise [S1][S4].
- **More** used to be the rightmost tab. For iOS Premium users, **Coach** now takes the bottom-right slot and More has moved to a **profile icon** at the top right of Today [S20].
- Likely order: Today · Progress · (Plan) · **+** · More/Coach.

**Today screen, top to bottom** [S1]:
1. **Week-strip date picker.** Tap a day, or tap "Today" to jump to any date. Swipe to move by whole weeks.
2. **Food logging streak** ("Streaks view") [S1][S9].
3. **Calories card:** "Calories consumed and remaining", shown as a bar. Earned exercise calories appear as a 🔥 emoji in the remaining bar [S1].
4. **Macro card:**
   - Free users see carbs/protein/fat as **% of calories**.
   - (P) users can tap to cycle through grams consumed → grams remaining → %.
   - (P) users can add a fourth view: "Heart Healthy" (sat fat, sodium, fiber) or "Carb Conscious" (carbs, sugar, fiber) [S1][S21].
5. **Intermittent Fasting tracker** if it's on (P). It appears "near the top" [S16].
6. **"View All / View Diary"** link, which opens a single list of every meal [S1].
7. **Meal cards:** Breakfast, Lunch, Dinner, Snacks, each with a **blue "Log" button**.
   - Users can rename meals and add up to 2 more, for 5 meals total [S19].
   - (P) users see per-meal macros, on by default. Tap to switch between grams and % [S13].
   - Swipe right under a meal name to repeat yesterday's foods for that meal.
   - The **•••** menu copies a meal [S1].
8. **Complete Diary** button: below the meals, shown after logging at least one food [S1].
9. **Healthy Habits:** water, exercise, steps [S1].
10. **Last weight card** at the very bottom. Tapping it opens weight progress [S1].

**Calorie formula.** MFP sets the goal in **net calories**: Food − Exercise = Net. So **Remaining = Goal − Food + Exercise**. Exercise "earns" calories back. (P) users can turn that adjustment off [S5][S6].

**Widgets:** Calories and Macros widgets, plus an interactive water widget on iOS 18 [S27].

---

## 2. Food logging flow

**Entry points:** a meal's blue **Log** button, which pre-selects that meal, or the global **+**. You can change the meal at the top of the search page [S4][S28].

**Search screen** (unified since Aug 2025 [S24]):
- Method buttons under the search bar: **Barcode Scan (P), Meal Scan (P), Voice Log (P), Quick Add** [S1][S8].
- A food-list bar: **History / Recently Logged** (sort by Most Recent, Most Frequent, A–Z, Z–A), **My Meals**, **My Recipes**, **My Foods** [S10][S29].
- History is **filtered to the current meal by default**. An "All Meals" filter turns that off [S30].

**Logging methods:**

| Method | Steps | Tier |
|---|---|---|
| **Quick Log** | Tap **+** next to a result to log it at its current portion. A toast confirms. Keep tapping to log more. This is how multi-add works in the app [S28] | Free |
| **Detail log** | Tap the food → set serving size + number of servings + meal → (P) timestamp / multi-day → **Log** or ✓ [S4] | Free |
| **Quick Add** | Log → Quick Add → enter calories. Can't be labelled; users put notes in Food Notes instead [S31] | Free for calories; macros need (P) |
| **Saved meal** ("My Meals") | Build in More → My Meals, Recipes & Foods (web: "Remember meal"). Logs **each food as its own entry** [S10] | Free |
| **Copy meal** | Today: ••• on a meal copies at meal level. Copying single items or **whole days isn't supported** in the new UI [S1] | Free |
| **Repeat yesterday** | Swipe right under the meal name [S1] | Free |
| **Multi-Day Logging** | "Add to Multiple Days", up to 7 days. Works for foods and recipes, not My Meals [S32] | P |
| **Barcode** | + → Barcode Scan → frame the code → pick meal + serving → Log [S8] | P since 2022 |
| **Meal Scan** | + → Meal Scan → shutter/upload → pick suggestions → adjust serving → ✓ → Log; "Add more" searches for misses. "A starting point, not a final answer" [S33] | P |
| **Voice Log** | + → Voice Log → speak (food + amount + meal) → blue arrow → edit items → Log. Public database only; no My Foods/Meals/Recipes [S34] | P |

**Tap counts** (my estimates from documented steps): repeat yesterday = 1 swipe; recent food = **2 taps** (Log → +); search + Quick Log = 2 taps + typing; search + portion change ≈ **6 taps** + typing; Meal Scan ≈ 6–8. Reviewers say the 2026 redesign *added* taps [S25 2nd].

---

## 3. Portion and serving UX

- **Two controls:** a **serving size** dropdown (unit) and a **number of servings** field (multiplier, decimals or, in some versions, fractions). The help center's main workaround is to change the multiplier, e.g. 0.75 × "1 cup" [S36].
- **Units come from whoever created the entry.** Staff-created foods often have several units (g, oz, cup, piece). User-created foods often have one [S36].
- Missing-unit fixes: use a 1-unit option as a multiplier, pick another entry, save as a remembered meal, or create your own food [S36].
- **Uncertain portions:** there's no dedicated UI for them.
  - Meal Scan and Voice Log guess a food and portion, and the user edits it [S33][S34].
  - "Preferred Serving Size Not Available" is one of the **Report Food** reasons [S37].
  - Quick Add is the escape hatch when you only know a rough calorie number [S31].

---

## 4. Goals and onboarding

- **Onboarding inputs:** age, height, weight, sex, normal daily activity level, **target weekly loss/gain rate**, and goal weight [S5].
  - Goal weight is **only used to report how much is left**. It doesn't affect the calorie goal [S5].
  - Weekly rates run from "maintain" up to "lose 2 lb/week" **[2nd]** [S38].
- **Calorie floor:** MFP won't compute goals under 1,200 kcal (women) or 1,500 kcal (men). "Complete Diary" warns below roughly 1,000/1,200 [S5][S9]. Users with a doctor-approved lower target complain about this floor [S40].
- **Customizing goals:**
  - More/Profile → Goals → Calorie & macro goals (turn off "Recommended Calories").
  - **Macro balance presets:** Default, High protein, Low carb, Keto, Paleo, Custom (slider) [S11].
  - Free users set macros as **% in 5% steps** that must total 100%. (P) users can set **grams** and **different goals by day of week** [S11][S14].
- **Per-meal goals (P):**
  - **Calorie Goals by Meal** splits the daily goal across meals and can vary by weekday.
  - Tapping a meal's goal number opens the editor [S39].
  - For macros, per-meal is a *breakdown view*, not a target [S13].
- **Beyond macros:** web Micronutrients editor [S11], Net Carbs (P) [S14], Heart Healthy / Carb Conscious views (P) [S21].

---

## 5. Progress and reports

- **Progress tab** (v26.16.0+) [S12]:
  - Weekly **Calories** vs goal.
  - **Weight** trend chart.
  - **Macros** vs targets. Actionable tips are (P).
  - **Reports** over time.
  - Calories, Macros, Nutrients, measurements, and sleep, viewable by day or week [S1].
- **Pie charts:**
  - Tap the Today Calories card → Nutrition › Calories tab → per-meal pie chart (Day view).
  - Tap the Macros card → macro pie chart, or a graph in Week view [S1].
- **Weight:** card at the bottom of Today → log weight, see history and other measurements [S1]. Progress photos also exist [S41].
- **Water:** Healthy Habits → Water card → Log water, in cups, unit can be changed. Plus the iOS widget [S15][S27].
- **Complete Diary:** gives a **5-week weight projection** that assumes every day looks like today. Motivational only [S9].
- **Weekly Digest** (Sundays): calories vs weekly goal, top 3 foods, exercise, streak prediction, **Food Group Insights** (Vegetables, Fruits, Proteins, Sweets & Snacks, Alcohol). Free keeps 2 past digests [S18].

---

## 6. Engagement mechanics

- **Streaks:**
  - A **food logging streak** on Today counts consecutive days with at least one food. It can be fixed by logging a past day.
  - A separate **login streak** lives on the profile, with a web reset tool [S9].
- **Celebrations:**
  - "First Food Logged" celebration [S24].
  - Reviews describe streak pop-ups and "fireworks and high five celebrations every time you log an item" that **can't be turned off**. This is a top complaint [S40].
- **Reminders:**
  - "Remind me if I haven't logged [meal]" at a chosen time. Unlimited, each with its own toggle [S43].
  - Users also report recipe and suggestion pushes they can't disable [S40].
- **Social** (buried under More → Community):
  - Friends, **diary sharing**, copying meals from friends [S44][S45].
  - Community **Activity Feed** (public by default), forums, **Groups** (public or private, with events) [S46].
- **AI Coach** (P, iOS): grounded in your diary, goals, and saved meals. Answers questions like "what should I eat with my remaining calories?" **It can't log food or edit goals** [S20].

---

## 7. Design language

- **One accent color, MFP blue,** used for every primary action: the "blue plus", the blue "Log" buttons, the blue shutter in Meal Scan, the blue arrow in Voice Log [S1][S33][S34].
- **Numbers come first.** Calories consumed and remaining sit "prominently… right at the top". Remaining is drawn as a bar, with exercise shown inline as 🔥 [S1].
- Macros on Today are a single swipeable card (arrows between views) instead of three rings [S21].
- **Density went down in 2026.** The diary became "a list of gigantic, space-consuming cards". The summary no longer stays pinned while you scroll; users say "I have to scroll to the top to constantly see my macros." Per-meal macros are harder to find **[2nd]** [S25][S40].
- **Free tier:** a banner ad at the bottom of the screen (users report it freezing the screen while logging), upgrade prompts, and Premium upsells inside the serving picker [S40].

---

## 8. User complaints a narrower product can exploit

From the 150 most recent US App Store reviews, Oct 2–18 2026 (55× 5★, 44× 1★, 18× 2★) [S40]. Counts are keyword matches.

- **Redesign (~23):** can't see the whole day; summary not pinned; meal-only copying; can't find "close out your day". "Please offer old version… I WILL PAY FOR IT!"
- **Ads (~32):** bottom banner that freezes logging, interstitials, review prompts.
- **Paywall (~30, barcode ~25):** "Scanning barcodes should be free." Many point to Cronometer as the alternative.
- **Database inaccuracy (~7, but strongly worded):** "Everything I search has incorrect values"; "Even the 'verified' entries aren't always accurate." MFP itself admits entries can be "wildly" wrong [S42].
- **Forced engagement:** streak pop-ups, celebrations, and AI suggestions with no opt-out ("This is an app. Not a coach").
- **Reliability:** sign-outs, goals reset to defaults, sync failures.
- **Onboarding friction:** "Too many questions, just let me count calories."

---

## Implications for a dining-hall tracker

**Maps directly**
- **Today screen = Diary.** Date strip, a pinned Remaining card (Goal − Food [+ Exercise]), macros, and meal sections. *Keep the summary pinned* to avoid MFP's #1 redesign complaint.
- **Meal sections, each with its own Log button** pre-scoped to that meal. Our sections are Breakfast / Brunch / Lunch / Dinner / Late Night, which line up with Cornell meal periods.
- **Quick Log "+" on every row:** one tap per item to build a plate.
- **Recents / Frequents**, the fastest path for repeat staples. Default the filter to the same meal_period.
- **Quick Add calories** as the escape hatch for off-menu food (Collegetown takeout, snacks).
- **Repeat or copy meal.** "Same as yesterday at Okenshields" works *if* the items are on today's menu. Otherwise grey them out.
- **Saved meals** ("my usual RPCC plate"), with the same live-menu availability check.
- **Fixable food logging streak** plus "haven't logged lunch" reminders. **Make celebrations optional.**
- **Weekly digest / Progress:** calories vs goal, top foods, *which dining halls*. Water and weight cards are cheap to add.
- **Free, no ads, no paywalls.** That answers most MFP complaints.

**Needs adaptation (fixed daily menu)**
- **Search becomes "browse today's menu."** Default to the current eatery and meal period's live menu, grouped by station, with search limited to today's menus. Faster than a 22M-item database.
- **Serving picker.** Per-100g has no natural unit. Offer dining-hall portions (scoop, ladle, piece, "¼ plate") mapped to grams, plus MFP's servings multiplier (0.5×–2×).
- **Show uncertainty honestly.** Show "≈" or a range for estimates, and label USDA-matched vs LLM-estimated nutrition (like MFP's "Verified" badge).
- **Meal Scan → "photo of my plate" matched against today's menu only.** A closed set makes it far more accurate than MFP's open-world guessing. The user still confirms each item.
- **Voice log**, likewise matched against today's menu ("pasta, salad bar, two cookies").
- **Goals:** one-screen onboarding; % presets plus grams; per-meal goals suit AYCE ("dinner under 800"). Use ED-sensitive copy and calorie floors on campus.
- **Complete Diary projection:** drop it or make it opt-in, since weight projections are sensitive for students.
- **Recommendation engine** (our current Crafted Meal) becomes MFP-Coach-style "what fits my remaining calories here, right now." A suggestion behind the tracker, not the main flow.

**Doesn't fit**
- **Barcode scanning** (no packaged food), the **user-generated food database** and Report Food workflow, **custom recipes and the recipe importer**.
- **Multi-day logging** (future menus aren't known) and **Meal Planner / grocery delivery / Instacart**.
- **Exercise database and device-sync calorie adjustments** (maybe a Health import later).
- **Public feed, forums, groups.** Friend diary-sharing maybe later.
- **GLP-1, fasting, Net Carbs:** niche for this audience.
- **Paid tiers, ads, upsells inside the logging flow.**

---

## Sources

- S1 Your Today tab — https://support.myfitnesspal.com/hc/en-us/articles/39985611667341-Your-Today-tab
- S2 Community: Introducing the "Today" tab — https://community.myfitnesspal.com/en/discussion/10950333/introducing-the-brand-new-today-tab
- S3 App Store listing + version history — https://apps.apple.com/us/app/myfitnesspal-calorie-counter/id341232718
- S4 How to log food to your diary — https://support.myfitnesspal.com/hc/en-us/articles/360032274592-How-to-log-food-to-your-diary
- S5 How MFP calculates initial goals — https://support.myfitnesspal.com/hc/en-us/articles/360032625391-How-does-MyFitnessPal-calculate-my-initial-goals
- S6 What are Net Calories? — https://support.myfitnesspal.com/hc/en-us/articles/360032273692-What-are-Net-Calories
- S7 Copy a meal day-to-day — https://support.myfitnesspal.com/hc/en-us/articles/360032622131-How-do-I-copy-a-meal-from-one-day-to-another
- S8 Barcode Scanner — https://support.myfitnesspal.com/hc/en-us/articles/360032624771-How-to-use-the-Barcode-Scanner
- S9 Streaks — https://support.myfitnesspal.com/hc/en-us/articles/360032624931-How-to-fix-an-incorrect-streak ; Complete Diary — https://support.myfitnesspal.com/hc/en-us/articles/360032624131
- S10 Saved meals — https://support.myfitnesspal.com/hc/en-us/articles/360032625331-Create-find-and-log-your-saved-meals
- S11 Customize nutritional goals — https://support.myfitnesspal.com/hc/en-us/articles/360032274432-Customize-your-nutritional-goals
- S12 Progress Overview — https://support.myfitnesspal.com/hc/en-us/articles/45246617814669-Introducing-Progress-Overview-Your-Progress-Personalized
- S13 Macro Goals by Meal — https://support.myfitnesspal.com/hc/en-us/articles/360032625151-Macro-Goals-by-Meal-with-MyFitnessPal-Premium
- S14 Free vs Premium vs Premium+ — https://support.myfitnesspal.com/hc/en-us/articles/34889191368077-The-difference-between-Free-Premium-and-Premium ; https://www.myfitnesspal.com/premium
- S15 Water tracking — https://support.myfitnesspal.com/hc/en-us/articles/360032270732-How-to-track-how-much-water-you-drink
- S16 Intermittent Fasting — https://support.myfitnesspal.com/hc/en-us/articles/10983207647117-Track-Intermittent-Fasting-with-MyFitnessPal-Premium
- S17 Meal Planner — https://support.myfitnesspal.com/hc/en-us/articles/34603055097869-How-to-use-the-Meal-Planner
- S18 Weekly Digest — https://support.myfitnesspal.com/hc/en-us/articles/360032622591-Weekly-Digest
- S19 Meal names / extra meals — https://support.myfitnesspal.com/hc/en-us/articles/360032622311-How-to-change-your-meal-names-or-add-more-meals
- S20 Nutrition Coach — https://support.myfitnesspal.com/hc/en-us/articles/45212266254221-Introducing-Nutrition-Coach-Your-Nutrition-Assistant
- S21 Customize Nutrient Dashboard — https://support.myfitnesspal.com/hc/en-us/articles/360032272532-Customize-your-Nutrient-Dashboard-with-MyFitnessPal-Premium
- S22 2026 Winter Release (press release) — https://lite.aol.com/sports/other/story/0022/20260224/9659625.htm
- S23 2025 Winter Release (press release) — https://www.webull.com/news/12377891991156736
- S24 2025 Summer Release (press release) — https://www.easternprogress.com/myfitnesspal-announces-its-2025-summer-release/article_0c108ad7-c8f9-5cbe-bbc6-eca09b6be312.html
- S25 [2nd] PiunikaWeb, Today-tab complaints (2026-04-24) — https://piunikaweb.com/2026/04/24/myfitnesspal-new-update-complaints/
- S26 [2nd] GLP-1 Support launch — https://www.bakersfield.com/ap/news/myfitnesspal-launches-comprehensive-glp-1-support-helping-users-stay-consistent-and-build/article_594b029e-ed9b-5c1a-ac3b-a4ea46e70908.html
- S27 Widgets — https://support.myfitnesspal.com/hc/en-us/articles/6886354417165-How-to-add-a-Widget-to-mobile-Home-Screen
- S28 Quick Log — https://support.myfitnesspal.com/hc/en-us/articles/360032622491-Getting-started-with-Quick-Log
- S29 Sort food lists — https://support.myfitnesspal.com/hc/en-us/articles/360032621811-How-to-sort-your-food-lists
- S30 Show all foods in lists — https://support.myfitnesspal.com/hc/en-us/articles/360032622651-View-all-your-favorite-foods-when-logging
- S31 Quick Add — https://support.myfitnesspal.com/hc/en-us/articles/360032621971-Getting-started-with-Quick-Add
- S32 Multi-Day Logging — https://support.myfitnesspal.com/hc/en-us/articles/33535658002061-Multi-Day-Logging-with-MyFitnessPal-Premium
- S33 Meal Scan — https://support.myfitnesspal.com/hc/en-us/articles/360045761612-How-to-use-the-Meal-Scanner
- S34 Voice Log — https://support.myfitnesspal.com/hc/en-us/articles/30332897072269-How-to-log-food-with-your-voice
- S36 Serving size not available — https://support.myfitnesspal.com/hc/en-us/articles/360032272852-What-to-do-if-the-serving-size-you-need-isn-t-available
- S37 Report incorrect food — https://support.myfitnesspal.com/hc/en-us/articles/360032274312-How-to-report-incorrect-food-items-in-the-database
- S38 [2nd] Wareable beginner's guide — https://www.wareable.com/health-and-wellbeing/beginners-guide-to-myfitnesspal
- S39 Calorie Goals by Meal — https://support.myfitnesspal.com/hc/en-us/articles/360032273792-Calorie-Goals-By-Meal-with-MyFitnessPal-Premium
- S40 App Store customer reviews, US, most recent 150 (Oct 2–18 2026) — https://itunes.apple.com/us/rss/customerreviews/page=1/id=341232718/sortBy=mostRecent/json (pages 1–3)
- S41 Progress Photos — https://support.myfitnesspal.com/hc/en-us/articles/360032625271-Progress-Photos-FAQs
- S42 Progress Bar FAQ — https://support.myfitnesspal.com/hc/en-us/articles/21330878903181-Progress-Bar-FAQ
- S43 Logging reminders — https://support.myfitnesspal.com/hc/en-us/articles/360032622391-How-to-set-up-logging-reminders
- S44 Diary visibility — https://support.myfitnesspal.com/hc/en-us/articles/360032273872-How-do-I-make-my-diary-visible-to-other-users
- S45 Copy meals from friends — https://support.myfitnesspal.com/hc/en-us/articles/360032274452-Can-I-copy-meals-from-my-friends
- S46 Community Activity Feed — https://support.myfitnesspal.com/hc/en-us/articles/26955045411981-Your-Community-Activity-Feed

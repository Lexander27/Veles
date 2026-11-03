# Veles: workout tracker plan

Status: **v1 built**, using design B (Paper). Decisions: Android first, offline, data only on the phone, kg, weeks start on Monday, weights only for now (running maybe later), English, name Veles.

## Goal

A phone-first app to log workouts, see progress per exercise on a graph, and add exercises to any day from a mini calendar.

## Proposed approach

**An installable web app (PWA), not a native app.**

- It opens in the phone browser, and "Add to Home Screen" gives it an icon and a full-screen view like a native app.
- It works offline. The data is stored on the phone (IndexedDB).
- There are no app-store fees or review, and one codebase works on iPhone and Android.
- Hosting is free on GitHub Pages from this repo. Every push to `main` redeploys it.

**Stack:** React + TypeScript + Vite, Dexie (IndexedDB), a lightweight chart library (Recharts or uPlot), vite-plugin-pwa.

## Features

### v1 (MVP)
1. **Exercise library.** Add, edit and archive exercises. Each one has a name, muscle group and type:
   - weight × reps (bench, squat…)
   - bodyweight reps (pull-ups)
   - time / distance (running, rowing)
2. **Calendar.** A mini calendar with a dot on each workout day. Tap a day to see what you did or add exercises to it.
3. **Logging.** Each exercise on a day has sets (kg × reps). The app pre-fills what you did last time and has a quick "+ set" button.
4. **Progress graph per exercise.** A line chart with ranges of 1M / 3M / 6M / 1Y / All. Metrics: top set weight, estimated 1RM, total volume. PRs are highlighted.
5. **Backup.** Export and import all data as a JSON file, so nothing is lost if the phone is reset.

### Suggested extras (v2, optional)
- Rest timer between sets, with vibration.
- Workout templates / routines ("Push day", "Leg day"), so a whole workout can be added with one tap.
- Notes or RPE (effort) per set.
- Streaks and weekly goals ("4 workouts / week").
- Body weight tracking with its own graph.
- Cloud sync across devices (e.g. Supabase or Firebase). This needs an account and login, so it is left out of v1.
- Dark / light theme toggle.
- CSV export for spreadsheets.

## Data model (draft)

```
Exercise   { id, name, muscleGroup, type: 'weight_reps' | 'reps' | 'time_distance', archived }
Workout    { id, date (YYYY-MM-DD), note? }
Entry      { id, workoutId, exerciseId, order }
Set        { id, entryId, weightKg?, reps?, durationSec?, distanceM?, done, rpe? }
```

## Milestones

1. Project scaffold, PWA setup and GitHub Pages deploy.
2. Exercise library and the data layer.
3. Calendar and day view (add exercises to a day).
4. Set logging screen.
5. Progress charts.
6. Export / import, polish, and testing on a real phone.

## Design mockups

Three directions, each shown on a home/calendar screen, a logging screen and a progress screen:

- **A · Midnight:** dark with a lime accent. A week strip sits on top and expands to the full month.
- **B · Paper:** light and minimal with a blue accent. The full month calendar is the home screen, and exercises are added from a bottom sheet.
- **C · Blocks:** playful coloured cards: streak, weekly goal, mini calendar, today's plan, big set steppers.

## Done in v1

- Calendar home with a next-workout card, an add-exercise sheet (routine days, recent, search, create new), and set logging.
- Routines with a cycle: the next workout is the day after the last one logged, wrapping around.
- Progress graph: top weight / est. 1RM / volume (max reps / total reps for bodyweight), 1M–All ranges, drag or arrows to move, tap a point for value and date.
- Exercise library (edit, archive), JSON backup export/import, storage persistence, offline service worker.

## Next up

- Make the home calendar more compact (the user said it's a bit too big).
- Rest timer, running/cardio exercises, optional desktop use (still offline).

# Veles

An offline workout tracker for your phone. Log your sets on a calendar, follow a routine that cycles, and see a progress graph for every exercise.

- **Calendar:** tap any day to see or add exercises. A filled dot means sets were logged that day; a ring means it's planned only.
- **Routines:** build a cycle such as *Push → Pull → Legs*. The calendar suggests the **next workout**: the day after the last one you logged, wrapping around to day 1. Rest days don't move the cycle.
- **Logging:** kg × reps, or reps for bodyweight exercises. It shows what you did last time, can copy it, saves as you type, and flags new personal records.
- **Progress graph:** switch between top weight, estimated 1RM and volume. Pick 1M / 3M / 6M / 1Y / All, drag sideways (or use the arrows) to move through time, and tap a point to see its value and date.
- **Your data stays on the phone.** Nothing is sent anywhere. Export and import a backup file under **More**.

## Install on Android

1. Open the app's address in Chrome. Once Pages is set up (below), that is `https://lexander27.github.io/Veles/`.
2. Tap the **⋮** menu, then **Add to Home screen** (or **Install app**).
3. Open Veles from the home screen. It now runs full-screen and works without internet.
4. Under **More**, tap **Protect my data** so Android doesn't clear it when space runs low. Export a backup now and then.

## Publishing (one-time setup)

The workflow in `.github/workflows/deploy.yml` builds and publishes the app on every push to `main`.

1. Merge this branch into `main`.
2. In the GitHub repo, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. The next push to `main` (or **Actions → Deploy to GitHub Pages → Run workflow**) publishes it.

Hosting a page doesn't make the app "online": the page just delivers the app to your phone once. After that it runs from the phone's storage, and your workouts never leave the device.

## Development

```bash
npm install
npm run dev       # local dev server
npm test          # unit tests (dates, metrics, routine cycle, backup)
npm run build     # production build in dist/
```

Stack: React, TypeScript, Vite, Dexie (IndexedDB), vite-plugin-pwa (service worker for offline use). The fonts are self-hosted so nothing loads from the internet.

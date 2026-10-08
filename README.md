# Effective Reps Workout Tracker

A mobile-first React / TypeScript PWA. It runs entirely in the browser, stores personal data in IndexedDB via Dexie, and uses a bundled, pinned Free Exercise DB dataset (876 exercises). No account, backend, paid API, or cloud synchronization.

## Run locally

Requires Node 22 or later.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. Production builds default to `/effective-reps/`.

```sh
npm test
npm run build
npm run preview
```

Visit `http://localhost:4173/effective-reps/` for the production preview. Service workers operate on localhost or HTTPS; the development server does not enable production offline caching.

Browser tests:

```sh
npx playwright install chromium
npm run test:e2e
```

On Linux, `npx playwright install --with-deps chromium` may be needed for system dependencies.

## Publish through GitHub Pages

1. Create a GitHub repository and put the contents of this folder at its root, including `.github/workflows/deploy.yml`. Do not upload `node_modules`, personal backup files, or browser records.
2. In repository **Settings → Pages → Build and deployment**, select **GitHub Actions**.
3. Push to `main`. The workflow installs dependencies, runs unit tests and mobile browser tests against the production build, then publishes `dist` with GitHub's Pages actions.
4. Open `https://USERNAME.github.io/REPOSITORY/` after the workflow succeeds.

The workflow derives `BASE_PATH` from the repository name, so it supports repositories other than `effective-reps`. Hash navigation (`#workout`, `#exercises`, `#history`, `#settings`) avoids server route 404s. For a user-site repository named `USERNAME.github.io`, change the workflow's `BASE_PATH` to `/`. For a manual build with a different repository name:

```sh
BASE_PATH=/my-repository/ npm run build
```

This deliverable has not been published to a GitHub repository. A live Pages URL and a successful remote workflow cannot be verified until the repository is configured.

## Install and use offline

Open the production app once online and allow its service worker to finish caching. On iOS, use Safari → Share → Add to Home Screen. On Android, use the browser's Install app option. The installed app runs in standalone mode where supported.

App assets and the complete exercise dataset are precached. Exercise photographs load lazily from the pinned source revision and are cached on demand (up to 100 images). Unviewed photographs may be unavailable offline; search, selection, calculations, sessions, history and settings remain usable. Core precache size is approximately 1.2 MiB. A missing photograph never blocks logging.

Updates present a reload action. The app does not automatically reload during a workout or delete IndexedDB. Accept an update between set entries. The database has an explicit version-1 schema; future changes should use additive Dexie version migrations, never `deleteDatabase`.

## Workout and accounting

Start or resume a workout, search and filter exercises, select one, enter reps/RIR, and log. The exercise and inputs stay selected between consecutive sets. Standard effective reps are `max(0, min(reps, 5 - RIR))`; the 5+ selector is stored as RIR 6 and counts zero. Rest-pause adds all mini-set reps and is one working set. Zero-credit sets remain in history. Cardio and stretching cannot be logged with this model.

Primary muscles receive weight 1, secondary muscles weight 0. Multiple primary muscles each receive full credit. Anatomy is kept separate from attribution: performed reps and muscle-attributed reps are different quantities. Settings configure defaults and targets; exercise details configure overrides. All changes affect future sets. Each recorded set stores raw inputs, its name and attribution snapshot, and calculation version.

Existing sets may be edited, reassigned to another exercise, or deleted, including from completed histories. Editing reps/RIR/type retains the original attribution snapshot; reassigning the exercise takes a fresh attribution snapshot. Muscle breakdowns sum exactly to displayed totals. Working-set count includes entries with positive effective repetitions, including rest-pause sequences.

The model, weights and 20–40 target are accounting assumptions, not established estimates of hypertrophy response.

## Backup and restore

Settings → Export JSON backup saves sessions, sets, custom exercises, attribution overrides, settings, schema version and export time. Import validates structure, versions, raw/calculated consistency, muscle weights and session references before writing in one transaction.

**Merge** is idempotent by stable identifiers; existing records win collisions. A merge containing a different active workout is rejected until the current one is completed. **Replace** removes existing personal records and restores the backup after an explicit confirmation. Export before replacing. Unsupported schema versions are rejected.

Records do not synchronize between browsers or devices. Clearing browser site data, changing origin, or losing the device may make records inaccessible. PWA installation and a persistent-storage request do not guarantee permanent retention; keep backups.

## Source data and reproduction

The complete source schema, source metadata and license are included. Original metadata and IDs are preserved, including nullable fields. Search normalizes names only for comparison; it does not rewrite anatomy. Custom identifiers use `custom:` plus a UUID and stay separate from bundled data.

```sh
npm run import:exercises -- f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5
```

Omit the SHA to import the latest source revision. The importer resolves the commit, downloads data/schema/license from that exact revision, validates all records against the Draft-04 schema, checks duplicate IDs, and records source SHA and dataset SHA-256. Dataset updates do not alter IndexedDB records or historical snapshots.

Sources: [Free Exercise DB](https://github.com/yuhonas/free-exercise-db), distributed under the Unlicense (see `EXERCISE-LICENSE.md`), and the [Brusov Coach estimator](https://www.brusovcoach.org/effective-reps.html). The estimator's UI/source code is not copied.

## Structure

- `src/core.ts`: pure calculation, attribution, aggregation, target and settings validation.
- `src/db.ts`: versioned Dexie persistence, session operations, transactional backup/restore.
- `src/data/`: complete immutable source dataset, schema and provenance.
- `src/App.tsx`: four screens, live database queries and entry workflows.
- `scripts/import-exercises.mjs`: reproducible schema-validated source import.
- `vite.config.ts`: base path, manifest, precache, image cache and update behavior.
- `src/*.test.ts`, `tests/`: calculation, integrity, persistence and mobile/offline browser verification.
- `.github/workflows/deploy.yml`: automated Pages deployment.

## Verification limits

Automated Chromium tests exercise mobile-sized pages and offline reloads. Physical iOS/Android home-screen installation, multi-version service-worker upgrades and future database migrations require device/release testing. The initial release provides versioned infrastructure without inventing a second schema merely for a migration test.

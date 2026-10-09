# Effective Reps Workout Tracker

A mobile-first React / TypeScript PWA. It runs entirely in the browser, stores personal data in IndexedDB via Dexie, and uses a bundled, pinned Free Exercise DB dataset (876 exercises). Accounts and Supabase cloud synchronization are optional; offline logging needs neither.

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

Source repository: https://github.com/alanrodrigueztiburcio/effective-reps. Enable GitHub Actions in Pages settings to deploy.

## Install and use offline

Open the production app once online and allow its service worker to finish caching. On iOS, use Safari → Share → Add to Home Screen. On Android, use the browser's Install app option. The installed app runs in standalone mode where supported.

App assets and the complete exercise dataset are precached. Exercise photographs load lazily from the pinned source revision and are cached on demand (up to 100 images). Unviewed photographs may be unavailable offline; search, selection, calculations, sessions, history and settings remain usable. Core precache size is approximately 1.2 MiB. A missing photograph never blocks logging.

Updates present a reload action. The app does not automatically reload during a workout or delete IndexedDB. Accept an update between set entries. IndexedDB uses additive migrations; existing workouts are preserved.

## Workout and accounting

Start or resume a dated workout. Exercises are grouped vertically with horizontally scrollable editable set tables. Each row stores load (lb/kg, BW, or BW +/− added load), a target rep value/range, actual reps, actual RIR (including 0), independent warm-up/rest-pause/strength flags, and rest seconds. Actual reps and RIR start blank. Mark a row Done after entering actual reps and RIR; incomplete plans contribute no stimulus or progression. Inputs save when leaving the row. Add, copy, reorder or delete sets inline.

Standard effective reps remain `max(0, min(reps, 5 - RIR))`. Rest-pause accepts ordered bouts such as `9,5,3`: the first bout uses the standard formula, and later bouts sum into the existing mini-set term. Warm-ups receive the same RIR-based stimulus calculation. Cardio and stretching are excluded from this model.

The fixed rest panel starts manually from a row's Rest button or automatically when Done is checked. Duration is configured per row in seconds. Pause/reset and countdown state survive reloads on this device; the timer is local, while training records sync.

Primary muscles receive weight 1, secondary muscles weight 0.5. Multiple primary muscles each receive full credit. Anatomy is kept separate from attribution: performed reps and muscle-attributed reps are different quantities. Previously saved settings keep their values; change the secondary weight to 0.5 in Settings if it still shows 0. Settings configure defaults and targets; exercise details configure overrides. All changes affect future sets. Each recorded set stores raw inputs, its name and attribution snapshot, and calculation version.

Existing sets may be edited or deleted in completed histories. Editing set inputs retains the original attribution snapshot. Completed-set totals exclude uncompleted planned rows.

The model, weights and 20–40 target are accounting assumptions, not established estimates of hypertrophy response.

## Backup and restore

Settings → Export JSON backup saves sessions, sets, custom exercises, attribution overrides, settings, schema version and export time. Import validates structure, versions, raw/calculated consistency, muscle weights and session references before writing in one transaction.

**Merge** is idempotent by stable identifiers; existing records win collisions. A merge containing a different active workout is rejected until the current one is completed. **Replace** removes existing personal records and restores the backup after an explicit confirmation. Export before replacing. Unsupported schema versions are rejected.

Records synchronize between signed-in devices through optional Supabase syncing. Clearing browser site data, changing origin, or losing the device may make unsynced records inaccessible. PWA installation and a persistent-storage request do not guarantee permanent retention; keep backups.

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
- `src/App.tsx`: navigation and live database queries.
- `src/WorkoutLog.tsx`, `src/setLog.ts`: inline workout rows, planned/actual normalization, set flags, timers and full-workout template capture.
- `src/TrainingViews.tsx`, `src/training.ts`: independent plans, blocks, dated sessions, and calendar helpers.
- `src/ProgressView.tsx`, `src/progress.ts`: completed-session weekly and block comparisons.
- `scripts/import-exercises.mjs`: reproducible schema-validated source import.
- `vite.config.ts`: base path, manifest, precache, image cache and update behavior.
- `src/*.test.ts`, `tests/`: calculation, integrity, persistence and mobile/offline browser verification.
- `.github/workflows/deploy.yml`: automated Pages deployment.

## Verification limits

Automated Chromium tests exercise mobile-sized pages and offline reloads. Physical iOS/Android home-screen installation and multi-version service-worker upgrades require device/release testing. Database tests upgrade an actual version-1 database to version 2 and verify its existing sessions and sets remain unchanged.


## Optional strength tracking

Check **S** on individual sets to include them in strength history. Load is recorded independently of this flag. Warm-up, rest-pause and strength inclusion have distinct meanings and can all be enabled together. Numeric positive loads support estimates in lb/kg; BW notation is retained in history without guessing body mass or a 1RM. Use a consistent convention, e.g., total barbell load or load per dumbbell.

The **Progress** tab shows chronological set history by exercise, load, repetitions, RIR, estimated 1RM, and overload flags. Pounds and kilograms are converted for comparisons. RIR-adjusted Epley is a heuristic: `load * (1 + (reps + RIR)/30)`, with a single rep at RIR 0 using recorded load. Estimates are withheld for warm-ups, incomplete sets, rest-pause, zero reps, RIR > 4, and reps + RIR > 10. These limits are conservative app choices, not a validated applicability cutoff. Compare only within the same exercise and technique. Effective-rep attribution is independent of load and strength estimates.

Overload flags compare with the latest comparable standard set from an earlier workout: same exercise, same RIR, and either the same reps or equivalent load. Increased load at matched reps/RIR or increased reps at matched load/RIR earns a flag. A flag records performance progression, not proof of physiological adaptation.

## Supabase setup (required once before syncing works)

1. Open the supplied project's **SQL Editor**, create a query, paste all of [`supabase/setup.sql`](supabase/setup.sql), and click **Run**. This creates an account-owned table, row-level security, and an atomic revision-checked save function. The public/publishable key embedded in the app cannot create database tables.
2. In **Authentication → URL Configuration**, set **Site URL** to `https://alanrodrigueztiburcio.github.io/effective-reps/`. Add that same URL to allowed redirect URLs.
3. Keep email/password authentication enabled. In the app's **Settings**, choose **Create account**, confirm the email if required, then sign in with the same credentials on computer and phone.
4. Leave the app open and online on each device to sync. Changes poll every five seconds, also on focus and reconnection. Offline edits persist locally. Supabase availability and the free plan's service limits still apply.

Sync uses one full JSON snapshot per account. Row-level security isolates accounts; no secret/service-role key is included. Three-way per-record merging preserves independent changes and deletions. Atomic revision checks reject stale writes. Conflicting edits to the same record, or concurrent independent active workouts, pause sync. Export local JSON before resolving. **Resolve using cloud version** downloads a local backup before restoring the cloud snapshot; reconcile needed changes from that backup manually. Complete/sync one active workout before starting a different one on another device.

On first sign-in, local records merge with cloud records; local settings win when both browsers already have settings. Existing local attribution settings and logged sets are retained, including any old secondary credit of zero. A browser that has synced to one account cannot silently attach its local data to a different account. Export, sign out, and clear site data before changing account ownership. Sign-out retains local data.

Test coverage includes calculation boundaries, unit conversion, legacy backups, independent sync edits, deletions, conflicting edits, and concurrent active workouts. Browser tests use a mocked Supabase API; live authentication/database access requires the setup above and has not been verified.

## Training structure: dates, templates, mesocycles

Navigation: **Training → Workout → History → Templates → Progress**. Exercise directory and Settings remain available above the page content. The old `#strength` bookmark still opens Progress.

- **Historical dates:** choose Workout date before starting a session. In an active or historical session, expand **Workout date & mesocycle** to change its performed date or explicit block assignment. Sessions and new sets store `performedAt` separately from `createdAt`; sessions also retain the entered calendar `performedDate` so time-zone changes do not shift its workout day. `startedAt`/`timestamp` remain compatible performed-time fields. Changing a workout date retimes its sets but preserves original entry times, effective-rep calculations, strength loads and attribution snapshots. Old records fall back to their existing timestamps until edited.
- **Templates:** create named, ordered plans with target sets, repetitions and RIR. Each exercise row has a stable ID, so repeated exercises can have distinct targets. Reordering/removing a row changes the plan only. Starting a session copies its template name and exercises/targets into a session snapshot; subsequent template edits never change that snapshot or actual sets. Starting a session expands targets into blank actual-set rows. Templates can store per-set planned loads, rep ranges, target RIR, all flags and rest durations. Use **Save workout as template** to capture the whole ordered plan; actual repetitions, completion and actual RIR never carry into a new session.
- **Mesocycles:** create blocks with names, start/end dates, goals and references to any reusable templates. Assign a block optionally when starting a workout or afterward in History. A workout belongs to the selected block even outside its planned dates; date-range warnings never reject an otherwise valid explicit assignment. Templates are independent of blocks, and blank/unassigned workouts remain supported.
- **Progress:** choose all blocks, one block, or unassigned workouts, and group by week or mesocycle. Only completed sessions contribute to these summaries. Calendar weeks begin Monday; selected-block weeks begin on the block start date. Out-of-range member workouts remain included. Strength comparisons report best load with repetitions/RIR and best/first/last eligible estimated 1RM within an exercise, with kg/lb conversion. Muscle exposure sums each actual set's saved muscle attribution; it is effective-rep accounting, not a newly validated physiological stimulus metric. Empty periods are omitted, not imputed as measured zeros.

IndexedDB version 2 adds plan/block tables without rewriting existing workouts. JSON backup schema 4 exports all tables and planned/actual set metadata; schema-1, schema-2 and schema-3 backups and cloud snapshots remain importable. New-schema snapshots stop older app versions from silently overwriting new planning data: **update the app on every syncing device**. The existing Supabase JSON table and RPC need no SQL changes. Planning data, snapshots, dates and membership participate in the same conflict-protected account sync.


## Exercise order, supersets and alternating sides

Drag the dotted handle next to an exercise title to move its whole set table; touch and mouse are supported. Up/down buttons and keyboard arrow keys on the handle provide the same operation. All actual values and attribution snapshots stay attached to their sets.

The exercise **+** menu offers **Add another exercise** for a linked superset partner and **Add alternating sets** for unilateral L/R pairs. Superset badges identify partners and their order; each exercise has its own table, targets, actuals and timer. A new partner starts with the same number of rounds (one L/R pair is one round). Use Unlink to remove a superset association without deleting sets.

Alternating rows display 1L/1R, 2L/2R and so on. Copy and Add set duplicate a pair with empty actuals. Enabling alternating sides converts only blank planned rows; existing logged or partially entered unsided rows remain intact. If there are no blank rows, a new pair is appended. Individual side rows remain editable/deletable. Each side is an independent actual-set record and contributes through the unchanged effective-rep accounting model; no automatic halving or averaging is introduced. Strength overload flags require matched exercise and side; exercise-level best-estimate summaries still pool eligible sides.

Exercise order, superset IDs and side/pair metadata are preserved in templates, session snapshots, account sync and schema-4 backups. Older backups remain importable. Update every syncing device to this version.

Apple Health is not connected in this web release. HealthKit access requires an iPhone-native component; Renpho can provide weigh-ins through Apple Health. A Shortcut or native bridge plus dated weigh-in storage would be needed before the web app could resolve BW from a daily measurement. This update neither fetches Health data nor substitutes guessed body mass.

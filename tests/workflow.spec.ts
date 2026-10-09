import { test, expect } from "@playwright/test";
const base = process.env.BASE_PATH || "/effective-reps/";
test("spreadsheet sets, independent flags, rest timer and full workout templates", async ({
  page,
}) => {
  await page.goto(base);
  await page.getByLabel("Workout date", { exact: true }).fill("2026-10-08");
  await page
    .getByRole("button", { name: "Start workout", exact: true })
    .click();
  await page
    .getByLabel("Search exercises")
    .fill("Barbell Bench Press - Medium Grip");
  await page
    .getByRole("button", { name: "Select", exact: true })
    .first()
    .click();
  await page.getByLabel("Set 1 load", { exact: true }).fill("135");
  await page.getByLabel("Set 1 target reps", { exact: true }).fill("2–4");
  await page.getByLabel("Set 1 warm-up", { exact: true }).check();
  await page.getByLabel("Set 1 rest-pause", { exact: true }).check();
  await page.getByLabel("Set 1 strength tracking", { exact: true }).check();
  await page.getByLabel("Set 1 rest seconds", { exact: true }).fill("4");
  await page.getByLabel("Set 1 actual reps", { exact: true }).fill("9,5,3");
  await page.getByLabel("Set 1 RIR", { exact: true }).fill("0");
  await page.getByLabel("Auto start on completion").check();
  await page.getByLabel("Set 1 completed", { exact: true }).check();
  await expect(
    page.locator(".stats").getByText("13", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("timer")).toHaveText(/00:0[1-4]/);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const timerValue = await page.getByRole("timer").innerText();
  await page.getByLabel("Set 1 duplicate", { exact: true }).click();
  await expect(
    page.getByLabel("Set 2 actual reps", { exact: true }),
  ).toHaveValue("");
  await expect(page.getByLabel("Set 2 RIR", { exact: true })).toHaveValue("");
  await page.getByLabel("Set 2 load", { exact: true }).fill("BW + 20");
  await page
    .getByRole("heading", { name: "Add an exercise", exact: true })
    .click();
  await page.getByLabel("Set 2 move up", { exact: true }).click();
  await expect(page.getByLabel("Set 1 load", { exact: true })).toHaveValue(
    "BW + 20",
  );
  await page.reload();
  await expect(page.getByRole("timer")).toHaveText(timerValue);
  await expect(
    page.getByLabel("Set 2 actual reps", { exact: true }),
  ).toHaveValue("9,5,3");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(
    await page
      .locator(".set-table-scroll")
      .first()
      .evaluate((el) => el.scrollWidth > el.clientWidth),
  ).toBe(true);
  await page.getByLabel("Workout template name").fill("Full body table");
  await page
    .getByRole("button", { name: "Save workout as template", exact: true })
    .click();
  await expect(
    page.getByText("Workout template saved.", { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/mobile-workout-table.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Complete workout", exact: true })
    .click();
  await expect(
    page.getByText("Workout completed.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Training", exact: true }).click();
  await page
    .getByLabel("Workout template", { exact: true })
    .selectOption({ label: "Full body table" });
  await page
    .getByRole("button", { name: "Start workout", exact: true })
    .click();
  await expect(page.getByLabel("Set 1 load", { exact: true })).toHaveValue(
    "BW + 20",
  );
  await expect(
    page.getByLabel("Set 2 target reps", { exact: true }),
  ).toHaveValue("2–4");
  await expect(page.getByLabel("Set 2 warm-up", { exact: true })).toBeChecked();
  await expect(
    page.getByLabel("Set 2 rest-pause", { exact: true }),
  ).toBeChecked();
  await expect(
    page.getByLabel("Set 2 strength tracking", { exact: true }),
  ).toBeChecked();
  await expect(
    page.getByLabel("Set 2 actual reps", { exact: true }),
  ).toHaveValue("");
  await expect(page.getByLabel("Set 2 RIR", { exact: true })).toHaveValue("");
  await expect(
    page.locator(".stats").getByText("0/2", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Set 2 delete", { exact: true }).click();
  await expect(
    page.locator(".stats").getByText("0/1", { exact: true }),
  ).toBeVisible();
});
test("mobile workout, edits, rest-pause, history, backups and offline persistence", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.getByRole("button", { name: "Start workout" }).click();
  await page
    .getByLabel("Search exercises")
    .fill("Barbell Bench Press - Medium Grip");
  await page
    .getByRole("button", { name: "Select", exact: true })
    .first()
    .click();
  await page.getByLabel("Set 1 actual reps", { exact: true }).fill("10");
  await page.getByLabel("Set 1 RIR", { exact: true }).fill("0");
  await page.getByLabel("Set 1 completed", { exact: true }).check();
  await expect(
    page.locator(".stats").getByText("5", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Set 1 actual reps", { exact: true }).fill("3");
  await page
    .getByRole("heading", { name: "Add an exercise", exact: true })
    .click();
  await expect(
    page.locator(".stats").getByText("3", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add set", exact: true }).click();
  await page.getByLabel("Set 2 rest-pause", { exact: true }).check();
  await page.getByLabel("Set 2 actual reps", { exact: true }).fill("10,3,3");
  await page.getByLabel("Set 2 RIR", { exact: true }).fill("0");
  await page.getByLabel("Set 2 completed", { exact: true }).check();
  await expect(
    page.locator(".stats").getByText("14", { exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBeTruthy();
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.locator(".stats").getByText("14", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Search exercises").fill("Dumbbell");
  await expect(page.locator(".exercise-row").first()).toBeVisible();
  await page.getByRole("button", { name: "Complete workout" }).click();
  await page.getByRole("link", { name: "History", exact: false }).click();
  await page.locator(".history-row").click();
  await expect(
    page.locator(".stats").getByText("14", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Settings", exact: false }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON backup" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("effective-reps");
  await page.screenshot({
    path: "test-results/mobile-settings.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("custom exercises and override persist after reload", async ({ page }) => {
  await page.goto(base + "#exercises");
  await page.getByRole("button", { name: "+ Custom exercise" }).click();
  await page.getByLabel("Name", { exact: true }).fill("My chest movement");
  await page
    .getByRole("group", { name: "Primary muscles" })
    .getByLabel("chest", { exact: true })
    .check();
  await page
    .getByRole("group", { name: "Secondary muscles" })
    .getByLabel("triceps", { exact: true })
    .check();
  await page
    .getByRole("button", { name: "Create exercise", exact: true })
    .click();
  await page.getByLabel("Search exercises").fill("My chest movement");
  await page
    .getByRole("button", { name: "My chest movement", exact: true })
    .click();
  await page.getByLabel("triceps weight").fill("0.5");
  await page.getByRole("button", { name: "Save override" }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await page.getByLabel("Search exercises").fill("My chest movement");
  await page
    .getByRole("button", { name: "My chest movement", exact: true })
    .click();
  await expect(page.getByLabel("triceps weight")).toHaveValue("0.5");
});

test("optional strength history, matched-RIR progression, and two-device sync", async ({
  browser,
}) => {
  const user = {
    id: "11111111-1111-4111-8111-111111111111",
    email: "test@example.com",
    aud: "authenticated",
    role: "authenticated",
    created_at: new Date().toISOString(),
  };
  let cloud: { payload: any; revision: number } | null = null;
  const contexts = await Promise.all([
    browser.newContext({ viewport: { width: 390, height: 844 } }),
    browser.newContext({ viewport: { width: 390, height: 844 } }),
  ]);
  for (const context of contexts)
    await context.route(
      "https://nivzauhtjxwxyfelkpwk.supabase.co/**",
      async (route) => {
        const req = route.request();
        const path = new URL(req.url()).pathname;
        let json: any = {};
        let status = 200;
        if (path.includes("/auth/v1/token"))
          json = {
            access_token: "test-token",
            refresh_token: "test-refresh",
            expires_in: 3600,
            token_type: "bearer",
            user,
          };
        else if (path.includes("/auth/v1/user")) json = user;
        else if (path.includes("/rest/v1/workout_sync"))
          json = cloud ? [{ ...cloud, user_id: user.id }] : [];
        else if (path.includes("/rpc/save_workout")) {
          const body = req.postDataJSON();
          if (body.expected_revision !== (cloud?.revision || 0)) {
            status = 409;
            json = { message: "Another device changed the data. Retry sync." };
          } else {
            cloud = {
              payload: body.new_payload,
              revision: (cloud?.revision || 0) + 1,
            };
            json = cloud.revision;
          }
        }
        await route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify(json),
        });
      },
    );
  const desktop = await contexts[0].newPage(),
    phone = await contexts[1].newPage();
  const errors: string[] = [];
  desktop.on("pageerror", (e) => errors.push(e.message));
  phone.on("pageerror", (e) => errors.push(e.message));
  async function signIn(page: typeof desktop) {
    await page.getByRole("link", { name: "Settings", exact: false }).click();
    await page.getByLabel("Email", { exact: true }).fill("test@example.com");
    await page.getByLabel("Password", { exact: true }).fill("example-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText("Signed in: test@example.com")).toBeVisible();
    await expect(page.getByText(/^Synced /)).toBeVisible();
  }
  await desktop.goto(base);
  await desktop.getByRole("button", { name: "Start workout" }).click();
  await desktop
    .getByLabel("Search exercises")
    .fill("Barbell Bench Press - Medium Grip");
  await desktop
    .getByRole("button", { name: "Select", exact: true })
    .first()
    .click();
  await desktop.getByLabel("Set 1 strength tracking", { exact: true }).check();
  await desktop.getByLabel("Set 1 load", { exact: true }).fill("100");
  await desktop.getByLabel("Set 1 actual reps", { exact: true }).fill("5");
  await desktop.getByLabel("Set 1 RIR", { exact: true }).fill("2");
  await desktop.getByLabel("Set 1 completed", { exact: true }).check();
  await expect(
    desktop.locator(".stats").getByText("1/1", { exact: true }),
  ).toBeVisible();
  await desktop.getByRole("button", { name: "Complete workout" }).click();
  await signIn(desktop);
  await phone.goto(base);
  await signIn(phone);
  await phone.getByRole("link", { name: "Progress", exact: false }).click();
  await expect(
    phone.getByRole("cell", { name: "100 lb", exact: true }),
  ).toBeVisible();
  await expect(
    phone.getByRole("cell", { name: "123.3 lb", exact: true }).last(),
  ).toBeVisible();
  // New workout on phone: improve load while keeping reps/RIR matched.
  await phone.getByRole("link", { name: "Workout", exact: false }).click();
  await phone.getByRole("button", { name: "Start workout" }).click();
  await phone
    .getByLabel("Search exercises")
    .fill("Barbell Bench Press - Medium Grip");
  await phone
    .getByRole("button", { name: "Select", exact: true })
    .first()
    .click();
  await phone.getByLabel("Set 1 strength tracking", { exact: true }).check();
  await phone.getByLabel("Set 1 load", { exact: true }).fill("105");
  await phone.getByLabel("Set 1 actual reps", { exact: true }).fill("5");
  await phone.getByLabel("Set 1 RIR", { exact: true }).fill("2");
  await phone.getByLabel("Set 1 completed", { exact: true }).check();
  await expect(
    phone.locator(".stats").getByText("1/1", { exact: true }),
  ).toBeVisible();
  await phone.getByRole("button", { name: "Complete workout" }).click();
  await phone.getByRole("link", { name: "Settings", exact: false }).click();
  await phone.getByRole("button", { name: "Sync now", exact: true }).click();
  await expect.poll(() => cloud?.payload.sets.length).toBe(2);
  await desktop.getByRole("button", { name: "Sync now", exact: true }).click();
  await desktop.getByRole("link", { name: "Progress", exact: false }).click();
  await expect(
    desktop.getByRole("cell", { name: "105 lb", exact: true }),
  ).toBeVisible();
  await expect(
    desktop.getByRole("cell", { name: "More load at matched reps and RIR" }),
  ).toBeVisible();
  await desktop.reload();
  await expect(
    desktop.getByRole("cell", { name: "105 lb", exact: true }),
  ).toBeVisible();
  await desktop.screenshot({
    path: "test-results/mobile-strength.png",
    fullPage: true,
  });
  // Planning records are included in the same account-isolated sync snapshot.
  await desktop.getByRole("link", { name: "Templates", exact: true }).click();
  await desktop
    .getByRole("button", { name: "New template", exact: true })
    .click();
  await desktop.getByLabel("Template name").fill("Synced Push");
  await desktop
    .getByLabel("Find exercise for template")
    .fill("Barbell Bench Press - Medium Grip");
  await desktop
    .getByRole("button", {
      name: "Add Barbell Bench Press - Medium Grip",
      exact: true,
    })
    .click();
  await desktop
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await desktop.getByRole("link", { name: "Training", exact: true }).click();
  await desktop
    .getByRole("button", { name: "New mesocycle", exact: true })
    .click();
  await desktop.getByLabel("Mesocycle name").fill("Synced block");
  await desktop.getByLabel("Start date", { exact: true }).fill("2026-09-01");
  await desktop.getByLabel("End date", { exact: true }).fill("2026-10-12");
  await desktop
    .getByRole("group", { name: "Associated templates" })
    .getByLabel("Synced Push")
    .check();
  await desktop
    .getByRole("button", { name: "Save mesocycle", exact: true })
    .click();
  await desktop.getByRole("link", { name: "Settings", exact: true }).click();
  await desktop.getByRole("button", { name: "Sync now", exact: true }).click();
  await expect.poll(() => cloud?.payload.templates?.length).toBe(1);
  await expect.poll(() => cloud?.payload.mesocycles?.length).toBe(1);
  await phone.getByRole("button", { name: "Sync now", exact: true }).click();
  await phone.getByRole("link", { name: "Training", exact: true }).click();
  await expect(
    phone.getByRole("heading", { name: "Synced block", exact: true }),
  ).toBeVisible();
  await phone.getByRole("link", { name: "Templates", exact: true }).click();
  await expect(phone.getByText("Synced Push", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  await Promise.all(contexts.map((c) => c.close()));
});

test("backdated template session, explicit block membership, immutable plans and progress", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "#templates");
  await page.getByRole("button", { name: "New template", exact: true }).click();
  await page.getByLabel("Template name").fill("Push Test");
  await page
    .getByLabel("Find exercise for template")
    .fill("Barbell Bench Press - Medium Grip");
  await page
    .getByRole("button", {
      name: "Add Barbell Bench Press - Medium Grip",
      exact: true,
    })
    .click();
  await page.getByLabel("Target sets", { exact: true }).fill("3");
  await page.getByLabel("Target reps", { exact: true }).fill("8");
  await page.getByLabel("Target RIR", { exact: true }).fill("1");
  await page
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await page.getByRole("link", { name: "Training", exact: true }).click();
  await page
    .getByRole("button", { name: "New mesocycle", exact: true })
    .click();
  await page.getByLabel("Mesocycle name").fill("Hypertrophy A");
  await page.getByLabel("Start date", { exact: true }).fill("2026-09-01");
  await page.getByLabel("End date", { exact: true }).fill("2026-10-12");
  await page.getByLabel("Training goal").fill("Build muscle");
  await page
    .getByRole("group", { name: "Associated templates" })
    .getByLabel("Push Test")
    .check();
  await page
    .getByRole("button", { name: "Save mesocycle", exact: true })
    .click();
  await page.getByLabel("Workout date", { exact: true }).fill("2026-08-25");
  await page
    .getByLabel("Workout template")
    .selectOption({ label: "Push Test" });
  await page
    .getByLabel("Mesocycle (optional)")
    .selectOption({ label: "Hypertrophy A" });
  await expect(
    page.getByText("Outside the planned date range.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start workout" }).click();
  await expect(
    page.getByLabel("Set 1 target reps", { exact: true }),
  ).toHaveValue("8");
  await expect(
    page.getByLabel("Set 1 actual reps", { exact: true }),
  ).toHaveValue("");
  await expect(page.getByLabel("Set 1 RIR", { exact: true })).toHaveValue("");
  await page.getByLabel("Set 1 strength tracking", { exact: true }).check();
  await page.getByLabel("Set 1 load", { exact: true }).fill("100");
  await page.getByLabel("Set 1 actual reps", { exact: true }).fill("5");
  await page.getByLabel("Set 1 RIR", { exact: true }).fill("1");
  await page.getByLabel("Set 1 completed", { exact: true }).check();
  await expect(
    page.locator(".stats").getByText("1/3", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Complete workout" }).click();
  await page.getByRole("link", { name: "Templates", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit template", exact: true })
    .click();
  await page.getByLabel("Target reps", { exact: true }).fill("12");
  await page
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await page.getByRole("link", { name: "History", exact: false }).click();
  await page.locator(".history-row").click();
  await expect(
    page.getByLabel("Set 1 target reps", { exact: true }),
  ).toHaveValue("8");
  await page.getByText("Workout date & mesocycle", { exact: true }).click();
  await page.getByLabel("Performed date", { exact: true }).fill("2026-09-10");
  await page.getByRole("button", { name: "Save workout details" }).click();
  await expect(
    page.getByText("Workout details saved.", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await page.locator(".history-row").click();
  await page.getByText("Workout date & mesocycle", { exact: true }).click();
  await expect(page.getByLabel("Performed date", { exact: true })).toHaveValue(
    "2026-09-10",
  );
  await expect(page.getByLabel("Assign mesocycle")).toHaveValue(/.+/);
  await expect(
    page.getByLabel("Set 1 target reps", { exact: true }),
  ).toHaveValue("8");
  await page.screenshot({
    path: "test-results/mobile-session-plan.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Progress", exact: true }).click();
  await page
    .getByLabel("Progress mesocycle")
    .selectOption({ label: "Hypertrophy A" });
  await expect(
    page.getByRole("cell", { name: "Week 2", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Muscle exposure", exact: true })
    .click();
  await expect(
    page.getByRole("columnheader", { name: "chest", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "4.0", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Group progress by").selectOption("mesocycle");
  await expect(
    page.getByRole("cell", { name: "Hypertrophy A", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/mobile-block-progress.png",
    fullPage: true,
  });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Export JSON backup" }).click();
  await downloadPromise;
  expect(errors).toEqual([]);
});

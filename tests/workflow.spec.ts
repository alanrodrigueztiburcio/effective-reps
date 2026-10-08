import { test, expect } from "@playwright/test";
const base = process.env.BASE_PATH || "/effective-reps/";
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
  await page.getByRole("button", { name: "0", exact: true }).click();
  await page.getByRole("button", { name: "Log set +" }).click();
  await expect(page.getByText("Set logged.", { exact: false })).toBeVisible();
  await expect(
    page.locator(".stats").getByText("5", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Repetitions", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.locator(".stats").getByText("3", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Rest-pause", exact: true }).click();
  await page.getByLabel("Activation reps").fill("10");
  await page.getByLabel("Mini-set reps").fill("6");
  await page.getByRole("button", { name: "Log set +" }).click();
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

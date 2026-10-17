import { expect, test } from "@playwright/test";
const base = process.env.BASE_PATH || "/effective-reps/";
test("desktop planner: explicit periods, range analytics, scheduled snapshots, actuals and day/microcycle drag moves", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1720, height: 1100 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "#templates");
  await page.getByRole("button", { name: "New template", exact: true }).click();
  await page.getByLabel("Template name").fill("Upper A");
  await page
    .getByLabel("Find exercise for template")
    .fill("Barbell Bench Press - Medium Grip");
  await page
    .getByRole("button", {
      name: "Add Barbell Bench Press - Medium Grip",
      exact: true,
    })
    .click();
  await page.getByLabel("Target sets", { exact: true }).fill("1");
  await page
    .getByLabel("Planned set 1 target reps", { exact: true })
    .fill("2–4");
  await page.getByLabel("Planned set 1 target RIR", { exact: true }).fill("1");
  await page.getByLabel("Planned set 1 load", { exact: true }).fill("100");
  await page
    .getByLabel("Planned set 1 strength tracking", { exact: true })
    .check();
  await page
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await page.getByRole("link", { name: "Planner", exact: true }).click();
  await page
    .getByRole("button", { name: "New macrocycle", exact: true })
    .click();
  await page
    .getByLabel("Macrocycle name", { exact: true })
    .fill("2026 Program");
  await page.getByLabel("Period start", { exact: true }).fill("2026-01-01");
  await page.getByLabel("Period end", { exact: true }).fill("2026-12-31");
  await page
    .getByRole("button", { name: "Save macrocycle", exact: true })
    .click();
  await page
    .getByRole("button", { name: "New mesocycle", exact: true })
    .click();
  await page.getByLabel("Mesocycle name", { exact: true }).fill("Strength A");
  await page
    .getByLabel("Parent macrocycle", { exact: true })
    .selectOption({ label: "2026 Program" });
  await page.getByLabel("Start date", { exact: true }).fill("2026-10-01");
  await page.getByLabel("End date", { exact: true }).fill("2026-11-30");
  await page
    .getByRole("button", { name: "Save mesocycle", exact: true })
    .click();
  async function createMicro(name: string, start: string, end: string) {
    const controls = page.locator(".cycle-management");
    if (!(await controls.evaluate((el) => (el as HTMLDetailsElement).open)))
      await controls.locator("summary").first().click();
    await page
      .getByRole("button", { name: "New microcycle", exact: true })
      .click();
    await page.getByLabel("Microcycle name", { exact: true }).fill(name);
    await page.getByLabel("Period start", { exact: true }).fill(start);
    await page.getByLabel("Period end", { exact: true }).fill(end);
    await page
      .getByRole("button", { name: "Save microcycle", exact: true })
      .click();
    await expect(
      page.getByText("Training period saved.", { exact: false }),
    ).toBeVisible();
  }
  await createMicro("Nine days", "2026-10-01", "2026-10-09");
  await createMicro("Next micro", "2026-10-10", "2026-10-16");
  await page
    .getByLabel("Planner microcycle", { exact: true })
    .selectOption({ label: "Nine days · 2026-10-01" });
  await expect(page.locator(".planner-day")).toHaveCount(9);
  await page.getByLabel("Planner day", { exact: true }).fill("2026-10-02");
  await page
    .getByLabel("Quick-add template", { exact: true })
    .selectOption({ label: "Upper A" });
  await page
    .getByRole("button", { name: "Schedule workout", exact: true })
    .click();
  const sourceDay = page.locator('[data-planner-day="2026-10-02"]'),
    card = sourceDay.locator(".scheduled-card");
  await expect(card).toHaveCount(1);
  await expect(
    page.getByLabel("chest exposure", { exact: true }),
  ).toContainText("0 / 2–4 ER");
  await card
    .locator("summary")
    .filter({ hasText: "Barbell Bench Press - Medium Grip" })
    .click();
  await expect(card.getByLabel("Planned 1 reps", { exact: true })).toHaveValue(
    "2–4",
  );
  await page.screenshot({
    path: "test-results/desktop-planner.png",
    fullPage: true,
  });
  await card.getByRole("button", { name: "Upper A", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Begin logging", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Begin logging", exact: true })
    .click();
  await expect(
    page.getByLabel("Set 1 actual reps", { exact: true }),
  ).toHaveValue("");
  await page.getByLabel("Set 1 actual reps", { exact: true }).fill("3");
  await page.getByLabel("Set 1 RIR", { exact: true }).fill("0");
  await page.getByLabel("Set 1 completed", { exact: true }).check();
  await expect(
    page.locator(".stats").getByText("3", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Complete workout", exact: true })
    .click();
  await page.getByRole("link", { name: "Planner", exact: true }).click();
  await expect(
    page.getByLabel("chest exposure", { exact: true }),
  ).toContainText("3 / 2–4 ER");
  await card.getByRole("button", { name: "Copy", exact: true }).click();
  await page
    .getByLabel("Destination microcycle", { exact: true })
    .selectOption({ label: "Next micro" });
  await page.getByLabel("Planner day", { exact: true }).fill("2026-10-12");
  await page
    .getByRole("button", { name: "Copy plan to day", exact: true })
    .click();
  await page
    .getByLabel("Planner microcycle", { exact: true })
    .selectOption({ label: "Next micro · 2026-10-10" });
  await expect(
    page.getByLabel("chest exposure", { exact: true }),
  ).toContainText("0 / 2–4 ER");
  await page.getByRole("button", { name: "Meso", exact: true }).click();
  await expect(
    page.getByLabel("chest exposure", { exact: true }),
  ).toContainText("3 / 4–8 ER");
  await page.getByRole("button", { name: "Macro", exact: true }).click();
  await expect(
    page.getByLabel("chest exposure", { exact: true }),
  ).toContainText("3 / 4–8 ER");
  await page
    .getByLabel("Planned or completed", { exact: true })
    .selectOption("planned");
  await expect(
    page.getByLabel("chest exposure", { exact: true }),
  ).toContainText("4–8 ER");
  await page
    .getByLabel("Planned or completed", { exact: true })
    .selectOption("completed");
  await expect(
    page.getByLabel("chest exposure", { exact: true }),
  ).toContainText("3 ER");
  await page
    .getByLabel("Planned or completed", { exact: true })
    .selectOption("compare");
  await page
    .getByLabel("Copy plan when dragging (or hold Alt/Option)", { exact: true })
    .uncheck();
  await page
    .locator('[data-planner-day="2026-10-12"] .scheduled-card')
    .dragTo(page.locator('[data-planner-day="2026-10-13"]'));
  await expect(
    page.locator('[data-planner-day="2026-10-13"] .scheduled-card'),
  ).toHaveCount(1);
  await page
    .locator('[data-planner-day="2026-10-13"] .scheduled-card')
    .dragTo(page.getByRole("button", { name: "Nine days", exact: true }));
  await page
    .getByLabel("Planner microcycle", { exact: true })
    .selectOption({ label: "Nine days · 2026-10-01" });
  await expect(
    page.locator('[data-planner-day="2026-10-01"] .scheduled-card'),
  ).toHaveCount(1);
  await page.reload();
  await expect(
    page.locator('[data-planner-day="2026-10-02"] .scheduled-card'),
  ).toHaveCount(1);
  await expect(
    page.getByLabel("chest exposure", { exact: true }),
  ).toContainText("3 / 4–8 ER");
  expect(errors).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/mobile-cycle-planner.png",
    fullPage: true,
  });
});

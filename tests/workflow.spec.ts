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

test('optional strength history, matched-RIR progression, and two-device sync', async ({browser}) => {
  const user={id:'11111111-1111-4111-8111-111111111111',email:'test@example.com',aud:'authenticated',role:'authenticated',created_at:new Date().toISOString()};
  let cloud: {payload: any; revision: number} | null=null;
  const contexts=await Promise.all([browser.newContext({viewport:{width:390,height:844}}),browser.newContext({viewport:{width:390,height:844}})]);
  for(const context of contexts) await context.route('https://nivzauhtjxwxyfelkpwk.supabase.co/**',async route=>{
    const req=route.request();const path=new URL(req.url()).pathname;
    let json:any={};let status=200;
    if(path.includes('/auth/v1/token')) json={access_token:'test-token',refresh_token:'test-refresh',expires_in:3600,token_type:'bearer',user};
    else if(path.includes('/auth/v1/user')) json=user;
    else if(path.includes('/rest/v1/workout_sync')) json=cloud ? [{...cloud,user_id:user.id}] : [];
    else if(path.includes('/rpc/save_workout')) {const body=req.postDataJSON();if(body.expected_revision!==(cloud?.revision || 0)){status=409;json={message:'Another device changed the data. Retry sync.'};}else{cloud={payload:body.new_payload,revision:(cloud?.revision || 0)+1};json=cloud.revision;}}
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(json)});
  });
  const desktop=await contexts[0].newPage(),phone=await contexts[1].newPage();
  const errors:string[]=[];desktop.on('pageerror',e=>errors.push(e.message));phone.on('pageerror',e=>errors.push(e.message));
  async function signIn(page: typeof desktop) {
    await page.getByRole('link',{name:'Settings',exact:false}).click();
    await page.getByLabel('Email',{exact:true}).fill('test@example.com');
    await page.getByLabel('Password',{exact:true}).fill('example-password');
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await expect(page.getByText('Signed in: test@example.com')).toBeVisible();
    await expect(page.getByText(/^Synced /)).toBeVisible();
  }
  await desktop.goto(base);
  await desktop.getByRole('button',{name:'Start workout'}).click();
  await desktop.getByLabel('Search exercises').fill('Barbell Bench Press - Medium Grip');
  await desktop.getByRole('button',{name:'Select',exact:true}).first().click();
  await desktop.getByLabel('Track strength for this exercise').check();
  await desktop.getByLabel('Load',{exact:true}).fill('100');
  await desktop.getByLabel('Repetitions',{exact:true}).fill('5');
  await desktop.getByRole('button',{name:'Log set +'}).click();
  await expect(desktop.locator('.set-log').getByText('100 lb · 5 reps · RIR 2')).toBeVisible();
  await desktop.getByRole('button',{name:'Complete workout'}).click();
  await signIn(desktop);
  await phone.goto(base);await signIn(phone);
  await phone.getByRole('link',{name:'Strength',exact:false}).click();
  await expect(phone.getByRole('cell',{name:'100 lb',exact:true})).toBeVisible();
  await expect(phone.getByRole('cell',{name:'123.3 lb',exact:true})).toBeVisible();
  // New workout on phone: improve load while keeping reps/RIR matched.
  await phone.getByRole('link',{name:'Workout',exact:false}).click();
  await phone.getByRole('button',{name:'Start workout'}).click();
  await phone.getByLabel('Search exercises').fill('Barbell Bench Press - Medium Grip');
  await phone.getByRole('button',{name:'Select',exact:true}).first().click();
  await expect(phone.getByLabel('Track strength for this exercise')).toBeChecked();
  await phone.getByLabel('Load',{exact:true}).fill('105');
  await phone.getByLabel('Repetitions',{exact:true}).fill('5');
  await phone.getByRole('button',{name:'Log set +'}).click();
  await phone.getByRole('button',{name:'Complete workout'}).click();
  await phone.getByRole('link',{name:'Settings',exact:false}).click();
  await phone.getByRole('button',{name:'Sync now',exact:true}).click();
  await expect.poll(()=>cloud?.payload.sets.length).toBe(2);
  await desktop.getByRole('button',{name:'Sync now',exact:true}).click();
  await desktop.getByRole('link',{name:'Strength',exact:false}).click();
  await expect(desktop.getByRole('cell',{name:'105 lb',exact:true})).toBeVisible();
  await expect(desktop.getByRole('cell',{name:'More load at matched reps and RIR'})).toBeVisible();
  await desktop.reload();
  await expect(desktop.getByRole('cell',{name:'105 lb',exact:true})).toBeVisible();
  await desktop.screenshot({path:'test-results/mobile-strength.png',fullPage:true});
  expect(errors).toEqual([]);
  await Promise.all(contexts.map(c=>c.close()));
});

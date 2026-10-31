import { expect, test, type Page } from "@playwright/test";

async function start(page: Page) {
  await page.goto("/");
  await page.getByLabel("Your name").fill("Dhairya");
  await page.getByRole("button", { name: "Start" }).click();
}

async function createGroup(page: Page, name: string, people: string[]) {
  await page.getByRole("button", { name: "Create a group" }).click();
  await page.getByLabel("Group name").fill(name);
  for (const person of people) {
    await page.getByLabel("New person's name").fill(person);
    await page.getByRole("button", { name: "Add person" }).click();
    await expect(page.getByRole("button", { name: new RegExp(`^.?${person}`) })).toBeVisible();
  }
  await page.getByRole("button", { name: "Create group" }).click();
  await expect(page.getByLabel("Amount")).toBeFocused();
}

async function tap(page: Page, keys: string) {
  for (const key of keys) await page.getByRole("group", { name: "Keypad" }).getByRole("button", { name: key, exact: true }).click();
}

test("first expense in 3 taps: + , amount, Save", async ({ page }) => {
  await start(page);
  await createGroup(page, "Goa trip", ["Rahul", "Priya"]);
  await tap(page, "900");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Added")).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
  await expect(page.getByText("you get back ₹600")).toBeVisible();
  await expect(page.getByText("You are owed ₹600")).toBeVisible();

  await page.getByRole("button", { name: "Add expense" }).click();
  await expect(page.getByLabel("Amount")).toBeFocused();
  await expect(page.getByText("Paid by")).toContainText("you");
  await expect(page.getByText("Paid by")).toContainText("equally");
  await expect(page.getByText("Paid by")).toContainText("3 people");
});

test("full flow: three expenses, balances, breakdown, settle, undo, share", async ({ page }) => {
  await start(page);
  await createGroup(page, "Goa trip", ["Rahul", "Priya"]);

  await page.getByLabel("Amount").fill("3000");
  await page.getByLabel("What was it for?").fill("Hotel");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await page.getByRole("button", { name: "Add expense" }).click();
  await tap(page, "450+150");
  await expect(page.getByText("= ₹600")).toBeVisible();
  await page.getByLabel("What was it for?").fill("Uber to airport");
  await page.getByRole("button", { name: "you", exact: true }).click();
  await page.getByRole("button", { name: "Rahul" }).click();
  await page.getByRole("button", { name: "3 people" }).click();
  await page.getByRole("button", { name: "You included" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Uber to airport")).toBeVisible();

  // An exact split must block Save until it adds up.
  await page.getByRole("button", { name: "Add expense" }).click();
  await page.getByLabel("Amount").fill("300");
  await page.getByRole("button", { name: "equally" }).click();
  await page.getByRole("button", { name: "Exact" }).click();
  await page.getByLabel("You Exact").fill("100");
  await page.getByLabel("Rahul Exact").fill("100");
  await page.getByLabel("Priya Exact").fill("0");
  await expect(page.getByText("₹100 left to assign")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await page.getByLabel("Priya Exact").fill("100");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  // Rahul paid last, so the app remembered him as payer for this one: Rahul -₹500, Priya -₹1,400.
  await page.getByRole("link", { name: "Balances" }).click();
  await expect(page.getByRole("button", { name: /Priya pays you ₹1,400/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Rahul pays you ₹500/ })).toBeVisible();

  await page.getByRole("button", { name: /Priya pays you ₹1,400/ }).click();
  await expect(page.getByText("Hotel")).toBeVisible();
  await expect(page.getByText("Overall, Priya owes ₹1,400")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Mark as settled" }).first().click();
  await page.getByLabel("Amount paid back").fill("300");
  await page.getByRole("button", { name: "Save ₹300" }).click();
  await expect(page.getByRole("button", { name: /Priya pays you ₹1,100/ })).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("button", { name: /Priya pays you ₹1,400/ })).toBeVisible();

  await page.getByRole("button", { name: "Share summary" }).click();
  await expect(page.getByText("Total ₹3,900")).toBeVisible();
  await page.evaluate(() => { Object.defineProperty(navigator, "share", { value: undefined }); });
  await page.getByRole("button", { name: "Share read-only link" }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toContain("/s#");

  // Open the link as a stranger with an empty browser.
  const stranger = await page.context().browser()!.newContext({ baseURL: "http://localhost:4173" });
  const friend = await stranger.newPage();
  await friend.goto(link.slice(link.indexOf("http")));
  await expect(friend.getByRole("heading", { name: /Goa trip/ })).toBeVisible();
  await expect(friend.getByText("Priya pays Dhairya ₹1,400")).toBeVisible();
  await stranger.close();
});

test("works with the internet off, and data survives a reload", async ({ page, context }) => {
  await start(page);
  await createGroup(page, "Flat", ["Asha"]);
  await page.getByLabel("Amount").fill("1000");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("You are owed ₹500")).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.getByText("You are owed ₹500")).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("You are owed ₹500")).toBeVisible();
  await page.getByRole("button", { name: "Add expense" }).click();
  await page.getByLabel("Amount").fill("200");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("You are owed ₹600")).toBeVisible();
});

test("multiple payers must add up before saving", async ({ page }) => {
  await start(page);
  await createGroup(page, "Flat", ["Rahul"]);
  await page.getByLabel("Amount").fill("1000");
  await page.getByRole("button", { name: "you", exact: true }).click();
  await page.getByRole("button", { name: "Multiple people paid" }).click();
  await page.getByLabel("You paid").fill("600");
  await expect(page.getByText("₹400 left to assign")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await page.getByLabel("Rahul paid").fill("400");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("You are owed ₹100")).toBeVisible();
});

test("delete and undo, removal rule, archive, backup round trip", async ({ page }) => {
  await start(page);
  await createGroup(page, "Dinner", ["Sam"]);
  await page.getByLabel("Amount").fill("400");
  await page.getByLabel("What was it for?").fill("Pizza");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await page.getByRole("button", { name: /Pizza/ }).click();
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("button", { name: "Delete expense" }).click();
  await expect(page.getByText("You are settled up")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("You are owed ₹200")).toBeVisible();

  await page.getByRole("button", { name: "People" }).click();
  await page.getByRole("button", { name: "Remove Sam" }).click();
  await expect(page.getByText("Settle this person's balance before removing them")).toBeVisible();
  await page.getByRole("button", { name: "Archive group" }).click();
  await expect(page.getByText("This group is archived")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add expense" })).toHaveCount(0);

  await page.goto("/settings");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export backup" }).click();
  const path = await (await download).path();
  await page.getByRole("button", { name: "Clear all data" }).click();
  await page.getByRole("button", { name: "Delete everything" }).click();
  await expect(page.getByRole("button", { name: "Start" })).toBeVisible();

  await page.getByLabel("Your name").fill("Dhairya");
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByText("Start with a group")).toBeVisible();
  await page.goto("/settings");
  await page.getByLabel("Backup file").setInputFiles(path);
  await page.getByRole("button", { name: "Replace everything" }).click();
  await expect(page.getByText("Dinner")).toBeVisible();
});

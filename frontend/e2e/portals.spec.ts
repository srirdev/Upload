import { expect, test, type Page } from "@playwright/test";

/**
 * One browser, several portals signed in at once. Switching uses the real "Switch portal" menu (client-side
 * navigation, no reload), from both setup screens and the portal layouts.
 */
const PASSWORD = "e2e-pass-1234";

async function signUp(page: Page, role: "student" | "shop" | "rider", name: string, mobile: string) {
  await page.getByRole("button", { name: "New here? Create an account" }).click();
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Mobile number").fill(mobile);
  await page.getByLabel("Email address").fill(`${role}.${mobile}@e2e.upload`);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByRole("button", { name: /Create account/ }).click();
}

async function switchTo(page: Page, portal: RegExp) {
  await page.getByRole("button", { name: /Switch portal/ }).first().click();
  await page.getByRole("menuitem", { name: portal }).click();
}

test("stay signed in to several portals and switch between them", async ({ page }) => {
  await page.goto("/student/login");
  await signUp(page, "student", "Asha Raman", "9876543210");
  await expect(page.getByRole("heading", { name: "Set up your profile" })).toBeVisible();
  // finish the student profile so the student portal shows its main layout
  await page.getByLabel("College").selectOption({ label: "Sample College (dev), Chennai" });
  await page.getByLabel("Department").fill("Computer Science");
  await page.getByLabel("Register number").fill("21CS001");
  if (!(await page.getByLabel("Full name").inputValue())) await page.getByLabel("Full name").fill("Asha Raman");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(/Asha/).first()).toBeVisible();

  await switchTo(page, /Printing Shop.*Not signed in/);
  await expect(page).toHaveURL(/\/shop\/login$/);
  await signUp(page, "shop", "Ravi Kumar", "9111111111");
  await expect(page.getByRole("heading", { name: "Register your shop" })).toBeVisible();

  // the menu shows both sign-ins
  await page.getByRole("button", { name: /Switch portal/ }).first().click();
  await expect(page.getByRole("menuitem", { name: /Student.*Signed in · Asha Raman/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Printing Shop.*Signed in · Ravi Kumar/ })).toBeVisible();
  await page.getByRole("menuitem", { name: /^Student/ }).click();
  await expect(page).toHaveURL(/\/student$/);
  await expect(page.getByText(/Asha/).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Register your shop" })).toHaveCount(0);

  await switchTo(page, /Printing Shop/);
  await expect(page).toHaveURL(/\/shop$/);
  await expect(page.getByRole("heading", { name: "Register your shop" })).toBeVisible();

  // a full page reload keeps both sign-ins
  await page.reload();
  await expect(page.getByRole("heading", { name: "Register your shop" })).toBeVisible();
  await switchTo(page, /^Student/);
  await expect(page.getByText(/Asha/).first()).toBeVisible();

  // signing out of one portal leaves the other signed in
  await switchTo(page, /Printing Shop/);
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(page).toHaveURL(/\/shop\/login$/);
  await switchTo(page, /^Student/);
  await expect(page).toHaveURL(/\/student$/);
  await expect(page.getByText(/Asha/).first()).toBeVisible();
});

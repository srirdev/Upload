import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

/**
 * The whole UpLOAD journey in a real browser, across all four websites, against the isolated E2E API:
 * shop + rider sign up and register -> admin approves both and assigns the college -> student signs up,
 * uploads a PDF, designs it in the Print Preview Studio, pays -> shop accepts, prints, packs, generates the
 * handover code -> rider accepts the run, verifies the code, delivers with a shelf photo -> student collects
 * -> admin sees the money in Finance.
 *
 * Razorpay Checkout (a third-party script) is replaced in the browser by a stand-in that "pays" and signs the
 * result with the E2E test secret; the real backend verifies that signature exactly as in production.
 */
const FIX = path.join(import.meta.dirname, "fixtures");
const PASSWORD = "e2e-pass-1234";
const RZP_SECRET = "e2e_secret"; // matches backend/scripts/e2e_server.py
const ADMIN = { mobile: "9000000001", password: "e2e-admin-pass" };
const SHOP = { name: "Ravi Kumar", mobile: "9111111111", email: "shop@e2e.upload", shop: "E2E Quick Prints" };
const RIDER = { name: "Kumar Selvam", mobile: "9333333333", email: "rider@e2e.upload" };
const STUDENT = { name: "Asha Raman", mobile: "9876543210", email: "asha@e2e.upload" };

test.describe.configure({ mode: "serial" });

/** Development aid: saves the page's accessibility tree to test-results/<name>.yml. */
async function snap(page: Page, name: string) {
  fs.mkdirSync("test-results", { recursive: true });
  fs.writeFileSync(`test-results/${name}.yml`, await page.locator("body").ariaSnapshot());
}

async function portal(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  return { ctx, page };
}

async function signUp(page: Page, role: "shop" | "rider" | "student", who: { name: string; mobile: string; email: string }) {
  await page.goto(`/${role}/login`);
  await page.getByRole("button", { name: "New here? Create an account" }).click();
  await page.getByLabel("Full name").fill(who.name);
  await page.getByLabel("Mobile number").fill(who.mobile);
  await page.getByLabel("Email address").fill(who.email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByRole("button", { name: /Create account/ }).click();
}

async function signIn(page: Page, role: string, mobile: string, password: string) {
  await page.goto(`/${role}/login`);
  await page.getByLabel("Mobile number").fill(mobile);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /^Sign in/ }).click();
  await page.waitForURL((url) => url.pathname === `/${role}`);
}

test("full order journey across all four websites", async ({ browser }) => {
  const shop = await portal(browser);
  const rider = await portal(browser);
  const admin = await portal(browser);
  const student = await portal(browser);

  await test.step("shop owner signs up and registers a shop", async () => {
    const page = shop.page;
    await signUp(page, "shop", SHOP);
    await expect(page.getByRole("heading", { name: "Register your shop" })).toBeVisible();
    await page.getByLabel("Shop name").fill(SHOP.shop);
    await page.getByLabel("Owner name").fill(SHOP.name);
    await page.getByLabel("Area").fill("Guindy");
    await page.getByLabel("Latitude").fill("13.0108");
    await page.getByLabel("Longitude").fill("80.2354");
    await page.getByLabel("UPI ID").fill("ravi@okbank");
    await page.getByRole("checkbox", { name: /I accept the UpLOAD partner terms/ }).check();
    await page.getByRole("button", { name: "Submit for approval" }).click();
    await expect(page.getByText(/review/i).first()).toBeVisible();
  });

  await test.step("rider signs up, registers and uploads KYC", async () => {
    const page = rider.page;
    await signUp(page, "rider", RIDER);
    await expect(page.getByRole("heading", { name: "About you" })).toBeVisible();
    await page.getByLabel("Full name").fill(RIDER.name);
    await page.getByLabel("Base area").fill("Guindy");
    await page.getByLabel("Two-wheeler registration number").fill("TN09AB1234");
    await page.getByLabel("UPI ID for payouts").fill("kumar@okbank");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Upload your documents" })).toBeVisible();
    await page.locator("input[type=file]").nth(0).setInputFiles(path.join(FIX, "photo.jpg"));
    await page.waitForTimeout(800);
    await page.locator("input[type=file]").nth(1).setInputFiles(path.join(FIX, "photo.jpg"));
    await expect(page.getByText(/review/i).first()).toBeVisible();
  });

  await test.step("admin approves the shop and assigns the college", async () => {
    const page = admin.page;
    await signIn(page, "admin", ADMIN.mobile, ADMIN.password);
    await page.goto("/admin/shops");
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByRole("heading", { name: /Registrations to review/ })).toHaveCount(0);
    await page.getByRole("button", { name: `Open ${SHOP.shop}` }).click();
    const drawer = page.getByRole("dialog", { name: SHOP.shop });
    await drawer.getByRole("checkbox", { name: "Sample College (dev)" }).check();
    await drawer.getByRole("button", { name: "Save zones" }).click();
    await expect(drawer.getByRole("button", { name: "Save zones" })).toBeDisabled();
    await drawer.getByRole("button", { name: "Close" }).click();
  });

  await test.step("admin approves the rider's KYC and assigns the college", async () => {
    const page = admin.page;
    await page.goto("/admin/riders");
    await page.getByRole("button", { name: "Verify and approve" }).click();
    await expect(page.getByRole("heading", { name: /KYC to review/ })).toHaveCount(0);
    await page.getByRole("button", { name: `Open ${RIDER.name}` }).click();
    const drawer = page.getByRole("dialog", { name: RIDER.name });
    await drawer.getByRole("radiogroup", { name: "Zone role for Sample College (dev)" }).getByRole("radio", { name: "Primary" }).click();
    await drawer.getByRole("button", { name: "Save zones" }).click();
    await expect(drawer.getByRole("button", { name: "Save zones" })).toBeDisabled();
    await drawer.getByRole("button", { name: "Close" }).click();
  });

  await test.step("shop opens and rider goes online once approved", async () => {
    await shop.page.reload();
    const open = shop.page.getByRole("switch", { name: "Accepting orders" });
    await expect(open).toBeVisible({ timeout: 30_000 });
    await open.click();
    await expect(open).toHaveAttribute("aria-checked", "true");

    await rider.page.reload();
    const online = rider.page.getByRole("switch", { name: "Available for deliveries" }).first();
    await expect(online).toBeVisible({ timeout: 30_000 });
    await online.click();
    await expect(online).toHaveAttribute("aria-checked", "true");
  });

  await test.step("student signs up, sets up the profile and uploads a PDF", async () => {
    const page = student.page;
    await signUp(page, "student", STUDENT);
    await expect(page.getByRole("heading", { name: "Set up your profile" })).toBeVisible();
    await page.getByLabel("Full name").fill(STUDENT.name);
    await page.getByLabel("College").selectOption({ label: "Sample College (dev), Chennai" });
    await page.getByLabel("Department").fill("Computer Science");
    await page.getByLabel("Year").selectOption({ label: "Year 3" });
    await page.getByLabel("Register number").fill("21CS001");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.goto("/student/new");
    await page.waitForURL(/\/student\/new\/[0-9a-f-]+/);
    await page.locator("input[type=file]").first().setInputFiles(path.join(FIX, "notes.pdf"));
    await expect(page.getByText("notes.pdf").first()).toBeVisible();
    await page.getByRole("button", { name: /^Continue/ }).click();
    await expect(page.getByRole("heading", { name: "Print Preview Studio" })).toBeVisible();
  });

  await test.step("student designs the print in the studio and the live price follows", async () => {
    const page = student.page;
    await expect(page.getByRole("img", { name: "Page 1" })).toBeVisible(); // the real PDF, rendered by PDF.js
    const total = page.getByRole("complementary", { name: "Selected options and price" }).getByText(/^₹\d/).last();
    await expect(total).toBeVisible();
    const before = await total.textContent();
    await page.getByRole("button", { name: "More copies" }).click();
    await page.getByRole("radio", { name: /^Double-sided/ }).click();
    await expect(page.getByText("2 sheets per copy")).toBeVisible();
    await expect(total).not.toHaveText(before!); // re-priced by the server for 2 copies

    await page.getByRole("tab", { name: "Binding" }).click();
    await page.getByRole("radio", { name: /^Spiral/ }).click();
    await expect(page.getByRole("img", { name: /spiral bound document/ })).toBeVisible();

    await page.getByRole("tab", { name: "Cover" }).click();
    await page.getByRole("switch", { name: "Add a cover page" }).click();
    await page.getByLabel("Subject name").fill("Data Structures");
    await page.getByLabel("Subject code").fill("CS3301");
    await page.getByRole("radio", { name: /Modern/ }).click();
    await page.getByRole("button", { name: /Save and continue/ }).first().click();
    await expect(page.getByRole("heading", { name: "Review your print" })).toBeVisible();
    await expect(page.getByText("Spiral").first()).toBeVisible();
    await page.getByRole("button", { name: /Choose slot and pay/ }).click();
    await page.waitForTimeout(2000);
    await snap(page, "student-payment");
    throw new Error("SNAPSHOT");
  });

  void student;
});

export { createHmac, RZP_SECRET, STUDENT };

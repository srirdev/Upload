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

  // Stand-in for Razorpay Checkout: "pays" at once and signs with the E2E test secret; the backend verifies it for real.
  await student.ctx.exposeFunction("rzpSign", (orderId: string, paymentId: string) =>
    createHmac("sha256", RZP_SECRET).update(`${orderId}|${paymentId}`).digest("hex"));
  await student.ctx.addInitScript(() => {
    (window as unknown as { Razorpay: unknown }).Razorpay = class {
      constructor(private o: { order_id: string; handler: (r: unknown) => void }) {}
      on() {}
      async open() {
        const payment = `pay_e2e_${Date.now()}`;
        const sign = (window as unknown as { rzpSign: (a: string, b: string) => Promise<string> }).rzpSign;
        this.o.handler({ razorpay_payment_id: payment, razorpay_order_id: this.o.order_id, razorpay_signature: await sign(this.o.order_id, payment) });
      }
    };
  });

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
    await expect(page.getByRole("img", { name: "Page 1" }).first()).toBeVisible(); // the real PDF, rendered by PDF.js
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
    await expect(page.getByRole("heading", { name: "Slot and payment" })).toBeVisible();
  });

  await test.step("student picks a slot and pays (Razorpay stand-in, real signature check)", async () => {
    const page = student.page;
    await page.getByRole("button", { name: /^Morning Arrives/ }).last().click();
    await expect(page.getByText("Choose a slot to see your total.")).toHaveCount(0);
    await page.getByRole("button", { name: /^Pay/ }).click();
    await expect(page.getByRole("heading", { name: "Order tracking" })).toBeVisible();
  });

  await test.step("shop sees the new order", async () => {
    const page = shop.page;
    await page.goto("/shop");
    const card = page.getByRole("article").filter({ hasText: "You earn" }).first();
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Accept order" }).click();
    await page.getByRole("tab", { name: /^In progress/ }).click();
    const card2 = page.getByRole("article").filter({ hasText: "You earn" }).first();
    await card2.getByRole("button", { name: "Mark printing done" }).click();
    await page.waitForTimeout(2000);
    await snap(page, "shop-after-printing");
    await page.getByRole("button", { name: "Mark binding and packing done" }).click();
    await page.waitForTimeout(2000);
    await expect(page.getByText("Ready for handover").first()).toBeVisible();
  });

  await test.step("rider is offered the run", async () => {
    const page = rider.page;
    await page.goto("/rider");
    await page.waitForTimeout(3000);
    await expect(page.getByText("New run offer")).toBeVisible();
    await expect(page.getByText("₹60.00").first()).toBeVisible(); // guaranteed payout
    await page.getByRole("button", { name: /^Accept/ }).click();
    await expect(page.getByText("Picking up")).toBeVisible();
  });

  let handoverCode = "";
  await test.step("rider arrives; shop reads out the 4-digit handover code; rider verifies it and collects the packet", async () => {
    await rider.page.getByRole("button", { name: "I’ve arrived" }).or(rider.page.getByRole("button", { name: "I've arrived" })).click();
    const generate = shop.page.getByRole("button", { name: "Generate handover OTP" });
    await expect(generate).toBeVisible();
    await generate.click();
    const shown = shop.page.getByLabel(/^Handover code.*: \d \d \d \d$/);
    await expect(shown).toBeVisible();
    handoverCode = ((await shown.getAttribute("aria-label")) ?? "").split(": ")[1].replace(/ /g, "");
    expect(handoverCode).toMatch(/^\d{4}$/);

    const page = rider.page;
    // a wrong code is refused by the backend
    const wrong = handoverCode === "0000" ? "1111" : "0000";
    await page.getByRole("textbox", { name: /Handover code for .* digit 1/ }).click();
    await page.keyboard.type(wrong);
    await page.waitForTimeout(2000);
    await expect(page.getByText(/^Packet UP-\S+ collected$/)).toHaveCount(0); // the wrong code did not release the packet
    await expect(page.getByRole("alert").filter({ hasText: "Incorrect code" })).toBeVisible();

    await page.getByRole("textbox", { name: /Handover code for .* digit 1/ }).click();
    await page.keyboard.type(handoverCode); // the 4th digit submits automatically
    await expect(page.getByText("1 of 1 packet collected")).toBeVisible();
  });

  await test.step("rider drives to the college, uploads the shelf photo and completes the delivery", async () => {
    const page = rider.page;
    await page.getByRole("button", { name: "Start delivery to college" }).click();
    await expect(page.getByRole("heading", { name: "Shelf photo" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Complete delivery/ })).toBeDisabled(); // photo is mandatory
    await page.locator('input[type="file"]').setInputFiles(path.join(FIX, "photo.jpg"));
    await page.getByRole("button", { name: "Upload photo" }).click();
    await expect(page.getByText("Photo in. You're ready to finish.")).toBeVisible();
    await page.getByRole("button", { name: /Complete delivery/ }).click();
    await expect(page.getByRole("heading", { name: "Delivery complete" })).toBeVisible();
    await expect(page.getByText("₹60.00").first()).toBeVisible();
  });

  await test.step("student sees the delivery and the shelf photo, then collects the order", async () => {
    const page = student.page;
    await page.reload();
    await page.waitForTimeout(2500);
    await expect(page.getByText("At security cabin")).toBeVisible();
    await expect(page.getByRole("img", { name: /Shelf at .* where packet .* was placed/ })).toBeVisible();
    await page.getByRole("button", { name: "Collect my packet" }).click();
    await expect(page.getByRole("button", { name: "Collect my packet" })).toHaveCount(0);
    await page.waitForTimeout(1500);
    await snap(page, "student-collected");
  });

  await test.step("admin sees the order and the money", async () => {
    const page = admin.page;
    await page.goto("/admin/finance");
    // one order: customer paid 90.40; the shop earns 67.86 and the rider's guaranteed payout is 60.00
    for (const amount of ["₹90.40", "₹67.86", "₹60.00"]) await expect(page.getByText(amount, { exact: true }).first()).toBeVisible();
  });

});

export { createHmac, RZP_SECRET, STUDENT };

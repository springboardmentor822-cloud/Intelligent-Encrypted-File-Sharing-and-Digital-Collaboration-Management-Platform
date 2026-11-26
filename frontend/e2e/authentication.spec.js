import { test, expect } from "@playwright/test";

const backend = "http://localhost:8000";

async function mockUnusedApiRequests(page) {
  await page.route(`${backend}/**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });
}

test("invalid login displays the API error", async ({ page }) => {
  await mockUnusedApiRequests(page);

  await page.route(`${backend}/auth/login`, async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Invalid email or password" }),
    });
  });

  await page.goto("/login");
  await page.getByLabel("Email address").fill("invalid@example.test");
  await page.getByPlaceholder("Enter your password").fill("WrongPassword123");
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(page.getByRole("status")).toContainText(
    "Invalid email or password"
  );
});

test("successful normal-user login stores the session", async ({ page }) => {
  await mockUnusedApiRequests(page);

  await page.route(`${backend}/auth/login`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: "playwright-user-token",
        token_type: "bearer",
        user: {
          id: 901,
          email: "normal-user@example.test",
          full_name: "Playwright User",
          role: "user",
        },
      }),
    });
  });

  await page.goto("/login");
  await page.getByLabel("Email address").fill("normal-user@example.test");
  await page.getByPlaceholder("Enter your password").fill("TestPassword123");
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(page).toHaveURL(/\/dashboard$/);

  await expect.poll(async () => page.evaluate(() => ({
    token: sessionStorage.getItem("trustshare_token"),
    user: JSON.parse(sessionStorage.getItem("trustshare_user") || "null"),
  }))).toEqual({
    token: "playwright-user-token",
    user: {
      id: 901,
      email: "normal-user@example.test",
      full_name: "Playwright User",
      role: "user",
    },
  });
});


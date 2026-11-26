import { test, expect } from "@playwright/test";

const backend = "http://localhost:8000";

test("normal user cannot access the super-admin dashboard", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("trustshare_token", "playwright-user-token");
    sessionStorage.setItem(
      "trustshare_user",
      JSON.stringify({
        id: 901,
        email: "normal-user@example.test",
        full_name: "Playwright User",
        role: "user",
      })
    );
  });

  await page.route(`${backend}/**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });

  await page.route(`${backend}/auth/me`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 901,
        email: "normal-user@example.test",
        full_name: "Playwright User",
        role: "user",
      }),
    });
  });

  await page.goto("/admin");

  await expect(
    page.getByRole("heading", {
      name: "Administrator access required",
    })
  ).toBeVisible();

  await expect(
    page.getByText("Platform data remains restricted.")
  ).toBeVisible();
});

test("unauthenticated user is redirected away from admin", async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("trustshare_playwright_auth_seeded")) {
      return;
    }

    sessionStorage.setItem("trustshare_playwright_auth_seeded", "true");
    sessionStorage.setItem("trustshare_token", "expired-test-token");

    sessionStorage.setItem(
      "trustshare_user",
      JSON.stringify({
        id: 902,
        email: "expired@example.test",
        role: "admin",
      })
    );
  });

  await page.route(`${backend}/**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });

  await page.route(`${backend}/auth/me`, async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Not authenticated" }),
    });
  });

  await page.goto("/admin");

  await expect(page).toHaveURL(/\/login/);

  await expect.poll(() =>
    page.evaluate(() => sessionStorage.getItem("trustshare_token"))
  ).toBeNull();
});


test("super-admin can load the platform dashboard", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("trustshare_token", "playwright-super-admin-token");
    sessionStorage.setItem(
      "trustshare_user",
      JSON.stringify({
        id: 903,
        email: "super-admin@example.test",
        full_name: "Playwright Super Admin",
        role: "super_admin",
      })
    );
  });

  await page.route(`${backend}/**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });

  await page.route(`${backend}/auth/me`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 903,
        email: "super-admin@example.test",
        full_name: "Playwright Super Admin",
        role: "super_admin",
      }),
    });
  });

  await page.route(`${backend}/admin/overview`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        total_users: 12,
        total_files: 34,
        total_storage_bytes: 2621440,
        failed_logins_last_24_hours: 2,
      }),
    });
  });

  await page.route(`${backend}/admin/security-dashboard**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        period_days: 7,
        summary: {
          successful_logins: 20,
          failed_logins: 2,
          unauthorized_access_attempts: 3,
          blocked_attempts: 1,
          login_attempts: 23,
          security_events: 6,
        },
        previous_period_summary: {
          successful_logins: 18,
          failed_logins: 1,
          unauthorized_access_attempts: 2,
          blocked_attempts: 0,
          login_attempts: 19,
          security_events: 3,
        },
        summary_change_percent: {},
        daily: [],
        recent_logins: [],
        recent_security_events: [],
      }),
    });
  });

  await page.route(`${backend}/admin/file-analytics**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        current_file_count: 34,
        current_storage_bytes: 2621440,
        recorded_upload_events: 10,
        recorded_download_events: 8,
        recorded_delete_events: 1,
      }),
    });
  });

  await page.route(`${backend}/audit-logs**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        events: [],
        logs: [],
        count: 0,
        limit: 100,
        offset: 0,
      }),
    });
  });

  await page.goto("/admin");

  await expect(
    page.getByRole("heading", { name: "Platform overview" })
  ).toBeVisible();

  await expect(page.getByText("Registered users", { exact: true })).toBeVisible();
  await expect(page.getByText("File records", { exact: true })).toBeVisible();
  await expect(page.getByText("Storage consumed", { exact: true })).toBeVisible();
  await expect(page.getByText("Failed sign-ins", { exact: true })).toBeVisible();

  await expect(page.getByText("Good to see you, Playwright Super Admin.", { exact: false })).toBeVisible();
});

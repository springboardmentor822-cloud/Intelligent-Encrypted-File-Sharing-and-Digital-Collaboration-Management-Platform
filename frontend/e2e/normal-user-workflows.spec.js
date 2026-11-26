import { test, expect } from "@playwright/test";
import { Buffer } from "node:buffer";

const backend = "http://localhost:8000";

async function prepareUser(page) {
  await page.route("https://fonts.googleapis.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/css", body: "" })
  );

  await page.addInitScript(() => {
    if (sessionStorage.getItem("trustshare_playwright_auth_seeded")) return;

    sessionStorage.setItem("trustshare_playwright_auth_seeded", "true");
    sessionStorage.setItem("trustshare_token", "playwright-user-token");
    sessionStorage.setItem("trustshare_user", JSON.stringify({
      id: 901,
      email: "normal-user@example.test",
      full_name: "Playwright User",
      role: "user"
    }));
  });

  await page.route(`${backend}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;

    if (path === "/auth/me") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: 901,
          email: "normal-user@example.test",
          full_name: "Playwright User",
          role: "user"
        })
      });
    }

    if ([
      "/files",
      "/files/dashboard/favorites",
      "/files/dashboard/recent-uploads",
      "/files/dashboard/activity",
      "/files/shared/with-me"
    ].includes(path)) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]"
      });
    }

    if (path === "/folders") {
      if (route.request().method() === "POST") {
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            id: 1101,
            name: "Research Notes",
            owner_id: 901,
            created_at: "2026-11-23T10:00:00Z",
            is_password_protected: false,
            is_shared: false,
            permission: "owner"
          })
        });
      }

      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]"
      });
    }

    if (path === "/files/upload" && route.request().method() === "POST") {
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: 1001,
          original_name: "sample.txt",
          size_bytes: 24
        })
      });
    }

    if (path === "/files/dashboard/shares") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          summary: {
            total_shared_files: 0,
            successfully_shared_files: 0,
            sent_emails: 0,
            pending_emails: 0,
            failed_emails: 0,
            active_recipient_shares: 0
          },
          invitations: []
        })
      });
    }

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}"
    });
  });
}

test("normal user dashboard initializes", async ({ page }) => {
  let browserPageErrors = 0;
  let browserConsoleErrors = 0;

  page.on("console", (message) => {
    if (message.type() === "error") {
      browserConsoleErrors += 1;
    }
  });
  page.on("pageerror", () => {
    browserPageErrors += 1;
  });

  await prepareUser(page);
  await page.goto("/dashboard");

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: "Welcome back, Playwright." })
  ).toBeVisible();

  await expect(page.getByText("No uploads yet.")).toBeVisible();
  expect(browserPageErrors).toBe(0);
  expect(browserConsoleErrors).toBe(0);
});

test("normal user can upload a file without password protection", async ({ page }) => {
  await prepareUser(page);
  await page.goto("/dashboard/files");

  await expect(
    page.getByRole("heading", { name: "Your files" })
  ).toBeVisible();

  const fileInput = page.locator('input[type="file"]');

  await fileInput.setInputFiles({
    name: "sample.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("TrustShare Playwright upload test")
  });

  await expect(
    page.getByRole("heading", { name: "Protect uploaded files?" })
  ).toBeVisible();

  const uploadRequestPromise = page.waitForRequest((request) =>
    request.url().endsWith("/files/upload") &&
    request.method() === "POST"
  );

  await page.getByRole("button", {
    name: "Upload without password"
  }).click();

  const uploadRequest = await uploadRequestPromise;

  expect(uploadRequest.postData()).toContain("sample.txt");
  expect(uploadRequest.postData()).toContain("TrustShare Playwright upload test");
});

test("normal user can create a folder without password protection", async ({ page }) => {
  await prepareUser(page);
  await page.goto("/dashboard/files");

  await expect(
    page.getByRole("heading", { name: "Your files" })
  ).toBeVisible();

  await page.getByLabel("New folder name").fill("Research Notes");
  await page.getByRole("button", { name: "+ Create folder" }).click();

  await expect(
    page.getByRole("heading", { name: "Protect your folder?" })
  ).toBeVisible();

  const createRequestPromise = page.waitForRequest((request) =>
    request.url().endsWith("/folders") &&
    request.method() === "POST"
  );

  await page.getByRole("button", {
    name: "Create without password"
  }).click();

  const createRequest = await createRequestPromise;
  const requestBody = createRequest.postDataJSON();

  expect(requestBody).toEqual({
    name: "Research Notes"
  });

  await expect(
    page.getByText("Research Notes", { exact: true })
  ).toBeVisible();
});

import { expect, test } from "@playwright/test";

test("login page renders both login modes", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("企业级临时邮箱")).toBeVisible();
  await expect(page.getByRole("button", { name: "令牌登录" })).toBeVisible();
  await expect(page.getByRole("button", { name: "账号登录" })).toBeVisible();
});

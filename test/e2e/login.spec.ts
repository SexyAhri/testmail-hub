import { expect, test } from "@playwright/test";

test("login page renders both login modes", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("企业级临时邮箱")).toBeVisible();
  await expect(page.getByText("令牌登录", { exact: true })).toBeVisible();
  await expect(page.getByText("账号登录", { exact: true })).toBeVisible();
  await expect(page.getByLabel("管理员令牌")).toBeVisible();
});

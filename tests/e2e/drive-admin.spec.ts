import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./runtime-helpers";

test.describe("Pháp Thoại admin controls", () => {
  test("admin sees Drive scan and can create a D1-backed album", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/phap-thoai");

    await page.locator("details.admin-content-tools > summary").click();
    await expect(
      page.getByRole("heading", { name: "Google Drive" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Xem trước thay đổi" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Tạo album", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "Chỉnh sửa Album" });
    await expect(editor).toBeVisible();

    await editor.getByLabel("ID").fill("e2e-admin-album");
    await editor.getByLabel("Tên album").fill("Album quản trị E2E");
    await editor.getByLabel("Ngày đăng").fill("2026-08-02");
    await editor.getByRole("button", { name: "Công khai" }).click();
    await editor
      .getByLabel(/Danh sách track/)
      .fill(
        [
          "Bài quản trị một | content/e2e-admin-1.mp3",
          "Bài quản trị hai | content/e2e-admin-2.mp3",
        ].join("\n"),
      );

    const trackList = editor.getByRole("list", {
      name: "Sắp xếp thứ tự bài phát",
    });
    await expect(trackList.getByRole("listitem")).toHaveCount(2);
    await page
      .getByRole("button", { name: "Đưa Bài quản trị hai lên trước" })
      .click();
    await expect(trackList.locator(".track-title").first()).toHaveText(
      "Bài quản trị hai",
    );

    const mediaUpload = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/media",
    );
    await editor.locator('.artwork-editor input[type="file"]').setInputFiles({
      name: "album-art.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    });
    expect((await mediaUpload).ok()).toBe(true);
    await expect(
      page.getByRole("status").filter({ hasText: "Đã tải ảnh bìa." }),
    ).toBeVisible();

    const createRequest = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/talks",
    );
    await editor.getByRole("button", { name: "Tạo album" }).click();
    const payload = (await createRequest).postDataJSON();
    expect(payload).toMatchObject({
      ngay_dang: "2026-08-02",
      visibility: "public",
    });
    expect(payload.anh_dai_dien).toContain("/api/media/covers/");
    expect(
      payload.tracks.map((track: { title: string }) => track.title),
    ).toEqual(["Bài quản trị hai", "Bài quản trị một"]);
    await expect(
      page.getByRole("status").filter({ hasText: "Đã tạo album mới." }),
    ).toBeVisible();
    await editor.locator("select").first().selectOption(String(payload.id));
    await expect(editor.getByLabel("ID")).toBeDisabled();
    await expect(
      editor.locator("select").first().locator("option:checked"),
    ).toHaveText("Album quản trị E2E");

    await editor.getByRole("button", { name: "Xóa album" }).click();
    const confirmation = page.locator("dialog[data-app-message]");
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText('Xóa album "Album quản trị E2E"?');
    await confirmation.getByRole("button", { name: "Hủy", exact: true }).click();
    await expect(confirmation).toHaveCount(0);
    await expect(editor.getByLabel("ID")).toHaveValue(String(payload.id));
    await editor.getByRole("button", { name: "Xóa album" }).click();
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole("button", { name: "Đồng ý", exact: true }).click();
    await expect(confirmation).toHaveCount(0);
    await expect(
      page.getByRole("status").filter({ hasText: "Đã xóa album." }),
    ).toBeVisible();
  });
});

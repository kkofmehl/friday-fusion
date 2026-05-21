import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ProfileService } from "./profileService";
import { profileUploadDir } from "./profileUploads";
import { FileStore } from "./storage/fileStore";

const createService = async (): Promise<{ service: ProfileService; tempDir: string }> => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "fusion-profile-test-"));
  const service = new ProfileService(
    new FileStore<any>(path.join(tempDir, "profiles.json")),
    tempDir
  );
  await service.load();
  return { service, tempDir };
};

describe("ProfileService", () => {
  it("opens a profile and normalizes username", async () => {
    const { service, tempDir } = await createService();
    try {
      const opened = await service.openProfile("PlayerOne", { name: "Player One" });
      expect(opened.username).toBe("playerone");
      expect(opened.profile.name).toBe("Player One");
      const loaded = await service.openProfile("playerone");
      expect(loaded.profile.name).toBe("Player One");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("marks username as unavailable after open", async () => {
    const { service, tempDir } = await createService();
    try {
      await service.openProfile("sam");
      expect(service.isUsernameAvailable("sam")).toBe(false);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("updates profile fields", async () => {
    const { service, tempDir } = await createService();
    try {
      await service.openProfile("sam");
      const updated = await service.updateProfile("sam", {
        name: "Sam",
        aboutMe: "About me",
        favorites: ["Pizza", "Coffee"],
        dreamJob: "Travel writer",
        avatar: { type: "stock", id: "avatar-lightbulb" }
      });
      expect(updated.profile.name).toBe("Sam");
      expect(updated.profile.favorites).toEqual(["Pizza", "Coffee"]);
      expect(updated.profile.avatar.type).toBe("stock");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("replaces uploaded avatar and deletes previous file", async () => {
    const { service, tempDir } = await createService();
    try {
      await service.openProfile("sam");
      const uploadDir = profileUploadDir(tempDir, "sam");
      await mkdir(uploadDir, { recursive: true });
      await writeFile(path.join(uploadDir, "first.png"), "x");
      await writeFile(path.join(uploadDir, "second.png"), "x");

      await service.setUploadedAvatar("sam", "first.png");
      await service.setUploadedAvatar("sam", "second.png");

      await expect(access(path.join(uploadDir, "first.png"))).rejects.toThrow();
      await expect(access(path.join(uploadDir, "second.png"))).resolves.toBeUndefined();
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

import type { ProfileAvatarSelection, PublicProfile } from "../../shared/contracts";
import { FileStore } from "./storage/fileStore";
import { deleteProfileStoredFile } from "./profileUploads";

type StoredProfile = {
  username: string;
  name: string;
  aboutMe: string;
  favorites: string[];
  dreamJob: string;
  avatar: ProfileAvatarSelection;
  createdAt: number;
  updatedAt: number;
};

type ProfilePersistedState = {
  profiles: Record<string, StoredProfile>;
};

type ProfileMutableFields = {
  name?: string;
  aboutMe?: string;
  favorites?: string[];
  dreamJob?: string;
  avatar?: ProfileAvatarSelection;
};

const normalizeUsername = (value: string): string => value.trim().toLowerCase();
const avatarStockUrl = (id: string): string => `/avatars/${id}.png`;
const avatarUploadUrl = (username: string, fileId: string): string =>
  `/api/profiles/avatar/${encodeURIComponent(username)}/${encodeURIComponent(fileId)}`;

const sanitizeMutableFields = (fields: ProfileMutableFields): ProfileMutableFields => {
  const next: ProfileMutableFields = {};
  if (typeof fields.name === "string") {
    next.name = fields.name.trim();
  }
  if (typeof fields.aboutMe === "string") {
    next.aboutMe = fields.aboutMe.trim();
  }
  if (typeof fields.dreamJob === "string") {
    next.dreamJob = fields.dreamJob.trim();
  }
  if (Array.isArray(fields.favorites)) {
    next.favorites = fields.favorites.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  }
  if (fields.avatar) {
    next.avatar = fields.avatar;
  }
  return next;
};

const mapPublicProfile = (profile: StoredProfile): PublicProfile => {
  if (profile.avatar.type === "upload") {
    return {
      name: profile.name,
      aboutMe: profile.aboutMe,
      favorites: profile.favorites,
      dreamJob: profile.dreamJob,
      avatar: {
        type: "upload",
        avatarUrl: avatarUploadUrl(profile.username, profile.avatar.fileId),
        fileId: profile.avatar.fileId,
        crop: profile.avatar.crop ?? { x: 0.5, y: 0.5, zoom: 0.85 }
      }
    };
  }
  if (profile.avatar.type === "stock") {
    return {
      name: profile.name,
      aboutMe: profile.aboutMe,
      favorites: profile.favorites,
      dreamJob: profile.dreamJob,
      avatar: {
        type: "stock",
        id: profile.avatar.id,
        avatarUrl: avatarStockUrl(profile.avatar.id)
      }
    };
  }
  return {
    name: profile.name,
    aboutMe: profile.aboutMe,
    favorites: profile.favorites,
    dreamJob: profile.dreamJob,
    avatar: {
      type: "none",
      avatarUrl: null
    }
  };
};


export class ProfileService {
  private readonly store: FileStore<ProfilePersistedState>;
  private readonly dataDirectory: string;
  private profiles: Record<string, StoredProfile> = {};

  public constructor(store: FileStore<ProfilePersistedState>, dataDirectory: string) {
    this.store = store;
    this.dataDirectory = dataDirectory;
  }

  public async load(): Promise<void> {
    const data = await this.store.read({ profiles: {} });
    this.profiles = data.profiles ?? {};
  }

  private async persist(): Promise<void> {
    await this.store.write({ profiles: this.profiles });
  }

  public normalizeUsername(username: string): string {
    return normalizeUsername(username);
  }

  public isUsernameAvailable(username: string): boolean {
    const key = normalizeUsername(username);
    return key.length > 0 && !this.profiles[key];
  }

  private getOrThrow(username: string): StoredProfile {
    const key = normalizeUsername(username);
    const profile = this.profiles[key];
    if (!profile) {
      throw new Error("Profile not found.");
    }
    return profile;
  }

  public ensureProfileExists(username: string): string {
    const key = normalizeUsername(username);
    if (!this.profiles[key]) {
      throw new Error("Profile not found.");
    }
    return key;
  }

  public getPublicProfileByUsername(username: string): PublicProfile | null {
    const key = normalizeUsername(username);
    const profile = this.profiles[key];
    if (!profile) {
      return null;
    }
    return mapPublicProfile(profile);
  }

  public async openProfile(
    username: string,
    fields: ProfileMutableFields = {}
  ): Promise<{ username: string; profile: PublicProfile }> {
    const key = normalizeUsername(username);
    if (!this.profiles[key]) {
      const sanitized = sanitizeMutableFields(fields);
      const now = Date.now();
      this.profiles[key] = {
        username: key,
        name: sanitized.name ?? "",
        aboutMe: sanitized.aboutMe ?? "",
        favorites: sanitized.favorites ?? [],
        dreamJob: sanitized.dreamJob ?? "",
        avatar: sanitized.avatar ?? { type: "none" },
        createdAt: now,
        updatedAt: now
      };
      await this.persist();
    }
    return { username: key, profile: mapPublicProfile(this.profiles[key]!) };
  }

  public async updateProfile(
    username: string,
    fields: ProfileMutableFields
  ): Promise<{ username: string; profile: PublicProfile }> {
    const key = this.ensureProfileExists(username);
    const profile = this.getOrThrow(key);
    const sanitized = sanitizeMutableFields(fields);
    if (Object.prototype.hasOwnProperty.call(sanitized, "name")) {
      profile.name = sanitized.name ?? "";
    }
    if (Object.prototype.hasOwnProperty.call(sanitized, "aboutMe")) {
      profile.aboutMe = sanitized.aboutMe ?? "";
    }
    if (Object.prototype.hasOwnProperty.call(sanitized, "favorites")) {
      profile.favorites = sanitized.favorites ?? [];
    }
    if (Object.prototype.hasOwnProperty.call(sanitized, "dreamJob")) {
      profile.dreamJob = sanitized.dreamJob ?? "";
    }
    if (Object.prototype.hasOwnProperty.call(sanitized, "avatar") && sanitized.avatar) {
      if (profile.avatar.type === "upload" && sanitized.avatar.type !== "upload") {
        await deleteProfileStoredFile(this.dataDirectory, key, profile.avatar.fileId);
      }
      profile.avatar = sanitized.avatar;
    }
    profile.updatedAt = Date.now();
    await this.persist();
    return { username: key, profile: mapPublicProfile(profile) };
  }

  public async setUploadedAvatar(username: string, fileId: string): Promise<{ username: string; profile: PublicProfile }> {
    const key = this.ensureProfileExists(username);
    const profile = this.getOrThrow(key);
    if (profile.avatar.type === "upload" && profile.avatar.fileId !== fileId) {
      await deleteProfileStoredFile(this.dataDirectory, key, profile.avatar.fileId);
    }
    profile.avatar = {
      type: "upload",
      fileId,
      crop: profile.avatar.type === "upload" ? profile.avatar.crop ?? { x: 0.5, y: 0.5, zoom: 0.85 } : { x: 0.5, y: 0.5, zoom: 0.85 }
    };
    profile.updatedAt = Date.now();
    await this.persist();
    return { username: key, profile: mapPublicProfile(profile) };
  }
}

export const createProfileService = (dataDirectory: string = process.env.DATA_DIR ?? "./data"): ProfileService => {
  const store = new FileStore<ProfilePersistedState>(`${dataDirectory}/profiles.json`);
  return new ProfileService(store, dataDirectory);
};

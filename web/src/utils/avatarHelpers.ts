import type { CSSProperties } from "react";
import type { ProfileAvatarCrop, ProfileAvatarView, ProfileStockAvatarId } from "../../../shared/contracts";

export const STOCK_AVATAR_EMOJI: Record<ProfileStockAvatarId, string> = {
  "avatar-astronaut": "🧑‍🚀",
  "avatar-lightbulb": "💡",
  "avatar-mountain": "🏔️"
};

export const toAbsoluteUrl = (apiBase: string, pathOrUrl: string): string => {
  if (!pathOrUrl) {
    return pathOrUrl;
  }
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }
  return new URL(pathOrUrl, apiBase).toString();
};

export const normalizedUploadUrl = (apiBase: string, avatarUrl: string, fileId?: string): string => {
  const fixedPath = avatarUrl.endsWith("/") && fileId ? `${avatarUrl}${encodeURIComponent(fileId)}` : avatarUrl;
  return toAbsoluteUrl(apiBase, fixedPath);
};

export const avatarImageStyle = (crop: ProfileAvatarCrop): CSSProperties => {
  const panStrength = Math.max(0.2, 0.65 + (crop.zoom - 1) * 1.35);
  const translateX = (0.5 - crop.x) * panStrength * 220;
  const translateY = (0.5 - crop.y) * panStrength * 220;
  return {
    transform: `translate(${translateX}%, ${translateY}%) scale(${crop.zoom})`
  };
};

export const hasRenderableAvatar = (avatar: ProfileAvatarView | null | undefined): boolean =>
  Boolean(avatar && avatar.type !== "none");

import type { ProfileAvatarView } from "../../../shared/contracts";
import { resolveApiBase } from "../config";
import { STOCK_AVATAR_EMOJI, avatarImageStyle, normalizedUploadUrl } from "../utils/avatarHelpers";

export type PlayerAvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

export function PlayerAvatar({
  avatar,
  size = "sm",
  apiBase,
  label,
  decorative = true
}: {
  avatar?: ProfileAvatarView;
  size?: PlayerAvatarSize;
  apiBase?: string;
  label?: string;
  decorative?: boolean;
}): JSX.Element | null {
  if (!avatar || avatar.type === "none") {
    return null;
  }
  const resolvedApiBase = apiBase ?? resolveApiBase();
  const accessibilityProps = decorative ? { "aria-hidden": true } : { "aria-label": label ?? "Player avatar" };

  if (avatar.type === "stock") {
    return (
      <span className={`player-avatar player-avatar--${size} player-avatar--stock`} {...accessibilityProps}>
        {STOCK_AVATAR_EMOJI[avatar.id]}
      </span>
    );
  }

  return (
    <span className={`player-avatar player-avatar--${size} player-avatar--upload`} {...accessibilityProps}>
      <img
        className="player-avatar-image"
        style={avatarImageStyle(avatar.crop ?? { x: 0.5, y: 0.5, zoom: 0.85 })}
        src={normalizedUploadUrl(resolvedApiBase, avatar.avatarUrl, avatar.fileId)}
        alt={decorative ? "" : label ?? "Player avatar"}
      />
    </span>
  );
}

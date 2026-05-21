import { type CSSProperties, useMemo } from "react";
import type { ProfileAvatarView } from "../../../shared/contracts";
import { hasRenderableAvatar } from "../utils/avatarHelpers";
import { PlayerAvatar } from "./PlayerAvatar";

type ShowerVariant = "rain" | "burst";
type ShowerDensity = "normal" | "team";

type ShowerParticle = {
  id: string;
  avatar: ProfileAvatarView;
  left: number;
  delayMs: number;
  durationMs: number;
  rotateDeg: number;
};

export function AvatarShower({
  avatar,
  avatars,
  variant = "rain",
  active,
  density = "normal"
}: {
  avatar?: ProfileAvatarView;
  avatars?: ProfileAvatarView[];
  variant?: ShowerVariant;
  active: boolean;
  density?: ShowerDensity;
}): JSX.Element | null {
  const sources = useMemo(
    () => (avatars?.filter(hasRenderableAvatar) ?? (hasRenderableAvatar(avatar) ? [avatar] : [])) as ProfileAvatarView[],
    [avatar, avatars]
  );
  const particles = useMemo<ShowerParticle[]>(() => {
    if (sources.length === 0) {
      return [];
    }
    const baseCount = density === "team" ? 24 : 18;
    const total = Math.max(baseCount, sources.length * 8);
    return Array.from({ length: total }, (_, index) => {
      const nextAvatar = sources[index % sources.length]!;
      return {
        id: `${index}-${nextAvatar.type}-${Math.random().toString(16).slice(2, 8)}`,
        avatar: nextAvatar,
        left: Math.random() * 96 + 2,
        delayMs: Math.floor(Math.random() * 650),
        durationMs: 2400 + Math.floor(Math.random() * 1800),
        rotateDeg: Math.floor(Math.random() * 80) - 40
      };
    });
  }, [density, sources]);

  if (!active || particles.length === 0) {
    return null;
  }

  return (
    <div className={`avatar-shower avatar-shower--${variant}`} aria-hidden>
      {particles.map((particle) => (
        <span
          key={particle.id}
          className="avatar-shower-particle"
          style={
            {
              left: `${particle.left}%`,
              animationDelay: `${particle.delayMs}ms`,
              animationDuration: `${particle.durationMs}ms`,
              "--avatar-rotate": `${particle.rotateDeg}deg`
            } as CSSProperties
          }
        >
          <PlayerAvatar avatar={particle.avatar} size={variant === "rain" ? "md" : "sm"} />
        </span>
      ))}
    </div>
  );
}

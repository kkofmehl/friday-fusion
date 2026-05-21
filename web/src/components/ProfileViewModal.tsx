import { type CSSProperties, useEffect, useState } from "react";
import type { ProfileAvatarCrop, ProfileStockAvatarId, PublicProfile } from "../../../shared/contracts";

const STOCK_AVATAR_EMOJI: Record<ProfileStockAvatarId, string> = {
  "avatar-astronaut": "🧑‍🚀",
  "avatar-lightbulb": "💡",
  "avatar-mountain": "🏔️"
};

const toAbsoluteUrl = (apiBase: string, pathOrUrl: string): string => {
  if (!pathOrUrl) {
    return pathOrUrl;
  }
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }
  return new URL(pathOrUrl, apiBase).toString();
};

const normalizedUploadUrl = (apiBase: string, avatarUrl: string, fileId?: string): string => {
  const fixedPath = avatarUrl.endsWith("/") && fileId ? `${avatarUrl}${encodeURIComponent(fileId)}` : avatarUrl;
  return toAbsoluteUrl(apiBase, fixedPath);
};

const avatarImageStyle = (crop: ProfileAvatarCrop): CSSProperties => {
  const panStrength = Math.max(0.2, 0.65 + (crop.zoom - 1) * 1.35);
  const translateX = (0.5 - crop.x) * panStrength * 220;
  const translateY = (0.5 - crop.y) * panStrength * 220;
  return {
    transform: `translate(${translateX}%, ${translateY}%) scale(${crop.zoom})`
  };
};

export function ProfileViewModal({
  apiBase,
  sessionId,
  participantId,
  onClose
}: {
  apiBase: string;
  sessionId: string;
  participantId: string | null;
  onClose: () => void;
}): JSX.Element | null {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<PublicProfile | null>(null);

  useEffect(() => {
    if (!participantId) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    setProfile(null);
    void (async () => {
      try {
        const response = await fetch(
          `${apiBase}/api/sessions/${encodeURIComponent(sessionId)}/participants/${encodeURIComponent(participantId)}/profile`
        );
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.message ?? "Could not load profile.");
        }
        if (cancelled) {
          return;
        }
        setProfile(payload as PublicProfile);
      } catch (modalError) {
        if (cancelled) {
          return;
        }
        const message = modalError instanceof Error ? modalError.message : "Could not load profile.";
        setError(message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBase, participantId, sessionId]);

  useEffect(() => {
    if (!participantId) {
      return;
    }
    const onEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("keydown", onEscape);
    };
  }, [onClose, participantId]);

  if (!participantId) {
    return null;
  }

  return (
    <div className="profile-modal-backdrop" onClick={onClose}>
      <div className="profile-modal card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <header className="card-head">
          <h2>Player Profile</h2>
        </header>
        {loading && <p>Loading profile...</p>}
        {error && <p className="my-profile-error">{error}</p>}
        {!loading && !error && profile && (
          <div className="profile-modal-content">
            {profile.avatar.type === "upload" || profile.avatar.type === "stock" ? (
              profile.avatar.type === "upload" ? (
                <div className="profile-modal-avatar profile-modal-avatar-upload">
                  <img
                    className="profile-modal-avatar-image"
                    style={avatarImageStyle(profile.avatar.crop ?? { x: 0.5, y: 0.5, zoom: 0.85 })}
                    src={normalizedUploadUrl(apiBase, profile.avatar.avatarUrl, profile.avatar.fileId)}
                    alt={`${profile.name || "Player"} avatar`}
                  />
                </div>
              ) : (
                <div className="profile-modal-avatar profile-modal-avatar-fallback" aria-label={`${profile.name || "Player"} avatar`}>
                  {STOCK_AVATAR_EMOJI[profile.avatar.id]}
                </div>
              )
            ) : (
              <div className="profile-modal-avatar profile-modal-avatar-fallback" aria-hidden="true">
                ★
              </div>
            )}
            <h3>{profile.name || "Unnamed player"}</h3>
            <p>{profile.aboutMe || "No about me provided."}</p>
            <h4>Favorites</h4>
            {profile.favorites.length === 0 ? (
              <p>No favorites listed.</p>
            ) : (
              <ul className="profile-modal-favorites">
                {profile.favorites.map((favorite, index) => (
                  <li key={`${favorite}-${index}`}>{favorite}</li>
                ))}
              </ul>
            )}
            <h4>If I didn't have to work...</h4>
            <p>{profile.dreamJob || "No answer yet."}</p>
          </div>
        )}
        <div className="card-footer card-footer-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

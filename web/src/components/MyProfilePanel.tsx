import { FormEvent, useEffect, useState } from "react";
import {
  PROFILE_STOCK_AVATAR_IDS,
  type ClientEvent,
  type ProfileAvatarCrop,
  type ProfileStockAvatarId,
  type PublicProfile
} from "../../../shared/contracts";
import { readStoredProfileUsername, writeStoredProfileUsername } from "../profilePersistence";
import { STOCK_AVATAR_EMOJI, avatarImageStyle, normalizedUploadUrl } from "../utils/avatarHelpers";

export type ProfileAuth = {
  username: string;
};

type AvatarDraft =
  | { type: "none" }
  | { type: "stock"; id: ProfileStockAvatarId }
  | { type: "upload"; fileId: string; avatarUrl: string; crop: ProfileAvatarCrop };

const mapPublicToAvatar = (apiBase: string, profile: PublicProfile): AvatarDraft => {
  if (profile.avatar.type === "upload") {
    const fileId = profile.avatar.fileId ?? "";
    return {
      type: "upload",
      fileId,
      avatarUrl: normalizedUploadUrl(apiBase, profile.avatar.avatarUrl, fileId),
      crop: profile.avatar.crop ?? { x: 0.5, y: 0.5, zoom: 0.85 }
    };
  }
  if (profile.avatar.type === "stock") {
    return { type: "stock", id: profile.avatar.id };
  }
  return { type: "none" };
};

export function MyProfilePanel({
  apiBase,
  sessionId,
  send,
  hasLinkedProfile,
  profileAuth,
  onProfileAuthChange
}: {
  apiBase: string;
  sessionId: string;
  send: (event: ClientEvent) => void;
  hasLinkedProfile: boolean;
  profileAuth: ProfileAuth | null;
  onProfileAuthChange: (auth: ProfileAuth | null) => void;
}): JSX.Element {
  const [usernameInput, setUsernameInput] = useState(() => readStoredProfileUsername());
  const [name, setName] = useState("");
  const [aboutMe, setAboutMe] = useState("");
  const [dreamJob, setDreamJob] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoriteDraft, setFavoriteDraft] = useState("");
  const [avatar, setAvatar] = useState<AvatarDraft>({ type: "none" });
  const [saving, setSaving] = useState(false);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [cropDraft, setCropDraft] = useState<ProfileAvatarCrop>({ x: 0.5, y: 0.5, zoom: 0.85 });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const canEdit = Boolean(profileAuth);

  useEffect(() => {
    if (!canEdit || !profileAuth) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`${apiBase}/api/profiles`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: profileAuth.username })
        });
        if (!response.ok) {
          throw new Error("Could not load profile.");
        }
        const profile = (await response.json()) as PublicProfile;
        if (cancelled) {
          return;
        }
        setName(profile.name);
        setAboutMe(profile.aboutMe);
        setDreamJob(profile.dreamJob);
        setFavorites(profile.favorites);
        setAvatar(mapPublicToAvatar(apiBase, profile));
      } catch (loadError) {
        if (cancelled) {
          return;
        }
        const message = loadError instanceof Error ? loadError.message : "Could not load profile.";
        setError(message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBase, canEdit, profileAuth]);

  const linkProfileToSession = (auth: ProfileAuth): void => {
    send({
      type: "session:linkProfile",
      payload: { username: auth.username }
    });
  };

  const handleCreateOrLoad = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const username = usernameInput.trim();
    if (!username) {
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const auth = { username };
      const response = await fetch(`${apiBase}/api/profiles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(auth)
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.message ?? "Could not create profile.");
      }
      const profile = payload as PublicProfile;
      onProfileAuthChange(auth);
      writeStoredProfileUsername(auth.username);
      linkProfileToSession(auth);
      setName(profile.name);
      setAboutMe(profile.aboutMe);
      setDreamJob(profile.dreamJob);
      setFavorites(profile.favorites);
      setAvatar(mapPublicToAvatar(apiBase, profile));
      setNotice("Profile loaded.");
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : "Could not create profile.";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const uploadAvatar = async (file: File): Promise<void> => {
    if (!profileAuth) {
      return;
    }
    setSaving(true);
    setError("");
    const formData = new FormData();
    formData.set("username", profileAuth.username);
    formData.set("file", file);
    try {
      const response = await fetch(`${apiBase}/api/profiles/avatar`, {
        method: "POST",
        body: formData
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.message ?? "Could not upload image.");
      }
      const fileId = payload.fileId as string;
      const avatarUrl = normalizedUploadUrl(apiBase, String(payload.avatarUrl ?? ""), fileId);
      const nextCrop = { x: 0.5, y: 0.5, zoom: 0.85 };
      setAvatar({ type: "upload", fileId, avatarUrl, crop: nextCrop });
      setCropDraft(nextCrop);
      setCropModalOpen(true);
      setNotice("Avatar uploaded.");
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : "Could not upload image.";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const saveProfile = async (): Promise<void> => {
    if (!profileAuth) {
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    const avatarPayload =
      avatar.type === "none"
        ? { type: "none" as const }
        : avatar.type === "stock"
          ? { type: "stock" as const, id: avatar.id }
          : { type: "upload" as const, fileId: avatar.fileId, crop: avatar.crop };
    try {
      const response = await fetch(`${apiBase}/api/profiles/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: profileAuth.username,
          name,
          aboutMe,
          favorites,
          dreamJob,
          avatar: avatarPayload
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.message ?? "Could not save profile.");
      }
      const profile = payload as PublicProfile;
      setAvatar(mapPublicToAvatar(apiBase, profile));
      setNotice("Profile saved.");
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Could not save profile.";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const addFavorite = (): void => {
    const next = favoriteDraft.trim();
    if (!next) {
      return;
    }
    setFavorites((prev) => [...prev, next]);
    setFavoriteDraft("");
  };

  const profileLinkedLabel = hasLinkedProfile ? "Linked to this session" : "Not linked to this session yet";

  return (
    <section className="card card-my-profile">
      <header className="card-head">
        <h2>My Profile</h2>
      </header>
      <p className="my-profile-status">{profileLinkedLabel}</p>
      {!canEdit ? (
        <div className="my-profile-auth">
          <form className="my-profile-form" onSubmit={handleCreateOrLoad}>
            <label>
              Username
              <input
                value={usernameInput}
                onChange={(event) => setUsernameInput(event.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              {saving ? "Loading..." : "Create/Load profile"}
            </button>
          </form>
        </div>
      ) : (
        <div className="my-profile-editor">
          <div className="my-profile-editor-actions">
            <span className="pill pill-muted">@{profileAuth?.username ?? ""}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onProfileAuthChange(null)}>
              Lock
            </button>
          </div>
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            About me
            <textarea value={aboutMe} onChange={(event) => setAboutMe(event.target.value)} rows={3} />
          </label>
          <label>
            If I didn't have to work...
            <input value={dreamJob} onChange={(event) => setDreamJob(event.target.value)} />
          </label>
          <div className="my-profile-favorites">
            <p>Favorites</p>
            {favorites.map((favorite, index) => (
              <div className="my-profile-favorite-row" key={`${favorite}-${index}`}>
                <span>{favorite}</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setFavorites((prev) => prev.filter((_, rowIndex) => rowIndex !== index))}
                >
                  Remove
                </button>
              </div>
            ))}
            <div className="my-profile-favorite-add">
              <input
                value={favoriteDraft}
                placeholder="Add favorite"
                onChange={(event) => setFavoriteDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addFavorite();
                  }
                }}
              />
              <button type="button" className="btn btn-ghost btn-sm" onClick={addFavorite}>
                +
              </button>
            </div>
          </div>
          <div className="my-profile-avatar">
            <p>Avatar</p>
            <div className="my-profile-stock-avatars">
              <button
                type="button"
                className={`btn btn-ghost btn-sm${avatar.type === "none" ? " is-active" : ""}`}
                onClick={() => setAvatar({ type: "none" })}
              >
                No avatar
              </button>
              {PROFILE_STOCK_AVATAR_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`btn btn-ghost btn-sm${avatar.type === "stock" && avatar.id === id ? " is-active" : ""}`}
                  onClick={() => setAvatar({ type: "stock", id })}
                  title={id}
                >
                  {STOCK_AVATAR_EMOJI[id]}
                </button>
              ))}
              <label className="btn btn-ghost btn-sm my-profile-upload-btn">
                Upload
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void uploadAvatar(file);
                    }
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
            {avatar.type === "upload" && (
              <div className="my-profile-avatar-preview my-profile-avatar-upload-preview">
                <img
                  className="my-profile-avatar-preview-image"
                  style={avatarImageStyle(avatar.crop)}
                  src={avatar.avatarUrl}
                  alt="Current profile avatar"
                />
              </div>
            )}
            {avatar.type === "stock" && (
              <div className="my-profile-avatar-preview my-profile-avatar-stock-preview" aria-label="Current stock avatar">
                {STOCK_AVATAR_EMOJI[avatar.id]}
              </div>
            )}
            {avatar.type === "upload" && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setCropDraft(avatar.crop);
                  setCropModalOpen(true);
                }}
              >
                Adjust crop
              </button>
            )}
          </div>
          <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => void saveProfile()}>
            {saving ? "Saving..." : "Save profile"}
          </button>
        </div>
      )}
      {error && <p className="my-profile-error">{error}</p>}
      {notice && <p className="my-profile-notice">{notice}</p>}
      <p className="my-profile-help">Session: {sessionId}</p>
      {cropModalOpen && avatar.type === "upload" && (
        <div className="profile-modal-backdrop" onClick={() => setCropModalOpen(false)}>
          <div className="profile-modal card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <header className="card-head">
              <h2>Position Avatar</h2>
            </header>
            <div className="my-profile-crop-preview-shell">
              <div className="my-profile-crop-preview">
                <img
                  className="my-profile-avatar-preview-image"
                  style={avatarImageStyle(cropDraft)}
                  src={avatar.avatarUrl}
                  alt="Avatar crop preview"
                />
              </div>
            </div>
            <label>
              Horizontal
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(cropDraft.x * 100)}
                onChange={(event) =>
                  setCropDraft((current) => ({ ...current, x: Number(event.target.value) / 100 }))
                }
              />
            </label>
            <label>
              Vertical
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(cropDraft.y * 100)}
                onChange={(event) =>
                  setCropDraft((current) => ({ ...current, y: Number(event.target.value) / 100 }))
                }
              />
            </label>
            <label>
              Zoom
              <input
                type="range"
                min={50}
                max={300}
                value={Math.round(cropDraft.zoom * 100)}
                onChange={(event) =>
                  setCropDraft((current) => ({ ...current, zoom: Number(event.target.value) / 100 }))
                }
              />
            </label>
            <div className="card-footer card-footer-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCropModalOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setAvatar((current) =>
                    current.type === "upload" ? { ...current, crop: cropDraft } : current
                  );
                  setCropModalOpen(false);
                }}
              >
                Apply crop
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

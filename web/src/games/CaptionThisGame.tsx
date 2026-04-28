import { useCallback, useEffect, useState } from "react";
import type { ClipboardEvent } from "react";
import {
  CAPTION_THIS_MAX_CHARS,
  type ClientEvent,
  type SessionState
} from "../../../shared/contracts";
import { imageFileFromClipboard } from "../utils/imageClipboardPaste";

export function CaptionThisGame({
  session,
  currentParticipantId,
  isHost,
  send,
  apiBase
}: {
  session: SessionState;
  currentParticipantId: string;
  isHost: boolean;
  send: (event: ClientEvent) => void;
  apiBase: string;
}): JSX.Element | null {
  const game = session.gameState?.type === "captionThis" ? session.gameState : null;
  const state = game?.state;
  const [captionDraft, setCaptionDraft] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [nextRoundProviderId, setNextRoundProviderId] = useState(currentParticipantId);

  useEffect(() => {
    if (!pendingFile) {
      setPreviewUrl(null);
      return;
    }
    if (typeof URL.createObjectURL !== "function") {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingFile);
    setPreviewUrl(url);
    return () => {
      if (typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(url);
      }
    };
  }, [pendingFile]);

  useEffect(() => {
    setCaptionDraft("");
  }, [state?.status, state?.status === "collectingCaptions" ? state.roundNumber : 0]);

  useEffect(() => {
    if (session.participants.some((p) => p.id === nextRoundProviderId)) {
      return;
    }
    setNextRoundProviderId(
      session.participants.find((p) => p.isHost)?.id ?? session.participants[0]?.id ?? currentParticipantId
    );
  }, [currentParticipantId, nextRoundProviderId, session.participants]);

  const imageSrc = (path: string): string =>
    path.startsWith("http") ? path : `${apiBase}${path}`;

  const uploadAndSubmit = async () => {
    if (!pendingFile || state?.status !== "waitingForImage") {
      return;
    }
    setUploadBusy(true);
    try {
      const body = new FormData();
      body.append("participantId", currentParticipantId);
      body.append("file", pendingFile);
      const response = await fetch(`${apiBase}/api/sessions/${session.sessionId}/caption-this/upload`, {
        method: "POST",
        body
      });
      const payload = (await response.json().catch(() => ({}))) as { fileId?: string; message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? `Upload failed (${response.status})`);
      }
      if (!payload.fileId) {
        throw new Error("Upload did not return a file id.");
      }
      send({ type: "captionThis:submitImage", payload: { imageFileId: payload.fileId } });
      setPendingFile(null);
    } catch {
      // stay on screen; user can retry
    }
    setUploadBusy(false);
  };

  const handlePasteImage = useCallback(
    (event: ClipboardEvent) => {
      if (state?.status !== "waitingForImage" || uploadBusy) {
        return;
      }
      if (currentParticipantId !== state.imageProviderId) {
        return;
      }
      const file = imageFileFromClipboard(event);
      if (!file) {
        return;
      }
      event.preventDefault();
      setPendingFile(file);
    },
    [state, currentParticipantId, uploadBusy]
  );

  if (!state) {
    return null;
  }

  if (state.status === "waitingForImage") {
    const isProvider = currentParticipantId === state.imageProviderId;
    return (
      <section className="card card-game-inner" onPaste={handlePasteImage}>
        <header className="card-head">
          <h2>Caption This</h2>
          <span className="pill pill-muted">Round {state.roundNumber}</span>
        </header>
        <p className="game-lede">
          <strong>{session.participants.find((p) => p.id === state.imageProviderId)?.displayName ?? "The provider"}</strong>{" "}
          chooses an image for everyone to caption.
        </p>
        {isHost && (
          <div className="stack gap-sm" style={{ marginBottom: "1rem" }}>
            <label className="mode-picker-label" htmlFor="cap-set-provider">
              Image provider
            </label>
            <select
              id="cap-set-provider"
              value={state.imageProviderId}
              onChange={(e) =>
                send({
                  type: "captionThis:setImageProvider",
                  payload: { participantId: e.target.value }
                })
              }
            >
              {session.participants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                  {p.isHost ? " (host)" : ""}
                </option>
              ))}
            </select>
          </div>
        )}
        {isProvider ? (
          <div className="stack gap-md">
            <p className="mode-option-hint">Upload or paste an image (JPEG, PNG, GIF, WebP).</p>
            <label className="btn btn-secondary" style={{ alignSelf: "flex-start" }}>
              Choose file
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setPendingFile(f);
                  }
                  e.target.value = "";
                }}
              />
            </label>
            {previewUrl ? (
              <img src={previewUrl} alt="" className="guess-image-preview" />
            ) : null}
            <button
              type="button"
              className="btn btn-primary"
              disabled={!pendingFile || uploadBusy}
              onClick={() => void uploadAndSubmit()}
            >
              {uploadBusy ? "Uploading…" : "Submit image"}
            </button>
          </div>
        ) : (
          <p className="mode-option-hint">Waiting for the image provider to submit an image.</p>
        )}
      </section>
    );
  }

  if (state.status === "collectingCaptions") {
    const mineSubmitted = state.submittedCaptionParticipantIds.includes(currentParticipantId);
    return (
      <section className="card card-game-inner">
        <header className="card-head">
          <h2>Caption This</h2>
          <span className="pill pill-muted">Round {state.roundNumber}</span>
        </header>
        <figure className="caption-this-figure">
          <img src={imageSrc(state.imageUrl)} alt="Round image" className="caption-this-main-img" />
        </figure>
        <p className="mode-option-hint">
          Submitted {state.submittedCaptionParticipantIds.length} / {session.participants.length}
        </p>
        {mineSubmitted ? (
          <p className="game-lede">You’ve submitted your caption. Waiting for others…</p>
        ) : (
          <div className="stack gap-sm">
            <label htmlFor="cap-line">Your caption</label>
            <textarea
              id="cap-line"
              className="input-textarea"
              rows={3}
              maxLength={CAPTION_THIS_MAX_CHARS}
              value={captionDraft}
              onChange={(e) => setCaptionDraft(e.target.value)}
              placeholder="Write something funny or clever…"
            />
            <button
              type="button"
              className="btn btn-primary"
              disabled={captionDraft.trim().length === 0}
              onClick={() =>
                send({
                  type: "captionThis:submitCaption",
                  payload: { text: captionDraft.trim() }
                })
              }
            >
              Submit caption
            </button>
          </div>
        )}
        {isHost && state.allCaptionsIn && (
          <div className="card-footer card-footer-actions" style={{ marginTop: "1rem" }}>
            <button type="button" className="btn btn-primary" onClick={() => send({ type: "captionThis:beginVoting", payload: {} })}>
              Start voting
            </button>
          </div>
        )}
        {isHost && !state.allCaptionsIn && (
          <p className="mode-option-hint">When everyone has submitted, you can start voting.</p>
        )}
      </section>
    );
  }

  if (state.status === "voting") {
    return (
      <section className="card card-game-inner">
        <header className="card-head">
          <h2>Vote</h2>
          <span className="pill pill-muted">Round {state.roundNumber}</span>
        </header>
        <figure className="caption-this-figure">
          <img src={imageSrc(state.imageUrl)} alt="Round image" className="caption-this-main-img" />
        </figure>
        <p className="mode-option-hint">
          Votes in: {state.votedParticipantIds.length} / {session.participants.length}
        </p>
        {state.hasVoted ? (
          <p className="game-lede">Thanks — your vote is in.</p>
        ) : null}
        <ul className="caption-this-entry-list">
          {state.displayEntries.map((row) => {
            const own = row.entryId === state.myEntryId;
            const canVote = !own && !state.hasVoted;
            return (
              <li key={row.entryId} className="caption-this-entry">
                <blockquote className="caption-this-quote">{row.text}</blockquote>
                {own ? (
                  <span className="pill pill-muted">Your caption</span>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={!canVote}
                    onClick={() =>
                      send({
                        type: "captionThis:vote",
                        payload: { entryId: row.entryId }
                      })
                    }
                  >
                    Vote for this
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  // results
  const sorted = [...state.tallies].sort((a, b) => b.voteCount - a.voteCount);
  return (
    <section className="card card-game-inner">
      <header className="card-head">
        <h2>Results</h2>
        <span className="pill pill-muted">Round {state.roundNumber}</span>
      </header>
      <figure className="caption-this-figure">
        <img src={imageSrc(state.imageUrl)} alt="Round image" className="caption-this-main-img" />
      </figure>
      <ol className="caption-this-results">
        {sorted.map((t) => {
          const name = session.participants.find((p) => p.id === t.authorId)?.displayName ?? "Player";
          const won = state.winnerEntryIds.includes(t.entryId);
          return (
            <li key={t.entryId} className={won ? "caption-this-result-row is-winner" : "caption-this-result-row"}>
              <span className="caption-this-result-votes">{t.voteCount}</span>
              <div>
                <div className="caption-this-result-text">{t.text}</div>
                <div className="caption-this-result-author">{name}</div>
              </div>
            </li>
          );
        })}
      </ol>
      {isHost && (
        <div className="stack gap-sm" style={{ marginTop: "1rem" }}>
          <label className="mode-picker-label" htmlFor="cap-next-provider">
            Next image provider
          </label>
          <select
            id="cap-next-provider"
            value={nextRoundProviderId}
            onChange={(e) => setNextRoundProviderId(e.target.value)}
          >
            {session.participants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
                {p.isHost ? " (host)" : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              send({
                type: "captionThis:beginNextRound",
                payload: { imageProviderId: nextRoundProviderId }
              })
            }
          >
            Next round
          </button>
        </div>
      )}
    </section>
  );
}

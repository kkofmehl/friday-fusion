import { useCallback, useEffect, useRef, useState } from "react";
import type { ClipboardEvent } from "react";
import type { ClientEvent, SessionState } from "../../../shared/contracts";
import { imageFileFromClipboard } from "../utils/imageClipboardPaste";

const clampRevealMs = (seconds: number): number => {
  const s = Number.isFinite(seconds) ? seconds : 60;
  return Math.min(120_000, Math.max(10_000, Math.round(s * 1000)));
};

const secondsFromMs = (ms: number): number => Math.round(ms / 1000);

const guessImageFileIdFromImageUrl = (url: string | null): string | null => {
  if (!url || !url.includes("/guess-the-image/file/")) {
    return null;
  }
  const part = url.split("/guess-the-image/file/")[1];
  if (!part) {
    return null;
  }
  try {
    return decodeURIComponent(part.split("?")[0] ?? "");
  } catch {
    return null;
  }
};

/** Max CSS blur (px) at the start of the reveal; eases to 0 as opacity reaches 1. */
const REVEAL_MAX_BLUR_PX = 22;

export function GuessTheImageGame({
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
  const game = session.gameState?.type === "guessTheImage" ? session.gameState : null;
  const state = game?.state;
  const [descriptions, setDescriptions] = useState<[string, string, string, string]>(["", "", "", ""]);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [revealSeconds, setRevealSeconds] = useState(60);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [lastFileId, setLastFileId] = useState<string | null>(null);
  const [setupBusy, setSetupBusy] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [opacity, setOpacity] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = (): void => {
      setReduceMotion(mq.matches);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

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
    if (state?.status === "playing") {
      setSelectedChoice(null);
    }
  }, [state?.status, state?.status === "playing" ? state.roundStartedAt : 0]);

  const prevGuessImageStatus = useRef<string>("");
  useEffect(() => {
    if (!state) {
      return;
    }
    const was = prevGuessImageStatus.current;
    prevGuessImageStatus.current = state.status;
    if (state.status === "setup" && was === "finished") {
      setLastFileId(null);
      setPendingFile(null);
      setDescriptions(["", "", "", ""] as [string, string, string, string]);
      setCorrectIndex(0);
      setRevealSeconds(secondsFromMs(state.revealDurationMs));
    }
  }, [state]);

  const prevConfiguredRef = useRef(false);
  useEffect(() => {
    if (state?.status !== "setup" || state.setupMode === "everyone") {
      prevConfiguredRef.current = false;
      return;
    }
    if (!state.configured) {
      prevConfiguredRef.current = false;
      return;
    }
    if (!prevConfiguredRef.current) {
      setDescriptions([...state.descriptions] as [string, string, string, string]);
      setCorrectIndex(state.correctIndex);
      setRevealSeconds(secondsFromMs(state.revealDurationMs));
      prevConfiguredRef.current = true;
    }
  }, [state]);

  const everyoneMySetupKey =
    state?.status === "setup" && state.setupMode === "everyone" && state.everyoneMySetup
      ? `${state.everyoneMySetup.configured}:${state.everyoneMySetup.imageUrl ?? ""}:${state.everyoneMySetup.descriptions.join("\u0000")}:${state.everyoneMySetup.correctIndex}:${state.everyoneMySetup.revealDurationMs}`
      : "";
  useEffect(() => {
    if (!everyoneMySetupKey || !state || state.status !== "setup" || state.setupMode !== "everyone" || !state.everyoneMySetup) {
      return;
    }
    const my = state.everyoneMySetup;
    setDescriptions([...my.descriptions] as [string, string, string, string]);
    setCorrectIndex(my.correctIndex);
    setRevealSeconds(secondsFromMs(my.revealDurationMs));
    setLastFileId(guessImageFileIdFromImageUrl(my.imageUrl));
    setPendingFile(null);
  }, [everyoneMySetupKey, state]);

  const imageSrc = (path: string): string => `${apiBase}${path}`;

  const revealBlurPx = (o: number): number => (1 - o) * REVEAL_MAX_BLUR_PX;

  const tickOpacity = useCallback(() => {
    if (!state || state.status !== "playing") {
      return;
    }
    const t = Math.min(1, Math.max(0, (Date.now() - state.roundStartedAt) / state.revealDurationMs));
    setOpacity(t);
    rafRef.current = requestAnimationFrame(tickOpacity);
  }, [state]);

  useEffect(() => {
    if (!state || state.status !== "playing") {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      setOpacity(state?.status === "finished" ? 1 : 0);
      return;
    }
    rafRef.current = requestAnimationFrame(tickOpacity);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [state, tickOpacity]);

  const saveSetup = async () => {
    if (state?.status !== "setup") {
      return;
    }
    const everyoneMode = state.setupMode === "everyone";
    if (!everyoneMode && currentParticipantId !== state.setupParticipantId) {
      return;
    }
    let imageFileId =
      lastFileId ?? guessImageFileIdFromImageUrl(state.everyoneMySetup?.imageUrl ?? state.imageUrl ?? null);
    if (pendingFile) {
      setSetupBusy(true);
      try {
        const body = new FormData();
        body.append("participantId", currentParticipantId);
        body.append("file", pendingFile);
        const response = await fetch(`${apiBase}/api/sessions/${session.sessionId}/guess-the-image/upload`, {
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
        imageFileId = payload.fileId;
        setLastFileId(payload.fileId);
      } catch {
        setSetupBusy(false);
        return;
      }
      setSetupBusy(false);
      setPendingFile(null);
    }
    if (!imageFileId) {
      return;
    }
    const trimmed = descriptions.map((d) => d.trim()) as [string, string, string, string];
    if (trimmed.some((d) => d.length === 0)) {
      return;
    }
    send({
      type: "guessImage:configure",
      payload: {
        imageFileId,
        descriptions: trimmed,
        correctIndex,
        revealDurationMs: clampRevealMs(revealSeconds)
      }
    });
  };

  const handlePasteImage = useCallback(
    (event: ClipboardEvent) => {
      if (!state || state.status !== "setup" || setupBusy) {
        return;
      }
      const canPaste =
        state.setupMode === "everyone" || currentParticipantId === state.setupParticipantId;
      if (!canPaste) {
        return;
      }
      const file = imageFileFromClipboard(event);
      if (!file) {
        return;
      }
      event.preventDefault();
      setPendingFile(file);
    },
    [state, currentParticipantId, setupBusy]
  );

  if (!state) {
    return null;
  }

  const mySubmitted =
    state.status === "playing" && state.submittedParticipantIds.includes(currentParticipantId);

  const isGuesserPlaying =
    state.status === "playing" && currentParticipantId !== state.setupParticipantId;
  const guesserCount =
    state.status === "playing"
      ? session.participants.filter((p) => p.id !== state.setupParticipantId).length
      : 0;

  const submitLock = () => {
    if (!isGuesserPlaying || selectedChoice === null || mySubmitted) {
      return;
    }
    send({ type: "guessImage:lock", payload: { choiceIndex: selectedChoice } });
  };

  if (state.status === "setup") {
    const everyoneMode = state.setupMode === "everyone";
    const everyoneBetweenRounds = everyoneMode && state.everyoneBetweenRounds;
    const isSetupPlayer = everyoneMode || currentParticipantId === state.setupParticipantId;
    const setupDisplayName =
      session.participants.find((p) => p.id === state.setupParticipantId)?.displayName ?? "the setup player";
    const mySaved = everyoneMode ? Boolean(state.everyoneMySetup?.configured) : state.configured;
    const setupImagePreviewPath =
      everyoneMode && state.everyoneMySetup?.imageUrl ? state.everyoneMySetup.imageUrl : state.imageUrl;
    const presenterCandidates = everyoneBetweenRounds
      ? session.participants.filter((p) =>
          state.everyonePeers.some((row) => row.participantId === p.id && row.configured)
        )
      : session.participants;
    const selectedPresenterConfigured = state.selectedRoundParticipantId
      ? Boolean(
          state.everyonePeers.find((row) => row.participantId === state.selectedRoundParticipantId)?.configured
        )
      : false;
    const canHostStartEveryone =
      everyoneMode &&
      isHost &&
      Boolean(state.selectedRoundParticipantId) &&
      selectedPresenterConfigured &&
      (everyoneBetweenRounds || state.everyoneAllConfigured);
    const canPreparerStartSingle =
      !everyoneMode && currentParticipantId === state.setupParticipantId && state.configured;
    return (
      <div className="guess-image card">
        <header className="card-head">
          <h2>Guess the image</h2>
          {everyoneMode ? (
            mySaved ? (
              <span className="pill pill-muted">Your setup saved</span>
            ) : (
              <span className="pill pill-muted">Your turn to prepare</span>
            )
          ) : state.configured ? (
            <span className="pill pill-muted">Ready to start</span>
          ) : (
            <span className="pill pill-muted">Setup</span>
          )}
        </header>
        {isHost && !everyoneMode ? (
          <div className="guess-image-setup-host-tools mode-picker">
            <label className="guess-image-label" htmlFor="guess-image-setup-assign">
              Who prepares this round?
            </label>
            <select
              id="guess-image-setup-assign"
              value={state.setupParticipantId}
              onChange={(e) =>
                send({ type: "guessImage:setSetupParticipant", payload: { participantId: e.target.value } })
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
        ) : null}
        {isHost && everyoneMode ? (
          <div className="guess-image-setup-host-tools mode-picker">
            {everyoneBetweenRounds ? (
              <p className="guess-image-hint">
                Pick the next saved image from the list, then start the round. To have everyone upload new images from
                scratch, use <strong>Start new round</strong> on the results screen instead.
              </p>
            ) : (
              <>
                <p className="guess-image-hint">
                  Each player saves their own image and captions below. When everyone has saved, choose whose image the
                  room will guess, then start the round.
                </p>
                <ul className="guess-image-everyone-peers">
                  {state.everyonePeers.map((row) => {
                    const name =
                      session.participants.find((p) => p.id === row.participantId)?.displayName ?? row.participantId;
                    return (
                      <li key={row.participantId}>
                        <span>{name}</span>
                        <span className="guess-image-peer-status">{row.configured ? "✓ Saved" : "… Not yet"}</span>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            {!everyoneBetweenRounds && !state.everyoneAllConfigured ? (
              <p className="guess-image-hint">Waiting until every player has saved their setup…</p>
            ) : (
              <>
                <label className="guess-image-label" htmlFor="guess-image-round-presenter">
                  Whose image do we guess?
                </label>
                <select
                  id="guess-image-round-presenter"
                  value={state.selectedRoundParticipantId ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    send({
                      type: "guessImage:setRoundPresenter",
                      payload: { participantId: v.length > 0 ? v : null }
                    });
                  }}
                >
                  <option value="">Select a player…</option>
                  {presenterCandidates.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName}
                      {p.isHost ? " (host)" : ""}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        ) : null}
        {isSetupPlayer ? (
          <div className="guess-image-setup" onPasteCapture={handlePasteImage}>
            <label className="guess-image-label" htmlFor="guess-image-file">
              Image
            </label>
            <input
              id="guess-image-file"
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
            />
            <p className="guess-image-paste-hint">JPEG, PNG, GIF, or WebP — choose a file or paste an image (⌘V / Ctrl+V) anywhere in this form.</p>
            {previewUrl ? (
              <img className="guess-image-preview" src={previewUrl} alt="" />
            ) : setupImagePreviewPath ? (
              <img className="guess-image-preview" src={imageSrc(setupImagePreviewPath)} alt="" />
            ) : null}
            <p className="guess-image-hint">Enter four descriptions in order, then mark which one is correct.</p>
            {[0, 1, 2, 3].map((i) => (
              <label key={i} className="guess-image-field" htmlFor={`guess-opt-${i}`}>
                <span className="guess-image-label">Option {i + 1}</span>
                <input
                  id={`guess-opt-${i}`}
                  type="text"
                  value={descriptions[i]}
                  onChange={(e) => {
                    const next = [...descriptions] as [string, string, string, string];
                    next[i] = e.target.value;
                    setDescriptions(next);
                  }}
                />
              </label>
            ))}
            <fieldset className="guess-image-field">
              <legend className="guess-image-label">Correct option</legend>
              <div className="guess-image-radio-row">
                {[0, 1, 2, 3].map((i) => (
                  <label key={i} className="mode-option">
                    <input
                      type="radio"
                      name="guess-correct"
                      checked={correctIndex === i}
                      onChange={() => setCorrectIndex(i)}
                    />
                    <span>#{i + 1}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="guess-image-field" htmlFor="guess-reveal-sec">
              <span className="guess-image-label">Reveal duration (seconds)</span>
              <input
                id="guess-reveal-sec"
                type="number"
                min={10}
                max={120}
                value={revealSeconds}
                onChange={(e) => setRevealSeconds(Number(e.target.value))}
              />
            </label>
            <div className="card-footer card-footer-actions">
              <button type="button" className="btn btn-primary" disabled={setupBusy} onClick={() => void saveSetup()}>
                {setupBusy ? "Uploading…" : "Save setup"}
              </button>
              {(everyoneMode && isHost) || canPreparerStartSingle ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={setupBusy || (everyoneMode ? !canHostStartEveryone : !state.configured)}
                  onClick={() => send({ type: "guessImage:startRound", payload: {} })}
                >
                  Start round
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <p>
            Waiting for <strong>{setupDisplayName}</strong> to finish setup…
          </p>
        )}
      </div>
    );
  }

  if (state.status === "playing") {
    return (
      <div className="guess-image card">
        <header className="card-head">
          <h2>Guess the image</h2>
          <span className="pill pill-muted">Round live</span>
        </header>
        <div className="guess-image-stage">
          <div className="guess-image-frame">
            <img
              src={imageSrc(state.imageUrl)}
              alt=""
              className="guess-image-photo"
              style={{
                opacity,
                filter: reduceMotion ? "none" : `blur(${revealBlurPx(opacity).toFixed(2)}px)`
              }}
            />
          </div>
        </div>
        {!isGuesserPlaying ? (
          <p className="guess-image-host-note">
            You prepared this round—others see shuffled options. Submitted: {state.submittedParticipantIds.length}/
            {guesserCount}
          </p>
        ) : (
          <div className="guess-image-choices">
            <p className="guess-image-label">Pick the best match, then submit.</p>
            <div className="guess-image-option-grid">
              {state.options.map((label, index) => (
                <button
                  key={index}
                  type="button"
                  className={`btn guess-image-option${selectedChoice === index ? " is-selected" : ""}`}
                  disabled={mySubmitted}
                  onClick={() => setSelectedChoice(index)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-primary btn-lg guess-image-submit"
              disabled={mySubmitted || selectedChoice === null}
              onClick={submitLock}
            >
              {mySubmitted ? "Locked in" : "Submit answer"}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="guess-image card">
      <header className="card-head">
        <h2>Guess the image</h2>
        <span className="pill pill-muted">Round over</span>
      </header>
      {state.imageUrl ? (
        <div className="guess-image-stage">
          <div className="guess-image-frame">
            <img src={imageSrc(state.imageUrl)} alt="" className="guess-image-photo" style={{ opacity: 1 }} />
          </div>
        </div>
      ) : (
        <p className="guess-image-hint">The image file was removed from the server after this round.</p>
      )}
      <p className="guess-image-reveal">
        Correct: <strong>{state.options[state.correctDisplayIndex]}</strong>
      </p>
      <ul className="guess-image-results">
        {state.results.map((r) => {
          const name = session.participants.find((p) => p.id === r.participantId)?.displayName ?? r.participantId;
          const picked =
            r.choiceDisplayIndex === null ? "—" : state.options[r.choiceDisplayIndex] ?? `#${r.choiceDisplayIndex}`;
          return (
            <li key={r.participantId}>
              <span className="guess-image-result-name">{name}</span>
              <span className="guess-image-result-pick">{picked}</span>
              <span className="guess-image-result-meta">
                {r.correct ? `+${r.pointsAwarded} pts` : "0 pts"}
                {r.elapsedMs !== null ? ` · ${(r.elapsedMs / 1000).toFixed(2)}s` : ""}
              </span>
            </li>
          );
        })}
      </ul>
      {isHost && (
        <div className="card-footer card-footer-actions">
          {state.setupMode === "everyone" ? (
            <>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => send({ type: "guessImage:beginNextRoundSelection", payload: {} })}
              >
                Select next image to guess
              </button>
              <button type="button" className="btn" onClick={() => send({ type: "guessImage:backToSetup", payload: {} })}>
                Start new round
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => send({ type: "guessImage:backToSetup", payload: {} })}>
              New image (setup)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

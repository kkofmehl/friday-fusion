import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ClientEvent,
  PictionarySavedStroke,
  PictionaryState,
  SessionState
} from "../../../shared/contracts";
import { ScoreBoard } from "../components/ScoreBoard";

type DrawTool = "pen" | "eraser";

function redrawCanvas(
  canvas: HTMLCanvasElement,
  strokes: PictionarySavedStroke[],
  lineColor: string,
  bg: string
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const w = canvas.width || canvas.clientWidth;
  const h = canvas.height || canvas.clientHeight;
  if (w === 0 || h === 0) {
    return;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const s of strokes) {
    if (s.points.length < 2) {
      continue;
    }
    const px = (x: number) => x * w;
    const py = (y: number) => y * h;
    ctx.beginPath();
    ctx.moveTo(px(s.points[0]!.x), py(s.points[0]!.y));
    for (let i = 1; i < s.points.length; i += 1) {
      ctx.lineTo(px(s.points[i]!.x), py(s.points[i]!.y));
    }
    if (s.tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
      ctx.lineWidth = Math.max(4, s.width * (w / 640));
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = Math.max(1, s.width * (w / 640));
    }
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
  }
}

type PictionaryRoundBreakState = Extract<PictionaryState, { status: "roundBreak" }>;

function PictionaryRoundBreak({ state }: { state: PictionaryRoundBreakState }): JSX.Element {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 250);
    return () => window.clearInterval(id);
  }, []);
  const msLeft = Math.max(0, state.nextRoundStartsAt - Date.now());
  const sec = Math.ceil(msLeft / 1000);
  return (
    <section className="card pictionary-break-card">
      <header className="card-head">
        <h2>Round over</h2>
      </header>
      <p className="pictionary-revealed-label">The clue was:</p>
      <p className="pictionary-revealed-word">{state.revealedPrompt}</p>
      <p className="pictionary-break-meta">
        {state.lastResult === "correct" ? "Team guessed in time." : "Time ran out."}
      </p>
      <p className="pictionary-break-countdown" aria-live="polite">
        Next round in {sec}s…
      </p>
    </section>
  );
}

export function PictionaryGame({
  session,
  currentParticipantId,
  isHost,
  send
}: {
  session: SessionState;
  currentParticipantId: string;
  isHost: boolean;
  send: (event: ClientEvent) => void;
}): JSX.Element | null {
  const gs = session.gameState;
  if (!gs || gs.type !== "pictionary") {
    return null;
  }
  const state = gs.state;

  const [draftTeamA, setDraftTeamA] = useState<string[]>(() =>
    state.status === "teamSetup" ? [...state.teamAIds] : []
  );
  const [draftTeamB, setDraftTeamB] = useState<string[]>(() =>
    state.status === "teamSetup" ? [...state.teamBIds] : []
  );

  useEffect(() => {
    if (state.status === "teamSetup") {
      setDraftTeamA([...state.teamAIds]);
      setDraftTeamB([...state.teamBIds]);
    }
  }, [state.status, state.teamAIds, state.teamBIds]);

  const setPlayerTeam = (participantId: string, team: "A" | "B" | "none"): void => {
    setDraftTeamA((a) => a.filter((id) => id !== participantId));
    setDraftTeamB((b) => b.filter((id) => id !== participantId));
    if (team === "A") {
      setDraftTeamA((a) => [...a, participantId]);
    } else if (team === "B") {
      setDraftTeamB((b) => [...b, participantId]);
    }
  };

  const saveTeams = (): void => {
    send({
      type: "pictionary:setTeams",
      payload: { teamAIds: draftTeamA, teamBIds: draftTeamB }
    });
  };

  const beginPlay = (): void => {
    send({ type: "pictionary:beginPlay", payload: {} });
  };

  if (state.status === "teamSetup") {
    return (
      <section className="card pictionary-setup-card">
        <header className="card-head">
          <h2>Pictionary — teams</h2>
        </header>
        <p className="pictionary-setup-lead">
          Split everyone into two teams. The host saves the lineup, then starts the game.
        </p>
        <ul className="pictionary-team-picks">
          {session.participants.map((p) => {
            const onA = draftTeamA.includes(p.id);
            const onB = draftTeamB.includes(p.id);
            return (
              <li key={p.id} className="pictionary-team-pick-row">
                <span className="pictionary-team-pick-name">
                  {p.displayName}
                  {p.isHost ? " (host)" : ""}
                </span>
                {isHost ? (
                  <div className="pictionary-team-pick-actions" role="group" aria-label={`Team for ${p.displayName}`}>
                    <label className="pictionary-team-radio">
                      <input
                        type="radio"
                        name={`team-${p.id}`}
                        checked={onA}
                        onChange={() => setPlayerTeam(p.id, "A")}
                      />
                      Team A
                    </label>
                    <label className="pictionary-team-radio">
                      <input
                        type="radio"
                        name={`team-${p.id}`}
                        checked={onB}
                        onChange={() => setPlayerTeam(p.id, "B")}
                      />
                      Team B
                    </label>
                    <label className="pictionary-team-radio">
                      <input
                        type="radio"
                        name={`team-${p.id}`}
                        checked={!onA && !onB}
                        onChange={() => setPlayerTeam(p.id, "none")}
                      />
                      Unassigned
                    </label>
                  </div>
                ) : (
                  <span className="pictionary-team-pick-hint">
                    {onA ? "Team A" : onB ? "Team B" : "Not assigned yet"}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        {isHost && (
          <div className="pictionary-setup-actions">
            <button type="button" className="btn btn-secondary" onClick={saveTeams}>
              Save team lineup
            </button>
            <button type="button" className="btn btn-primary" onClick={beginPlay}>
              Start drawing
            </button>
          </div>
        )}
      </section>
    );
  }

  if (state.status === "roundBreak") {
    return <PictionaryRoundBreak state={state} />;
  }

  return (
    <PictionaryDrawingView
      key={`${state.drawerId}-${state.roundStartedAt}`}
      session={session}
      state={state}
      currentParticipantId={currentParticipantId}
      isHost={isHost}
      send={send}
    />
  );
}

type PictionaryDrawingState = Extract<PictionaryState, { status: "drawing" }>;

function PictionaryDrawingView({
  session,
  state,
  currentParticipantId,
  isHost,
  send
}: {
  session: SessionState;
  state: PictionaryDrawingState;
  currentParticipantId: string;
  isHost: boolean;
  send: (event: ClientEvent) => void;
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  /** Last bitmap size — only assign canvas.width/height when this changes (avoids layout feedback + clears). */
  const bitmapSizeRef = useRef({ w: 0, h: 0 });
  const [tool, setTool] = useState<DrawTool>("pen");
  const [penWidth, setPenWidth] = useState(6);
  const [currentStroke, setCurrentStroke] = useState<{ x: number; y: number }[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [, setTick] = useState(0);

  const isDrawer = state.drawerId === currentParticipantId;
  const onActiveTeam =
    state.activeTeam === "A" ? state.teamAIds.includes(currentParticipantId) : state.teamBIds.includes(currentParticipantId);
  const isIdleTeam = !onActiveTeam;

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 250);
    return () => window.clearInterval(id);
  }, []);

  const paintCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) {
      return;
    }
    const w = Math.max(1, Math.floor(wrap.clientWidth));
    const h = Math.max(1, Math.floor(wrap.clientHeight));
    const prev = bitmapSizeRef.current;
    if (w !== prev.w || h !== prev.h) {
      bitmapSizeRef.current = { w, h };
      canvas.width = w;
      canvas.height = h;
    }
    redrawCanvas(
      canvas,
      [
        ...state.strokes,
        ...(currentStroke.length > 1
          ? [{ id: "_draft", tool, width: penWidth, points: currentStroke } as PictionarySavedStroke]
          : [])
      ],
      "#1a1a2e",
      "#f8f8fc"
    );
  }, [currentStroke, penWidth, state.strokes, tool]);

  const paintCanvasRef = useRef(paintCanvas);
  paintCanvasRef.current = paintCanvas;

  useEffect(() => {
    paintCanvas();
  }, [paintCanvas]);

  useEffect(() => {
    const onResize = (): void => paintCanvasRef.current();
    window.addEventListener("resize", onResize);
    const wrap = wrapRef.current;
    let ro: ResizeObserver | undefined;
    if (wrap && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => paintCanvasRef.current());
      ro.observe(wrap);
    }
    return () => {
      window.removeEventListener("resize", onResize);
      ro?.disconnect();
    };
  }, []);

  const normPoint = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const wrap = wrapRef.current;
    if (!wrap) {
      return null;
    }
    const r = wrap.getBoundingClientRect();
    const x = (clientX - r.left) / r.width;
    const y = (clientY - r.top) / r.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) {
      return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
    }
    return { x, y };
  };

  const flushStroke = (): void => {
    if (currentStroke.length < 2) {
      setCurrentStroke([]);
      return;
    }
    send({
      type: "pictionary:appendStroke",
      payload: {
        tool,
        width: penWidth,
        points: currentStroke
      }
    });
    setCurrentStroke([]);
  };

  const onPointerDown = (e: React.PointerEvent): void => {
    if (!isDrawer) {
      return;
    }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const pt = normPoint(e.clientX, e.clientY);
    if (!pt) {
      return;
    }
    setDrawing(true);
    setCurrentStroke([pt]);
  };

  const onPointerMove = (e: React.PointerEvent): void => {
    if (!isDrawer || !drawing) {
      return;
    }
    const pt = normPoint(e.clientX, e.clientY);
    if (!pt) {
      return;
    }
    setCurrentStroke((prev) => {
      const last = prev[prev.length - 1];
      if (last && Math.hypot(pt.x - last.x, pt.y - last.y) < 0.002) {
        return prev;
      }
      if (prev.length >= 400) {
        return prev;
      }
      return [...prev, pt];
    });
  };

  const onPointerUp = (e: React.PointerEvent): void => {
    if (!isDrawer) {
      return;
    }
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setDrawing(false);
    flushStroke();
  };

  const msLeft = Math.max(0, state.roundEndsAt - Date.now());
  const timerPct = Math.min(100, (msLeft / state.roundDurationMs) * 100);

  return (
    <div className="pictionary-stage">
      {isIdleTeam && (
        <div className="pictionary-quiet-banner" role="status">
          {"Shh — it's the other team's turn. Stay quiet so their guessers can think aloud."}
        </div>
      )}
      <div className="pictionary-main-row">
        <section className="card pictionary-play-card">
          <header className="card-head pictionary-play-head">
            <h2>Pictionary</h2>
            <div className="pictionary-timer-wrap" aria-label="Time remaining">
              <div className="pictionary-timer-bar">
                <div className="pictionary-timer-fill" style={{ width: `${timerPct}%` }} />
              </div>
              <span className="pictionary-timer-text">{Math.ceil(msLeft / 1000)}s</span>
            </div>
          </header>
          {isDrawer && state.myPrompt && (
            <p className="pictionary-prompt">
              Draw: <strong>{state.myPrompt}</strong>
            </p>
          )}
          {!isDrawer && (
            <p className="pictionary-prompt-muted">
              {`${session.participants.find((p) => p.id === state.drawerId)?.displayName ?? "Someone"} is drawing.`}
            </p>
          )}
          <div ref={wrapRef} className="pictionary-canvas-wrap">
            <canvas
              ref={canvasRef}
              className="pictionary-canvas"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              style={{ touchAction: isDrawer ? "none" : "auto" }}
            />
          </div>
          {isDrawer && (
            <div className="pictionary-drawer-tools">
              <div className="pictionary-tool-group" role="group" aria-label="Tool">
                <button
                  type="button"
                  className={`btn btn-sm${tool === "pen" ? " btn-primary" : " btn-secondary"}`}
                  onClick={() => setTool("pen")}
                >
                  Pen
                </button>
                <button
                  type="button"
                  className={`btn btn-sm${tool === "eraser" ? " btn-primary" : " btn-secondary"}`}
                  onClick={() => setTool("eraser")}
                >
                  Eraser
                </button>
              </div>
              <label className="pictionary-width-label">
                Size
                <input
                  type="range"
                  min={2}
                  max={28}
                  value={penWidth}
                  onChange={(ev) => setPenWidth(Number(ev.target.value))}
                />
              </label>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => send({ type: "pictionary:clearCanvas", payload: {} })}>
                Clear canvas
              </button>
              <button type="button" className="btn btn-primary" onClick={() => send({ type: "pictionary:teamGuessed", payload: {} })}>
                Someone on my team guessed it
              </button>
            </div>
          )}
          {isHost && (
            <p className="pictionary-host-skip">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => send({ type: "pictionary:hostSkipRound", payload: {} })}>
                Skip round (time out)
              </button>
            </p>
          )}
        </section>
        <aside className="card card-players pictionary-scores">
          <header className="card-head">
            <h2>Scores</h2>
          </header>
          <ScoreBoard participants={session.participants} />
          <div className="pictionary-team-legend">
            <p>
              <span className="pictionary-legend-a">Team A</span>:{" "}
              {state.teamAIds
                .map((id) => session.participants.find((p) => p.id === id)?.displayName)
                .filter(Boolean)
                .join(", ")}
            </p>
            <p>
              <span className="pictionary-legend-b">Team B</span>:{" "}
              {state.teamBIds
                .map((id) => session.participants.find((p) => p.id === id)?.displayName)
                .filter(Boolean)
                .join(", ")}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

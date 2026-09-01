import { useEffect, useRef, useState, type JSX } from "react";
import type { MonopolyDealPendingAction, MonopolyDealPendingResolution, SessionState } from "../../../../shared/contracts";
import { getCardDef } from "../../../../shared/monopolyDealData";
import { justSayNoActionLabel, justSayNoTargetsEveryone } from "../../../../shared/monopolyDealJustSayNo";
import { PlayerName } from "../../components/PlayerName";

type LateWindow = {
  action: MonopolyDealPendingAction;
  eligiblePlayerIds: string[];
  primaryTargetId?: string;
  affectedPlayerIds?: string[];
  effect?: "undo" | "apply";
};

function ActionDescription({
  action,
  participants
}: {
  action: MonopolyDealPendingAction;
  participants: SessionState["participants"];
}): JSX.Element {
  const actor = <PlayerName participantId={action.actorId} participants={participants} size="sm" inline />;
  const actionLabel = justSayNoActionLabel(action);

  if (justSayNoTargetsEveryone(action)) {
    return (
      <p className="md-jsn-panel-message">
        {actor} played <strong>{actionLabel}</strong> against all other players.
      </p>
    );
  }

  if (action.targetId) {
    return (
      <p className="md-jsn-panel-message">
        {actor} played <strong>{actionLabel}</strong> against{" "}
        <PlayerName participantId={action.targetId} participants={participants} size="sm" inline />.
      </p>
    );
  }

  return (
    <p className="md-jsn-panel-message">
      {actor} played <strong>{actionLabel}</strong>.
    </p>
  );
}

export function JustSayNoPanel({
  pending,
  late,
  currentParticipantId,
  myHand,
  participants,
  send
}: {
  pending?: Extract<MonopolyDealPendingResolution, { kind: "justSayNo" }>;
  late?: LateWindow | null;
  currentParticipantId: string;
  myHand: { id: string; defId: string }[];
  participants: SessionState["participants"];
  send: (
    event:
      | { type: "monopolyDeal:respondJustSayNo"; payload: { useCardId: string | null } }
      | { type: "monopolyDeal:extendJustSayNo"; payload: Record<string, never> }
      | { type: "monopolyDeal:expireJustSayNo"; payload: Record<string, never> }
  ) => void;
}): JSX.Element | null {
  const [secondsLeft, setSecondsLeft] = useState(5);
  const sendRef = useRef(send);
  const autoRespondedRef = useRef(false);
  const thinkingRequestedRef = useRef(false);
  const thinkingUntilRef = useRef(0);
  const expireSentRef = useRef(false);
  sendRef.current = send;

  const action = pending?.action ?? late?.action;
  if (!action) {
    return null;
  }

  const primaryTargetId = pending?.primaryTargetId ?? late?.primaryTargetId;
  const isPrimaryTarget = primaryTargetId === currentParticipantId;
  const hasJustSayNo = myHand.some((c) => getCardDef(c.defId).action === "justSayNo");
  const eligibleIds = pending?.eligiblePlayerIds ?? late?.eligiblePlayerIds ?? [];
  const canCounter = eligibleIds.includes(currentParticipantId) && hasJustSayNo;
  const isLateWindow = Boolean(late) && !pending;
  const shouldShowPanel = canCounter;

  useEffect(() => {
    if (!pending || isLateWindow || !isPrimaryTarget || hasJustSayNo) {
      return;
    }
    autoRespondedRef.current = false;
    const expiresAt = pending.expiresAt;
    const tick = (): void => {
      if (expiresAt - Date.now() <= 0 && !autoRespondedRef.current) {
        autoRespondedRef.current = true;
        sendRef.current({ type: "monopolyDeal:respondJustSayNo", payload: { useCardId: null } });
      }
    };
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [pending?.expiresAt, isLateWindow, isPrimaryTarget, hasJustSayNo, pending]);

  useEffect(() => {
    if (isLateWindow || !shouldShowPanel || !pending) {
      return;
    }
    const expiresAt = pending.expiresAt;
    if (pending.thinkingExtended && expiresAt - Date.now() > 1000) {
      thinkingRequestedRef.current = false;
    }
    const tick = (): void => {
      const deadline =
        thinkingRequestedRef.current && thinkingUntilRef.current > 0 ? thinkingUntilRef.current : expiresAt;
      setSecondsLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    };
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [pending?.expiresAt, pending?.thinkingExtended, isLateWindow, shouldShowPanel, pending]);

  useEffect(() => {
    if (!pending || isLateWindow || !shouldShowPanel) {
      return;
    }
    expireSentRef.current = false;
    const expiresAt = pending.expiresAt;
    const tick = (): void => {
      if (thinkingRequestedRef.current || expireSentRef.current) {
        return;
      }
      if (expiresAt - Date.now() <= 0) {
        expireSentRef.current = true;
        sendRef.current({ type: "monopolyDeal:expireJustSayNo", payload: {} });
      }
    };
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [pending?.expiresAt, isLateWindow, shouldShowPanel, pending]);

  if (!shouldShowPanel) {
    return null;
  }

  const jsnCard = myHand.find((c) => getCardDef(c.defId).action === "justSayNo");
  const canAllow = Boolean(pending) && !isLateWindow;

  return (
    <div className="md-jsn-panel" role="alertdialog" aria-live="assertive">
      <div className="md-jsn-panel-title">{isLateWindow ? "Last chance — Just Say No" : "Just Say No?"}</div>
      <ActionDescription action={action} participants={participants} />
      {isLateWindow ? (
        <p className="md-jsn-panel-note">
          {late?.effect === "apply"
            ? "Play Just Say No before they take another play or end their turn to block their Just Say No so the original action still happens."
            : "The action was applied. Play Just Say No before they take another play or end their turn to undo it."}
        </p>
      ) : (
        <p className="md-jsn-panel-timer">{secondsLeft}s remaining to counter</p>
      )}
      <div className="md-jsn-panel-actions">
        {canAllow ? (
          <button
            type="button"
            className="md-btn md-btn--allow"
            onClick={() => send({ type: "monopolyDeal:respondJustSayNo", payload: { useCardId: null } })}
          >
            Allow
          </button>
        ) : null}
        {jsnCard ? (
          <button
            type="button"
            className="md-btn md-btn--jsn"
            onClick={() => send({ type: "monopolyDeal:respondJustSayNo", payload: { useCardId: jsnCard.id } })}
          >
            Just Say No
          </button>
        ) : null}
        {pending && !pending.thinkingExtended ? (
          <button
            type="button"
            className="md-btn md-btn--ghost"
            onClick={() => {
              thinkingRequestedRef.current = true;
              thinkingUntilRef.current = Date.now() + 30_000;
              expireSentRef.current = true;
              setSecondsLeft(30);
              send({ type: "monopolyDeal:extendJustSayNo", payload: {} });
            }}
          >
            I&apos;m thinking...
          </button>
        ) : null}
      </div>
      {!isLateWindow && pending?.canCounter === false ? (
        <p className="md-jsn-panel-note">
          Playing Just Say No blocks their Just Say No so the original action still happens.
        </p>
      ) : !isPrimaryTarget && !isLateWindow ? (
        <p className="md-jsn-panel-note">Playing Just Say No cancels this action for everyone.</p>
      ) : null}
    </div>
  );
}

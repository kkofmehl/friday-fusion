import type { ClientEvent, Participant, SessionState } from "../../../shared/contracts";

type TurnTag = { label: string; tone: "creator" | "guesser" | "presenter" | "voter" | "answerer" | "submitting" };

const participantIsActive = (p: Participant): boolean => p.isActive !== false;

const resolveTurnTag = (session: SessionState, participantId: string): TurnTag | null => {
  if (!session.gameState) return null;
  if (session.gameState.type === "hangman") {
    const state = session.gameState.state;
    if (state.puzzleCreatorId === participantId) {
      return { label: "Puzzle creator", tone: "creator" };
    }
    if (state.status === "inProgress") {
      return { label: "Guessing", tone: "guesser" };
    }
    return null;
  }
  if (session.gameState.type === "twoTruthsLie") {
    const state = session.gameState.state;
    if (state.status === "collecting") {
      return state.submissions[participantId] ? null : { label: "Submitting", tone: "submitting" };
    }
    if (state.currentPresenterId === participantId) {
      return { label: "Presenter", tone: "presenter" };
    }
    if (state.status === "voting") {
      return { label: "Voting", tone: "voter" };
    }
    return null;
  }
  if (session.gameState.type === "trivia") {
    if (session.gameState.state.status === "questionOpen") {
      return { label: "Answering", tone: "answerer" };
    }
  }
  if (session.gameState.type === "icebreaker") {
    const st = session.gameState.state;
    if (st.status === "gatheringPrompts" && !st.submittedPromptParticipantIds.includes(participantId)) {
      return { label: "Submitting", tone: "submitting" };
    }
    if (st.status === "collecting" && !st.submittedParticipantIds.includes(participantId)) {
      return { label: "Submitting", tone: "submitting" };
    }
  }
  if (session.gameState.type === "guessWhoSaidIt") {
    const st = session.gameState.state;
    if (st.status === "collecting" && !st.submittedParticipantIds.includes(participantId)) {
      return { label: "Submitting", tone: "submitting" };
    }
    if (st.status === "voting" && !st.votedParticipantIds.includes(participantId)) {
      return { label: "Guessing", tone: "voter" };
    }
  }
  if (session.gameState.type === "twentyQuestions") {
    const st = session.gameState.state;
    if (st.status === "waitingForItem" && st.itemSelectorId === participantId) {
      return { label: "Choosing item", tone: "creator" };
    }
    if (st.status === "playing") {
      if (st.itemSelectorId === participantId) {
        return { label: "Oracle", tone: "presenter" };
      }
      if (st.currentAskerId === participantId) {
        return { label: "Asking", tone: "answerer" };
      }
    }
  }
  if (session.gameState.type === "captionThis") {
    const st = session.gameState.state;
    if (st.status === "waitingForImage" && st.imageProviderId === participantId) {
      return { label: "Image provider", tone: "presenter" };
    }
    if (st.status === "collectingCaptions" && !st.submittedCaptionParticipantIds.includes(participantId)) {
      return { label: "Captioning", tone: "submitting" };
    }
    if (st.status === "voting" && !st.votedParticipantIds.includes(participantId)) {
      return { label: "Voting", tone: "voter" };
    }
  }
  return null;
};

export function PlayerList({
  session,
  currentParticipantId,
  isHost = false,
  send,
  allowActivate = true,
  allowBench = true
}: {
  session: SessionState;
  currentParticipantId: string;
  isHost?: boolean;
  send?: (event: ClientEvent) => void;
  /** When false (in-game), host cannot activate benched players from this list. */
  allowActivate?: boolean;
  /** When false (in-game), host cannot bench players; use the lobby to bench before a game starts. */
  allowBench?: boolean;
}): JSX.Element {
  const hideScores = session.activeGame === "icebreaker";
  const ranked = hideScores
    ? [...session.participants]
    : [...session.participants].sort((a, b) => b.score - a.score);
  const topScore = ranked[0]?.score ?? 0;

  return (
    <ul className="players-list">
      {ranked.map((participant: Participant) => {
        const turnTag = resolveTurnTag(session, participant.id);
        const isYou = participant.id === currentParticipantId;
        const isLeader = !hideScores && topScore > 0 && participant.score === topScore;
        const isInactive = !participantIsActive(participant);
        const showHostActions =
          Boolean(isHost && send && !participant.isHost && participant.id !== currentParticipantId);
        return (
          <li
            key={participant.id}
            className={`player-row${isYou ? " player-row-you" : ""}${isInactive ? " player-row-inactive" : ""}`}
          >
            <div className="player-identity">
              <span className="player-name">
                {participant.displayName}
                {isYou && <span className="player-you-tag">you</span>}
              </span>
              <div className="player-tags">
                {participant.isHost && <span className="tag tag-host">Host</span>}
                {isInactive && <span className="tag tag-inactive">Inactive</span>}
                {turnTag && <span className={`tag tag-turn tag-${turnTag.tone}`}>{turnTag.label}</span>}
                {isLeader && <span className="tag tag-leader">Leader</span>}
              </div>
            </div>
            <div className="player-row-right">
              {!hideScores && <span className="player-score">{participant.score}</span>}
              {showHostActions && (
                <div className="player-host-actions">
                  {allowBench && participantIsActive(participant) && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        send!({
                          type: "session:setParticipantActive",
                          payload: { participantId: participant.id, isActive: false }
                        })
                      }
                    >
                      Bench
                    </button>
                  )}
                  {allowActivate && !participantIsActive(participant) && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        send!({
                          type: "session:setParticipantActive",
                          payload: { participantId: participant.id, isActive: true }
                        })
                      }
                    >
                      Activate
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Remove ${participant.displayName} from the session? They will be disconnected.`
                        )
                      ) {
                        send!({ type: "session:boot", payload: { participantId: participant.id } });
                      }
                    }}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

import type { Participant } from "../../../shared/contracts";

export function ScoreBoard({ participants }: { participants: Participant[] }): JSX.Element {
  const ranked = [...participants].sort((a, b) => b.score - a.score);
  const topScore = ranked[0]?.score ?? 0;
  return (
    <ol className="scoreboard">
      {ranked.map((participant, index) => {
        const isLeader = topScore > 0 && participant.score === topScore;
        return (
          <li key={participant.id} className={`scoreboard-row${isLeader ? " scoreboard-leader" : ""}`}>
            <span className="scoreboard-rank">#{index + 1}</span>
            <span className="scoreboard-name">{participant.displayName}</span>
            <span className="scoreboard-score">{participant.score}</span>
          </li>
        );
      })}
    </ol>
  );
}

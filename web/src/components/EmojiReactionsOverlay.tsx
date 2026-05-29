type EmojiReactionBurst = {
  id: string;
  emoji: string;
  displayName: string;
  lanePercent: number;
  storm?: boolean;
};

export function EmojiReactionsOverlay({
  reactions
}: {
  reactions: EmojiReactionBurst[];
}): JSX.Element {
  return (
    <div className="emoji-reactions-overlay" aria-hidden="true">
      {reactions.map((reaction) => (
        <span
          key={reaction.id}
          className={`emoji-reaction-float${reaction.storm ? " emoji-reaction-float-storm" : ""}`}
          style={{ left: `${reaction.lanePercent}%` }}
          title={reaction.displayName}
        >
          {reaction.emoji}
        </span>
      ))}
    </div>
  );
}

export type { EmojiReactionBurst };

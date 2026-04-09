import React from "react";

interface BirdScoreMeterProps {
  score: number | null | undefined;
  size?: "default" | "compact";
}

export const BirdScoreMeter: React.FC<BirdScoreMeterProps> = ({
  score,
  size = "default",
}) => {
  if (typeof score !== "number") {
    return (
      <div className={`score-pill ${size === "compact" ? "score-pill--compact" : ""} score-pill-na`}>
        <span className="score-pill-value">N/A</span>
        <span className="score-pill-label">No data</span>
      </div>
    );
  }

  const tone = score >= 8 ? "good" : score >= 6 ? "mid" : "low";
  const sizeClass = size === "compact" ? "score-pill--compact" : "";
  const label = size === "compact" ? "Bird" : "Bird score";

  return (
    <div className={`score-pill ${sizeClass} score-pill-${tone}`}>
      <span className="score-pill-value">{score.toFixed(1)}</span>
      {label && <span className="score-pill-label">{label}</span>}
    </div>
  );
};

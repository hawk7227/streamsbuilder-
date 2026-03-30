/**
 * t2vSelector.ts
 *
 * Per spec: select best passing candidate from scored candidates.
 * If none pass: return block reason with all scores.
 * Ranked by totalScore descending among passing candidates.
 */

import type { T2VCandidate, T2VQcScore, T2VSelectionResult } from "./types";

export function selectBestT2VCandidate(
  scored: Array<{ candidate: T2VCandidate; score: T2VQcScore }>,
): T2VSelectionResult {
  const passing = scored.filter(s => s.score.passed);
  const rejected = scored.filter(s => !s.score.passed);

  if (passing.length === 0) {
    // Surface the best failure reason for diagnostics
    const sorted = [...scored].sort((a, b) => b.score.totalScore - a.score.totalScore);
    const topFailure = sorted[0];
    const blockReason = topFailure
      ? `All candidates failed QC. Best score: ${topFailure.score.totalScore}. Reasons: ${topFailure.score.rejectionReasons.join(", ")}`
      : "No candidates generated";

    return {
      accepted: false,
      rejectedCandidates: scored,
      blockReason,
      attempts: scored.length,
    };
  }

  // Rank passing candidates by totalScore descending
  const ranked = [...passing].sort((a, b) => b.score.totalScore - a.score.totalScore);
  const best = ranked[0];

  return {
    accepted: true,
    acceptedCandidate: best.candidate,
    acceptedScore: best.score,
    rejectedCandidates: rejected,
    attempts: scored.length,
  };
}

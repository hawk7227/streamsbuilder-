import type { GeneratedImageCandidate, ImageQcScore, VideoCandidate, VideoQcScore } from "./types";

export function selectBestImageCandidate(candidates: Array<{ candidate: GeneratedImageCandidate; score: ImageQcScore }>) {
  return candidates.sort((a, b) => b.score.totalScore - a.score.totalScore)[0];
}

export function selectBestVideoCandidate(candidates: Array<{ candidate: VideoCandidate; score: VideoQcScore }>) {
  return candidates.sort((a, b) => b.score.totalScore - a.score.totalScore)[0];
}

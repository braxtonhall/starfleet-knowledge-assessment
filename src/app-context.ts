import type { Category, Question, QuestionState, QuizConfig, RunResult } from "./data/types";
import type { AnswerLog } from "./state/answerLog";
import type { HostSession } from "./net/hostSession";
import type { PlayerSession } from "./net/playerSession";

export type Screen =
  | "landing"
  | "hub"
  | "quickPlayConfig"
  | "play"
  | "results"
  | "browse"
  | "options"
  | "multiplayer"
  | "hostGame"
  | "joinGame"
  | "rotationGame";

export type ScreenParams =
  | { kind: "play"; config: QuizConfig }
  | { kind: "results"; result: RunResult; config: QuizConfig; isRecord: boolean }
  | { kind: "join"; roomCode: string }
  | undefined;

/**
 * The live P2P session, if any. It lives here rather than inside a screen
 * because a room has to survive the lobby → drill → standings transitions;
 * leaving multiplayer altogether is what closes it.
 */
export interface NetSlot {
  host: HostSession | null;
  player: PlayerSession | null;
  teardown(): void;
}

export interface AppContext {
  questions: Question[];
  byNumber: Map<number, Question>;
  categories: Category[];
  playable: Question[];
  answerLog: AnswerLog;
  net: NetSlot;
  navigate(screen: Screen, params?: ScreenParams): void;
  answerFor(number: number): QuestionState;
  setAnswer(number: number, state: QuestionState): void;
  resetAll(): void;
  resetCategory(title: string): void;
  bestForCount(key: string): number | undefined;
  recordHighScore(key: string, score: number): boolean;
  lastConfig(): QuizConfig | null;
  saveConfig(config: QuizConfig): void;
}

export type ScreenRenderer = (
  ctx: AppContext,
  params: ScreenParams,
  main: HTMLElement,
) => void | (() => void);

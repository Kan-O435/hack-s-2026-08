export type RoomStatus = "waiting" | "in_progress" | "finished";

export type RoomSummary = {
  id: number;
  name: string;
  passcode: string;
  status: RoomStatus;
  host_user_id: number;
};

export type Participant = {
  user_id: number;
  nickname: string;
  joined_at: string;
};

export type RoomDetail = {
  room: RoomSummary;
  participants: Participant[];
};

export type ApiErrorBody = {
  error?: { code: string; message: string };
};

export type Utterance = {
  id: number;
  room_id: number;
  user_id: number;
  nickname: string;
  transcript: string;
  spoken_at: string;
  cringe_score?: number | null;
  cringe_phrase?: string | null;
  cringe_reason?: string | null;
};

export type ResultLine = {
  phrase: string;
  score: number;
  reason: string | null;
};

export type VoiceRoastStatus = "unavailable" | "processing" | "ready" | "failed";

export type ParticipantResult = {
  user_id: number;
  nickname: string;
  total_score: number;
  critique: string;
  voice_roast_status: VoiceRoastStatus;
  top_lines: ResultLine[];
};

export type RoomResultResponse =
  | { status: "processing" }
  | {
      status: "ready";
      room: { id: number; name: string };
      results: ParticipantResult[];
    };

export function cringeColor(score: number | null | undefined): string {
  if (!score || score <= 0) return "transparent";
  if (score < 30) return "#fff3b0";
  if (score < 60) return "#ffcc66";
  if (score < 85) return "#ff9966";
  return "#ff6666";
}

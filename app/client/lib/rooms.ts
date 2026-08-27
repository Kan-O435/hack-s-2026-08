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
};

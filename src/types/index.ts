export interface Session {
  id: string;
  name: string;
  map_url: string | null;
  grid_size: number;
  token_size: number;
  owner_id: string;
  created_at: string;
}

export interface Token {
  id: string;
  session_id: string;
  name: string;
  color: string;
  hp: number;
  max_hp: number;
  x: number;
  y: number;
  image_url: string | null;
  owner_id: string | null; // null = unclaimed; set when a player claims the token
  size: number | null;     // null = inherit session token_size
}

export interface DiceRoll {
  id: string;
  session_id: string;
  player_name: string;
  expression: string;
  result: number;
  breakdown: string;
  created_at: string;
}

// Realtime broadcast event payloads
export type BroadcastEvent =
  | { type: "token_move"; token_id: string; x: number; y: number }
  | { type: "dice_roll"; player_name: string; expression: string; result: number; breakdown: string }
  | { type: "session_ended" }
  | { type: "token_drag_start"; token_id: string; user_id: string }
  | { type: "token_drag_end"; token_id: string; user_id: string };

export interface PresenceState {
  user_id: string;
  player_name: string;
  color: string;
}

export interface ParsedRoll {
  count: number;
  sides: number;
  modifier: number;
}

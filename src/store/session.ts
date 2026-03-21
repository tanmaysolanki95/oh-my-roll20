import { create } from "zustand";
import type { Token, DiceRoll, PresenceState, Session } from "@/types";

interface SessionStore {
  session: Session | null;
  tokens: Token[];
  diceLog: DiceRoll[];
  presence: PresenceState[];
  playerName: string;
  playerColor: string;
  userId: string | null; // Supabase anonymous auth UID

  setSession: (session: Session) => void;
  setTokens: (tokens: Token[]) => void;
  upsertToken: (token: Token) => void;
  removeToken: (id: string) => void;
  updateTokenPosition: (id: string, x: number, y: number) => void;
  addDiceRoll: (roll: DiceRoll) => void;
  setPresence: (presence: PresenceState[]) => void;
  setPlayerName: (name: string) => void;
  setPlayerColor: (color: string) => void;
  setUserId: (id: string | null) => void;
}

const stored = typeof window !== "undefined"
  ? { name: localStorage.getItem("omr_playerName") ?? "", color: localStorage.getItem("omr_playerColor") ?? "#3b82f6" }
  : { name: "", color: "#3b82f6" };

export const useSessionStore = create<SessionStore>((set) => ({
  session: null,
  tokens: [],
  diceLog: [],
  presence: [],
  playerName: stored.name,
  playerColor: stored.color,
  userId: null,

  setSession: (session) => set({ session }),

  setTokens: (tokens) => set({ tokens }),

  upsertToken: (token) =>
    set((state) => {
      const idx = state.tokens.findIndex((t) => t.id === token.id);
      if (idx >= 0) {
        const next = [...state.tokens];
        next[idx] = token;
        return { tokens: next };
      }
      return { tokens: [...state.tokens, token] };
    }),

  removeToken: (id) =>
    set((state) => ({ tokens: state.tokens.filter((t) => t.id !== id) })),

  updateTokenPosition: (id, x, y) =>
    set((state) => ({
      tokens: state.tokens.map((t) => (t.id === id ? { ...t, x, y } : t)),
    })),

  addDiceRoll: (roll) =>
    set((state) => ({ diceLog: [roll, ...state.diceLog].slice(0, 50) })),

  setPresence: (presence) => set({ presence }),

  setPlayerName: (playerName) => {
    if (typeof window !== "undefined") localStorage.setItem("omr_playerName", playerName);
    set({ playerName });
  },

  setPlayerColor: (playerColor) => {
    if (typeof window !== "undefined") localStorage.setItem("omr_playerColor", playerColor);
    set({ playerColor });
  },

  setUserId: (userId) => set({ userId }),
}));

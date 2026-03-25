// Storage layer — AsyncStorage now, Node server swap later.
// To connect to Phase 1 server: replace AsyncStorage calls
// with fetch() to http://localhost:4000 — nothing else changes.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { EventLane, SavedNote } from "./parser";

// ── Types ──────────────────────────────────────────────────
export type EventStatus = "not_started" | "in_progress" | "done" | "cancelled";
export type EventType   = "plan" | "reflection" | "task" | "milestone";

export type LifeEvent = {
  id: string;
  title: string;
  lane: EventLane;
  type: EventType;
  status: EventStatus;
  date: string;        // YYYY-MM-DD
  startHour: number;
  endHour: number;
  notes?: string;
  tags: string[];
  source: "mobile" | "desktop" | "helm";
  createdAt: string;   // ISO
};

// ── Keys ──────────────────────────────────────────────────
const KEYS = {
  EVENTS:   "myatlas_events",
  NOTEPAD:  "myatlas_notepad",
};

// ── ID ─────────────────────────────────────────────────────
export function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ── Today's date key ───────────────────────────────────────
export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Events ─────────────────────────────────────────────────
export async function getEvents(): Promise<LifeEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.EVENTS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveEvent(event: LifeEvent): Promise<void> {
  const events = await getEvents();
  const idx = events.findIndex(e => e.id === event.id);
  if (idx >= 0) events[idx] = event;
  else events.push(event);
  await AsyncStorage.setItem(KEYS.EVENTS, JSON.stringify(events));
}

export async function getEventsForDate(dateKey: string): Promise<LifeEvent[]> {
  const all = await getEvents();
  return all.filter(e => e.date === dateKey);
}

export async function getTodayEvents(): Promise<LifeEvent[]> {
  return getEventsForDate(todayKey());
}

// ── Briefing summary ──────────────────────────────────────
export type LaneSummary = {
  lane: EventLane;
  count: number;
  next?: { title: string; startHour: number };
};

export async function getTodayBriefing(): Promise<LaneSummary[]> {
  const todayEvents = await getTodayEvents();
  const now = new Date().getHours();

  const lanes: EventLane[] = ["Work", "Family", "Health", "Travel", "Money", "Creative"];

  return lanes.map(lane => {
    const laneEvents = todayEvents
      .filter(e => e.lane === lane)
      .sort((a, b) => a.startHour - b.startHour);

    const upcoming = laneEvents.find(e => e.startHour >= now);

    return {
      lane,
      count: laneEvents.length,
      next: upcoming
        ? { title: upcoming.title, startHour: upcoming.startHour }
        : undefined,
    };
  });
}

export function getNextEvent(briefing: LaneSummary[]): { lane: EventLane; title: string; startHour: number } | null {
  const now = new Date().getHours();
  const upcoming = briefing
    .filter(b => b.next && b.next.startHour >= now)
    .sort((a, b) => (a.next!.startHour) - (b.next!.startHour));

  if (!upcoming.length) return null;
  const first = upcoming[0];
  return { lane: first.lane, title: first.next!.title, startHour: first.next!.startHour };
}

// ── Notepad ────────────────────────────────────────────────
export async function getNotes(): Promise<SavedNote[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.NOTEPAD);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveNote(note: SavedNote): Promise<void> {
  const notes = await getNotes();
  await AsyncStorage.setItem(KEYS.NOTEPAD, JSON.stringify([note, ...notes]));
}

export async function deleteNote(id: string): Promise<void> {
  const notes = await getNotes();
  await AsyncStorage.setItem(KEYS.NOTEPAD, JSON.stringify(notes.filter(n => n.id !== id)));
}

// ── Format hour ────────────────────────────────────────────
export function fmtHour(h: number): string {
  const ampm = h >= 12 ? "pm" : "am";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}${ampm}`;
}

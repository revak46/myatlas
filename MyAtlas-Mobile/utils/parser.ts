// Helm Parser — natural language → structured MyAtlas entry
// No external dependencies. Ollama/API slot ready.

export type EventLane = "Work" | "Family" | "Health" | "Travel" | "Money" | "Creative";

export type ParsedEntry = {
  title: string;
  lane: EventLane;
  date: string;        // YYYY-MM-DD
  startHour: number;   // 0-23
  endHour: number;     // 0-23
  confidence: "high" | "medium" | "low";
  raw: string;
};

export type SavedNote = {
  id: string;
  text: string;
  url?: string;
  metadata?: { title?: string; artist?: string; source?: string };
  timestamp: string;   // ISO
};

// ── Lane keywords ──────────────────────────────────────────
const LANE_KEYWORDS: Record<EventLane, string[]> = {
  Work: [
    "meeting","client","call","project","deadline","office","work","presentation",
    "email","report","sprint","standup","interview","proposal","contract","invoice",
    "deliverable","launch","deploy","build","review","pr","commit","release",
  ],
  Family: [
    "family","kids","school","pickup","dropoff","dinner","home","mom","dad",
    "wife","husband","partner","parents","birthday","anniversary","wedding",
    "church","visit","grandma","grandpa","niece","nephew","brother","sister",
  ],
  Health: [
    "gym","workout","doctor","dentist","appointment","medicine","run","exercise",
    "yoga","therapy","health","physio","checkup","prescription","hospital","clinic",
    "sleep","diet","nutrition","steps","walk","jog","lift","cardio","stretch",
  ],
  Travel: [
    "flight","hotel","trip","travel","airport","drive","uber","lyft","booking",
    "passport","visa","airbnb","airfare","layover","depart","arrive","land",
    "houston","lagos","london","nyc","atlanta","toronto","paris","dubai",
  ],
  Money: [
    "bank","payment","invoice","tax","budget","salary","bill","insurance","rent",
    "mortgage","financial","invest","stocks","transfer","deposit","withdrawal",
    "subscription","expense","refund","loan","credit","debit","payroll","quote",
  ],
  Creative: [
    "design","write","draw","music","art","photo","creative","sketch","record",
    "edit","blog","shoot","session","mix","track","album","portfolio","brand",
    "logo","video","film","edit","color","grade","publish","draft","storyboard",
  ],
};

// ── Time keywords ──────────────────────────────────────────
const TIME_MAP: Record<string, number> = {
  midnight: 0, "early morning": 6, morning: 9, "late morning": 10,
  noon: 12, afternoon: 14, evening: 18, night: 20, "late night": 22,
};

// ── Parse ──────────────────────────────────────────────────
export function parseEntry(raw: string): ParsedEntry {
  const text = raw.trim();
  const lower = text.toLowerCase();

  return {
    title:      extractTitle(text),
    lane:       detectLane(lower),
    date:       detectDate(lower),
    startHour:  detectStartHour(lower),
    endHour:    detectEndHour(lower),
    confidence: scoreConfidence(lower),
    raw:        text,
  };
}

// ── Title ──────────────────────────────────────────────────
function extractTitle(text: string): string {
  // Strip time and date phrases, keep the meaningful part
  return text
    .replace(/\b(at|on|this|next|tomorrow|today)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}(am|pm)|morning|afternoon|evening|night)\b/gi, "")
    .replace(/\b\d{1,2}(:\d{2})?\s*(am|pm)\b/gi, "")
    .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}\b/gi, "")
    .replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, "")
    .replace(/\b(today|tomorrow|tonight|this week|next week)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    || text.trim();
}

// ── Lane detection ─────────────────────────────────────────
function detectLane(lower: string): EventLane {
  const scores: Record<EventLane, number> = {
    Work: 0, Family: 0, Health: 0, Travel: 0, Money: 0, Creative: 0,
  };

  for (const [lane, keywords] of Object.entries(LANE_KEYWORDS) as [EventLane, string[]][]) {
    for (const kw of keywords) {
      if (lower.includes(kw)) scores[lane] += kw.length > 5 ? 2 : 1;
    }
  }

  const top = (Object.entries(scores) as [EventLane, number][])
    .sort((a, b) => b[1] - a[1]);

  return top[0][1] > 0 ? top[0][0] : "Work";
}

// ── Date detection ─────────────────────────────────────────
function detectDate(lower: string): string {
  const today = new Date();

  if (lower.includes("today") || lower.includes("tonight")) {
    return fmt(today);
  }
  if (lower.includes("tomorrow")) {
    return fmt(add(today, 1));
  }
  if (lower.includes("next week")) {
    return fmt(add(today, 7));
  }

  // Named day: "thursday", "next monday"
  const days = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  for (let i = 0; i < days.length; i++) {
    if (lower.includes(days[i])) {
      const diff = (i - today.getDay() + 7) % 7 || 7;
      return fmt(add(today, diff));
    }
  }

  // Month + day: "april 4", "march 28"
  const months: Record<string, number> = {
    january:0, jan:0, february:1, feb:1, march:2, mar:2,
    april:3, apr:3, may:4, june:5, jun:5,
    july:6, jul:6, august:7, aug:7, september:8, sep:8,
    october:9, oct:9, november:10, nov:10, december:11, dec:11,
  };
  const monthMatch = lower.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})\b/);
  if (monthMatch) {
    const m = months[monthMatch[1]];
    const d = parseInt(monthMatch[2]);
    const year = today.getMonth() > m ? today.getFullYear() + 1 : today.getFullYear();
    return fmt(new Date(year, m, d));
  }

  // Default: today
  return fmt(today);
}

// ── Start hour detection ───────────────────────────────────
function detectStartHour(lower: string): number {
  // 3:30pm, 10:00am
  const timeMatch = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (timeMatch) {
    let h = parseInt(timeMatch[1]);
    const meridiem = timeMatch[3];
    if (meridiem === "pm" && h !== 12) h += 12;
    if (meridiem === "am" && h === 12) h = 0;
    return h;
  }

  // "at 3", "at 9"
  const atMatch = lower.match(/\bat\s+(\d{1,2})\b/);
  if (atMatch) {
    const h = parseInt(atMatch[1]);
    return h < 7 ? h + 12 : h; // bias towards afternoon for ambiguous hours
  }

  // Named time
  for (const [word, hour] of Object.entries(TIME_MAP)) {
    if (lower.includes(word)) return hour;
  }

  return 9; // default: 9am
}

// ── End hour detection ─────────────────────────────────────
function detectEndHour(lower: string): number {
  const start = detectStartHour(lower);

  // Duration: "for 2 hours", "for an hour"
  const durationMatch = lower.match(/\bfor\s+(\d+|an?)\s+hour/);
  if (durationMatch) {
    const n = durationMatch[1] === "a" || durationMatch[1] === "an" ? 1 : parseInt(durationMatch[1]);
    return Math.min(start + n, 23);
  }

  // Range: "3pm to 5pm", "9am-11am"
  const rangeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|-)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
  if (rangeMatch) {
    let end = parseInt(rangeMatch[4]);
    const meridiem = rangeMatch[6];
    if (meridiem === "pm" && end !== 12) end += 12;
    return end;
  }

  return start + 1;
}

// ── Confidence score ───────────────────────────────────────
function scoreConfidence(lower: string): "high" | "medium" | "low" {
  let score = 0;

  // Has explicit time
  if (/\b\d{1,2}(:\d{2})?\s*(am|pm)\b/.test(lower)) score += 2;
  if (/\bat\s+\d/.test(lower)) score += 1;

  // Has explicit date
  if (/(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/.test(lower)) score += 2;
  if (/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/.test(lower)) score += 2;

  // Has strong lane keyword
  const allKeywords = Object.values(LANE_KEYWORDS).flat();
  const matches = allKeywords.filter(kw => lower.includes(kw)).length;
  if (matches >= 2) score += 2;
  else if (matches === 1) score += 1;

  if (score >= 5) return "high";
  if (score >= 2) return "medium";
  return "low";
}

// ── URL detection ──────────────────────────────────────────
export function extractUrl(text: string): string | undefined {
  const match = text.match(/https?:\/\/[^\s]+/);
  return match?.[0];
}

export function isUrl(text: string): boolean {
  return /^https?:\/\//.test(text.trim());
}

// ── Date helpers ───────────────────────────────────────────
function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function add(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

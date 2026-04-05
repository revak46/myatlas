import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

const WEEK_STARTS_ON_MONDAY = true;
const DAY_START_HOUR = 4;

// Build version stamp — visible in Helm footer for stale-binary detection
const MYATLAS_BUILD = "1.1.0";
const MYATLAS_BUILD_DATE = "2026-03-25";

type ViewMode = "launch" | "pods" | "week" | "day" | "helm";
type TravelStatus = "DONE" | "IN_PROGRESS" | "NOT_STARTED" | "TBD";
type EventLane = "Work" | "Family" | "Health" | "Travel" | "Money" | "Creative";
type EventType = "plan" | "reflection" | "task" | "milestone";
type EventStatus = "not_started" | "in_progress" | "done" | "cancelled";

// ── Travel Signal System ──
// Each trip decomposes into typed signals — discrete, actionable units
// with their own timelines, urgency, and surface behavior.
type TravelSignalType =
  | "flight_outbound"    // carrier, route, confirmation, seat, departure
  | "flight_return"      // same shape, return leg
  | "lodging"            // property, address, check-in/out, confirmation, host
  | "car_rental"         // agency, pickup/dropoff, confirmation
  | "checkin_reminder"   // derived: auto-surfaces T-24h before flight/lodging
  | "ground_transport"   // rideshare, shuttle, directions between venues
  | "activity"           // planned activities, excursions, reservations
  | "packing"            // packing list items, weather-driven suggestions
  | "document";          // passport, visa, boarding pass, insurance

type TravelSignalUrgency = "none" | "low" | "upcoming" | "action_now" | "overdue";

type TravelSignal = {
  id: string;
  type: TravelSignalType;
  label: string;                     // human-readable: "UA 2197 IAH → ORD"
  status: TravelStatus;
  actionDate?: Date;                 // when this signal becomes urgent
  confirmationRef?: string;          // booking confirmation number
  details: Record<string, string>;   // flexible k/v: carrier, seat, address, etc.
  notes?: string;
  urgency?: TravelSignalUrgency;     // computed at render time
};

type TravelTrip = {
  id: string; title: string; location: string;
  start: Date; end: Date; tags: string[];
  signals: TravelSignal[];           // decomposed signal array
  // Legacy compat — derived from signals, used by existing UI until full migration
  status: { flight: TravelStatus; lodging: TravelStatus; transport: TravelStatus };
  notes?: string;
};

// Derive legacy status from signals for backward compatibility
function deriveStatusFromSignals(signals: TravelSignal[]): TravelTrip["status"] {
  const best = (types: TravelSignalType[]): TravelStatus => {
    const matches = signals.filter(s => types.includes(s.type));
    if (matches.length === 0) return "TBD";
    if (matches.every(s => s.status === "DONE")) return "DONE";
    if (matches.some(s => s.status === "IN_PROGRESS" || s.status === "DONE")) return "IN_PROGRESS";
    if (matches.some(s => s.status === "NOT_STARTED")) return "NOT_STARTED";
    return "TBD";
  };
  return {
    flight:    best(["flight_outbound", "flight_return"]),
    lodging:   best(["lodging"]),
    transport: best(["car_rental", "ground_transport"]),
  };
}

// Compute signal urgency based on current time vs actionDate
// @ts-expect-error — reserved for signal urgency rendering (used by DayShell when signal panel ships)
function computeSignalUrgency(signal: TravelSignal, now: Date = new Date()): TravelSignalUrgency {
  if (signal.status === "DONE") return "none";
  if (!signal.actionDate) return signal.status === "NOT_STARTED" ? "low" : "none";
  const hoursUntil = (signal.actionDate.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursUntil < 0) return "overdue";
  if (hoursUntil < 3) return "action_now";
  if (hoursUntil < 24) return "upcoming";
  if (hoursUntil < 72) return "low";
  return "none";
}

// ── Helm Notes Intelligence ──
// Parses freeform trip notes into structured TravelSignals.
// Runs client-side as a lightweight heuristic layer; Helm server
// can override with richer ML-parsed signals from Gmail/captures.
function parseNotesIntoSignals(notes: string, tripId: string): TravelSignal[] {
  const parsed: TravelSignal[] = [];
  const lines = notes.split(/[.\n]+/).map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    const lower = line.toLowerCase();

    // Flight detection: "UA 2197", "Southwest", "flight booked", airline names
    const flightMatch = lower.match(
      /\b(ua|united|southwest|sw|delta|dl|american|aa|spirit|nk|frontier|jetblue|b6)\s*(\d{1,4})?\b/
    );
    if (flightMatch || lower.includes("flight")) {
      const isReturn = lower.includes("return") || lower.includes("iah→") || lower.includes("iah ->");
      const isOutbound = lower.includes("outbound") || lower.includes("→iah") || lower.includes("-> iah") || lower.includes("going");
      const type: TravelSignalType = isReturn ? "flight_return" : isOutbound ? "flight_outbound" : "flight_outbound";

      // Extract route pattern: "IAH→ORD", "IAH - ORD", "IAH to ORD"
      const routeMatch = line.match(/\b([A-Z]{3})\s*[→\->to]+\s*([A-Z]{3})\b/i);
      // Extract seat pattern: "Seats 39A-D", "Seat 14C"
      const seatMatch = line.match(/seats?\s+([\w\d]+[-–]?[\w\d]*)/i);
      // Extract time: "6:40PM", "18:40"
      const timeMatch = line.match(/\b(\d{1,2}:\d{2}\s*[AaPp][Mm]?)\b/);

      const details: Record<string, string> = {};
      if (flightMatch?.[1]) details.carrier = flightMatch[1].toUpperCase();
      if (flightMatch?.[2]) details.flightNumber = flightMatch[2];
      if (routeMatch) details.route = `${routeMatch[1].toUpperCase()} → ${routeMatch[2].toUpperCase()}`;
      if (seatMatch) details.seat = seatMatch[1];
      if (timeMatch) details.departure = timeMatch[1];

      // Don't duplicate if we already parsed a signal of this type
      if (!parsed.some(p => p.type === type)) {
        parsed.push({
          id: `${tripId}-${type}-parsed`,
          type,
          label: details.carrier && details.flightNumber
            ? `${details.carrier} ${details.flightNumber}${details.route ? ` ${details.route}` : ""}`
            : `Flight ${isReturn ? "(return)" : "(outbound)"}`,
          status: lower.includes("booked") || lower.includes("confirmed") || lower.includes("done") ? "DONE" : "IN_PROGRESS",
          details,
          notes: line,
        });
      }
    }

    // Lodging detection
    if (lower.includes("lodging") || lower.includes("airbnb") || lower.includes("vrbo") ||
        lower.includes("hotel") || lower.includes("stay") || lower.includes("accommodation")) {
      const isPending = lower.includes("pending") || lower.includes("tbd") || lower.includes("shortlist");
      if (!parsed.some(p => p.type === "lodging")) {
        parsed.push({
          id: `${tripId}-lodging-parsed`,
          type: "lodging",
          label: "Accommodation",
          status: isPending ? "IN_PROGRESS" : lower.includes("booked") ? "DONE" : "NOT_STARTED",
          details: {},
          notes: line,
        });
      }
    }

    // Car rental detection
    if (lower.includes("rental") || lower.includes("rent a car") || lower.includes("car rental") ||
        lower.includes("hertz") || lower.includes("enterprise") || lower.includes("avis") || lower.includes("turo")) {
      const isPending = lower.includes("pending") || lower.includes("tbd");
      if (!parsed.some(p => p.type === "car_rental")) {
        parsed.push({
          id: `${tripId}-car-rental-parsed`,
          type: "car_rental",
          label: "Car Rental",
          status: isPending || lower.includes("not started") ? "NOT_STARTED" : lower.includes("booked") ? "DONE" : "IN_PROGRESS",
          details: {},
          notes: line,
        });
      }
    }
  }

  return parsed;
}

// Generate check-in reminder signals from existing flight/lodging signals
function generateCheckinReminders(signals: TravelSignal[], tripId: string): TravelSignal[] {
  const reminders: TravelSignal[] = [];
  for (const sig of signals) {
    if ((sig.type === "flight_outbound" || sig.type === "flight_return" || sig.type === "lodging")
        && sig.status === "DONE" && sig.actionDate) {
      const reminderDate = new Date(sig.actionDate.getTime() - 24 * 60 * 60 * 1000);
      reminders.push({
        id: `${tripId}-checkin-${sig.type}`,
        type: "checkin_reminder",
        label: sig.type === "lodging"
          ? `Check-in reminder: ${sig.label}`
          : `Flight check-in: ${sig.label}`,
        status: new Date() > sig.actionDate ? "DONE" : "NOT_STARTED",
        actionDate: reminderDate,
        details: { parentSignal: sig.id },
        notes: `Check in 24h before: ${sig.label}`,
      });
    }
  }
  return reminders;
}

type LifeEvent = {
  id: string; title: string; lane: EventLane; type: EventType;
  status: EventStatus; date: Date; startHour?: number; endHour?: number;
  notes?: string; tags: string[];
};

type ModalState = { open: false } | { open: true; date: Date; hour?: number; event?: LifeEvent };

type RecurPattern = "daily" | "weekdays" | "weekly" | "custom";
type RecurringEvent = {
  id: string; title: string; lane: EventLane; type: EventType;
  startHour: number; endHour: number; notes?: string; tags: string[];
  pattern: RecurPattern;
  customDays?: number[]; // 0=Sun,1=Mon,...,6=Sat
  anchorDay?: number;    // day-of-week for "weekly"
  createdAt: string;
};

type DayNote = { date: string; text: string }; // date = "YYYY-MM-DD"

type HelmSignal = {
  id: string;
  timestamp: string;
  pillar: string;
  signal: string;
  tags: string[];
  source_image: string;
  confirmed: boolean;
};

// ---------- Utilities ----------
function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function formatDow(d: Date) { return d.toLocaleDateString(undefined,{weekday:"short"}); }
function formatMonthDay(d: Date) { return d.toLocaleDateString(undefined,{month:"short",day:"numeric"}); }
function formatMonthDayYear(d: Date) { return d.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"}); }
function getWeekStart(d: Date) {
  const x = startOfDay(d), dow = x.getDay();
  return WEEK_STARTS_ON_MONDAY ? addDays(x, dow===0 ? -6 : 1-dow) : addDays(x, -dow);
}
function polar(cx:number, cy:number, r:number, a:number) { return {x: cx+r*Math.cos(a), y: cy+r*Math.sin(a)}; }
function isDateInRange(day:Date, start:Date, end:Date) {
  const t=startOfDay(day).getTime(), a=startOfDay(start).getTime(), b=startOfDay(end).getTime();
  return t>=a && t<=b;
}
function overlapsWeek(ws:Date, t:TravelTrip) {
  const we=addDays(ws,6), a=startOfDay(ws).getTime(), b=startOfDay(we).getTime();
  const s=startOfDay(t.start).getTime(), e=startOfDay(t.end).getTime();
  return !(e<a || s>b);
}
function statusLabel(s:TravelStatus) {
  return s==="DONE"?"Done":s==="IN_PROGRESS"?"In progress":s==="NOT_STARTED"?"Not started":"TBD";
}
function uid() { return Math.random().toString(36).slice(2)+Date.now().toString(36); }

// ---------- Design tokens ----------
type Palette = {
  paper: string; card: string; graphite: string;
  hairline: string; faint: string; soft: string; accent: string;
  reflection: string; stabilization: string; regrowth: string;
};

const palette: Palette = {
  paper:"#f1efe9", card:"#fbfaf6", graphite:"#141312",
  hairline:"rgba(20,19,18,0.10)", faint:"rgba(20,19,18,0.06)",
  soft:"rgba(20,19,18,0.18)", accent:"rgba(80,110,140,0.50)",
  reflection:"rgba(80,110,140,0.10)", stabilization:"rgba(200,190,160,0.12)", regrowth:"rgba(150,170,150,0.10)",
};

const LANE_COLORS: Record<EventLane,string> = {
  Work:"#4f6eb0", Family:"#c07840", Health:"#4d9e6a",
  Travel:"#7c5cb5", Money:"#a08c2a", Creative:"#b84060",
};

const LANE_BG: Record<EventLane,string> = {
  Work:"rgba(79,110,176,0.08)", Family:"rgba(192,120,64,0.08)", Health:"rgba(77,158,106,0.08)",
  Travel:"rgba(124,92,181,0.08)", Money:"rgba(160,140,42,0.08)", Creative:"rgba(184,64,96,0.08)",
};

const EVENT_TYPE_LABEL: Record<EventType,string> = {
  plan:"Plan", reflection:"Reflection", task:"Task", milestone:"Milestone",
};
const EVENT_STATUS_LABEL: Record<EventStatus,string> = {
  not_started:"Not started", in_progress:"In progress", done:"Done", cancelled:"Cancelled",
};

// ---------- Style helpers ----------
function buttonStyle(o: object = {}) {
  return {
    appearance:"none" as const, borderRadius:999, border:`1px solid ${palette.hairline}`,
    background:"transparent", color:palette.graphite, padding:"8px 12px",
    fontSize:12, letterSpacing:"0.06em", cursor:"pointer", ...o,
  };
}
function chipStyle(o: object = {}) {
  return {
    display:"inline-flex", alignItems:"center", gap:8, padding:"6px 10px",
    borderRadius:999, border:`1px solid ${palette.hairline}`,
    background:"rgba(255,255,255,0.30)", fontSize:12,
    color:"rgba(20,19,18,0.72)", letterSpacing:"0.04em", ...o,
  } as const;
}

// ---------- Event Modal ----------
function EventModal({ initialDate, initialHour, event, onSave, onDelete, onClose, recurring, onSaveRecurring, onDeleteRecurring }: {
  initialDate: Date; initialHour?: number; event?: LifeEvent;
  onSave: (e: LifeEvent) => void; onDelete?: (id: string) => void; onClose: () => void;
  recurring?: RecurringEvent[]; onSaveRecurring?: (r: RecurringEvent) => void; onDeleteRecurring?: (id: string) => void;
}) {
  const isEditing = !!event;
  // const pal = palette; // removed unused alias
  const [title, setTitle] = useState(event?.title ?? "");
  const [lane, setLane] = useState<EventLane>(event?.lane ?? "Work");
  const [type, setType] = useState<EventType>(event?.type ?? "task");
  const [status, setStatus] = useState<EventStatus>(event?.status ?? "not_started");
  const [startHour, setStartHour] = useState<number>(event?.startHour ?? initialHour ?? 9);
  const [endHour, setEndHour] = useState<number>(event?.endHour ?? (initialHour ? initialHour+1 : 10));
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>(event?.tags ?? []);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  };

  const handleSave = () => {
    if (!title.trim()) return;
    // Ensure end is always after start
    const safeEnd = endHour <= startHour ? startHour + 1 : endHour;
    onSave({
      id: event?.id ?? uid(), title: title.trim(), lane, type, status,
      date: startOfDay(initialDate), startHour, endHour: safeEnd,
      notes: notes.trim() || undefined, tags,
    });
    onClose();
  };

  const hours = Array.from({length: 24}, (_, i) => i);
  const fmtH = (h: number) => { const a = h>=12?"pm":"am", hh = h%12===0?12:h%12; return `${hh}${a}`; };

  const inputBase: React.CSSProperties = {
    width:"100%", background:"rgba(255,255,255,0.55)", border:`1px solid ${palette.hairline}`,
    borderRadius:12, padding:"10px 12px", fontSize:13, color:palette.graphite,
    outline:"none", boxSizing:"border-box", fontFamily:"inherit",
  };
  const labelStyle: React.CSSProperties = {
    fontSize:10, letterSpacing:"0.16em", textTransform:"uppercase",
    color:"rgba(20,19,18,0.52)", marginBottom:6, display:"block",
  };

  return (
    <>
      <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(20,19,18,0.28)",
        backdropFilter:"blur(4px)",zIndex:100,animation:"fadeIn 0.15s ease"}}/>
      <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:101,
        width:"min(560px,92vw)",maxHeight:"90vh",overflowY:"auto",background:palette.card,
        borderRadius:28,border:`1px solid ${palette.hairline}`,
        boxShadow:"0 32px 80px rgba(0,0,0,0.18)",padding:28,animation:"slideUp 0.18s ease"}}>

        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22}}>
          <div>
            <div style={{fontSize:10,letterSpacing:"0.20em",textTransform:"uppercase",
              color:"rgba(20,19,18,0.50)",marginBottom:4}}>
              {isEditing ? "Edit event" : "New event"} · {formatMonthDayYear(initialDate)}
            </div>
            <div style={{display:"inline-flex",alignItems:"center",gap:6,padding:"3px 10px",
              borderRadius:999,background:LANE_BG[lane],border:`1px solid ${LANE_COLORS[lane]}`,
              fontSize:11,color:LANE_COLORS[lane],letterSpacing:"0.10em",fontWeight:600,transition:"all 0.15s"}}>
              {lane.toUpperCase()}
            </div>
          </div>
          <button onClick={onClose} style={{...buttonStyle(),padding:"6px 10px",fontSize:16,
            lineHeight:1,border:"none",color:"rgba(20,19,18,0.40)"}}>✕</button>
        </div>

        {/* Title */}
        <div style={{marginBottom:18}}>
          <label style={labelStyle}>Title</label>
          <input ref={titleRef} value={title} onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key==="Enter") handleSave(); }}
            placeholder="What's happening?"
            style={{...inputBase, fontSize:15, fontWeight:500}}/>
        </div>

        {/* Lane + Type */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:18}}>
          <div>
            <label style={labelStyle}>Lane</label>
            <select value={lane} onChange={e => setLane(e.target.value as EventLane)}
              style={{...inputBase, cursor:"pointer"}}>
              {(["Work","Family","Health","Travel","Money","Creative"] as EventLane[]).map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Type</label>
            <select value={type} onChange={e => setType(e.target.value as EventType)}
              style={{...inputBase, cursor:"pointer"}}>
              {(Object.entries(EVENT_TYPE_LABEL) as [EventType,string][]).map(([k,v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Status */}
        <div style={{marginBottom:18}}>
          <label style={labelStyle}>Status</label>
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            {(Object.entries(EVENT_STATUS_LABEL) as [EventStatus,string][]).map(([k,v]) => (
              <button key={k} onClick={() => setStatus(k)} style={{...buttonStyle(),
                background:status===k?"rgba(20,19,18,0.07)":"transparent",
                border:status===k?`1px solid rgba(20,19,18,0.30)`:`1px solid ${palette.hairline}`,
                fontWeight:status===k?600:400}}>
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Time */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:18}}>
          <div>
            <label style={labelStyle}>Start time</label>
            <select value={startHour} onChange={e => setStartHour(Number(e.target.value))}
              style={{...inputBase, cursor:"pointer"}}>
              {hours.map(h => <option key={h} value={h}>{fmtH(h)}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>End time</label>
            <select value={endHour} onChange={e => setEndHour(Number(e.target.value))}
              style={{...inputBase, cursor:"pointer",
                border:endHour<=startHour?`1px solid rgba(180,60,60,0.50)`:`1px solid ${palette.hairline}`}}>
              {hours.map(h => <option key={h} value={h}>{fmtH(h)}</option>)}
            </select>
            {endHour <= startHour && (
              <div style={{fontSize:10,color:"rgba(160,40,40,0.75)",marginTop:4,letterSpacing:"0.04em"}}>
                End is before start — will be auto-corrected to {fmtH(startHour+1)}
              </div>
            )}
          </div>
        </div>

        {/* Notes */}
        <div style={{marginBottom:18}}>
          <label style={labelStyle}>Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Any context, links, thoughts..." rows={3}
            style={{...inputBase, resize:"vertical", lineHeight:1.5}}/>
        </div>

        {/* Tags */}
        <div style={{marginBottom:24}}>
          <label style={labelStyle}>Tags</label>
          <div style={{display:"flex",gap:8,marginBottom:8}}>
            <input value={tagInput} onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key==="Enter") { e.preventDefault(); addTag(); }}}
              placeholder="Add a tag, press Enter"
              style={{...inputBase, flex:1}}/>
            <button onClick={addTag} style={buttonStyle({padding:"10px 14px"})}>+</button>
          </div>
          {tags.length > 0 && (
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {tags.map(t => (
                <div key={t} style={{...chipStyle(), gap:6}}>
                  <span>{t}</span>
                  <button onClick={() => setTags(tags.filter(x => x!==t))}
                    style={{background:"none",border:"none",cursor:"pointer",
                      color:"rgba(20,19,18,0.45)",padding:0,fontSize:12,lineHeight:1}}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recurring — only show when creating/editing and recurring props provided */}
        {onSaveRecurring && (
          <RecurringSection
            lane={lane} title={title} type={type} startHour={startHour} endHour={endHour}
            notes={notes} tags={tags} recurring={recurring??[]}
            onSave={onSaveRecurring} onDelete={onDeleteRecurring??(() => {})}
            palette={palette}/>
        )}

        {/* Actions */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
          {isEditing && onDelete ? (
            confirmDelete ? (
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <span style={{fontSize:12,color:"rgba(20,19,18,0.55)"}}>Delete this event?</span>
                <button onClick={() => { onDelete(event!.id); onClose(); }}
                  style={buttonStyle({background:"rgba(180,60,60,0.08)",
                    border:"1px solid rgba(180,60,60,0.25)",color:"rgba(160,40,40,0.80)"})}>
                  Yes, delete
                </button>
                <button onClick={() => setConfirmDelete(false)} style={buttonStyle()}>Cancel</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)}
                style={buttonStyle({color:"rgba(20,19,18,0.40)"})}>Delete</button>
            )
          ) : <div/>}
          <div style={{display:"flex",gap:10}}>
            <button onClick={onClose} style={buttonStyle()}>Cancel</button>
            <button onClick={handleSave} disabled={!title.trim()} style={buttonStyle({
              background:title.trim()?"rgba(20,19,18,0.88)":"rgba(20,19,18,0.12)",
              color:title.trim()?"#fbfaf6":"rgba(20,19,18,0.30)",
              border:"1px solid transparent", padding:"8px 20px", fontWeight:600,
              cursor:title.trim()?"pointer":"default"})}>
              {isEditing ? "Save changes" : "Add event"}
            </button>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{opacity:0;transform:translate(-50%,calc(-50% + 12px))} to{opacity:1;transform:translate(-50%,-50%)} }
        @keyframes threadFadeIn { from{opacity:0;stroke-dashoffset:20} to{opacity:1;stroke-dashoffset:0} }
      `}</style>
    </>
  );
}

// ---------- localStorage helpers ----------
const LS_EVENTS = "myatlas_events";
const LS_RECURRING = "myatlas_recurring";
const LS_NOTES = "myatlas_notes";

function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch { return fallback; }
}
function lsSet(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* storage unavailable */ }
}

// Serialize/deserialize LifeEvent dates (JSON loses Date objects)
function serializeEvents(evs: LifeEvent[]) {
  return evs.map(e => ({...e, date: e.date.toISOString()}));
}
function deserializeEvents(raw: Record<string, unknown>[]): LifeEvent[] {
  return raw.map(e => ({...e, date: new Date(e.date as string)})) as LifeEvent[];
}

function dateKey(d: Date): string {
  return startOfDay(d).toISOString().slice(0,10);
}

// Expand recurring templates into LifeEvent instances for a given date
function expandRecurring(templates: RecurringEvent[], date: Date): LifeEvent[] {
  const dow = date.getDay(); // 0=Sun
  return templates
    .filter(t => {
      if (t.pattern === "daily") return true;
      if (t.pattern === "weekdays") return dow >= 1 && dow <= 5;
      if (t.pattern === "weekly") return dow === (t.anchorDay ?? 1);
      if (t.pattern === "custom") return (t.customDays ?? []).includes(dow);
      return false;
    })
    .map(t => ({
      id: `recur-${t.id}-${dateKey(date)}`,
      title: t.title, lane: t.lane, type: t.type,
      status: "not_started" as EventStatus,
      date: startOfDay(date),
      startHour: t.startHour, endHour: t.endHour,
      notes: t.notes, tags: [...t.tags],
    }));
}

// ---------- Main App ----------
// ─────────────────────────────────────────────────────────────────────────────
// LaunchScreen
// ─────────────────────────────────────────────────────────────────────────────
function LaunchScreen({ onEnter }: { onEnter: (mode: ViewMode) => void }) {
  const [helmCaptureUp, setHelmCaptureUp] = useState<boolean | null>(null);
  const [helmSystemUp,  setHelmSystemUp]  = useState<boolean | null>(null);
  const [starting, setStarting] = useState<Record<string, boolean>>({});
  const [helmToken, setHelmToken] = useState<string>("");
  const [tick, setTick] = useState(0);

  // Load Helm auth token from the file Helm System writes on first run
  useEffect(() => {
    const loadToken = async () => {
      try {
        const t = await invoke<string>("read_helm_token");
        if (t) setHelmToken(t);
      } catch { /* Helm not started yet — health ping will show offline */ }
    };
    loadToken();
    // Retry every 30s in case Helm System starts after MyAtlas
    const iv = setInterval(loadToken, 30000);
    return () => clearInterval(iv);
  }, []);

  const launchService = async (key: "helm_capture" | "helm_system", setStatus: (v: boolean) => void) => {
    setStarting(s => ({ ...s, [key]: true }));
    try {
      // Rust: spawns the Python process, waits ~2s, then opens a native window
      await invoke("launch_service", { service: key });
      setStatus(true);
    } catch (e) {
      console.error("launch_service failed:", e);
    } finally {
      setStarting(s => ({ ...s, [key]: false }));
    }
  };

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  }, []);

  const dateLabel = useMemo(() =>
    new Date().toLocaleDateString(undefined, { weekday:"long", month:"long", day:"numeric" })
  , []);

  const timeLabel = useMemo(() =>
    new Date().toLocaleTimeString(undefined, { hour:"numeric", minute:"2-digit" })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  , [tick]);

  // Ping services
  useEffect(() => {
    const ping = async () => {
      const check = async (url: string, token?: string) => {
        try {
          const headers: Record<string, string> = token
            ? { Authorization: `Bearer ${token}` }
            : {};
          const r = await fetch(url, { signal: AbortSignal.timeout(2000), headers });
          return r.ok || r.status < 500;
        } catch { return false; }
      };
      const [cap, sys] = await Promise.all([
        check("http://localhost:7777/signals", helmToken || undefined),
        check("http://localhost:7778/api/health", helmToken || undefined),
      ]);
      setHelmCaptureUp(cap);
      setHelmSystemUp(sys);
    };
    ping();
    const iv = setInterval(ping, 15000);
    return () => clearInterval(iv);
  }, [helmToken]);

  // Tick clock
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(iv);
  }, []);

  const statusDot = (up: boolean | null): React.CSSProperties => ({
    width: 6, height: 6, borderRadius: "50%",
    background: up === null ? "rgba(224,221,214,0.25)" : up ? "#4d9e6a" : "#b84060",
    boxShadow: up ? "0 0 5px #4d9e6a88" : up === false ? "0 0 5px #b8406088" : "none",
    flexShrink: 0,
  });

  const statusText = (up: boolean | null): React.CSSProperties => ({
    fontSize: 10, letterSpacing: "0.07em",
    color: up === null ? "rgba(224,221,214,0.28)" : up ? "#4d9e6a" : "rgba(184,64,96,0.85)",
  });

  const s: Record<string, React.CSSProperties> = {
    root: {
      height: "100vh", width: "100%", overflow: "hidden",
      background: "radial-gradient(ellipse at 28% 35%, rgba(30,45,110,0.45) 0%, #08080f 62%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      fontFamily: "ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif",
      color: "#e0ddd6", padding: "0 24px 32px",
      userSelect: "none", position: "relative",
    },
    topBadge: {
      fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase",
      color: "rgba(224,221,214,0.28)", marginBottom: 36,
    },
    hexWrap: {
      width: 72, height: 72, display: "flex", alignItems: "center", justifyContent: "center",
      marginBottom: 24, position: "relative",
    },
    greeting: {
      fontSize: 13, letterSpacing: "0.08em", color: "rgba(224,221,214,0.55)", marginBottom: 6,
    },
    name: {
      fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: 4,
      background: "linear-gradient(135deg, #e0ddd6 30%, #8eaaff 100%)",
      WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
    },
    dateLine: {
      fontSize: 12, color: "rgba(224,221,214,0.38)", letterSpacing: "0.06em", marginBottom: 52,
    },
    cards: {
      display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16,
      width: "min(860px,92vw)", marginBottom: 48,
    },
    card: {
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(90,130,255,0.14)",
      borderRadius: 20, padding: "24px 22px",
      cursor: "pointer", transition: "all 0.18s ease",
      display: "flex", flexDirection: "column", gap: 0,
    },
    cardIcon: {
      fontSize: 22, marginBottom: 14, lineHeight: 1,
    },
    cardTitle: {
      fontSize: 15, fontWeight: 650, color: "#e0ddd6", marginBottom: 5,
    },
    cardSub: {
      fontSize: 11, color: "rgba(224,221,214,0.40)", letterSpacing: "0.04em",
      lineHeight: 1.55, flex: 1, marginBottom: 16,
    },
    statusRow: {
      display: "flex", alignItems: "center", gap: 6, marginTop: "auto",
    },
    footer: {
      fontSize: 10, letterSpacing: "0.07em", color: "rgba(224,221,214,0.18)",
      display: "flex", gap: 20, alignItems: "center",
    },
  };

  const cardHover = (e: React.MouseEvent<HTMLDivElement>, enter: boolean) => {
    const el = e.currentTarget as HTMLDivElement;
    el.style.background = enter
      ? "rgba(90,130,255,0.08)"
      : "rgba(255,255,255,0.03)";
    el.style.borderColor = enter
      ? "rgba(90,130,255,0.35)"
      : "rgba(90,130,255,0.14)";
    el.style.transform = enter ? "translateY(-2px)" : "none";
    el.style.boxShadow = enter ? "0 12px 40px rgba(90,130,255,0.12)" : "none";
  };

  return (
    <div style={s.root}>
      {/* Tauri v2 drag region — data-tauri-drag-region makes this area move the window */}
      <div data-tauri-drag-region="" style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 52,
        zIndex: 10, cursor: "grab",
      }}/>

      <div style={s.topBadge}>Intelligence Infrastructure · Helm</div>

      {/* Hexagon logo */}
      <div style={s.hexWrap}>
        <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
          <polygon points="36,4 64,20 64,52 36,68 8,52 8,20"
            fill="rgba(14,20,52,0.9)" stroke="#5a82ff" strokeWidth="1.5"/>
          <polygon points="36,14 56,25 56,47 36,58 16,47 16,25"
            fill="rgba(20,28,60,0.8)" stroke="rgba(90,130,255,0.35)" strokeWidth="1"/>
          <text x="36" y="40" textAnchor="middle" dominantBaseline="middle"
            fill="#e0ddd6" fontSize="15" fontWeight="700" fontFamily="ui-sans-serif,system-ui,sans-serif"
            letterSpacing="1">MA</text>
          <circle cx="54" cy="22" r="4" fill="#5a82ff" opacity="0.8"/>
        </svg>
      </div>

      <div style={s.greeting}>{greeting}, Yemi</div>
      <div style={s.name}>MyAtlas</div>
      <div style={s.dateLine}>{dateLabel} · {timeLabel}</div>

      {/* Navigation cards */}
      <div style={s.cards} className="no-drag">

        {/* MyAtlas Dashboard */}
        <div
          style={s.card}
          onClick={() => onEnter("pods")}
          onMouseEnter={e => cardHover(e, true)}
          onMouseLeave={e => cardHover(e, false)}>
          <div style={s.cardIcon}>◎</div>
          <div style={s.cardTitle}>MyAtlas</div>
          <div style={s.cardSub}>
            Life planning dashboard — Pods timeline, week calendar, day view, and Helm intelligence.
          </div>
          <div style={s.statusRow}>
            <div style={statusDot(true)}/>
            <span style={statusText(true)}>Ready</span>
          </div>
        </div>

        {/* Helm Capture */}
        <div
          style={s.card}
          onClick={() => {
            if (!starting["helm_capture"]) { launchService("helm_capture", setHelmCaptureUp); }
          }}
          onMouseEnter={e => cardHover(e, true)}
          onMouseLeave={e => cardHover(e, false)}>
          <div style={s.cardIcon}>⬡</div>
          <div style={s.cardTitle}>Helm Capture</div>
          <div style={s.cardSub}>
            Drop images to extract intelligence signals. Tag, pillar-assign, and feed your Helm layer.
          </div>
          <div style={s.statusRow}>
            <div style={statusDot(helmCaptureUp)}/>
            <span style={statusText(helmCaptureUp)}>
              {starting["helm_capture"] ? "Starting…"
                : helmCaptureUp === null ? "Checking…"
                : helmCaptureUp ? "Running · port 7777 — click to open"
                : "Offline — click to start"}
            </span>
          </div>
        </div>

        {/* Helm System */}
        <div
          style={s.card}
          onClick={() => {
            if (!starting["helm_system"]) { launchService("helm_system", setHelmSystemUp); }
          }}
          onMouseEnter={e => cardHover(e, true)}
          onMouseLeave={e => cardHover(e, false)}>
          <div style={s.cardIcon}>⬡</div>
          <div style={s.cardTitle}>Helm System</div>
          <div style={s.cardSub}>
            Mac Mini health monitor — CPU, memory, disk, component management, and unified logs.
          </div>
          <div style={s.statusRow}>
            <div style={statusDot(helmSystemUp)}/>
            <span style={statusText(helmSystemUp)}>
              {starting["helm_system"] ? "Starting…"
                : helmSystemUp === null ? "Checking…"
                : helmSystemUp ? "Running · port 7778 — click to open"
                : "Offline — click to start"}
            </span>
          </div>
        </div>

      </div>

      <div style={s.footer}>
        <span>⬡ Helm · Intelligence Infrastructure</span>
        <span>·</span>
        <span>Mac Mini · Chicago</span>
      </div>
    </div>
  );
}

export default function App() {
  // Hardcoded planned trips — fallback and unconfirmed future trips
  // Signals are the source of truth; legacy `status` derived for backward compat
  const PLANNED_TRIPS = useMemo<TravelTrip[]>(() => {
    const houstonSignals: TravelSignal[] = [
      {
        id: "houston-2026-flight-outbound",
        type: "flight_outbound",
        label: "SW 455 MDW → HOU",
        status: "DONE",
        actionDate: new Date(2026, 3, 8, 7, 25),
        details: {
          carrier: "SW", flightNumber: "455",
          route: "MDW → HOU",
          departure: "7:25 AM", arrival: "10:05 AM",
          aircraft: "Boeing 737 MAX8",
          passengers: "4",
          fare: "Basic",
        },
        notes: "Southwest 455 MDW→HOU. 4 passengers. Basic fare — 24hr check-in required Apr 7.",
      },
      {
        id: "houston-2026-flight-return",
        type: "flight_return",
        label: "UA 2197 IAH → ORD",
        status: "DONE",
        actionDate: new Date(2026, 3, 12, 18, 40),
        details: {
          carrier: "UA", flightNumber: "2197",
          route: "IAH → ORD",
          departure: "6:40 PM", arrival: "9:31 PM",
          aircraft: "Airbus A321neo",
          cabin: "United Economy (L)",
          seat: "39A-D",
        },
        notes: "Return flight confirmed. Seats 39A-D. Drop-off at IAH (~45 min from hotel).",
      },
      {
        id: "houston-2026-lodging",
        type: "lodging",
        label: "Marriott Residence Inn — Energy Corridor",
        status: "DONE",
        actionDate: new Date(2026, 3, 8, 15, 0),  // standard 3pm check-in
        details: {
          property: "Residence Inn by Marriott Houston West/Energy Corridor",
          room: "2 Bedroom Suite (2 queen + sofa bed)",
          guests: "4",
          cost: "$785.66",
        },
        notes: "Apr 8-12, 4 nights. 2BR suite for the family.",
      },
      {
        id: "houston-2026-car-rental",
        type: "car_rental",
        label: "Apex Auto — Mercedes GLC",
        status: "DONE",
        actionDate: new Date(2026, 3, 8, 10, 30),  // pickup after flight lands
        details: {
          agency: "Apex Auto Group",
          vehicle: "Mercedes-Benz GLC-Class 2020",
          mileage: "800 miles included",
          pickup: "Houston Hobby (HOU)",
          dropoff: "George Bush Intercontinental (IAH)",
        },
        notes: "Pickup at Hobby, drop-off at IAH — different airports, ~45 min apart.",
      },
      {
        id: "houston-2026-birthday",
        type: "activity",
        label: "Taiwo & Kehinde's 50th Birthday",
        status: "NOT_STARTED",
        actionDate: new Date(2026, 3, 11, 18, 0),
        details: {
          venue: "Mara Villa, 1419 Avenue D, Katy TX 77493",
          theme: "Cheers to 50 Years",
          dress: "Touch of Vibrancy",
        },
        notes: "Anchor event. Apr 11 at 6:00 PM. Dress: Touch of Vibrancy.",
      },
      {
        id: "houston-2026-topgolf",
        type: "activity",
        label: "Topgolf Katy",
        status: "TBD",
        details: { venue: "Topgolf Katy" },
        notes: "Day TBD. Family outing.",
      },
      {
        id: "houston-2026-checkin-outbound",
        type: "checkin_reminder",
        label: "Flight check-in: SW 455",
        status: "NOT_STARTED",
        actionDate: new Date(2026, 3, 7, 7, 25),  // T-24h before departure
        details: { parentSignal: "houston-2026-flight-outbound" },
        notes: "Southwest Basic fare — check in EXACTLY at 24hr mark (Apr 7 7:25am).",
      },
      {
        id: "houston-2026-checkin-return",
        type: "checkin_reminder",
        label: "Flight check-in: UA 2197",
        status: "NOT_STARTED",
        actionDate: new Date(2026, 3, 11, 18, 40),  // T-24h before return
        details: { parentSignal: "houston-2026-flight-return" },
        notes: "Check in to UA 2197 — opens 24h before departure.",
      },
    ];

    const lagosSignals: TravelSignal[] = [
      {
        id: "lagos-2026-flight-outbound",
        type: "flight_outbound",
        label: "Flight to Lagos",
        status: "IN_PROGRESS",
        details: { note: "Flights on installment payments" },
        notes: "Installment payment plan — exact carrier/route TBD.",
      },
      {
        id: "lagos-2026-flight-return",
        type: "flight_return",
        label: "Return from Lagos",
        status: "TBD",
        details: {},
      },
      {
        id: "lagos-2026-lodging",
        type: "lodging",
        label: "Lagos Accommodation",
        status: "TBD",
        details: {},
      },
      {
        id: "lagos-2026-ground",
        type: "ground_transport",
        label: "Lagos Ground Transport",
        status: "TBD",
        details: {},
        notes: "Local transport TBD.",
      },
      {
        id: "lagos-2026-docs",
        type: "document",
        label: "Travel Documents",
        status: "NOT_STARTED",
        details: { note: "Passport validity, any visa requirements" },
        notes: "Verify passport expiry dates for all 4 travelers.",
      },
    ];

    return [
      {
        id: "houston-2026", title: "Houston", location: "Houston / Katy, TX",
        start: new Date(2026, 3, 8), end: new Date(2026, 3, 12),
        tags: ["Travel", "Family"],
        signals: houstonSignals,
        status: deriveStatusFromSignals(houstonSignals),
        notes: "FULLY BOOKED — SW 455 MDW→HOU, Marriott Residence Inn, Apex Mercedes GLC. Anchor: 50th birthday Apr 11.",
      },
      {
        id: "lagos-2026", title: "Lagos", location: "Lagos, Nigeria",
        start: new Date(2026, 10, 24), end: new Date(2026, 10, 30),
        tags: ["Travel", "All 4 traveling"],
        signals: lagosSignals,
        status: deriveStatusFromSignals(lagosSignals),
        notes: "Flights on installment payments. Exact dates + lodging/transport TBD.",
      },
    ];
  }, []);

  // Confirmed trips from Helm Capture /trips — parsed from real bookings + Gmail
  // Server may return `signals[]` (new) or legacy `status{}` (old). We handle both.
  const [confirmedTrips, setConfirmedTrips] = useState<TravelTrip[]>([]);
  useEffect(() => {
    fetch("http://localhost:7777/trips")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: Array<{
        id: string; title: string; location: string;
        start: string; end: string; tags: string[];
        status?: { flight: string; lodging: string; transport: string };
        signals?: TravelSignal[];
        notes?: string;
      }>) => {
        setConfirmedTrips(data.map(t => {
          // If server sends signals, use them; otherwise parse notes as intelligence layer
          const serverSignals = t.signals ?? [];
          const notesSignals = t.notes ? parseNotesIntoSignals(t.notes, t.id) : [];
          // Merge: server signals take precedence, notes fill gaps
          const serverTypes = new Set(serverSignals.map(s => s.type));
          const merged = [...serverSignals, ...notesSignals.filter(ns => !serverTypes.has(ns.type))];
          // Generate check-in reminders from confirmed signals
          const reminders = generateCheckinReminders(merged, t.id);
          const reminderTypes = new Set(merged.filter(s => s.type === "checkin_reminder").map(s => s.details.parentSignal));
          const newReminders = reminders.filter(r => !reminderTypes.has(r.details.parentSignal));
          const allSignals = [...merged, ...newReminders];

          return {
            id:       t.id,
            title:    t.title,
            location: t.location,
            start:    new Date(t.start + "T12:00:00"),
            end:      new Date(t.end   + "T12:00:00"),
            tags:     t.tags,
            signals:  allSignals,
            status:   allSignals.length > 0
              ? deriveStatusFromSignals(allSignals)
              : (t.status as TravelTrip["status"]) ?? { flight: "TBD", lodging: "TBD", transport: "TBD" },
            notes:    t.notes ?? "",
          };
        }));
      })
      .catch(() => {}); // silent — PLANNED_TRIPS serve as fallback
  }, []);

  // Merge: confirmed trips take precedence; planned trips fill any gaps
  // Signal-aware merge: confirmed signals override planned; planned fill gaps by type
  const travelTrips: TravelTrip[] = useMemo(() => {
    if (confirmedTrips.length === 0) return PLANNED_TRIPS;

    const mergeSignals = (confirmed: TravelSignal[], planned: TravelSignal[]): TravelSignal[] => {
      const confirmedTypes = new Set(confirmed.map(s => s.type));
      // Confirmed signals take precedence; planned fill any type gaps
      return [...confirmed, ...planned.filter(ps => !confirmedTypes.has(ps.type))];
    };

    const merged = confirmedTrips.map(ct => {
      const planned = PLANNED_TRIPS.find(p => p.title.toLowerCase() === ct.title.toLowerCase());
      if (!planned) return ct;
      const signals = mergeSignals(ct.signals || [], planned.signals || []);
      return {
        ...ct,
        signals,
        status: deriveStatusFromSignals(signals),
        notes: ct.notes || planned.notes,
      };
    });
    const confirmedTitles = new Set(confirmedTrips.map(t => t.title.toLowerCase()));
    const extras = PLANNED_TRIPS.filter(p => !confirmedTitles.has(p.title.toLowerCase()));
    return [...merged, ...extras];
  }, [confirmedTrips, PLANNED_TRIPS]);

  const [events, setEvents] = useState<LifeEvent[]>(() =>
    deserializeEvents(lsGet<Record<string, unknown>[]>(LS_EVENTS, []))
  );
  const [recurring, setRecurring] = useState<RecurringEvent[]>(() =>
    lsGet<RecurringEvent[]>(LS_RECURRING, [])
  );
  const [dayNotes, setDayNotes] = useState<DayNote[]>(() =>
    lsGet<DayNote[]>(LS_NOTES, [])
  );
  const [modal, setModal] = useState<ModalState>({open:false});
  const [mode, setMode] = useState<ViewMode>("launch");
  const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date(2026,0,1)));
  const [notesOpen, setNotesOpen] = useState(false);

  // ── Helm auth token (loaded from disk via Tauri invoke) ──
  const [helmToken, setHelmToken] = useState<string>("");
  useEffect(() => {
    const loadToken = async () => {
      try {
        const t = await invoke<string>("read_helm_token");
        if (t) setHelmToken(t);
      } catch { /* Helm not started yet */ }
    };
    loadToken();
    const iv = setInterval(loadToken, 30000);
    return () => clearInterval(iv);
  }, []);

  // ── Gmail calendar signal → Day view bridge ──
  const [calendarSignalEvents, setCalendarSignalEvents] = useState<LifeEvent[]>([]);
  useEffect(() => {
    fetch("http://localhost:7777/calendar-events")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: Array<{id:string; title:string; lane:string; type:string; status:string; date:string; startHour:number; endHour:number; tags:string[]; notes:string}>) => {
        const mapped: LifeEvent[] = data.map(d => ({
          id: d.id,
          title: d.title,
          lane: (d.lane || "Work") as EventLane,
          type: (d.type || "task") as EventType,
          status: (d.status || "not_started") as EventStatus,
          date: new Date(d.date),
          startHour: d.startHour,
          endHour: d.endHour,
          tags: d.tags || ["helm-signal"],
          notes: d.notes || "",
        }));
        setCalendarSignalEvents(mapped);
      })
      .catch(() => { /* helm server not running — silent */ });
  }, []);

  // ── Seed Events — known dates from signals, trips, and Dash schedule ──
  // These populate the calendar even when Helm server is offline.
  // Helm server /calendar-events takes precedence if running (deduped by id).
  // Helper to generate daily rhythm events for a given date
  const seedEvents = useMemo<LifeEvent[]>(() => {
    const E = (id: string, title: string, lane: EventLane, type: EventType, status: EventStatus,
               date: Date, startHour: number, endHour: number, tags: string[], notes: string): LifeEvent =>
      ({ id, title, lane, type, status, date, startHour, endHour, tags, notes });

    // ── Daily rhythm blocks (Apr 8–12 Houston trip) ──
    const dailyRhythm = (day: number, label: string): LifeEvent[] => [
      E(`seed-wake-apr${day}`, "Wake Up", "Health", "task", "not_started",
        new Date(2026, 3, day), 6, 7, ["routine", "houston"],
        `${label} — rise and prep.`),
      E(`seed-walk-apr${day}`, "Walk & Stretch (30 min)", "Health", "task", "not_started",
        new Date(2026, 3, day), 7, 8, ["routine", "health", "houston"],
        "30 min walk or stretch — hotel area or nearby trail."),
      E(`seed-coffee-apr${day}`, "Coffee", "Health", "task", "not_started",
        new Date(2026, 3, day), 8, 9, ["routine", "houston"],
        "Marriott breakfast bar or local spot."),
    ];

    // ── Family blocks (Apr 8–12) — this is a family trip ──
    const familyBlocks: LifeEvent[] = [
      E("seed-fam-apr8-arrive", "Family Arrives in Houston", "Family", "milestone", "not_started",
        new Date(2026, 3, 8), 10, 11, ["houston", "family"],
        "Landed at Hobby. Collect bags, pick up rental, settle in."),
      E("seed-fam-apr8-settle", "Settle Into Hotel — Family Time", "Family", "task", "not_started",
        new Date(2026, 3, 8), 16, 18, ["houston", "family"],
        "Unpack at Marriott. Kids decompress. Explore hotel pool/area."),
      E("seed-fam-apr8-dinner", "Family Dinner — First Night", "Family", "task", "not_started",
        new Date(2026, 3, 8), 18, 20, ["houston", "family"],
        "First dinner in Houston. Local spot near Energy Corridor."),
      E("seed-fam-apr9-mainevent", "Main Event Katy — Family Outing", "Family", "task", "not_started",
        new Date(2026, 3, 9), 11, 15, ["houston", "family", "activity"],
        "Main Event, 24401 Katy Fwy, Katy TX 77494. Bowling, arcade, laser tag. Open 11am-midnight."),
      E("seed-fam-apr9-dinner", "Family Dinner", "Family", "task", "not_started",
        new Date(2026, 3, 9), 18, 20, ["houston", "family"],
        "Evening meal together."),
      E("seed-fam-apr10-typhoon", "Typhoon Texas Waterpark", "Family", "task", "not_started",
        new Date(2026, 3, 10), 11, 17, ["houston", "family", "activity"],
        "Typhoon Texas, 555 Katy Fort Bend Rd, Katy TX 77494. NOTE: Season may not start until mid-April — check typhoontexas.com/houston before going. If closed, backup: Topgolf Katy or Katy Mills Mall."),
      E("seed-fam-apr10-dinner", "Family Dinner", "Family", "task", "not_started",
        new Date(2026, 3, 10), 18, 20, ["houston", "family"],
        "Evening meal together."),
      E("seed-fam-apr11-prep", "Birthday Prep — Outfits & Photos", "Family", "task", "not_started",
        new Date(2026, 3, 11), 14, 17, ["houston", "family", "birthday"],
        "Get ready for the party. Touch of Vibrancy outfits. Camera gear prepped."),
      E("seed-fam-apr11-birthday", "Taiwo & Kehinde's 50th Birthday", "Family", "milestone", "not_started",
        new Date(2026, 3, 11), 18, 23, ["houston", "family", "anchor-event"],
        "Mara Villa, 1419 Avenue D, Katy TX. Theme: Cheers to 50 Years. Dress: Touch of Vibrancy."),
      E("seed-fam-apr12-packup", "Family Pack-Up & Goodbye", "Family", "task", "not_started",
        new Date(2026, 3, 12), 9, 11, ["houston", "family"],
        "Pack up, check out by 11am. Lunch nearby, then leave for IAH by 2:30pm (45 min drive + rental return)."),
    ];

    return [
      // ── Pre-trip: Packing ──
      E("seed-pack-start", "Packing — Start (Family of 4)", "Travel", "task", "not_started",
        new Date(2026, 3, 6), 10, 12, ["houston", "packing"],
        "Begin packing: outfits, camera gear, kids items, documents, chargers."),
      E("seed-pack-verify", "Packing — Final Check", "Travel", "task", "not_started",
        new Date(2026, 3, 7), 20, 21, ["houston", "packing", "action-required"],
        "Final verify: chargers, camera batteries, SD cards, kids comfort items, Touch of Vibrancy outfits, docs."),

      // ── Pre-trip: SW Check-in ──
      E("seed-sw-checkin", "SW 455 Check-in (24hr)", "Travel", "task", "not_started",
        new Date(2026, 3, 7), 7, 8, ["houston", "flight", "action-required"],
        "Southwest Basic fare — check in EXACTLY at 7:25am CT. All 4 passengers."),

      // ── Apr 8 (Wed) — Travel Day ──
      ...dailyRhythm(8, "Travel day — up early for 7:25am flight"),
      E("seed-sw455-departure", "✈ SW 455 MDW → HOU", "Travel", "milestone", "not_started",
        new Date(2026, 3, 8), 7, 10, ["houston", "flight"],
        "Depart 7:25am, arrive 10:05am. 4 passengers. Boeing 737 MAX8."),
      E("seed-car-pickup", "Apex Mercedes GLC — Pickup (HOU)", "Travel", "task", "not_started",
        new Date(2026, 3, 8), 10, 11, ["houston", "car-rental"],
        "Pickup at Houston Hobby after landing. 800 mi included."),
      E("seed-work-wed-monitor", "Morning — Monitoring & Reporting", "Work", "task", "not_started",
        new Date(2026, 3, 8), 7, 9, ["work", "dba", "recurring"],
        "Daily block — flying out at 7:25am, handle from phone if possible."),
      E("seed-work-wed-1on1", "Yemi 1:1 (Teams)", "Work", "task", "not_started",
        new Date(2026, 3, 8), 13, 14, ["work", "meeting", "1on1"],
        "Wednesday recurring — join from Houston."),
      E("seed-marriott-checkin", "Marriott Residence Inn — Check In", "Travel", "task", "not_started",
        new Date(2026, 3, 8), 15, 16, ["houston", "hotel"],
        "2 Bedroom Suite (2 queen + sofa bed). 4 guests. Energy Corridor."),

      // ── Apr 9 (Thu) — Houston Day 2 ──
      ...dailyRhythm(9, "Houston day 2"),
      E("seed-work-thu-monitor", "Morning — Monitoring & Reporting", "Work", "task", "not_started",
        new Date(2026, 3, 9), 7, 9, ["work", "dba", "recurring"],
        "Daily block — remote from Houston."),
      E("seed-work-thu-ets", "Weekly — ETS", "Work", "task", "not_started",
        new Date(2026, 3, 9), 14, 15, ["work", "meeting"],
        "Thursday recurring — remote from Houston."),

      // ── Apr 10 (Fri) — Houston Day 3 ──
      ...dailyRhythm(10, "Houston day 3"),
      E("seed-work-fri-monitor", "Morning — Monitoring & Reporting", "Work", "task", "not_started",
        new Date(2026, 3, 10), 7, 9, ["work", "dba", "recurring"],
        "Daily block — remote from Houston."),
      E("seed-work-fri-cloudkt", "DBA SYNC — Cloud KT (Teams)", "Work", "task", "not_started",
        new Date(2026, 3, 10), 10, 11, ["work", "dba", "meeting"],
        "Cloud Knowledge Transfer — Friday recurring. Remote from Houston."),
      E("seed-work-fri-employbridge", "Employbridge Meeting", "Work", "task", "not_started",
        new Date(2026, 3, 10), 13, 14, ["work", "meeting"],
        "Employbridge — Friday. Remote from Houston."),

      // ── Apr 11 (Sat) — Birthday Day ──
      ...dailyRhythm(11, "Birthday day — pace yourself"),
      E("seed-work-sat-monitor", "Morning — Monitoring & Reporting", "Work", "task", "not_started",
        new Date(2026, 3, 11), 7, 9, ["work", "dba", "recurring"],
        "Daily block — birthday day, wrap up early."),
      E("seed-essay-04", "Essay 04 — Due", "Creative", "milestone", "not_started",
        new Date(2026, 3, 11), 17, 18, ["dg", "writing", "deadline"],
        "DG Essay Series — Essay 04 deadline. Friday April 11."),
      E("seed-ua-checkin", "UA 2197 Check-in (24hr)", "Travel", "task", "not_started",
        new Date(2026, 3, 11), 18, 19, ["houston", "flight"],
        "Check in for return flight — opens 24hr before 6:40pm Apr 12."),

      // ── Apr 12 (Sun) — Return Day ──
      // Timeline: checkout 11am → lunch → leave hotel 2:30pm → 45min drive → arrive IAH 3:15pm
      //           → rental drop-off 3:30pm → shuttle to terminal → security → gate by 5:00pm → board 6:10pm → depart 6:40pm
      ...dailyRhythm(12, "Return day — check out by 11am"),
      E("seed-marriott-checkout", "Marriott — Check Out", "Travel", "task", "not_started",
        new Date(2026, 3, 12), 11, 12, ["houston", "hotel"],
        "Check out by 11am. Lunch nearby, then head to IAH by 2:30pm."),
      E("seed-apr12-lunch", "Lunch — Last Meal in Houston", "Family", "task", "not_started",
        new Date(2026, 3, 12), 12, 14, ["houston", "family"],
        "Last meal before heading to the airport."),
      E("seed-apr12-leave", "Leave for IAH", "Travel", "task", "not_started",
        new Date(2026, 3, 12), 14, 15, ["houston", "travel", "action-required"],
        "Leave hotel/restaurant by 2:30pm. 45 min drive to IAH. Must arrive by 3:15pm for rental return + security."),
      E("seed-car-dropoff", "Apex Mercedes GLC — Drop-off (IAH)", "Travel", "task", "not_started",
        new Date(2026, 3, 12), 15, 16, ["houston", "car-rental"],
        "Drop-off at IAH rental return. Allow 30 min for return process + shuttle to terminal."),
      E("seed-apr12-security", "IAH Security + Gate", "Travel", "task", "not_started",
        new Date(2026, 3, 12), 16, 17, ["houston", "flight"],
        "Through security by 4:30pm. At gate by 5:00pm. Boarding ~6:10pm."),
      E("seed-ua2197-return", "✈ UA 2197 IAH → ORD", "Travel", "milestone", "not_started",
        new Date(2026, 3, 12), 18, 22, ["houston", "flight"],
        "Depart 6:40pm, arrive 9:31pm. Airbus A321neo. Seats 39A-D."),

      // ── Family blocks ──
      ...familyBlocks,

      // ── Pre-trip Work (Mon Apr 6, Tue Apr 7) ──
      E("seed-work-mon-monitor", "Morning — Monitoring & Reporting", "Work", "task", "not_started",
        new Date(2026, 3, 6), 7, 9, ["work", "dba", "recurring"],
        "Daily DBA monitoring and reporting block."),
      E("seed-work-mon-standup", "DBA Team Weekly Stand Up", "Work", "task", "not_started",
        new Date(2026, 3, 6), 9, 10, ["work", "dba", "meeting"],
        "THE DB A-TEAM — Monday recurring."),
      E("seed-work-mon-helpdesk", "Help Desk Sync (Teams)", "Work", "task", "not_started",
        new Date(2026, 3, 6), 10, 11, ["work", "meeting"],
        "Help desk coordination — Microsoft Teams."),
      E("seed-work-tue-monitor", "Morning — Monitoring & Reporting", "Work", "task", "not_started",
        new Date(2026, 3, 7), 7, 9, ["work", "dba", "recurring"],
        "Daily DBA monitoring and reporting block."),

      // ── Dash Scheduled Releases (nightly Apr 5–12) ──
      ...[5,6,7,8,9,10,11,12].map(d =>
        E(`seed-dash-nightly-apr${d}`, "Dash Nightwatch", "Work", "task", "not_started",
          new Date(2026, 3, d), 22, 23, ["dash", "helm", "automated"],
          d >= 8 ? "Nightly audit — runs while traveling." : "Nightly audit — health checks, trend detection.")
      ),

      // ── Pulse Monthly ──
      E("seed-pulse-may1", "Pulse Card Generation (May)", "Creative", "task", "not_started",
        new Date(2026, 4, 1), 7, 8, ["pulse", "ideka", "automated"],
        "Monthly pulse card generation — select quotes, pair with images, update pulse_builder.py."),
    ];
  }, []);

  // Persist events whenever they change
  useEffect(() => { lsSet(LS_EVENTS, serializeEvents(events)); }, [events]);
  useEffect(() => { lsSet(LS_RECURRING, recurring); }, [recurring]);
  useEffect(() => { lsSet(LS_NOTES, dayNotes); }, [dayNotes]);

  // ── Sync MyAtlas state to Helm server (bidirectional bridge) ──
  // Writes events + recurring + notes to disk via helm_web.py /sync
  // so helm_suggest.py can generate calendar-aware suggestions.
  useEffect(() => {
    const payload = {
      events: serializeEvents(events),
      recurring: recurring,
      notes: dayNotes,
      synced_at: new Date().toISOString(),
    };
    fetch("http://localhost:7777/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => { /* helm server not running — silent */ });
  }, [events, recurring, dayNotes]);

  // Day note helpers
  const getNoteForDate = useCallback((d: Date) => {
    return dayNotes.find(n => n.date === dateKey(d))?.text ?? "";
  }, [dayNotes]);
  const setNoteForDate = useCallback((d: Date, text: string) => {
    setDayNotes(prev => {
      const key = dateKey(d);
      const exists = prev.findIndex(n => n.date === key);
      if (exists >= 0) {
        const next = [...prev]; next[exists] = {date:key, text}; return next;
      }
      return [...prev, {date:key, text}];
    });
  }, []);

  // Merge real events + expanded recurring + calendar signal events + seed events for a given date
  const eventsForDate = useCallback((d: Date): LifeEvent[] => {
    const dayStart = startOfDay(d).getTime();
    const real = events.filter(e => startOfDay(e.date).getTime()===dayStart);
    const recurExpanded = expandRecurring(recurring, d);
    const calSignals = calendarSignalEvents.filter(e => startOfDay(e.date).getTime()===dayStart);
    const seeds = seedEvents.filter(e => startOfDay(e.date).getTime()===dayStart);
    // Don't double-show if a real event or calendar signal has the same id
    const seenIds = new Set(real.map(e => e.id));
    const deduped = (arr: LifeEvent[]) => arr.filter(e => { if (seenIds.has(e.id)) return false; seenIds.add(e.id); return true; });
    return [...real, ...deduped(recurExpanded), ...deduped(calSignals), ...deduped(seeds)];
  }, [events, recurring, calendarSignalEvents, seedEvents]);

  const addOrUpdateEvent = useCallback((e: LifeEvent) => {
    // ── Tag-to-recurring promotion ──
    // If the user tags an event as "Daily", "Weekdays", or "Weekly",
    // auto-promote it into the recurring system and remove from one-time events.
    const tagLower = (e.tags || []).map(t => t.toLowerCase());
    const recurTag = tagLower.find(t => ["daily","weekdays","weekly"].includes(t));
    if (recurTag) {
      const pattern = recurTag as RecurPattern;
      const recurEvent: RecurringEvent = {
        id: e.id,
        title: e.title,
        lane: e.lane,
        type: e.type,
        startHour: e.startHour ?? 9,
        endHour: e.endHour ?? 10,
        notes: e.notes,
        tags: e.tags.filter(t => !["daily","weekdays","weekly","recurring"].includes(t.toLowerCase())),
        pattern,
        createdAt: new Date().toISOString(),
      };
      setRecurring(prev => {
        const idx = prev.findIndex(x => x.id === recurEvent.id);
        if (idx >= 0) { const n = [...prev]; n[idx] = recurEvent; return n; }
        return [...prev, recurEvent];
      });
      // Remove from one-time events if it was there
      setEvents(prev => prev.filter(x => x.id !== e.id));
      return;
    }

    setEvents(prev => {
      const idx = prev.findIndex(x => x.id === e.id);
      if (idx >= 0) { const n = [...prev]; n[idx] = e; return n; }
      return [...prev, e];
    });
  }, []);

  const deleteEvent = useCallback((id: string) => {
    setEvents(prev => prev.filter(e => e.id !== id));
  }, []);

  const saveRecurring = useCallback((r: RecurringEvent) => {
    setRecurring(prev => {
      const idx = prev.findIndex(x => x.id === r.id);
      if (idx >= 0) { const n = [...prev]; n[idx] = r; return n; }
      return [...prev, r];
    });
  }, []);
  const deleteRecurring = useCallback((id: string) => {
    setRecurring(prev => prev.filter(r => r.id !== id));
  }, []);

  const openNew = useCallback((date: Date, hour?: number) => setModal({open:true,date,hour}), []);
  const openEdit = useCallback((event: LifeEvent) => setModal({open:true,date:event.date,event}), []);
  const closeModal = useCallback(() => setModal({open:false}), []);

  const weekStart = useMemo(() => getWeekStart(selectedDate), [selectedDate]);
  const weekDays = useMemo(() => Array.from({length:7}, (_,i) => addDays(weekStart,i)), [weekStart]);

  const headerRange = useMemo(() => {
    const end = addDays(weekStart,6);
    return `${formatMonthDay(weekStart)} – ${formatMonthDay(end)}`;
  }, [weekStart]);

  const headerTitle = useMemo(() => {
    if (mode==="pods") return "Pods · Birds-eye timeline";
    if (mode==="week") return `Week · ${headerRange}`;
    if (mode==="helm") return "⬡ Helm · Intelligence Layer";
    return `Day · ${formatDow(selectedDate)} · ${formatMonthDay(selectedDate)}`;
  }, [mode, headerRange, selectedDate]);

  if (mode === "launch") {
    return <LaunchScreen onEnter={(m) => setMode(m)} />;
  }

  return (
    <div style={{height:"100vh",overflow:"hidden",background:palette.paper,
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-start",
      padding:24,color:palette.graphite,
      fontFamily:"ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif"}}>
      <div style={{width:"min(1120px,94vw)",background:palette.card,borderRadius:28,
        border:`1px solid ${palette.hairline}`,boxShadow:"0 18px 60px rgba(0,0,0,0.08)",overflow:"hidden",
        display:"flex",flexDirection:"column",flex:1,minHeight:0}}>

        {/* Header */}
        <div style={{padding:22,paddingBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:16,alignItems:"baseline"}}>
            <div>
              <div
                style={{fontSize:11,letterSpacing:"0.20em",textTransform:"uppercase",
                  color:"rgba(20,19,18,0.58)",cursor:"pointer"}}
                onClick={() => setMode("launch")}
                title="Return to home">
                ⬡ MyAtlas
              </div>
              <div style={{fontSize:18,fontWeight:650,lineHeight:1.15,marginTop:6}}>{headerTitle}</div>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"center"}}>
              {/* Pods: always available when not already there */}
              {mode !== "pods" && (
                <button onClick={() => setMode("pods")} style={buttonStyle()}>Pods</button>
              )}
              {/* ⬡ Helm: always visible */}
              <button
                onClick={() => setMode(m => m === "helm" ? "pods" : "helm")}
                style={buttonStyle({
                  background: mode === "helm" ? "#0d0d1a" : "transparent",
                  color: mode === "helm" ? "#5a82ff" : palette.graphite,
                  border: mode === "helm" ? "1px solid #5a82ff" : `1px solid ${palette.hairline}`,
                  fontWeight: mode === "helm" ? 600 : 400,
                })}>
                ⬡ Helm
              </button>
              {mode === "day" && <>
                <button onClick={() => openNew(selectedDate)}
                  style={buttonStyle({background:"rgba(20,19,18,0.06)",fontWeight:600})}>+ Event</button>
                <button onClick={() => setMode("week")} style={buttonStyle()}>← Week</button>
              </>}
              {mode === "week" && <>
                <button onClick={() => setSelectedDate(startOfDay(new Date()))} style={buttonStyle()}>Today</button>
                <button onClick={() => setSelectedDate(addDays(selectedDate,-7))} style={buttonStyle()}>← Prev</button>
                <button onClick={() => setSelectedDate(addDays(selectedDate,7))} style={buttonStyle()}>Next →</button>
              </>}
              {/* Notes panel toggle — visible on week + day */}
              {mode !== "pods" && (
                <button onClick={() => setNotesOpen(o => !o)}
                  style={buttonStyle({
                    background: notesOpen ? "rgba(20,19,18,0.08)" : "transparent",
                    fontWeight: notesOpen ? 600 : 400,
                  })}>
                  📝 Notes
                </button>
              )}
            </div>
          </div>
          <div style={{marginTop:10,fontSize:12,color:"rgba(20,19,18,0.50)",letterSpacing:"0.04em"}}>
            {mode==="pods"
              ? "Reflection → Stabilization → ReGrowth · click a year to enter Week view."
              : mode==="week"
                ? "Click any day to open it · travel chips drill down."
                : mode==="helm"
                  ? "Life signals by pillar · captured via Helm Drop · tag-filtered."
                  : "Click the dial to add · hover arcs to see connections · same tag = linked."}
          </div>
        </div>

        <div style={{borderTop:`1px solid ${palette.hairline}`}}/>

        {/* Body */}
        <div style={{padding:22,flex:1,minHeight:0,overflowY:"auto"}}>
          {mode === "helm" ? (
            <HelmView palette={palette} travelTrips={travelTrips} helmToken={helmToken}/>
          ) : mode === "pods" ? (
            <PodsTimeline
              currentPodStartYear={2026} palette={palette} travelTrips={travelTrips}
              onPickYear={y => { setSelectedDate(startOfDay(new Date(y,0,1))); setMode("week"); }}
              onPickTrip={t => { setSelectedDate(startOfDay(t.start)); setMode("week"); }}/>
          ) : mode === "week" ? (
            <WeekShell
              days={weekDays} selectedDate={selectedDate} palette={palette}
              travelTrips={travelTrips}
              events={events} recurring={recurring} eventsForDate={eventsForDate}
              weekStart={weekStart}
              onPickDay={d => { setSelectedDate(startOfDay(d)); setMode("day"); }}
              onPickTrip={t => {
                const ts = startOfDay(t.start).getTime();
                const ws = weekStart.getTime();
                const we = addDays(weekStart,6).getTime();
                setSelectedDate(ts >= ws && ts <= we ? startOfDay(t.start) : startOfDay(weekStart));
                setMode("day");
              }}/>
          ) : (
            <DayShell
              date={selectedDate} palette={palette} travelTrips={travelTrips}
              events={eventsForDate(selectedDate)}
              onAddEvent={hour => openNew(selectedDate, hour)}
              onEditEvent={openEdit}/>
          )}
        </div>
      </div>

      {/* Floating Notes Panel */}
      {notesOpen && mode !== "pods" && (
        <NotesPanel
          date={selectedDate}
          note={getNoteForDate(selectedDate)}
          onChangeNote={text => setNoteForDate(selectedDate, text)}
          onClose={() => setNotesOpen(false)}
          palette={palette}/>
      )}

      {/* Recurring Events Manager — accessible from notes panel */}
      {modal.open && (
        <EventModal
          key={modal.event?.id ?? `new-${modal.date?.toISOString()}-${modal.hour}`}
          initialDate={modal.date} initialHour={modal.hour} event={modal.event}
          onSave={addOrUpdateEvent} onDelete={deleteEvent} onClose={closeModal}
          recurring={recurring} onSaveRecurring={saveRecurring} onDeleteRecurring={deleteRecurring}/>
      )}
    </div>
  );
}

// ---------- Recurring Section (inside EventModal) ----------
function RecurringSection({ lane, title, type, startHour, endHour, notes, tags,
  recurring, onSave, onDelete, palette }: {
  lane: EventLane; title: string; type: EventType;
  startHour: number; endHour: number; notes: string; tags: string[];
  recurring: RecurringEvent[]; onSave: (r: RecurringEvent) => void;
  onDelete: (id: string) => void; palette: Palette;
}) {
  const [open, setOpen] = useState(false);
  const [pattern, setPattern] = useState<RecurPattern>("weekly");
  const [customDays, setCustomDays] = useState<number[]>([1]); // Mon default
  const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  const existing = recurring.filter(r => r.lane===lane && r.title===title);

  const handleAdd = () => {
    const anchorDay = new Date().getDay();
    onSave({
      id: uid(), title, lane, type, startHour, endHour,
      notes: notes||undefined, tags: [...tags],
      pattern, customDays: pattern==="custom"?customDays:undefined,
      anchorDay: pattern==="weekly"?anchorDay:undefined,
      createdAt: new Date().toISOString(),
    });
    setOpen(false);
  };

//   const inputBase: React.CSSProperties = {
//     background:"rgba(255,255,255,0.55)", border:`1px solid ${palette.hairline}`,
//     borderRadius:10, padding:"7px 10px", fontSize:12, color:palette.graphite,
//     outline:"none", fontFamily:"inherit", cursor:"pointer",
//   };

  return (
    <div style={{marginBottom:18, borderTop:`1px solid ${palette.hairline}`, paddingTop:14}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:open?12:0}}>
        <span style={{fontSize:10, letterSpacing:"0.16em", textTransform:"uppercase",
          color:"rgba(20,19,18,0.50)"}}>Recurring</span>
        <button onClick={() => setOpen(o=>!o)} style={{
          appearance:"none" as const, border:"none", background:"none", cursor:"pointer",
          fontSize:11, color:"rgba(20,19,18,0.50)", letterSpacing:"0.06em",
        }}>{open?"▲ hide":"+ make recurring"}</button>
      </div>

      {/* Existing recurring templates for this event */}
      {existing.length > 0 && (
        <div style={{display:"flex", flexWrap:"wrap", gap:6, marginBottom:8}}>
          {existing.map(r => (
            <div key={r.id} style={{display:"flex", alignItems:"center", gap:6,
              padding:"3px 10px", borderRadius:999, fontSize:10,
              background:LANE_BG[r.lane], border:`1px solid ${LANE_COLORS[r.lane]}33`,
              color:LANE_COLORS[r.lane]}}>
              <span style={{fontWeight:600}}>
                {r.pattern==="daily"?"Daily":r.pattern==="weekdays"?"Weekdays":
                 r.pattern==="weekly"?`Weekly·${DOW[r.anchorDay??1]}`:
                 `Custom·${(r.customDays??[]).map(d=>DOW[d]).join(",")}`}
              </span>
              <button onClick={() => onDelete(r.id)}
                style={{background:"none",border:"none",cursor:"pointer",
                  color:"rgba(20,19,18,0.40)",padding:0,fontSize:11,lineHeight:1}}>✕</button>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div style={{display:"grid", gap:10, background:"rgba(20,19,18,0.03)",
          borderRadius:14, padding:12}}>
          <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
            {(["daily","weekdays","weekly","custom"] as RecurPattern[]).map(p => (
              <button key={p} onClick={() => setPattern(p)} style={{
                appearance:"none" as const, borderRadius:999, cursor:"pointer",
                padding:"5px 12px", fontSize:11, letterSpacing:"0.06em",
                border:`1px solid ${pattern===p?LANE_COLORS[lane]:palette.hairline}`,
                background:pattern===p?LANE_BG[lane]:"transparent",
                color:pattern===p?LANE_COLORS[lane]:palette.graphite, fontWeight:pattern===p?600:400,
              }}>
                {p==="daily"?"Daily":p==="weekdays"?"Weekdays":p==="weekly"?"Weekly":"Custom days"}
              </button>
            ))}
          </div>

          {pattern==="custom" && (
            <div style={{display:"flex", gap:6}}>
              {DOW.map((d,i) => (
                <button key={i} onClick={() => setCustomDays(prev =>
                  prev.includes(i)?prev.filter(x=>x!==i):[...prev,i]
                )} style={{
                  appearance:"none" as const, width:34, height:34, borderRadius:10,
                  border:`1px solid ${customDays.includes(i)?LANE_COLORS[lane]:palette.hairline}`,
                  background:customDays.includes(i)?LANE_BG[lane]:"transparent",
                  color:customDays.includes(i)?LANE_COLORS[lane]:"rgba(20,19,18,0.55)",
                  fontSize:10, fontWeight:600, cursor:"pointer",
                }}>{d}</button>
              ))}
            </div>
          )}

          {pattern==="weekly" && (
            <div style={{fontSize:11, color:"rgba(20,19,18,0.50)"}}>
              Will repeat every {DOW[new Date().getDay()]} · change after saving if needed
            </div>
          )}

          <button onClick={handleAdd} disabled={!title.trim()} style={{
            appearance:"none" as const, borderRadius:999,
            background:title.trim()?LANE_COLORS[lane]:"rgba(20,19,18,0.10)",
            color:title.trim()?"#fff":"rgba(20,19,18,0.30)",
            border:"none", padding:"8px 16px", fontSize:11, fontWeight:600,
            cursor:title.trim()?"pointer":"default", letterSpacing:"0.06em",
            alignSelf:"start",
          }}>
            Save recurring event
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- Notes Panel (floating) ----------
function NotesPanel({ date, note, onChangeNote, onClose, palette }: {
  date: Date; note: string; onChangeNote: (t: string) => void;
  onClose: () => void; palette: Palette;
}) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { textRef.current?.focus(); }, []);

  return (
    <>
      {/* Backdrop — click to close */}
      <div onClick={onClose} style={{position:"fixed", inset:0, zIndex:90, background:"transparent"}}/>
      <div style={{
        position:"fixed", top:80, right:24, width:300, zIndex:91,
        background:palette.card, borderRadius:22,
        border:`1px solid ${palette.hairline}`,
        boxShadow:"0 20px 60px rgba(0,0,0,0.14)",
        display:"flex", flexDirection:"column",
        animation:"slideInRight 0.18s ease",
      }}>
        {/* Panel header */}
        <div style={{padding:"14px 16px 10px", borderBottom:`1px solid ${palette.hairline}`,
          display:"flex", justifyContent:"space-between", alignItems:"center"}}>
          <div>
            <div style={{fontSize:9, letterSpacing:"0.20em", textTransform:"uppercase",
              color:"rgba(20,19,18,0.45)", marginBottom:2}}>Day notes</div>
            <div style={{fontSize:12, fontWeight:600, color:palette.graphite}}>
              {formatMonthDayYear(date)}
            </div>
          </div>
          <button onClick={onClose} style={{
            appearance:"none" as const, border:"none", background:"none",
            cursor:"pointer", fontSize:16, color:"rgba(20,19,18,0.35)", lineHeight:1,
          }}>✕</button>
        </div>

        {/* Textarea */}
        <textarea
          ref={textRef}
          value={note}
          onChange={e => onChangeNote(e.target.value)}
          placeholder={"Intentions, thoughts, reminders…\n\nAnything goes here."}
          style={{
            flex:1, resize:"none", border:"none", outline:"none",
            background:"transparent", padding:"14px 16px",
            fontSize:13, lineHeight:1.70, color:palette.graphite,
            fontFamily:"ui-sans-serif,system-ui,-apple-system,sans-serif",
            minHeight:220,
          }}/>

        {/* Footer */}
        <div style={{padding:"8px 16px 12px", borderTop:`1px solid ${palette.hairline}`,
          fontSize:10, color:"rgba(20,19,18,0.35)", letterSpacing:"0.06em",
          display:"flex", justifyContent:"space-between"}}>
          <span>Saved automatically</span>
          {note.length > 0 && <span>{note.length} chars</span>}
        </div>
      </div>
      <style>{`
        @keyframes slideInRight {
          from { opacity:0; transform:translateX(16px) }
          to   { opacity:1; transform:translateX(0) }
        }
      `}</style>
    </>
  );
}

// ---------- Pods ----------
function PodsTimeline({ currentPodStartYear, onPickYear, onPickTrip, palette, travelTrips }: {
  currentPodStartYear: number; onPickYear: (y: number) => void;
  onPickTrip: (t: TravelTrip) => void; palette: Palette; travelTrips: TravelTrip[];
}) {
  const pods = useMemo(() => {
    const p = currentPodStartYear-2, n = currentPodStartYear+2;
    return [
      {chapter:"Reflection", years:[p,p+1] as [number,number], atmosphere:palette.reflection, emphasis:"past" as const},
      {chapter:"Stabilization", years:[currentPodStartYear,currentPodStartYear+1] as [number,number], atmosphere:palette.stabilization, emphasis:"current" as const},
      {chapter:"ReGrowth", years:[n,n+1] as [number,number], atmosphere:palette.regrowth, emphasis:"future" as const},
    ];
  }, [currentPodStartYear, palette]);

  const currentPodTrips = useMemo(() => {
    const s = new Date(currentPodStartYear,0,1), e = new Date(currentPodStartYear+1,11,31);
    return travelTrips.filter(t => !(t.end<s || t.start>e));
  }, [travelTrips, currentPodStartYear]);

  return (
    <div style={{display:"grid",gap:16}}>
      {/* Rail */}
      <div style={{position:"relative",height:24}}>
        <div style={{position:"absolute",left:0,right:0,top:12,height:1,background:palette.hairline}}/>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",alignItems:"center"}}>
          {pods.map(p => {
            const ic = p.emphasis==="current", op = p.emphasis==="past"?0.55:p.emphasis==="future"?0.65:1;
            return (
              <div key={p.chapter} style={{display:"grid",justifyItems:"center",opacity:op}}>
                <div style={{width:10,height:10,borderRadius:999,
                  background:ic?"rgba(20,19,18,0.55)":"rgba(20,19,18,0.20)",
                  boxShadow:ic?"0 0 0 4px rgba(20,19,18,0.06)":"none"}}/>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pod tiles */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:14,minWidth:0}}>
        {pods.map(p => {
          const ic = p.emphasis==="current", op = p.emphasis==="past"?0.70:p.emphasis==="future"?0.82:1;
          return (
            <div key={p.chapter} style={{borderRadius:22,
              border:`1px solid ${ic?"rgba(20,19,18,0.22)":palette.hairline}`,
              background:p.atmosphere, padding:14, opacity:op,
              overflow:"hidden", minWidth:0}}>
              <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"baseline"}}>
                <div style={{fontSize:11,letterSpacing:"0.18em",textTransform:"uppercase",
                  color:"rgba(20,19,18,0.60)"}}>{p.chapter}</div>
                <div style={{fontSize:12,color:"rgba(20,19,18,0.65)",letterSpacing:"0.06em"}}>
                  {p.years[0]}–{p.years[1]}
                </div>
              </div>

              {ic && currentPodTrips.length > 0 && (
                <div style={{marginTop:10,display:"flex",flexWrap:"wrap",gap:8}}>
                  {currentPodTrips.map(t => (
                    <button key={t.id} onClick={() => onPickTrip(t)}
                      style={{...chipStyle(), cursor:"pointer", transition:"background 0.15s,box-shadow 0.15s",
                        background:"rgba(255,255,255,0.42)"}}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.72)";
                        (e.currentTarget as HTMLElement).style.boxShadow="0 2px 8px rgba(0,0,0,0.07)";
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.42)";
                        (e.currentTarget as HTMLElement).style.boxShadow="none";
                      }}>
                      <span style={{color:"rgba(20,19,18,0.65)",fontSize:11,letterSpacing:"0.12em"}}>TRAVEL</span>
                      <span style={{fontWeight:650}}>{t.title}</span>
                      <span style={{color:"rgba(20,19,18,0.55)"}}>{formatMonthDay(t.start)}–{formatMonthDay(t.end)}</span>
                      <span style={{color:"rgba(20,19,18,0.30)",fontSize:11}}>→</span>
                    </button>
                  ))}
                </div>
              )}

              <div style={{marginTop:12, display:"grid", gridTemplateColumns:"1fr 1fr", gap:10}}>
                {p.years.map(y => (
                  <button key={y} onClick={() => onPickYear(y)} style={{
                    textAlign:"left", width:"100%", boxSizing:"border-box",
                    borderRadius:16, border:`1px solid ${palette.hairline}`,
                    background:"rgba(255,255,255,0.28)", padding:"10px 10px 8px",
                    cursor:"pointer", overflow:"hidden", minWidth:0}}>
                    <div style={{fontSize:12,color:"rgba(20,19,18,0.75)",marginBottom:8,
                      fontWeight:500,letterSpacing:"0.04em"}}>{y}</div>
                    <YearDial palette={palette} highlight={ic}/>
                  </button>
                ))}
              </div>

              <div style={{marginTop:10,fontSize:11,color:"rgba(20,19,18,0.50)",letterSpacing:"0.04em"}}>
                {ic?"Current chapter":p.emphasis==="past"?"Past · softened":"Future · softened"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function YearDial({ palette, highlight }: { palette: Palette; highlight: boolean }) {
  const cx=80, cy=80, r=56;
  return (
    <svg viewBox="0 0 160 160" width="100%" style={{display:"block", maxWidth:140}}>
      {highlight && <circle cx={cx} cy={cy} r={r+12} fill="none" stroke={palette.accent} strokeWidth={1.2} opacity={0.45}/>}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={palette.graphite} strokeWidth={1.4}/>
      <circle cx={cx} cy={cy} r={r-10} fill="none" stroke={palette.faint} strokeWidth={1}/>
      {Array.from({length:12}, (_,i) => {
        const a = -Math.PI/2+(2*Math.PI*i/12);
        const p0 = polar(cx,cy,r-4,a), p1 = polar(cx,cy,r+5,a);
        return <line key={i} x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y}
          stroke="rgba(20,19,18,0.22)" strokeWidth={i%3===0?1.8:1.1} strokeLinecap="round"/>;
      })}
      <circle cx={cx} cy={cy} r={3.5} fill={palette.graphite} opacity={0.85}/>
    </svg>
  );
}

// ---------- Week Shell ----------
function WeekShell({ days, selectedDate, onPickDay, onPickTrip, palette, travelTrips, eventsForDate, weekStart }: {
  days: Date[]; selectedDate: Date; onPickDay: (d: Date) => void;
  onPickTrip: (t: TravelTrip) => void; palette: Palette;
  travelTrips: TravelTrip[]; events: LifeEvent[];
  recurring: RecurringEvent[]; eventsForDate: (d: Date) => LifeEvent[];
  weekStart: Date;
}) {
  const tripsThisWeek = useMemo(() => travelTrips.filter(t => overlapsWeek(weekStart,t)), [travelTrips,weekStart]);

  return (
    <div style={{display:"grid",gap:14}}>
      {tripsThisWeek.length > 0 && (
        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
          {tripsThisWeek.map(t => (
            <button key={t.id} onClick={() => onPickTrip(t)}
              style={{...chipStyle(), cursor:"pointer", transition:"background 0.15s,box-shadow 0.15s"}}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.72)";
                (e.currentTarget as HTMLElement).style.boxShadow="0 2px 8px rgba(0,0,0,0.07)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.30)";
                (e.currentTarget as HTMLElement).style.boxShadow="none";
              }}>
              <span style={{color:"rgba(20,19,18,0.65)",fontSize:11,letterSpacing:"0.12em"}}>TRAVEL</span>
              <span style={{fontWeight:650}}>{t.title}</span>
              <span style={{color:"rgba(20,19,18,0.55)"}}>{formatMonthDay(t.start)}–{formatMonthDay(t.end)}</span>
              <span style={{color:"rgba(20,19,18,0.30)",fontSize:11}}>→</span>
            </button>
          ))}
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))",gap:14}}>
        {days.map(d => {
          const isToday = startOfDay(d).getTime()===startOfDay(new Date()).getTime();
          const isSel = startOfDay(d).getTime()===startOfDay(selectedDate).getTime();
          const tripsForDay = travelTrips.filter(t => isDateInRange(d,t.start,t.end));
          const eventsForDay = eventsForDate(d);
          return (
            <button key={d.toISOString()} onClick={() => onPickDay(d)} style={{textAlign:"left",
              padding:12, borderRadius:18, cursor:"pointer",
              border:`1px solid ${isSel?"rgba(20,19,18,0.22)":palette.hairline}`,
              background:isSel?"rgba(20,19,18,0.03)":"transparent"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:8}}>
                <div style={{fontSize:11,letterSpacing:"0.14em",textTransform:"uppercase",
                  color:"rgba(20,19,18,0.58)"}}>{formatDow(d)}</div>
                {isToday && <div style={{fontSize:10,letterSpacing:"0.16em",textTransform:"uppercase",
                  color:"rgba(80,110,140,0.75)"}}>Today</div>}
              </div>
              <div style={{marginTop:4,fontSize:12,color:"rgba(20,19,18,0.70)"}}>{formatMonthDay(d)}</div>
              {tripsForDay.length > 0 && (
                <div style={{marginTop:6,fontSize:10,letterSpacing:"0.18em",textTransform:"uppercase",
                  color:"rgba(20,19,18,0.55)"}}>TRAVEL</div>
              )}
              {eventsForDay.length > 0 ? (
                <div style={{marginTop:6,display:"flex",flexWrap:"wrap",gap:4}}>
                  {eventsForDay.slice(0,6).map(ev => (
                    <div key={ev.id} title={ev.title} style={{width:6,height:6,borderRadius:999,
                      background:LANE_COLORS[ev.lane],flexShrink:0}}/>
                  ))}
                  {eventsForDay.length > 6 && (
                    <div style={{fontSize:9,color:"rgba(20,19,18,0.45)",lineHeight:"6px"}}>
                      +{eventsForDay.length-6}
                    </div>
                  )}
                </div>
              ) : <div style={{marginTop:6,height:10}}/>}
              <div style={{marginTop:8,display:"grid",placeItems:"center"}}>
                <MiniDayDial palette={palette} events={eventsForDay}/>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MiniDayDial({ palette, events }: { palette: Palette; events: LifeEvent[] }) {
  const size=110, cx=55, cy=55, rOuter=40;
  const laneR = [32,27,22,17,12,7];
  const lanes: EventLane[] = ["Work","Family","Health","Travel","Money","Creative"];
  const angleFor = (h: number) => { const s=(h-DAY_START_HOUR+24)%24; return -Math.PI/2+(2*Math.PI*s/24); };
  return (
    <svg width={size} height={size}>
      <circle cx={cx} cy={cy} r={rOuter} fill="none" stroke={palette.graphite} strokeWidth={1.1}/>
      <circle cx={cx} cy={cy} r={rOuter-6} fill="none" stroke={palette.faint} strokeWidth={1}/>
      {Array.from({length:24}, (_,h) => {
        const a=angleFor(h), p0=polar(cx,cy,rOuter-2,a), p1=polar(cx,cy,rOuter+2,a);
        return <line key={h} x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y}
          stroke="rgba(20,19,18,0.12)" strokeWidth={h%6===0?1.2:1} strokeLinecap="round"/>;
      })}
      {laneR.map((rr,idx) => (
        <circle key={idx} cx={cx} cy={cy} r={rr} fill="none" stroke="rgba(20,19,18,0.05)" strokeWidth={6}/>
      ))}
      {events.map(ev => {
        const li = lanes.indexOf(ev.lane);
        if (li<0 || ev.startHour===undefined) return null;
        const p = polar(cx,cy,laneR[li],angleFor(ev.startHour));
        return <circle key={ev.id} cx={p.x} cy={p.y} r={2.5} fill={LANE_COLORS[ev.lane]} opacity={0.9}/>;
      })}
      <circle cx={cx} cy={cy} r={2.6} fill={palette.graphite} opacity={0.9}/>
    </svg>
  );
}

// ---------- Day Shell ----------
function DayShell({ date, palette, travelTrips, events, onAddEvent, onEditEvent }: {
  date: Date; palette: Palette; travelTrips: TravelTrip[]; events: LifeEvent[];
  onAddEvent: (hour?: number) => void; onEditEvent: (e: LifeEvent) => void;
}) {
  const size=640, cx=320, cy=320, rOuter=270;

  // Fetch Helm signals relevant to any active trip
  const [tripSignals, setTripSignals] = useState<HelmSignal[]>([]);
  const [signalsOpen, setSignalsOpen] = useState(false);
  const tripsForDayEarly = useMemo(
    () => travelTrips.filter(t => isDateInRange(date, t.start, t.end)),
    [travelTrips, date]
  );
  useEffect(() => {
    if (tripsForDayEarly.length === 0) { setTripSignals([]); return; }
    // Trip-specific keywords — must match at least one for a signal to qualify.
    // Generic travel tags alone (e.g. "car rental") are not enough — they'd bleed
    // across trips (Houston car rental showing on Lagos dates, etc.)
    const tripKeywords = new Set(tripsForDayEarly.flatMap(t =>
      [t.title.toLowerCase(), t.location.split(",")[0].toLowerCase()]
    ));
    fetch("http://localhost:7777/signals")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((sigs: HelmSignal[]) => {
        const relevant = sigs.filter(s => {
          const tags = (s.tags || []).map(t => t.toLowerCase());
          const text = (s.signal || "").toLowerCase();
          // Signal must reference this trip's name or city — not just any travel tag
          return [...tripKeywords].some(kw => tags.includes(kw) || text.includes(kw));
        }).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        setTripSignals(relevant);
      })
      .catch(() => {});
  }, [tripsForDayEarly]);
  const laneR = useMemo(() => [218,185,152,119,86,53], []);
  const laneThickness = 13;
  const lanes: EventLane[] = ["Work","Family","Health","Travel","Money","Creative"];

  // Each lane label sits at its own staggered clock hour so labels spread around the dial
  // and threads between lanes don't cut through label clusters
  const LANE_LABEL_HOUR: Record<EventLane, number> = {
    Work:     5,   // ~5am — upper left zone
    Family:   8,   // ~8am — upper right
    Health:   11,  // ~11am — right
    Travel:   14,  // ~2pm — lower right
    Money:    18,  // ~6pm — lower left
    Creative: 22,  // ~10pm — left
  };

  const [hoveredLane, setHoveredLane] = useState<number|null>(null);
  const [hoveredEventId, setHoveredEventId] = useState<string|null>(null);

  const angleForHour = useCallback((h: number) => {
    const s = (h - DAY_START_HOUR + 24) % 24;
    return -Math.PI/2 + (2*Math.PI*s/24);
  }, []);

  const arcPath = useCallback((rr: number, sh: number, eh: number) => {
    const a1=angleForHour(sh), a2=angleForHour(eh);
    const p1=polar(cx,cy,rr,a1), p2=polar(cx,cy,rr,a2);
    let diff=(eh-sh+24)%24; if(diff===0) diff=0.5;
    return `M ${p1.x} ${p1.y} A ${rr} ${rr} 0 ${diff>12?1:0} 1 ${p2.x} ${p2.y}`;
  }, [angleForHour]);

  const arcMidpoint = useCallback((rr: number, sh: number, eh: number) => {
    return polar(cx, cy, rr, angleForHour((sh+eh)/2));
  }, [angleForHour]);

  const tagGroups = useMemo(() => {
    const g = new Map<string,string[]>();
    events.forEach(ev => ev.tags.forEach(tag => {
      if (!g.has(tag)) g.set(tag,[]);
      g.get(tag)!.push(ev.id);
    }));
    g.forEach((ids,tag) => { if (ids.length<2) g.delete(tag); });
    return g;
  }, [events]);

  const getLinkedEvents = useCallback((evId: string): LifeEvent[] => {
    const ids = new Set<string>();
    tagGroups.forEach(group => {
      if (group.includes(evId)) group.forEach(id => { if (id!==evId) ids.add(id); });
    });
    return events.filter(e => ids.has(e.id));
  }, [tagGroups, events]);

  const handleSvgMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect=e.currentTarget.getBoundingClientRect();
    const mx=e.clientX-rect.left-cx, my=e.clientY-rect.top-cy;
    const dist=Math.sqrt(mx*mx+my*my);
    let closest:number|null=null, minD=999;
    laneR.forEach((rr,idx) => { const d=Math.abs(dist-rr); if(d<minD&&d<18){minD=d;closest=idx;} });
    setHoveredLane(closest);
  }, [laneR]);

  const handleSvgMouseLeave = useCallback(() => {
    setHoveredLane(null);
    setHoveredEventId(null);
  }, [setHoveredLane, setHoveredEventId]);

  // Clicking the dial no longer opens add-event — arcs only open edit
  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => { e.stopPropagation(); };

  const tripsForDay = useMemo(
    () => travelTrips.filter(t => isDateInRange(date,t.start,t.end)),
    [travelTrips, date]
  );

  const AFFINITY_PAIRS: [EventLane, EventLane][] = [
    ["Travel","Creative"], ["Travel","Work"], ["Travel","Family"],
    ["Travel","Health"], ["Work","Creative"], ["Family","Health"],
  ];
  const hasAffinity = (a: EventLane, b: EventLane) =>
    AFFINITY_PAIRS.some(([x,y]) => (x===a&&y===b)||(x===b&&y===a));

  // Hours grid for swimlane — 6am to midnight
  const SWIM_START = 6, SWIM_END = 24;
  const swimHours = Array.from({length: SWIM_END - SWIM_START + 1}, (_,i) => SWIM_START + i);

  return (
    <div style={{display:"grid", gap:18}}>

      {/* Top bar: date + add button */}
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
        <div style={{fontSize:13, color:"rgba(20,19,18,0.60)", letterSpacing:"0.04em"}}>
          {formatMonthDayYear(date)}
          {tripsForDay.length>0 && (
            <span style={{marginLeft:10, fontSize:11, letterSpacing:"0.12em",
              color:LANE_COLORS["Travel"], textTransform:"uppercase", fontWeight:600}}>
              · {tripsForDay[0].title}
            </span>
          )}
        </div>
        <button
          onClick={() => onAddEvent()}
          style={{...buttonStyle({
            background:"rgba(20,19,18,0.88)", color:"#fbfaf6",
            border:"1px solid transparent", padding:"8px 18px", fontWeight:600, fontSize:12,
          })}}>
          + Add event
        </button>
      </div>

      {/* Two-panel layout: dial left, swimlanes right */}
      <div style={{display:"grid", gridTemplateColumns:"300px 1fr", gap:20, alignItems:"start"}}>

        {/* ---- Dial (overview only, no click-to-add) ---- */}
        <div style={{display:"grid", placeItems:"center"}}>
          <svg width={size/2 + 20} height={size/2 + 20}
            onMouseMove={handleSvgMouseMove} onMouseLeave={handleSvgMouseLeave}
            onClick={handleSvgClick}
            style={{cursor:"default"}}>

            {/* Scale everything to half size via a group transform */}
            <g transform={`scale(0.5) translate(${cx * 0.0} ${cy * 0.0})`}>

            <circle cx={cx} cy={cy} r={rOuter} fill="none" stroke={palette.graphite} strokeWidth={1.6}/>
            <circle cx={cx} cy={cy} r={rOuter-12} fill="none" stroke={palette.faint} strokeWidth={1}/>

            {/* Hour ticks */}
            {Array.from({length:24}, (_,h) => {
              const a=angleForHour(h);
              const p0=polar(cx,cy,rOuter-5,a), p1=polar(cx,cy,rOuter+5,a);
              return <line key={h} x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y}
                stroke="rgba(20,19,18,0.20)" strokeWidth={h%6===0?2.5:1.4} strokeLinecap="round"/>;
            })}

            {/* Cardinal labels */}
            {[0,6,12,18].map(h => {
              const p = polar(cx,cy,rOuter+22,angleForHour(h));
              return <text key={h} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
                fontSize={18} fill="rgba(20,19,18,0.35)" style={{letterSpacing:"0.06em"}}>
                {h===0?"MID":h===6?"6":h===12?"12":"18"}
              </text>;
            })}

            {/* Lane rings */}
            {laneR.map((rr,idx) => {
              const lane=lanes[idx], lc=LANE_COLORS[lane];
              const isLH=hoveredLane===idx;
              const isTonal=hoveredEventId
                ? getLinkedEvents(hoveredEventId).some(e => e.lane===lane) : false;
              return (
                <circle key={idx} cx={cx} cy={cy} r={rr} fill="none"
                  stroke={isLH||isTonal ? lc : "rgba(20,19,18,0.05)"}
                  strokeWidth={isLH?laneThickness+8:isTonal?laneThickness+4:laneThickness}
                  style={{
                    transition:"stroke 0.25s,stroke-width 0.25s,opacity 0.25s",
                    opacity:isLH?0.40:isTonal?0.20:1,
                    filter:isLH?`drop-shadow(0 0 8px ${lc})`:isTonal?`drop-shadow(0 0 5px ${lc})`:"none",
                  }}/>
              );
            })}

            {/* Lane labels — each at its own staggered clock position */}
            {laneR.map((rr,idx) => {
              const lane=lanes[idx], lc=LANE_COLORS[lane];
              const isLH=hoveredLane===idx;
              const isTonal=hoveredEventId
                ? getLinkedEvents(hoveredEventId).some(e => e.lane===lane) : false;
              const labelHour = LANE_LABEL_HOUR[lane];
              const a = angleForHour(labelHour);
              // Place label just outside the ring
              const p = polar(cx, cy, rr + 18, a);
              // Anchor text based on which side of the dial
              const cos = Math.cos(a);
              const anchor = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
              return (
                <text key={`lbl-${idx}`} x={p.x} y={p.y} textAnchor={anchor}
                  dominantBaseline="middle"
                  fontSize={isLH?20:17} fontWeight={isLH||isTonal?700:500} fill={lc}
                  style={{letterSpacing:"0.08em", transition:"opacity 0.18s",
                    opacity:isLH?1:isTonal?0.95:0.60}}>
                  {lane.toUpperCase()}
                </text>
              );
            })}

            {/* Constellation threads */}
            {hoveredEventId && (() => {
              const hovEv = events.find(e => e.id===hoveredEventId);
              if (!hovEv) return null;
              const hSh=hovEv.startHour??9, hEh=hovEv.endHour??hSh+1;
              const hLI=lanes.indexOf(hovEv.lane);
              const hMid=arcMidpoint(laneR[hLI],hSh,hEh);
              const hoursOverlap=(s1:number,e1:number,s2:number,e2:number)=>s1<e2&&s2<e1;

              return events.filter(e=>e.id!==hoveredEventId).map(lev => {
                const lSh=lev.startHour??9, lEh=lev.endHour??lSh+1;
                const sharesTag=lev.tags.some(t=>hovEv.tags.includes(t));
                const affiliated=hasAffinity(hovEv.lane,lev.lane);
                const conflicts=hoursOverlap(hSh,hEh,lSh,lEh)&&lev.lane!==hovEv.lane;
                if (!sharesTag&&!affiliated&&!conflicts) return null;
                const isConflict=conflicts&&!sharesTag&&!affiliated;
                const color=isConflict?"rgba(190,50,40,0.65)":"rgba(60,100,180,0.55)";
                const dash=isConflict?"4 4":"5 5";
                const lLI=lanes.indexOf(lev.lane);
                const lMid=arcMidpoint(laneR[lLI],lSh,lEh);
                return (
                  <g key={`thread-${lev.id}`} style={{pointerEvents:"none"}}>
                    <path d={`M ${hMid.x} ${hMid.y} L ${lMid.x} ${lMid.y}`}
                      fill="none" stroke={color} strokeWidth={1.8} strokeDasharray={dash}
                      style={{animation:"threadFadeIn 0.22s ease forwards"}}/>
                    <circle cx={hMid.x} cy={hMid.y} r={4} fill={color} opacity={0.9}/>
                    <circle cx={lMid.x} cy={lMid.y} r={4} fill={color} opacity={0.9}/>
                  </g>
                );
              });
            })()}

            {/* Travel trip arcs — full-day arc in Travel ring */}
            {tripsForDay.map(t => {
              const rr = laneR[lanes.indexOf("Travel")];
              const color = LANE_COLORS["Travel"];
              return (
                <g key={`trip-arc-${t.id}`} style={{pointerEvents:"none"}}>
                  <path d={arcPath(rr, 0, 23.5)} fill="none" stroke={color}
                    strokeWidth={14} strokeLinecap="round" strokeDasharray="12 6"
                    style={{opacity:0.55}}/>
                  <title>{t.title}</title>
                </g>
              );
            })}

            {/* Event arcs */}
            {events.map(ev => {
              const li=lanes.indexOf(ev.lane);
              if (li<0) return null;
              const rr=laneR[li], sh=ev.startHour??9, eh=ev.endHour??sh+1;
              const color=LANE_COLORS[ev.lane];
              const isH=hoveredEventId===ev.id;
              const isL=hoveredEventId?getLinkedEvents(hoveredEventId).some(e=>e.id===ev.id):false;
              const isDim=!!hoveredEventId&&!isH&&!isL;
              const onClick=(e:React.MouseEvent)=>{e.stopPropagation();onEditEvent(ev);};
              if (Math.abs(eh-sh)<0.5) {
                const p=polar(cx,cy,rr,angleForHour(sh));
                return (
                  <g key={ev.id} onClick={onClick}
                    onMouseEnter={()=>setHoveredEventId(ev.id)}
                    onMouseLeave={()=>setHoveredEventId(null)}
                    style={{cursor:"pointer"}}>
                    <circle cx={p.x} cy={p.y} r={20} fill="transparent" pointerEvents="all"/>
                    <circle cx={p.x} cy={p.y} r={isH?12:isL?10:8} fill={color}
                      style={{transition:"r 0.18s,opacity 0.18s",opacity:isDim?0.20:1}}/>
                    <title>{ev.title}</title>
                  </g>
                );
              }
              return (
                <g key={ev.id} onClick={onClick}
                  onMouseEnter={()=>setHoveredEventId(ev.id)}
                  onMouseLeave={()=>setHoveredEventId(null)}
                  style={{cursor:"pointer"}}>
                  <path d={arcPath(rr,sh,eh)} fill="none" stroke={color}
                    strokeWidth={isH?18:isL?15:11} strokeLinecap="round" pointerEvents="none"
                    style={{transition:"stroke-width 0.20s,opacity 0.20s",
                      opacity:isDim?0.15:1,
                      filter:isH?`drop-shadow(0 0 8px ${color})`:"none"}}/>
                  <path d={arcPath(rr,sh,eh)} fill="none" stroke="transparent"
                    strokeWidth={36} strokeLinecap="round" pointerEvents="all"/>
                  <title>{ev.title}</title>
                </g>
              );
            })}

            {/* Day-start marker */}
            {(() => {
              const a=angleForHour(DAY_START_HOUR);
              const p0=polar(cx,cy,rOuter-16,a), p1=polar(cx,cy,rOuter+12,a);
              return <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y}
                stroke={palette.accent} strokeWidth={3} strokeLinecap="round"/>;
            })()}

            <circle cx={cx} cy={cy} r={9} fill={palette.graphite} opacity={0.90}/>

            </g>{/* end scale group */}
          </svg>
          <div style={{fontSize:11,color:"rgba(20,19,18,0.40)",letterSpacing:"0.06em",marginTop:4,textAlign:"center"}}>
            Hover arcs · blue = connected · red = conflict
          </div>
        </div>

        {/* ---- Horizontal swimlane schedule ---- */}
        <div style={{display:"grid", gap:0, borderRadius:18,
          border:`1px solid ${palette.hairline}`, overflow:"hidden",
          background:"rgba(255,255,255,0.18)"}}>

          {/* Time header */}
          <div style={{display:"grid",
            gridTemplateColumns:`80px repeat(${SWIM_END - SWIM_START}, 1fr)`,
            borderBottom:`1px solid ${palette.hairline}`,
            background:"rgba(255,255,255,0.30)"}}>
            <div style={{padding:"8px 10px", fontSize:10, color:"rgba(20,19,18,0.40)",
              letterSpacing:"0.10em", textTransform:"uppercase"}}>Lane</div>
            {swimHours.slice(0,-1).map(h => (
              <div key={h} style={{padding:"8px 0", fontSize:9,
                color:"rgba(20,19,18,0.38)", letterSpacing:"0.06em",
                textAlign:"center", borderLeft:`1px solid ${palette.hairline}`}}>
                {h===12?"noon":h>12?`${h-12}p`:`${h}a`}
              </div>
            ))}
          </div>

          {/* One row per lane */}
          {lanes.map((lane, laneIdx) => {
            const laneEvents = events
              .filter(e => e.lane===lane)
              .sort((a,b) => (a.startHour??0)-(b.startHour??0));
            const lc = LANE_COLORS[lane];
            const bg = LANE_BG[lane];
            const isLastLane = laneIdx === lanes.length - 1;

            return (
              <div key={lane} style={{display:"grid",
                gridTemplateColumns:`80px 1fr`,
                borderBottom: isLastLane ? "none" : `1px solid ${palette.hairline}`,
                minHeight:44}}>

                {/* Lane label cell */}
                <div style={{display:"flex", alignItems:"center", padding:"0 10px",
                  borderRight:`1px solid ${palette.hairline}`,
                  background:bg}}>
                  <div style={{width:6, height:6, borderRadius:999,
                    background:lc, marginRight:7, flexShrink:0}}/>
                  <span style={{fontSize:10, fontWeight:600, letterSpacing:"0.10em",
                    textTransform:"uppercase", color:lc}}>{lane}</span>
                </div>

                {/* Timeline cell */}
                <div style={{position:"relative", overflow:"hidden"}}>
                  {/* Hour grid lines */}
                  {swimHours.slice(0,-1).map((h,i) => (
                    <div key={h} style={{
                      position:"absolute", top:0, bottom:0,
                      left:`${(i/(SWIM_END-SWIM_START))*100}%`,
                      width:1, background:palette.hairline, pointerEvents:"none"}}/>
                  ))}

                  {/* Travel trip bar — full-width block in Travel row */}
                  {lane === "Travel" && tripsForDay.map(t => (
                    <div key={`trip-bar-${t.id}`} style={{
                      position:"absolute", inset:"6px 2px",
                      borderRadius:6,
                      background: LANE_COLORS["Travel"],
                      opacity:0.18,
                      pointerEvents:"none",
                    }}/>
                  ))}
                  {lane === "Travel" && tripsForDay.map(t => (
                    <div key={`trip-label-${t.id}`} style={{
                      position:"absolute", top:0, bottom:0, left:6,
                      display:"flex", alignItems:"center",
                      pointerEvents:"none",
                    }}>
                      <span style={{fontSize:9, fontWeight:700, letterSpacing:"0.10em",
                        color: LANE_COLORS["Travel"], textTransform:"uppercase", opacity:0.70}}>
                        ✈ {t.title}
                      </span>
                    </div>
                  ))}

                  {/* Event bars */}
                  {laneEvents.map(ev => {
                    const sh = Math.max(ev.startHour??SWIM_START, SWIM_START);
                    const eh = Math.min(ev.endHour??sh+1, SWIM_END);
                    const total = SWIM_END - SWIM_START;
                    const left = ((sh - SWIM_START) / total) * 100;
                    const width = Math.max(((eh - sh) / total) * 100, 2);
                    const isHov = hoveredEventId===ev.id;
                    return (
                      <button
                        key={ev.id}
                        onClick={() => onEditEvent(ev)}
                        onMouseEnter={() => setHoveredEventId(ev.id)}
                        onMouseLeave={() => setHoveredEventId(null)}
                        title={ev.title}
                        style={{
                          position:"absolute",
                          left:`${left}%`, width:`${width}%`,
                          top:6, bottom:6,
                          borderRadius:6,
                          background:lc,
                          opacity: hoveredEventId && !isHov &&
                            !getLinkedEvents(hoveredEventId).some(e=>e.id===ev.id)
                            ? 0.25 : isHov ? 1 : 0.82,
                          border:"none",
                          cursor:"pointer",
                          padding:"0 6px",
                          overflow:"hidden",
                          display:"flex", alignItems:"center",
                          boxShadow: isHov ? `0 2px 10px ${lc}55` : "none",
                          transition:"opacity 0.18s, box-shadow 0.18s",
                          minWidth:4,
                        }}>
                        {width > 8 && (
                          <span style={{fontSize:9, color:"#fff", fontWeight:600,
                            letterSpacing:"0.06em", whiteSpace:"nowrap",
                            overflow:"hidden", textOverflow:"ellipsis"}}>
                            {ev.title}
                          </span>
                        )}
                      </button>
                    );
                  })}

                  {/* Empty state hint */}
                  {laneEvents.length === 0 && (
                    <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",
                      paddingLeft:10}}>
                      <span style={{fontSize:10,color:"rgba(20,19,18,0.20)",
                        letterSpacing:"0.06em"}}>no events</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Travel trip panel — status + expandable Helm signals */}
          {tripsForDay.length > 0 && (
            <div style={{borderTop:`1px solid ${palette.hairline}`,
              background:LANE_BG["Travel"]}}>
              {/* Trip header row */}
              <div style={{padding:"10px 14px", display:"flex", gap:12,
                flexWrap:"wrap", alignItems:"center", justifyContent:"space-between"}}>
                <div style={{display:"flex", gap:12, flexWrap:"wrap"}}>
                  {tripsForDay.map(t => (
                    <div key={t.id} style={{display:"flex",gap:10,alignItems:"center"}}>
                      <div style={{width:6,height:6,borderRadius:999,
                        background:LANE_COLORS["Travel"],flexShrink:0}}/>
                      <span style={{fontSize:11,fontWeight:600,color:LANE_COLORS["Travel"]}}>
                        {t.title}</span>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                        <span style={{...chipStyle(),padding:"2px 7px",fontSize:10}}>
                          ✈ Flight: {statusLabel(t.status.flight)}</span>
                        <span style={{...chipStyle(),padding:"2px 7px",fontSize:10}}>
                          🏨 Lodging: {statusLabel(t.status.lodging)}</span>
                        <span style={{...chipStyle(),padding:"2px 7px",fontSize:10}}>
                          🚗 Transport: {statusLabel(t.status.transport)}</span>
                        <span style={{
                          ...chipStyle(), padding:"2px 7px", fontSize:10,
                          background:"rgba(184,64,96,0.10)",
                          border:"1px solid rgba(184,64,96,0.25)",
                          color:"#b84060", fontWeight:600,
                        }}>
                          📷 Camera</span>
                      </div>
                    </div>
                  ))}
                </div>
                {tripSignals.length > 0 && (
                  <button onClick={() => setSignalsOpen(o => !o)} style={{
                    background:"none", border:`1px solid ${LANE_COLORS["Travel"]}44`,
                    borderRadius:999, padding:"3px 10px", fontSize:10, fontWeight:600,
                    color:LANE_COLORS["Travel"], cursor:"pointer", letterSpacing:"0.06em",
                    opacity:0.80,
                  }}>
                    {signalsOpen ? "▲ Hide" : `▼ ${tripSignals.length} signal${tripSignals.length>1?"s":""}`}
                  </button>
                )}
              </div>

              {/* Expanded signal cards */}
              {signalsOpen && tripSignals.length > 0 && (
                <div style={{padding:"0 14px 14px", display:"flex", flexDirection:"column", gap:8}}>
                  {tripSignals.map(s => {
                    const pillarColors: Record<string,string> = {
                      Travel:"#7c5cb5", Growth:"#4f6eb0", Family:"#c07840",
                      Photography:"#b84060", Finances:"#a08c2a",
                    };
                    const pc = pillarColors[s.pillar] ?? LANE_COLORS["Travel"];
                    const date = new Date(s.timestamp).toLocaleDateString(undefined,
                      {month:"short", day:"numeric"});
                    return (
                      <div key={s.id} style={{
                        background:"rgba(255,255,255,0.55)",
                        border:`1px solid ${palette.hairline}`,
                        borderLeft:`3px solid ${pc}`,
                        borderRadius:8, padding:"10px 12px",
                        display:"flex", gap:10,
                      }}>
                        <div style={{flexShrink:0, paddingTop:1}}>
                          <span style={{
                            fontSize:9, fontWeight:700, letterSpacing:"0.10em",
                            color:pc, background:`${pc}18`,
                            padding:"2px 7px", borderRadius:999,
                            border:`1px solid ${pc}33`,
                          }}>{s.pillar.toUpperCase()}</span>
                        </div>
                        <div style={{flex:1, minWidth:0}}>
                          <div style={{fontSize:11, color:"rgba(20,19,18,0.80)",
                            lineHeight:1.5, marginBottom:6}}>
                            {s.signal}
                          </div>
                          <div style={{display:"flex", gap:5, flexWrap:"wrap"}}>
                            {(s.tags||[]).map(tag => (
                              <span key={tag} style={{
                                fontSize:9, color:"rgba(20,19,18,0.45)",
                                background:"rgba(20,19,18,0.06)",
                                padding:"1px 6px", borderRadius:999,
                              }}>{tag}</span>
                            ))}
                            <span style={{fontSize:9, color:"rgba(20,19,18,0.30)",
                              marginLeft:"auto"}}>{date}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- HelmView ----------
const HELM_PILLARS: { key: string; label: string; icon: string; color: string; bg: string; insight: string }[] = [
  {
    key: "Growth",
    label: "Growth & Development",
    icon: "⬡",
    color: "#4f6eb0",
    bg: "rgba(79,110,176,0.07)",
    insight: "Future: Helm can cross-reference DBA trainings & conferences with your Travel calendar — find events near Houston, Lagos, or any upcoming trip.",
  },
  {
    key: "Travel",
    label: "Travel",
    icon: "✈",
    color: "#7c5cb5",
    bg: "rgba(124,92,181,0.07)",
    insight: "Future: Helm can suggest optimal trip windows based on Work load and Family commitments.",
  },
  {
    key: "Family",
    label: "Family",
    icon: "◎",
    color: "#c07840",
    bg: "rgba(192,120,64,0.07)",
    insight: "Future: Helm can flag Family signals that overlap with Travel periods.",
  },
  {
    key: "Photography",
    label: "Photography",
    icon: "◈",
    color: "#b84060",
    bg: "rgba(184,64,96,0.07)",
    insight: "Future: Helm can cluster location ideas from Photography signals onto your Travel map.",
  },
  {
    key: "Finances",
    label: "Finances",
    icon: "◇",
    color: "#a08c2a",
    bg: "rgba(160,140,42,0.07)",
    insight: "Future: Helm can surface spending signals aligned with upcoming trips or goals.",
  },
];

type PillarDigest = {
  signal_count: number;
  week_count: number;
  suggestions: { action: string; generated_at: string; source: string }[];
  top_tags: string[];
  cross_pillars: string[];
};
type HelmDigestData = {
  generated_at: string;
  lookback_days: number;
  capture_signals: number;
  gmail_signals: number;
  active_pillars: string[];
  bridges: { tag: string; pillars: string[] }[];
  needs_review_count: number;
  needs_review: { fetched: string; sender: string; subject: string }[];
  pillars: Record<string, PillarDigest>;
};

function HelmDigest() {
  const [digest, setDigest] = useState<HelmDigestData | null>(null);
  const [open, setOpen] = useState(true);
  const [actioned, setActioned] = useState<Record<string, "pin" | "on_it" | "not_relevant">>({});

  useEffect(() => {
    fetch("http://localhost:7777/digest")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((d: HelmDigestData) => setDigest(d))
      .catch(() => setDigest(null));
  }, []);

  const handleAction = (suggestion: string, pillar: string, action: "pin"|"unpin"|"on_it"|"not_relevant") => {
    setActioned(prev => {
      const next = { ...prev };
      if (action === "unpin") delete next[suggestion];
      else next[suggestion] = action;
      return next;
    });
    if (action !== "unpin") {
      fetch("http://localhost:7777/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestion, pillar, action }),
      }).catch(() => {});
    }
  };

  if (!digest) return null;

  const pillarColor: Record<string, string> = {
    Growth:"#4f6eb0", Travel:"#7c5cb5", Family:"#c07840",
    Photography:"#b84060", Finances:"#a08c2a",
  };

  // Derive flat arrays from nested pillars structure
  const suggestions = Object.entries(digest.pillars || {})
    .flatMap(([pillar, pd]) => (pd.suggestions || []).map(s => ({ pillar, action: s.action })));
  const top_tags = [...new Set(
    Object.values(digest.pillars || {}).flatMap(pd => pd.top_tags || [])
  )].slice(0, 10);
  const week_count = Object.values(digest.pillars || {})
    .reduce((sum, pd) => sum + (pd.week_count || 0), 0);
  const total_count = (digest.capture_signals || 0) + (digest.gmail_signals || 0);

  return (
    <div style={{
      marginBottom: 20,
      background: "#0d0d1a",
      borderRadius: 16,
      border: "1px solid rgba(90,130,255,0.20)",
      overflow: "hidden",
    }}>
      {/* Digest header row */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 18px", background: "none", border: "none", cursor: "pointer",
          fontFamily: "inherit",
        }}>
        <div style={{display:"flex", alignItems:"center", gap:10}}>
          <span style={{color:"#5a82ff", fontSize:15}}>⬡</span>
          <span style={{color:"#e8e6e0", fontSize:12, fontWeight:700, letterSpacing:"0.12em",
            textTransform:"uppercase"}}>Helm Intelligence Digest</span>
          <span style={{
            background:"rgba(90,130,255,0.15)", color:"#5a82ff",
            fontSize:10, fontWeight:600, padding:"2px 8px", borderRadius:999,
            letterSpacing:"0.08em",
          }}>
            {week_count} this week
          </span>
        </div>
        <span style={{color:"rgba(232,230,224,0.40)", fontSize:11}}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{padding:"0 18px 18px", display:"flex", flexDirection:"column", gap:16}}>
          <div style={{height:1, background:"rgba(90,130,255,0.12)"}}/>

          {/* Suggestions row */}
          <div>
            <div style={{fontSize:10, letterSpacing:"0.16em", textTransform:"uppercase",
              color:"rgba(232,230,224,0.40)", marginBottom:10}}>Action Items</div>
            <div style={{display:"flex", flexDirection:"column", gap:8}}>
              {/* Pinned suggestions always float to top */}
              {[
                ...suggestions.filter(s => actioned[s.action] === "pin"),
                ...suggestions.filter(s => !actioned[s.action]),
                ...suggestions.filter(s => actioned[s.action] === "on_it"),
              ].filter(s => actioned[s.action] !== "not_relevant").map(s => {
                const state = actioned[s.action] as "pin"|"on_it"|"not_relevant"|undefined;
                const pc = pillarColor[s.pillar] ?? "#5a82ff";
                const isPinned = state === "pin";
                const isOnIt   = state === "on_it";
                return (
                  <div key={`${s.pillar}-${s.action}`} style={{
                    display:"flex", gap:10, alignItems:"flex-start",
                    background: isPinned
                      ? `${pc}12`
                      : isOnIt ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.04)",
                    borderRadius:10, padding:"10px 12px",
                    border: isPinned
                      ? `1px solid ${pc}35`
                      : isOnIt ? "1px solid rgba(255,255,255,0.03)" : "1px solid rgba(255,255,255,0.06)",
                    opacity: isOnIt ? 0.40 : 1,
                    transition:"all 0.25s",
                  }}>
                    {/* Pin indicator */}
                    {isPinned && (
                      <span style={{fontSize:9, color:pc, flexShrink:0, marginTop:3}}>●</span>
                    )}
                    <span style={{
                      fontSize:10, fontWeight:700, letterSpacing:"0.10em",
                      color: pc, background:`${pc}22`,
                      padding:"2px 8px", borderRadius:999, whiteSpace:"nowrap", flexShrink:0,
                      border:`1px solid ${pc}44`, marginTop:1,
                    }}>
                      {s.pillar.toUpperCase()}
                    </span>
                    <span style={{
                      flex:1, fontSize:12,
                      color: isOnIt ? "rgba(232,230,224,0.40)" : "rgba(232,230,224,0.82)",
                      lineHeight:1.5,
                    }}>
                      {s.action}
                    </span>
                    {/* Reaction buttons — always visible, active state shows clearly */}
                    <div style={{display:"flex", gap:3, flexShrink:0, marginTop:1}}>
                      <button
                        onClick={() => handleAction(s.action, s.pillar, isPinned ? "unpin" : "pin")}
                        title={isPinned ? "Unpin" : "Keep this — important"}
                        style={{
                          background: isPinned ? `${pc}30` : "rgba(255,255,255,0.05)",
                          border: isPinned ? `1px solid ${pc}60` : "1px solid rgba(255,255,255,0.10)",
                          borderRadius:6, color: isPinned ? pc : "rgba(232,230,224,0.35)",
                          fontSize:12, cursor:"pointer", padding:"2px 8px", lineHeight:1,
                          fontWeight: isPinned ? 700 : 400,
                        }}>+</button>
                      <button
                        onClick={() => handleAction(s.action, s.pillar, isOnIt ? "unpin" : "on_it")}
                        title="On it"
                        style={{
                          background: isOnIt ? "rgba(80,200,120,0.12)" : "rgba(255,255,255,0.05)",
                          border: isOnIt ? "1px solid rgba(80,200,120,0.35)" : "1px solid rgba(255,255,255,0.10)",
                          borderRadius:6,
                          color: isOnIt ? "rgba(80,200,120,0.80)" : "rgba(232,230,224,0.35)",
                          fontSize:11, cursor:"pointer", padding:"2px 8px", lineHeight:1,
                        }}>→</button>
                      <button
                        onClick={() => handleAction(s.action, s.pillar, "not_relevant")}
                        title="Not relevant right now"
                        style={{
                          background:"rgba(255,255,255,0.05)",
                          border:"1px solid rgba(255,255,255,0.08)",
                          borderRadius:6, color:"rgba(232,230,224,0.20)",
                          fontSize:11, cursor:"pointer", padding:"2px 8px", lineHeight:1,
                        }}>✕</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cross-pillar bridges */}
          {(digest.bridges || []).length > 0 && (
            <div>
              <div style={{fontSize:10, letterSpacing:"0.16em", textTransform:"uppercase",
                color:"rgba(232,230,224,0.40)", marginBottom:8}}>Cross-Pillar Bridges</div>
              <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
                {(digest.bridges || []).map(b => (
                  <div key={b.tag} style={{
                    background:"rgba(90,130,255,0.10)", border:"1px solid rgba(90,130,255,0.25)",
                    borderRadius:999, padding:"4px 12px", display:"flex", alignItems:"center", gap:6,
                  }}>
                    <span style={{fontSize:11, color:"#5a82ff", fontWeight:600}}>{b.tag}</span>
                    <span style={{fontSize:10, color:"rgba(232,230,224,0.40)"}}>
                      {b.pillars.join(" · ")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(digest.bridges || []).length === 0 && (
            <div style={{fontSize:11, color:"rgba(232,230,224,0.30)", letterSpacing:"0.04em",
              fontStyle:"italic"}}>
              No cross-pillar bridges yet — capture signals across more pillars to unlock connections.
            </div>
          )}

          {/* Top tags */}
          {top_tags.length > 0 && (
            <div>
              <div style={{fontSize:10, letterSpacing:"0.16em", textTransform:"uppercase",
                color:"rgba(232,230,224,0.40)", marginBottom:8}}>Momentum Tags</div>
              <div style={{display:"flex", gap:6, flexWrap:"wrap"}}>
                {top_tags.map(t => (
                  <div key={t} style={{
                    background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.10)",
                    borderRadius:999, padding:"3px 10px", fontSize:11,
                    color:"rgba(232,230,224,0.60)",
                  }}>
                    {t}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{fontSize:10, color:"rgba(232,230,224,0.22)", letterSpacing:"0.04em",
            borderTop:"1px solid rgba(90,130,255,0.10)", paddingTop:10}}>
            Generated {new Date(digest.generated_at).toLocaleString(undefined,
              {month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})} · {total_count} total signals
          </div>
        </div>
      )}
    </div>
  );
}

function HelmView({ palette: _palette, travelTrips: _travelTrips, helmToken }: { palette: Palette; travelTrips: TravelTrip[]; helmToken?: string }) {
  const [signals, setSignals] = useState<HelmSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [deployStatus, setDeployStatus] = useState<string | null>(null);
  const [restartPassword, setRestartPassword] = useState("");
  const [restarting, setRestarting] = useState(false);
  const [restartStatus, setRestartStatus] = useState<string | null>(null);

  const loadSignals = useCallback(() => {
    setLoading(true);
    fetch("http://localhost:7777/signals")
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: HelmSignal[]) => {
        const clean = data.map(s => {
          let sig = s.signal || "";
          if (sig.startsWith("```")) {
            const inner = sig.split("```")[1] || "";
            try {
              const parsed = JSON.parse(inner.startsWith("json") ? inner.slice(4) : inner);
              sig = (parsed as { signal?: string }).signal || sig;
            } catch { /* leave as-is */ }
          }
          return { ...s, signal: sig };
        });
        setSignals(clean);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadSignals(); }, [loadSignals]);

  // ── Refresh pipeline: fetches new emails + regenerates suggestions ──
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (helmToken) headers["Authorization"] = `Bearer ${helmToken}`;
    fetch("http://localhost:7777/refresh", { method: "POST", headers })
      .then(r => r.json())
      .then(() => {
        setLastRefresh(new Date().toLocaleTimeString(undefined, { hour:"numeric", minute:"2-digit" }));
        loadSignals(); // reload after pipeline runs
      })
      .catch(() => {})
      .finally(() => setRefreshing(false));
  }, [loadSignals, helmToken]);

  // ── Deploy: rebuild MyAtlas .app from latest source code ──
  const handleDeploy = useCallback(() => {
    if (!confirm("Rebuild MyAtlas? This may take a few minutes. You'll need to quit and reopen the app when done.")) return;
    setDeploying(true);
    setDeployStatus("Building…");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (helmToken) headers["Authorization"] = `Bearer ${helmToken}`;
    fetch("http://localhost:7777/deploy", { method: "POST", headers })
      .then(r => r.json())
      .then((data: { ok: boolean; steps?: Array<{ step: string; exit_code: number }> }) => {
        if (data.ok) {
          setDeployStatus("Build complete — quit & reopen MyAtlas to apply");
        } else {
          const failed = data.steps?.find(s => s.exit_code !== 0);
          setDeployStatus(`Build failed at ${failed?.step || "unknown"}`);
        }
      })
      .catch(() => setDeployStatus("Deploy request failed — is Helm server running?"))
      .finally(() => setDeploying(false));
  }, [helmToken]);

  // ── Restart: password-gated Helm server recovery via Tauri Rust backend ──
  const handleRestart = useCallback(async () => {
    if (!restartPassword.trim()) return;
    setRestarting(true);
    setRestartStatus("Restarting Helm server…");
    try {
      const result = await invoke<string>("restart_helm_server", { password: restartPassword });
      setRestartStatus(result);
      setRestartPassword("");
      setError(null); // clear error state so HelmView exits error UI
      setTimeout(() => {
        loadSignals();
        setRestartStatus(null);
      }, 1500);
    } catch (e: unknown) {
      const err = String(e);
      if (err.includes("WRONG_PASSWORD")) {
        setRestartStatus("Incorrect password");
      } else if (err.includes("NO_HASH_FILE")) {
        setRestartStatus("Restart not configured — contact team");
      } else if (err.includes("PORT_STILL_BUSY")) {
        setRestartStatus("Could not free port 7777 — try again in 30s");
      } else if (err.includes("SPAWN_FAILED")) {
        setRestartStatus("Could not start server — check Python installation");
      } else if (err.includes("TIMEOUT")) {
        setRestartStatus("Server started but not responding — check helm_web.py for errors");
      } else {
        setRestartStatus(`Restart failed: ${err}`);
      }
    } finally {
      setRestarting(false);
    }
  }, [restartPassword, loadSignals]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    signals.forEach(sig => (sig.tags || []).forEach(t => s.add(t)));
    return Array.from(s).sort();
  }, [signals]);

  const filtered = useMemo(() => {
    if (!activeTag) return signals;
    return signals.filter(s => (s.tags || []).includes(activeTag));
  }, [signals, activeTag]);

  const byPillar = useMemo(() => {
    const m: Record<string, HelmSignal[]> = {};
    HELM_PILLARS.forEach(p => { m[p.key] = []; });
    filtered.forEach(s => {
      if (m[s.pillar]) m[s.pillar].push(s);
      else m["Growth"].push(s);
    });
    return m;
  }, [filtered]);

  if (loading) return (
    <div style={{padding:40,textAlign:"center",color:"rgba(20,19,18,0.40)",fontSize:13,letterSpacing:"0.08em"}}>
      ⬡ &nbsp;Loading Helm signals…
    </div>
  );

  if (error) return (
    <div style={{padding:40}}>
      <div style={{fontSize:13,color:"#b84060",marginBottom:8,fontWeight:600}}>
        ⚠ Could not reach Helm server
      </div>
      <div style={{fontSize:12,color:"rgba(20,19,18,0.50)",marginBottom:16}}>
        Enter your restart password to bring the server back online.
      </div>

      {/* Password input + restart button */}
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10}}>
        <input
          type="password"
          placeholder="Restart password"
          value={restartPassword}
          onChange={e => setRestartPassword(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleRestart(); }}
          disabled={restarting}
          style={{
            flex:1, padding:"8px 12px", fontSize:12,
            border:"1px solid rgba(20,19,18,0.15)", borderRadius:8,
            background:"rgba(255,255,255,0.80)",
            color:"rgba(20,19,18,0.70)", outline:"none",
            letterSpacing:"0.04em",
          }}
        />
        <button
          onClick={handleRestart}
          disabled={restarting || !restartPassword.trim()}
          style={{
            padding:"8px 16px", fontSize:11, fontWeight:600,
            letterSpacing:"0.06em",
            background: restarting ? "rgba(20,19,18,0.05)" : "#b84060",
            color: restarting ? "rgba(20,19,18,0.30)" : "#fff",
            border:"none", borderRadius:8,
            cursor: restarting ? "wait" : "pointer",
            transition:"all 0.15s",
          }}>
          {restarting ? "Restarting…" : "⟳ Restart Server"}
        </button>
      </div>

      {/* Password hint */}
      <div style={{fontSize:10,color:"rgba(20,19,18,0.30)",letterSpacing:"0.04em",marginBottom:8}}>
        Hint: shoulder shrug
      </div>

      {/* Status feedback */}
      {restartStatus && (
        <div style={{fontSize:11, padding:"6px 10px", borderRadius:6, marginBottom:8,
          background: restartStatus.includes("restarted") ? "rgba(40,120,60,0.08)" : "rgba(180,64,96,0.08)",
          color: restartStatus.includes("restarted") ? "rgba(40,120,60,0.8)" : "rgba(180,64,96,0.8)",
          letterSpacing:"0.03em"}}>
          {restartStatus}
        </div>
      )}

      {/* Debug info */}
      <div style={{fontSize:10,color:"rgba(20,19,18,0.25)",marginTop:8}}>
        Debug: {error}
      </div>
    </div>
  );

  return (
    <div style={{display:"flex",flexDirection:"column",gap:0}}>

      {/* Refresh bar */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:8,
        padding:"6px 0",marginBottom:4}}>
        {lastRefresh && (
          <span style={{fontSize:10,color:"rgba(20,19,18,0.35)",letterSpacing:"0.06em"}}>
            Last refresh: {lastRefresh}
          </span>
        )}
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            background:"transparent",border:"1px solid rgba(20,19,18,0.15)",
            borderRadius:6,padding:"4px 12px",fontSize:11,letterSpacing:"0.06em",
            color: refreshing ? "rgba(20,19,18,0.30)" : "rgba(20,19,18,0.55)",
            cursor: refreshing ? "wait" : "pointer",transition:"all 0.15s",
          }}>
          {refreshing ? "Refreshing…" : "⟳ Refresh pipeline"}
        </button>
        <button
          onClick={handleDeploy}
          disabled={deploying}
          style={{
            background:"transparent",border:"1px solid rgba(20,19,18,0.10)",
            borderRadius:6,padding:"4px 12px",fontSize:11,letterSpacing:"0.06em",
            color: deploying ? "rgba(20,19,18,0.30)" : "rgba(20,19,18,0.40)",
            cursor: deploying ? "wait" : "pointer",transition:"all 0.15s",
          }}>
          {deploying ? "Building…" : "⬡ Deploy"}
        </button>
      </div>
      {deployStatus && (
        <div style={{textAlign:"right",fontSize:10,color: deployStatus.includes("complete") ? "rgba(40,120,60,0.7)" : "rgba(180,64,96,0.7)",
          padding:"2px 0",letterSpacing:"0.04em"}}>
          {deployStatus}
        </div>
      )}

      {/* Intelligence Digest */}
      <HelmDigest />

      {/* Tag filter bar */}
      {allTags.length > 0 && (
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:20,alignItems:"center"}}>
          <span style={{fontSize:11,letterSpacing:"0.10em",textTransform:"uppercase",
            color:"rgba(20,19,18,0.40)",marginRight:4}}>Filter</span>
          <button
            onClick={() => setActiveTag(null)}
            style={buttonStyle({
              padding:"4px 10px",fontSize:11,
              background: !activeTag ? "rgba(20,19,18,0.08)" : "transparent",
              fontWeight: !activeTag ? 600 : 400,
            })}>
            All
          </button>
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => setActiveTag(t => t === tag ? null : tag)}
              style={buttonStyle({
                padding:"4px 10px",fontSize:11,
                background: activeTag === tag ? "#0d0d1a" : "transparent",
                color: activeTag === tag ? "#5a82ff" : "rgba(20,19,18,0.60)",
                border: activeTag === tag ? "1px solid #5a82ff" : "1px solid rgba(20,19,18,0.12)",
              })}>
              {tag}
            </button>
          ))}
        </div>
      )}

      <div style={{height:1,background:"rgba(20,19,18,0.07)",marginBottom:18}}/>

      {/* Pillar buckets */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:16}}>
        {HELM_PILLARS.map(pillar => {
          const sigs = byPillar[pillar.key] || [];
          return (
            <div key={pillar.key} style={{
              background: pillar.bg,
              border:`1px solid ${pillar.color}22`,
              borderRadius:16,
              padding:"16px 18px",
              display:"flex",flexDirection:"column",gap:10,
            }}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:16,color:pillar.color}}>{pillar.icon}</span>
                <span style={{fontSize:12,fontWeight:700,letterSpacing:"0.10em",
                  textTransform:"uppercase",color:pillar.color}}>
                  {pillar.label}
                </span>
                <span style={{marginLeft:"auto",fontSize:11,
                  color:"rgba(20,19,18,0.35)",fontWeight:500}}>
                  {sigs.length} signal{sigs.length !== 1 ? "s" : ""}
                </span>
              </div>

              <div style={{height:1,background:`${pillar.color}22`}}/>

              {sigs.length === 0 ? (
                <div style={{fontSize:12,color:"rgba(20,19,18,0.30)",
                  padding:"12px 0",textAlign:"center",letterSpacing:"0.04em"}}>
                  No signals yet
                </div>
              ) : (
                sigs.map(s => (
                  <div key={s.id} style={{
                    background:"rgba(255,255,255,0.60)",
                    borderRadius:10,
                    padding:"10px 12px",
                    border:"1px solid rgba(20,19,18,0.07)",
                  }}>
                    <div style={{fontSize:12,color:"rgba(20,19,18,0.72)",lineHeight:1.5,marginBottom:6}}>
                      {s.signal}
                    </div>
                    {(s.tags || []).length > 0 && (
                      <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                        {(s.tags || []).map(tag => (
                          <button
                            key={tag}
                            onClick={() => setActiveTag(t => t === tag ? null : tag)}
                            style={buttonStyle({
                              padding:"2px 7px",fontSize:10,
                              background: activeTag === tag ? "#0d0d1a" : "rgba(20,19,18,0.05)",
                              color: activeTag === tag ? "#5a82ff" : "rgba(20,19,18,0.50)",
                              border: activeTag === tag ? "1px solid #5a82ff" : "1px solid rgba(20,19,18,0.10)",
                            })}>
                            {tag}
                          </button>
                        ))}
                      </div>
                    )}
                    <div style={{marginTop:6,fontSize:10,color:"rgba(20,19,18,0.28)",letterSpacing:"0.04em"}}>
                      {new Date(s.timestamp).toLocaleDateString(undefined,
                        {month:"short",day:"numeric",year:"numeric"})}
                    </div>
                  </div>
                ))
              )}

              <div style={{
                marginTop:4,
                background:`${pillar.color}11`,
                border:`1px dashed ${pillar.color}44`,
                borderRadius:8,
                padding:"8px 10px",
                fontSize:11,
                color:`${pillar.color}bb`,
                lineHeight:1.5,
                letterSpacing:"0.02em",
              }}>
                <span style={{fontWeight:700,marginRight:4}}>↗</span>
                {pillar.insight}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{marginTop:20,borderTop:"1px solid rgba(20,19,18,0.08)",
        paddingTop:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:11,color:"rgba(20,19,18,0.35)",letterSpacing:"0.06em"}}>
          {signals.length} signal{signals.length !== 1 ? "s" : ""} captured total
        </span>
        <a href="http://localhost:7777" target="_blank" rel="noreferrer"
          style={{fontSize:11,color:"#5a82ff",textDecoration:"none",letterSpacing:"0.06em"}}>
          ⬡ Open Helm Capture →
        </a>
      </div>

      {/* Build version stamp — stale binary detection */}
      <div style={{marginTop:8,textAlign:"right",fontSize:9,color:"rgba(20,19,18,0.18)",
        letterSpacing:"0.08em",fontFamily:"monospace"}}>
        v{MYATLAS_BUILD} · {MYATLAS_BUILD_DATE}
      </div>
    </div>
  );
}
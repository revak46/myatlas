// MyAtlas Mobile — Main Screen
// Helm-powered briefing + natural language input
// Top half: today's lane summary + next event
// Bottom half: text input → ADD TO DIAL or SAVE TO NOTES

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  ActivityIndicator,
  Animated,
  Easing,
} from "react-native";
import {
  getEvents,
  getTodayBriefing,
  getNextEvent,
  saveEvent,
  getNotes,
  saveNote,
  deleteNote,
  fmtHour,
  uid,
  todayKey,
  LaneSummary,
  LifeEvent,
} from "../../utils/storage";
import {
  parseEntry,
  extractUrl,
  isUrl,
  EventLane,
} from "../../utils/parser";

// ── Lane colours (mirror desktop App.tsx) ──────────────────
const LANE_COLORS: Record<EventLane, string> = {
  Work:     "#4f6eb0",
  Family:   "#c07840",
  Health:   "#4d9e6a",
  Travel:   "#7c5cb5",
  Money:    "#a08c2a",
  Creative: "#b84060",
};

// ── Palette ────────────────────────────────────────────────
const C = {
  bg:         "#0f0f0f",
  surface:    "#1a1a1a",
  border:     "#2a2a2a",
  textPrimary:"#f0f0f0",
  textSecond: "#888",
  textMuted:  "#555",
  accent:     "#4f6eb0",
  pill:       "#1f1f1f",
};

// ── Helpers ────────────────────────────────────────────────
function fmt12(h: number): string { return fmtHour(h); }

function todayLabel(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// ── Lane Dot Row ───────────────────────────────────────────
function LaneDot({ summary }: { summary: LaneSummary }) {
  const color = LANE_COLORS[summary.lane];
  const active = summary.count > 0;
  return (
    <View style={styles.laneDotWrap}>
      <View style={[styles.dot, { backgroundColor: active ? color : C.border }]} />
      <Text style={[styles.laneLabel, { color: active ? color : C.textMuted }]}>
        {summary.lane.slice(0, 3).toUpperCase()}
      </Text>
      {active && (
        <Text style={[styles.laneCount, { color }]}>{summary.count}</Text>
      )}
    </View>
  );
}

// ── Next event banner ──────────────────────────────────────
function NextBanner({
  next,
}: {
  next: { lane: EventLane; title: string; startHour: number } | null;
}) {
  if (!next) {
    return (
      <View style={styles.nextBanner}>
        <Text style={styles.nextEmpty}>Nothing scheduled. Feed Helm something.</Text>
      </View>
    );
  }
  const color = LANE_COLORS[next.lane];
  return (
    <View style={[styles.nextBanner, { borderLeftColor: color }]}>
      <Text style={styles.nextLabel}>NEXT</Text>
      <Text style={styles.nextTitle} numberOfLines={1}>{next.title}</Text>
      <View style={styles.nextMeta}>
        <View style={[styles.laneChip, { borderColor: color }]}>
          <Text style={[styles.laneChipText, { color }]}>{next.lane}</Text>
        </View>
        <Text style={styles.nextTime}>{fmt12(next.startHour)}</Text>
      </View>
    </View>
  );
}

// ── Parse preview ──────────────────────────────────────────
function ParsePreview({ text }: { text: string }) {
  if (!text.trim()) return null;

  if (isUrl(text.trim())) {
    return (
      <View style={styles.previewBox}>
        <Text style={styles.previewIcon}>🔗</Text>
        <Text style={styles.previewText}>Link detected — will save to notes</Text>
      </View>
    );
  }

  const parsed = parseEntry(text);
  const color = LANE_COLORS[parsed.lane];
  const confColor =
    parsed.confidence === "high"   ? "#4d9e6a" :
    parsed.confidence === "medium" ? "#a08c2a" : C.textMuted;

  return (
    <View style={styles.previewBox}>
      <View style={styles.previewRow}>
        <View style={[styles.dot, { backgroundColor: color, marginRight: 6 }]} />
        <Text style={[styles.previewLane, { color }]}>{parsed.lane}</Text>
        <Text style={[styles.previewConf, { color: confColor }]}>
          {parsed.confidence}
        </Text>
      </View>
      <Text style={styles.previewTitle} numberOfLines={1}>{parsed.title}</Text>
      <Text style={styles.previewTime}>
        {parsed.date}  ·  {fmt12(parsed.startHour)} – {fmt12(parsed.endHour)}
      </Text>
    </View>
  );
}

// ── Notes list ─────────────────────────────────────────────
function NoteItem({
  note,
  onDelete,
}: {
  note: { id: string; text: string; url?: string; metadata?: { title?: string; artist?: string }; timestamp: string };
  onDelete: (id: string) => void;
}) {
  const ts = new Date(note.timestamp).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit",
  });

  const display = note.metadata?.artist
    ? `🎵 ${note.metadata.title ?? note.url ?? note.text}  —  ${note.metadata.artist}`
    : note.metadata?.title
    ? `🔗 ${note.metadata.title}`
    : note.url
    ? `🔗 ${note.url}`
    : note.text;

  return (
    <View style={styles.noteRow}>
      <View style={styles.noteContent}>
        <Text style={styles.noteText} numberOfLines={2}>{display}</Text>
        <Text style={styles.noteTs}>{ts}</Text>
      </View>
      <TouchableOpacity onPress={() => onDelete(note.id)} style={styles.noteDelete}>
        <Text style={styles.noteDeleteText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────
export default function HomeScreen() {
  const [briefing,   setBriefing]   = useState<LaneSummary[]>([]);
  const [nextEvent,  setNextEvent]  = useState<ReturnType<typeof getNextEvent>>(null);
  const [input,      setInput]      = useState("");
  const [notes,      setNotes]      = useState<Awaited<ReturnType<typeof getNotes>>>([]);
  const [tab,        setTab]        = useState<"briefing" | "notes">("briefing");
  const [saving,     setSaving]     = useState(false);
  const [feedback,   setFeedback]   = useState<string | null>(null);

  const flashAnim = useRef(new Animated.Value(0)).current;
  const inputRef  = useRef<TextInput>(null);

  // ── Load data ──────────────────────────────────────────
  const refresh = useCallback(async () => {
    const b = await getTodayBriefing();
    setBriefing(b);
    setNextEvent(getNextEvent(b));
    const n = await getNotes();
    setNotes(n);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Flash feedback ─────────────────────────────────────
  const flash = (msg: string) => {
    setFeedback(msg);
    flashAnim.setValue(1);
    Animated.timing(flashAnim, {
      toValue: 0,
      duration: 2000,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start(() => setFeedback(null));
  };

  // ── ADD TO DIAL ────────────────────────────────────────
  const handleAdd = async () => {
    const raw = input.trim();
    if (!raw || saving) return;
    setSaving(true);
    Keyboard.dismiss();

    try {
      const parsed = parseEntry(raw);
      const event: LifeEvent = {
        id:        uid(),
        title:     parsed.title,
        lane:      parsed.lane,
        type:      "plan",
        status:    "not_started",
        date:      parsed.date,
        startHour: parsed.startHour,
        endHour:   parsed.endHour,
        notes:     raw,
        tags:      [],
        source:    "mobile",
        createdAt: new Date().toISOString(),
      };
      await saveEvent(event);
      setInput("");
      await refresh();
      flash(`Added to ${parsed.lane} · ${fmt12(parsed.startHour)}`);
    } catch {
      flash("Could not parse — try again");
    } finally {
      setSaving(false);
    }
  };

  // ── SAVE TO NOTES ──────────────────────────────────────
  const handleSave = async () => {
    const raw = input.trim();
    if (!raw || saving) return;
    setSaving(true);
    Keyboard.dismiss();

    try {
      const url = extractUrl(raw) ?? (isUrl(raw) ? raw : undefined);
      const note = {
        id:        uid(),
        text:      raw,
        url,
        metadata:  url ? await fetchMeta(url) : undefined,
        timestamp: new Date().toISOString(),
      };
      await saveNote(note);
      setInput("");
      setTab("notes");
      await refresh();
      flash("Saved to notes");
    } catch {
      flash("Save failed — try again");
    } finally {
      setSaving(false);
    }
  };

  // ── Delete note ────────────────────────────────────────
  const handleDeleteNote = async (id: string) => {
    await deleteNote(id);
    await refresh();
  };

  // ── Render ─────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>MyAtlas</Text>
        <Text style={styles.headerDate}>{todayLabel()}</Text>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === "briefing" && styles.tabBtnActive]}
          onPress={() => setTab("briefing")}
        >
          <Text style={[styles.tabText, tab === "briefing" && styles.tabTextActive]}>
            TODAY
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === "notes" && styles.tabBtnActive]}
          onPress={() => setTab("notes")}
        >
          <Text style={[styles.tabText, tab === "notes" && styles.tabTextActive]}>
            NOTES {notes.length > 0 ? `(${notes.length})` : ""}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content pane */}
      <ScrollView
        style={styles.pane}
        contentContainerStyle={styles.paneContent}
        keyboardShouldPersistTaps="handled"
      >
        {tab === "briefing" ? (
          <>
            {/* Lane dots */}
            <View style={styles.laneRow}>
              {briefing.map(s => <LaneDot key={s.lane} summary={s} />)}
            </View>

            {/* Next event */}
            <NextBanner next={nextEvent} />

            {/* Event list for today */}
            {briefing.some(b => b.count > 0) && (
              <TodayEventList briefing={briefing} />
            )}
          </>
        ) : (
          <>
            {notes.length === 0 ? (
              <Text style={styles.emptyNotes}>No notes yet. Type something below.</Text>
            ) : (
              notes.map(n => (
                <NoteItem key={n.id} note={n} onDelete={handleDeleteNote} />
              ))
            )}
          </>
        )}
      </ScrollView>

      {/* Input area */}
      <View style={styles.inputArea}>
        {/* Parse preview */}
        <ParsePreview text={input} />

        {/* Feedback flash */}
        {feedback && (
          <Animated.View style={[styles.feedbackBar, { opacity: flashAnim }]}>
            <Text style={styles.feedbackText}>{feedback}</Text>
          </Animated.View>
        )}

        <TextInput
          ref={inputRef}
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Paste a link or type anything…"
          placeholderTextColor={C.textMuted}
          multiline
          maxLength={500}
          returnKeyType="default"
        />

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary, !input.trim() && styles.btnDisabled]}
            onPress={handleAdd}
            disabled={!input.trim() || saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.btnTextPrimary}>ADD TO DIAL</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, styles.btnSecondary, !input.trim() && styles.btnDisabled]}
            onPress={handleSave}
            disabled={!input.trim() || saving}
          >
            <Text style={styles.btnTextSecondary}>SAVE</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Today event list (inline) ──────────────────────────────
function TodayEventList({ briefing }: { briefing: LaneSummary[] }) {
  const [events, setEvents] = useState<LifeEvent[]>([]);

  useEffect(() => {
    getEvents().then(all => {
      const today = todayKey();
      const todayEvents = all
        .filter(e => e.date === today)
        .sort((a, b) => a.startHour - b.startHour);
      setEvents(todayEvents);
    });
  }, [briefing]);

  if (!events.length) return null;

  return (
    <View style={styles.eventList}>
      <Text style={styles.sectionTitle}>ON THE DIAL</Text>
      {events.map(e => {
        const color = LANE_COLORS[e.lane];
        return (
          <View key={e.id} style={[styles.eventRow, { borderLeftColor: color }]}>
            <View style={styles.eventMain}>
              <Text style={styles.eventTitle} numberOfLines={1}>{e.title}</Text>
              <Text style={styles.eventMeta}>
                {fmt12(e.startHour)}–{fmt12(e.endHour)}  ·  {e.lane}
              </Text>
            </View>
            <View style={[styles.statusDot, { backgroundColor: statusColor(e.status) }]} />
          </View>
        );
      })}
    </View>
  );
}

function statusColor(s: LifeEvent["status"]): string {
  if (s === "done")       return "#4d9e6a";
  if (s === "in_progress")return "#a08c2a";
  if (s === "cancelled")  return "#555";
  return "#333";
}

// ── Lightweight metadata fetch ─────────────────────────────
// Pulls <title> and og:* tags from HTML. No API needed.
async function fetchMeta(url: string): Promise<{ title?: string; artist?: string; source?: string }> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "MyAtlas/1.0" } });
    const html = await res.text();

    const title =
      html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)?.[1] ??
      html.match(/<title>([^<]+)<\/title>/i)?.[1] ??
      undefined;

    // Spotify / YouTube: pull artist from og:description or structured meta
    const artist =
      html.match(/<meta[^>]+name="music:musician_description"[^>]+content="([^"]+)"/i)?.[1] ??
      html.match(/<meta[^>]+property="music:musician"[^>]+content="([^"]+)"/i)?.[1] ??
      undefined;

    const source =
      url.includes("spotify.com") ? "spotify" :
      url.includes("youtube.com") || url.includes("youtu.be") ? "youtube" :
      url.includes("soundcloud.com") ? "soundcloud" : undefined;

    return { title, artist, source };
  } catch {
    return {};
  }
}

// ── Styles ─────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 56 : 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: C.textPrimary,
    letterSpacing: 1,
  },
  headerDate: {
    fontSize: 13,
    color: C.textSecond,
    letterSpacing: 0.5,
  },

  // Tab bar
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
  },
  tabBtnActive: {
    borderBottomWidth: 2,
    borderBottomColor: C.accent,
  },
  tabText: {
    fontSize: 11,
    fontWeight: "600",
    color: C.textMuted,
    letterSpacing: 1.2,
  },
  tabTextActive: {
    color: C.textPrimary,
  },

  // Pane
  pane: {
    flex: 1,
  },
  paneContent: {
    padding: 20,
    paddingBottom: 12,
  },

  // Lane dots
  laneRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  laneDotWrap: {
    alignItems: "center",
    gap: 4,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  laneLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  laneCount: {
    fontSize: 11,
    fontWeight: "700",
  },

  // Next banner
  nextBanner: {
    backgroundColor: C.surface,
    borderRadius: 10,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: C.border,
    marginBottom: 20,
    gap: 4,
  },
  nextLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: C.textMuted,
    letterSpacing: 1.5,
  },
  nextTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: C.textPrimary,
  },
  nextMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 2,
  },
  laneChip: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  laneChipText: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  nextTime: {
    fontSize: 13,
    color: C.textSecond,
  },
  nextEmpty: {
    fontSize: 13,
    color: C.textMuted,
    fontStyle: "italic",
  },

  // Event list
  eventList: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "700",
    color: C.textMuted,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
    gap: 10,
  },
  eventMain: {
    flex: 1,
    gap: 2,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: C.textPrimary,
  },
  eventMeta: {
    fontSize: 11,
    color: C.textSecond,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Notes
  emptyNotes: {
    fontSize: 13,
    color: C.textMuted,
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 40,
  },
  noteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: C.surface,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    gap: 8,
  },
  noteContent: {
    flex: 1,
    gap: 4,
  },
  noteText: {
    fontSize: 13,
    color: C.textPrimary,
    lineHeight: 18,
  },
  noteTs: {
    fontSize: 10,
    color: C.textMuted,
  },
  noteDelete: {
    padding: 4,
  },
  noteDeleteText: {
    fontSize: 12,
    color: C.textMuted,
  },

  // Input area
  inputArea: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 32 : 16,
    backgroundColor: C.bg,
    gap: 10,
  },
  input: {
    backgroundColor: C.surface,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: C.textPrimary,
    minHeight: 56,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: C.border,
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
  },
  btn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimary: {
    backgroundColor: C.accent,
  },
  btnSecondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: C.border,
  },
  btnDisabled: {
    opacity: 0.35,
  },
  btnTextPrimary: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 1.2,
  },
  btnTextSecondary: {
    fontSize: 12,
    fontWeight: "600",
    color: C.textSecond,
    letterSpacing: 1.2,
  },

  // Preview box
  previewBox: {
    backgroundColor: C.pill,
    borderRadius: 8,
    padding: 10,
    gap: 3,
    borderWidth: 1,
    borderColor: C.border,
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  previewIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  previewLane: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    flex: 1,
  },
  previewConf: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  previewTitle: {
    fontSize: 13,
    color: C.textPrimary,
    fontWeight: "500",
  },
  previewTime: {
    fontSize: 11,
    color: C.textSecond,
  },
  previewText: {
    fontSize: 12,
    color: C.textSecond,
  },

  // Feedback
  feedbackBar: {
    backgroundColor: "#1e2d1e",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: "flex-start",
  },
  feedbackText: {
    fontSize: 12,
    color: "#4d9e6a",
    fontWeight: "600",
  },
});

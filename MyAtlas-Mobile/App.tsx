// MyAtlas Mobile — Root App
// Helm-powered briefing + natural language input

import React, { useState, useEffect, useRef, useCallback } from "react";
import SplashScreen from "./SplashScreen";
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
  SafeAreaView,
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
} from "./utils/storage";
import type { LaneSummary, LifeEvent } from "./utils/storage";
import { parseEntry, extractUrl, isUrl } from "./utils/parser";
import type { EventLane } from "./utils/parser";

// ── Lane colours ───────────────────────────────────────────
const LANE_COLORS: Record<EventLane, string> = {
  Work:     "#4f6eb0",
  Family:   "#c07840",
  Health:   "#4d9e6a",
  Travel:   "#7c5cb5",
  Money:    "#a08c2a",
  Creative: "#b84060",
};

const C = {
  bg:          "#0f0f0f",
  surface:     "#1a1a1a",
  border:      "#2a2a2a",
  textPrimary: "#f0f0f0",
  textSecond:  "#888",
  textMuted:   "#555",
  accent:      "#4f6eb0",
  pill:        "#1f1f1f",
};

function todayLabel(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

// ── Lane dot ───────────────────────────────────────────────
function LaneDot({ summary }: { summary: LaneSummary }) {
  const color = LANE_COLORS[summary.lane];
  const active = summary.count > 0;
  return (
    <View style={s.laneDotWrap}>
      <View style={[s.dot, { backgroundColor: active ? color : C.border }]} />
      <Text style={[s.laneLabel, { color: active ? color : C.textMuted }]}>
        {summary.lane.slice(0, 3).toUpperCase()}
      </Text>
      {active && <Text style={[s.laneCount, { color }]}>{summary.count}</Text>}
    </View>
  );
}

// ── Next banner ────────────────────────────────────────────
function NextBanner({ next }: { next: ReturnType<typeof getNextEvent> }) {
  if (!next) {
    return (
      <View style={s.nextBanner}>
        <Text style={s.nextEmpty}>Nothing on the dial. Feed Helm something.</Text>
      </View>
    );
  }
  const color = LANE_COLORS[next.lane];
  return (
    <View style={[s.nextBanner, { borderLeftColor: color }]}>
      <Text style={s.nextLabel}>NEXT</Text>
      <Text style={s.nextTitle} numberOfLines={1}>{next.title}</Text>
      <View style={s.nextMeta}>
        <View style={[s.laneChip, { borderColor: color }]}>
          <Text style={[s.laneChipText, { color }]}>{next.lane}</Text>
        </View>
        <Text style={s.nextTime}>{fmtHour(next.startHour)}</Text>
      </View>
    </View>
  );
}

// ── Parse preview ──────────────────────────────────────────
function ParsePreview({ text }: { text: string }) {
  if (!text.trim()) return null;
  if (isUrl(text.trim())) {
    return (
      <View style={s.previewBox}>
        <Text style={s.previewText}>🔗 Link — will save to notes</Text>
      </View>
    );
  }
  const parsed = parseEntry(text);
  const color = LANE_COLORS[parsed.lane];
  const confColor =
    parsed.confidence === "high"   ? "#4d9e6a" :
    parsed.confidence === "medium" ? "#a08c2a" : C.textMuted;
  return (
    <View style={s.previewBox}>
      <View style={s.previewRow}>
        <View style={[s.dot, { backgroundColor: color, marginRight: 6 }]} />
        <Text style={[s.previewLane, { color }]}>{parsed.lane}</Text>
        <Text style={[s.previewConf, { color: confColor }]}>{parsed.confidence}</Text>
      </View>
      <Text style={s.previewTitle} numberOfLines={1}>{parsed.title}</Text>
      <Text style={s.previewTime}>
        {parsed.date} · {fmtHour(parsed.startHour)}–{fmtHour(parsed.endHour)}
      </Text>
    </View>
  );
}

// ── Note row ───────────────────────────────────────────────
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
  const display =
    note.metadata?.artist ? `🎵 ${note.metadata.title ?? note.url ?? note.text} — ${note.metadata.artist}` :
    note.metadata?.title  ? `🔗 ${note.metadata.title}` :
    note.url              ? `🔗 ${note.url}` :
    note.text;
  return (
    <View style={s.noteRow}>
      <View style={s.noteContent}>
        <Text style={s.noteText} numberOfLines={2}>{display}</Text>
        <Text style={s.noteTs}>{ts}</Text>
      </View>
      <TouchableOpacity onPress={() => onDelete(note.id)} style={s.noteDelete}>
        <Text style={s.noteDeleteText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Today event list ───────────────────────────────────────
function TodayEventList({ briefing }: { briefing: LaneSummary[] }) {
  const [events, setEvents] = useState<LifeEvent[]>([]);
  useEffect(() => {
    getEvents().then(all => {
      const today = todayKey();
      setEvents(all.filter(e => e.date === today).sort((a, b) => a.startHour - b.startHour));
    });
  }, [briefing]);
  if (!events.length) return null;
  return (
    <View style={s.eventList}>
      <Text style={s.sectionTitle}>ON THE DIAL</Text>
      {events.map(e => {
        const color = LANE_COLORS[e.lane];
        return (
          <View key={e.id} style={[s.eventRow, { borderLeftColor: color }]}>
            <View style={s.eventMain}>
              <Text style={s.eventTitle} numberOfLines={1}>{e.title}</Text>
              <Text style={s.eventMeta}>{fmtHour(e.startHour)}–{fmtHour(e.endHour)} · {e.lane}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ── Main App ───────────────────────────────────────────────
export default function App() {
  const [entered, setEntered] = useState(false);

  if (!entered) {
    return <SplashScreen onEnter={() => setEntered(true)} />;
  }

  return <MainScreen />;
}

function MainScreen() {
  const [briefing,  setBriefing]  = useState<LaneSummary[]>([]);
  const [nextEvent, setNextEvent] = useState<ReturnType<typeof getNextEvent>>(null);
  const [input,     setInput]     = useState("");
  const [notes,     setNotes]     = useState<Awaited<ReturnType<typeof getNotes>>>([]);
  const [tab,       setTab]       = useState<"briefing" | "notes">("briefing");
  const [saving,    setSaving]    = useState(false);
  const [feedback,  setFeedback]  = useState<string | null>(null);

  const flashAnim = useRef(new Animated.Value(0)).current;

  const refresh = useCallback(async () => {
    const b = await getTodayBriefing();
    setBriefing(b);
    setNextEvent(getNextEvent(b));
    setNotes(await getNotes());
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const flash = (msg: string) => {
    setFeedback(msg);
    flashAnim.setValue(1);
    Animated.timing(flashAnim, {
      toValue: 0, duration: 2200,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start(() => setFeedback(null));
  };

  const handleAdd = async () => {
    const raw = input.trim();
    if (!raw || saving) return;
    setSaving(true);
    Keyboard.dismiss();
    try {
      const parsed = parseEntry(raw);
      const event: LifeEvent = {
        id: uid(), title: parsed.title, lane: parsed.lane,
        type: "plan", status: "not_started",
        date: parsed.date, startHour: parsed.startHour, endHour: parsed.endHour,
        notes: raw, tags: [], source: "mobile",
        createdAt: new Date().toISOString(),
      };
      await saveEvent(event);
      setInput("");
      await refresh();
      flash(`Added to ${parsed.lane} · ${fmtHour(parsed.startHour)}`);
    } catch { flash("Could not parse — try again"); }
    finally { setSaving(false); }
  };

  const handleSave = async () => {
    const raw = input.trim();
    if (!raw || saving) return;
    setSaving(true);
    Keyboard.dismiss();
    try {
      const url = extractUrl(raw) ?? (isUrl(raw) ? raw : undefined);
      await saveNote({
        id: uid(), text: raw, url,
        metadata: url ? await fetchMeta(url) : undefined,
        timestamp: new Date().toISOString(),
      });
      setInput("");
      setTab("notes");
      await refresh();
      flash("Saved to notes");
    } catch { flash("Save failed"); }
    finally { setSaving(false); }
  };

  const handleDeleteNote = async (id: string) => {
    await deleteNote(id);
    await refresh();
  };

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerTitle}>MyAtlas</Text>
          <Text style={s.headerDate}>{todayLabel()}</Text>
        </View>

        {/* Tabs */}
        <View style={s.tabBar}>
          <TouchableOpacity
            style={[s.tabBtn, tab === "briefing" && s.tabBtnActive]}
            onPress={() => setTab("briefing")}
          >
            <Text style={[s.tabText, tab === "briefing" && s.tabTextActive]}>TODAY</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tabBtn, tab === "notes" && s.tabBtnActive]}
            onPress={() => setTab("notes")}
          >
            <Text style={[s.tabText, tab === "notes" && s.tabTextActive]}>
              NOTES{notes.length > 0 ? ` (${notes.length})` : ""}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        <ScrollView style={s.pane} contentContainerStyle={s.paneContent} keyboardShouldPersistTaps="handled">
          {tab === "briefing" ? (
            <>
              <View style={s.laneRow}>
                {briefing.map(b => <LaneDot key={b.lane} summary={b} />)}
              </View>
              <NextBanner next={nextEvent} />
              <TodayEventList briefing={briefing} />
            </>
          ) : (
            notes.length === 0
              ? <Text style={s.emptyNotes}>No notes yet.</Text>
              : notes.map(n => <NoteItem key={n.id} note={n} onDelete={handleDeleteNote} />)
          )}
        </ScrollView>

        {/* Input */}
        <View style={s.inputArea}>
          <ParsePreview text={input} />
          {feedback && (
            <Animated.View style={[s.feedbackBar, { opacity: flashAnim }]}>
              <Text style={s.feedbackText}>{feedback}</Text>
            </Animated.View>
          )}
          <TextInput
            style={s.input}
            value={input}
            onChangeText={setInput}
            placeholder="Paste a link or type anything…"
            placeholderTextColor={C.textMuted}
            multiline
            maxLength={500}
          />
          <View style={s.buttonRow}>
            <TouchableOpacity
              style={[s.btn, s.btnPrimary, !input.trim() && s.btnDisabled]}
              onPress={handleAdd}
              disabled={!input.trim() || saving}
            >
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.btnTextPrimary}>ADD TO DIAL</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.btn, s.btnSecondary, !input.trim() && s.btnDisabled]}
              onPress={handleSave}
              disabled={!input.trim() || saving}
            >
              <Text style={s.btnTextSecondary}>SAVE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

async function fetchMeta(url: string): Promise<{ title?: string; artist?: string }> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "MyAtlas/1.0" } });
    const html = await res.text();
    const title =
      html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)?.[1] ??
      html.match(/<title>([^<]+)<\/title>/i)?.[1];
    const artist =
      html.match(/<meta[^>]+name="music:musician_description"[^>]+content="([^"]+)"/i)?.[1];
    return { title, artist };
  } catch { return {}; }
}

// ── Styles ─────────────────────────────────────────────────
const s = StyleSheet.create({
  root:           { flex: 1, backgroundColor: C.bg },
  header:         { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle:    { fontSize: 20, fontWeight: "700", color: C.textPrimary, letterSpacing: 1 },
  headerDate:     { fontSize: 13, color: C.textSecond },
  tabBar:         { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.border },
  tabBtn:         { flex: 1, paddingVertical: 10, alignItems: "center" },
  tabBtnActive:   { borderBottomWidth: 2, borderBottomColor: C.accent },
  tabText:        { fontSize: 11, fontWeight: "600", color: C.textMuted, letterSpacing: 1.2 },
  tabTextActive:  { color: C.textPrimary },
  pane:           { flex: 1 },
  paneContent:    { padding: 20, paddingBottom: 12 },
  laneRow:        { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  laneDotWrap:    { alignItems: "center", gap: 4 },
  dot:            { width: 10, height: 10, borderRadius: 5 },
  laneLabel:      { fontSize: 9, fontWeight: "700", letterSpacing: 0.8 },
  laneCount:      { fontSize: 11, fontWeight: "700" },
  nextBanner:     { backgroundColor: C.surface, borderRadius: 10, padding: 14, borderLeftWidth: 3, borderLeftColor: C.border, marginBottom: 20, gap: 4 },
  nextLabel:      { fontSize: 10, fontWeight: "700", color: C.textMuted, letterSpacing: 1.5 },
  nextTitle:      { fontSize: 16, fontWeight: "600", color: C.textPrimary },
  nextMeta:       { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 2 },
  laneChip:       { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  laneChipText:   { fontSize: 10, fontWeight: "600", letterSpacing: 0.5 },
  nextTime:       { fontSize: 13, color: C.textSecond },
  nextEmpty:      { fontSize: 13, color: C.textMuted, fontStyle: "italic" },
  eventList:      { gap: 8 },
  sectionTitle:   { fontSize: 10, fontWeight: "700", color: C.textMuted, letterSpacing: 1.5, marginBottom: 4 },
  eventRow:       { flexDirection: "row", alignItems: "center", backgroundColor: C.surface, borderRadius: 8, padding: 12, borderLeftWidth: 3, gap: 10 },
  eventMain:      { flex: 1, gap: 2 },
  eventTitle:     { fontSize: 14, fontWeight: "500", color: C.textPrimary },
  eventMeta:      { fontSize: 11, color: C.textSecond },
  emptyNotes:     { fontSize: 13, color: C.textMuted, fontStyle: "italic", textAlign: "center", marginTop: 40 },
  noteRow:        { flexDirection: "row", alignItems: "flex-start", backgroundColor: C.surface, borderRadius: 8, padding: 12, marginBottom: 8, gap: 8 },
  noteContent:    { flex: 1, gap: 4 },
  noteText:       { fontSize: 13, color: C.textPrimary, lineHeight: 18 },
  noteTs:         { fontSize: 10, color: C.textMuted },
  noteDelete:     { padding: 4 },
  noteDeleteText: { fontSize: 12, color: C.textMuted },
  inputArea:      { borderTopWidth: 1, borderTopColor: C.border, paddingHorizontal: 16, paddingTop: 12, paddingBottom: Platform.OS === "ios" ? 8 : 16, backgroundColor: C.bg, gap: 10 },
  input:          { backgroundColor: C.surface, borderRadius: 10, padding: 12, fontSize: 14, color: C.textPrimary, minHeight: 56, maxHeight: 120, borderWidth: 1, borderColor: C.border, lineHeight: 20 },
  buttonRow:      { flexDirection: "row", gap: 10 },
  btn:            { flex: 1, paddingVertical: 13, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  btnPrimary:     { backgroundColor: C.accent },
  btnSecondary:   { backgroundColor: "transparent", borderWidth: 1, borderColor: C.border },
  btnDisabled:    { opacity: 0.35 },
  btnTextPrimary: { fontSize: 12, fontWeight: "700", color: "#fff", letterSpacing: 1.2 },
  btnTextSecondary:{ fontSize: 12, fontWeight: "600", color: C.textSecond, letterSpacing: 1.2 },
  previewBox:     { backgroundColor: C.pill, borderRadius: 8, padding: 10, gap: 3, borderWidth: 1, borderColor: C.border },
  previewRow:     { flexDirection: "row", alignItems: "center", gap: 4 },
  previewLane:    { fontSize: 11, fontWeight: "700", letterSpacing: 0.8, flex: 1 },
  previewConf:    { fontSize: 10, fontWeight: "600", letterSpacing: 0.5, textTransform: "uppercase" },
  previewTitle:   { fontSize: 13, color: C.textPrimary, fontWeight: "500" },
  previewTime:    { fontSize: 11, color: C.textSecond },
  previewText:    { fontSize: 12, color: C.textSecond },
  feedbackBar:    { backgroundColor: "#1e2d1e", borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6, alignSelf: "flex-start" },
  feedbackText:   { fontSize: 12, color: "#4d9e6a", fontWeight: "600" },
});

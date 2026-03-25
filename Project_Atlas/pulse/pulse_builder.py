#!/usr/bin/env python3
"""
Pulse Auto-Builder
Reads today's card from the schedule, builds index.html, pushes to GitHub.
Run manually or schedule via launchd to run every morning at 7am.

Each day gets a unique background image via picsum.photos (no local files needed).
Design system: warm honey gradient overlay + shimmer + text glitter + ambient particles.
"""

import os
import sys
import subprocess
import webbrowser
from datetime import date, timedelta

# ============================================================
# CARD SCHEDULE — Ideka's cards, days 1-30
# Format: "YYYY-MM-DD": (label, quote, attribution, image_path)
# ============================================================

CARDS = {

    # ── MARCH ──────────────────────────────────────────────

    "2026-03-10": (
        "for a honey kind of day",
        "Some people colour your world without even trying.",
        "for you today",
        "images/i5_clutch_perfume.jpg"
    ),
    "2026-03-11": (
        "for a curious wednesday",
        "The most interesting minds don't just see the world differently. They make you wonder why you ever saw it any other way.",
        "for you today",
        "images/i9_palm_tower.jpg"
    ),
    "2026-03-12": (
        "for a better energy thursday",
        "Some days just have better energy than others. Today feels like one of those days.",
        "for you today",
        "images/i2_tulips.jpg"
    ),
    "2026-03-13": (
        "for the quiet observers",
        "Rare is the person who listens not to respond, but to understand. You'll know them by how seen they make you feel.",
        "for you today",
        "images/i4_earrings.jpg"
    ),
    "2026-03-14": (
        "for a saturday kind of thought",
        "Art is never finished, only abandoned — but conversation between the right people never truly ends.",
        "for you today",
        "images/i4_angel_oak.jpg"
    ),
    "2026-03-15": (
        "for a slow sunday",
        "Sunday energy: Soft blanket. Something warm in a mug. A thought that arrived uninvited and stayed for hours. Perfect.",
        "for you today",
        "images/i12_marina.jpg"
    ),
    "2026-03-16": (
        "for a monday kind of presence",
        "The people worth keeping are the ones who make silence feel like conversation and distance feel like presence.",
        "for you today",
        "images/i1_table_setting.jpg"
    ),
    "2026-03-17": (
        "for a reflective tuesday",
        "We are drawn to flawed protagonists not because we excuse them, but because we recognise them. The best stories hold a mirror.",
        "for you today",
        "images/i7_campus_trees.jpg"
    ),
    "2026-03-18": (
        "for a wednesday plot twist",
        "Plot twist: The person who keeps showing up, paying attention, and remembering everything? That's the main character energy right there.",
        "for you today",
        "images/i3_bridal_shoes2.jpg"
    ),
    "2026-03-19": (
        "for the quietly observed",
        "To be truly known by someone — not performed for, not managed, just known — that is one of the rarest gifts in a noisy world.",
        "for you today",
        "images/i3_orchid_water.jpg"
    ),

    # ── Day 11 onwards ──────────────────────────────────────

    "2026-03-20": (
        "for the first day of spring",
        "Spring doesn't ask permission to begin again. It just does. There's a lesson in that for the rest of us.",
        "for you today",
        "images/i8_tree_path.jpg"
    ),
    "2026-03-21": (
        "for a saturday kind of conversation",
        "You ever have a conversation so good it ruins small talk forever? Yeah. That.",
        "for you today",
        "images/i1_frangipani.jpg"
    ),
    "2026-03-22": (
        "for the ones that feel inevitable",
        "Some connections don't need explaining. They just make sense in a language neither person had to learn.",
        "for you today",
        "images/i6_makeup.jpg"
    ),
    "2026-03-23": (
        "for the home you carry",
        "The aunties, the comfort food, the cuddles — home is not always a place. Sometimes it's a feeling you carry and occasionally share.",
        "for you today",
        "images/i10_glass_palms.jpg"
    ),
    "2026-03-24": (
        "for halfway through",
        "Halfway through March and you're still here, still noticing, still keeping count of things that matter. Honestly? Impressive.",
        "for you today",
        "images/i2_bridal_shoes.jpg"
    ),

    # ── Days 16-30: personal photos from images/ideka/ ─────

    "2026-03-25": (
        "for those who reframe everything",
        "There are people who enter your story and somehow make every chapter before them feel like prologue.",
        "for you today",
        "images/ideka/CFS_0-17-2.jpg"
    ),
    "2026-03-26": (
        "for a mind that forms its own views",
        "Independent thought is an act of courage disguised as an opinion. Not everyone has the nerve.",
        "for you today",
        "images/ideka/CFS_0-17-3.jpg"
    ),
    "2026-03-27": (
        "for a dramatic spring friday",
        "Allergy season reminder: Even the flowers are dramatic in spring. You're allowed to be too.",
        "for you today",
        "images/ideka/CFS_0-17-10.jpg"
    ),
    "2026-03-28": (
        "for the ones who wait for real",
        "Depth is not common. Neither is the patience to find it in someone else. You have both.",
        "for you today",
        "images/ideka/CFS_0-17-14.jpg"
    ),
    "2026-03-29": (
        "for a quiet sunday defiance",
        "Art defies. That's its whole job. And the people who love art deeply — they carry that defiance quietly inside them.",
        "for you today",
        "images/ideka/CFS_0-17-23.jpg"
    ),
    "2026-03-30": (
        "for a monday kind of score",
        "Monday report: Still intellectually dangerous. Still noticing everything. Still keeping score. No notes.",
        "for you today",
        "images/ideka/DSC03891.jpg"
    ),
    "2026-03-31": (
        "for the last day of march",
        "March taught us: things that take their time arriving are usually worth the wait.",
        "for you today",
        "images/ideka/DSC_4305.jpg"
    ),

    # ── APRIL ───────────────────────────────────────────────

    "2026-04-01": (
        "for a new month kind of mind",
        "New month. Same curious mind. Different questions. That's growth dressed in ordinary clothes.",
        "for you today",
        "images/ideka/DSC_5423.jpg"
    ),
    "2026-04-02": (
        "for the most interesting thursday",
        "Two chess players, talking philosophy over coffee, keeping count of everything — honestly sounds like the most interesting Tuesday anyone has ever had.",
        "for you today",
        "images/ideka/DSC_7226.jpg"
    ),
    "2026-04-03": (
        "for the 2 to 8 hour kind",
        "The conversations that last hours are never really about the topic. They're about the recognition — finally, someone who speaks the same language.",
        "for you today",
        "images/ideka/DSC_7305.jpg"
    ),
    "2026-04-04": (
        "for the guarded ones worth waiting for",
        "Vulnerability is not weakness. It is the decision that connection matters more than the risk of being known.",
        "for you today",
        "images/ideka/FT-2.jpg"
    ),
    "2026-04-05": (
        "for a dramatic spring sunday",
        "Spring is basically nature's way of being extra. Colour everywhere, everything blooming at once, dramatic temperature changes. Iconic behaviour honestly.",
        "for you today",
        "images/ideka/FT-5.jpg"
    ),
    "2026-04-06": (
        "for a quiet beautiful monday",
        "To be someone's highlight — not their everything, not their anchor, just their highlight — that is a quietly beautiful thing to be.",
        "for you today",
        "images/i5_clutch_perfume.jpg"
    ),
    "2026-04-07": (
        "for the ones who prefer depth",
        "The most honest relationships are built slowly, with questions, with patience, with the willingness to not rush the knowing.",
        "for you today",
        "images/i8_tree_path.jpg"
    ),
    "2026-04-08": (
        "for thirty days and counting",
        "Thirty days of being noticed, thought of, and sent something made just for you. Still keeping count? Because I am.",
        "for you today",
        "images/i1_frangipani.jpg"
    ),
}

# ============================================================
# YEMI'S CARDS — days 1-30
# Format: "YYYY-MM-DD": (label, quote)
# ============================================================

YEMI_CARDS = {
    "2026-03-10": ("for a builder's tuesday",        "Concern that knows its own name is already halfway to peace. You're more aware than you think."),
    "2026-03-11": ("for the foundations",             "Every great builder has a season where nothing looks finished. That's not failure. That's foundations."),
    "2026-03-12": ("for the work in progress",        "You are allowed to be a masterpiece and a work in progress at the same time."),
    "2026-03-13": ("for morning light",               "Clarity doesn't always arrive loudly. Sometimes it settles in like morning light — slowly, then all at once."),
    "2026-03-14": ("for the path through",            "The obstacle is the path. Not around it, not despite it — through it, the path reveals itself."),
    "2026-03-15": ("for the rest that is the work",   "Rest is not a reward for finishing. Rest is part of the work. Take it without apology."),
    "2026-03-16": ("for the breath before",           "Sunday is not the end of the week. It is the breath before the next chapter begins."),
    "2026-03-17": ("for the direction worth walking", "Leadership is not about being in front. It is about knowing which direction is worth walking in."),
    "2026-03-18": ("for the days still deciding",     "Not every day has a colour yet. Some days are still deciding. That's fine — so are you."),
    "2026-03-19": ("for the ones still moving",       "You don't have to have it all figured out. You just have to keep moving with intention."),
    "2026-03-20": ("for the equinox",                 "Equinox: the one day the world is perfectly balanced between dark and light. Some days you get to be both."),
    "2026-03-21": ("for the exhale",                  "Saturday is just the universe's way of saying — you made it, now exhale."),
    "2026-03-22": ("for the private work",            "The work you do in private becomes the life you live in public. Keep going."),
    "2026-03-23": ("for two weeks in",                "Two weeks of showing up. That's not a streak. That's a statement of character."),
    "2026-03-24": ("for halfway",                     "Halfway means you've already proven you can. The second half is just confirming what you already know."),
    "2026-03-25": ("for every version",               "Every version of you that got you here deserves acknowledgement — even the uncertain ones."),
    "2026-03-26": ("for the blueprint",               "Vision without execution is just imagination. But execution without vision is just motion. You need both."),
    "2026-03-27": ("for showing up anyway",           "Some days the only win is that you showed up despite everything. Today counts."),
    "2026-03-28": ("for the ones who see clearly",    "The fact that you notice things others miss — that's not overthinking. That's a gift with a sharp edge."),
    "2026-03-29": ("for chapter three",               "The most dangerous thing you can do is compare your chapter three to someone else's chapter twenty."),
    "2026-03-30": ("for three weeks in",              "Three weeks in. At this point it's not discipline anymore. It's just who you are."),
    "2026-03-31": ("for the last day of march",       "You started this month with concern but moderate. Look how far that got you."),
    "2026-04-01": ("for a new month",                 "April is the universe asking: who do you want to be now that spring has cleared the air?"),
    "2026-04-02": ("for the quiet echo",              "You've been building quietly for a while now. April is when quiet starts to echo."),
    "2026-04-03": ("for showing up",                  "Consistency is not glamorous. It is just the most honest thing a person can do."),
    "2026-04-04": ("for future you",                  "Every system you build now is future-you saying thank you."),
    "2026-04-05": ("for three more days",             "Three more days. Not because you have to — because you decided to. That's the whole point."),
    "2026-04-06": ("for the version finishing",       "The version of you that started this 30 days ago and the version finishing it are not the same person. Notice that."),
    "2026-04-07": ("for one more day",                "One more day. What you've built here — in thirty days of showing up — nobody can take that back."),
    "2026-04-08": ("for thirty days",                 "You said concern but moderate on day one. Thirty days later — what colour is today?"),
}

# ============================================================
# HTML TEMPLATE — uses PLACEHOLDER_ tokens to avoid f-string
# escaping issues with CSS/JS curly braces.
# Full design system: background image + overlay, shimmer sweep,
# text glitter gradient, ambient particle drift, word glitter.
# ============================================================

TEMPLATE = '''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>Pulse</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=Montserrat:wght@200;300;400&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden; }
  body {
    font-family: 'Cormorant Garamond', serif;
    background:
      linear-gradient(180deg,
        rgba(28,14,4,0.54) 0%,
        rgba(18,10,2,0.22) 28%,
        rgba(18,10,2,0.56) 62%,
        rgba(10,5,1,0.94) 100%),
      url('PLACEHOLDER_IMAGE') center / cover no-repeat;
    min-height: 100vh; min-height: 100dvh;
    display: flex; flex-direction: column;
    align-items: center; justify-content: space-between;
    padding: 52px 36px 48px;
    position: relative; overflow: hidden; text-align: center;
  }
  body::before { content: ''; position: absolute; width: 400px; height: 400px; border-radius: 50%; background: radial-gradient(circle, rgba(200,146,42,0.10) 0%, transparent 70%); top: -100px; right: -100px; pointer-events: none; }
  body::after { content: ''; position: absolute; width: 300px; height: 300px; border-radius: 50%; background: radial-gradient(circle, rgba(232,184,75,0.07) 0%, transparent 70%); bottom: -80px; left: -60px; pointer-events: none; }
  .top-line { position: absolute; top: 0; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, transparent, #c8922a, #e8b84b, #c8922a, transparent); }
  .bottom-line { position: absolute; bottom: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, rgba(200,146,42,0.4), transparent); }
  .center { width: 100%; display: flex; flex-direction: column; align-items: center; opacity: 0; animation: fadeUp 1.2s ease forwards; animation-delay: 0.3s; z-index: 2; position: relative; }
  .label { font-family: 'Montserrat', sans-serif; font-size: 9px; font-weight: 400; letter-spacing: 5px; color: #c8922a; text-transform: uppercase; margin-bottom: 40px; opacity: 0.9; }
  .deco { width: 32px; height: 1px; background: linear-gradient(90deg, transparent, #e8b84b, transparent); margin-bottom: 36px; }
  .quote-mark { font-size: 80px; line-height: 0.6; color: #c8922a; opacity: 0.35; margin-bottom: 12px; font-style: italic; }
  .quote {
    font-size: 32px; font-weight: 300; font-style: italic;
    line-height: 1.6; letter-spacing: 0.3px; margin-bottom: 40px;
    background: linear-gradient(90deg,
      #c8922a  0%, #f5e6c8 10%, #fffbe6 18%, #ffd700 25%,
      #fff4b0 32%, #f5e6c8 42%, #e8b84b 52%, #fffbe6 60%,
      #ffd700 67%, #fff4b0 74%, #f5e6c8 84%, #ffe08a 92%, #c8922a 100%
    );
    background-size: 260% 100%;
    background-position: 160% center;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    filter: drop-shadow(0 0 12px rgba(232,184,75,0.45));
    animation: textGlitter 5s linear 1.4s infinite;
  }
  @keyframes textGlitter {
    0%   { background-position: 160% center; }
    100% { background-position: -60% center; }
  }
  .divider { width: 48px; height: 1px; background: linear-gradient(90deg, transparent, #c8922a, transparent); margin-bottom: 20px; }
  .attribution { font-family: 'Montserrat', sans-serif; font-size: 10px; font-weight: 300; letter-spacing: 3px; color: #c8922a; opacity: 0.75; text-transform: uppercase; }
  .bottom { display: flex; flex-direction: column; align-items: center; gap: 16px; opacity: 0; animation: fadeUp 0.8s ease forwards; animation-delay: 0.8s; z-index: 2; position: relative; }
  .honey-dot { width: 5px; height: 5px; border-radius: 50%; background: #e8b84b; opacity: 0.6; animation: glow 3s ease-in-out infinite; }
  @keyframes glow { 0%, 100% { opacity: 0.6; transform: scale(1); } 50% { opacity: 1; transform: scale(1.5); } }
  .date-chip { font-family: 'Montserrat', sans-serif; font-size: 9px; font-weight: 300; letter-spacing: 3px; color: #f5e6c8; opacity: 0.25; text-transform: uppercase; }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

  /* ── SHIMMER SWEEP ── */
  .shimmer-stripe {
    position: absolute; top: 0; left: 0;
    width: 38%; height: 100%;
    background: linear-gradient(90deg,
      transparent 0%,
      rgba(255,248,180,0.22) 28%,
      rgba(255,255,240,0.44) 50%,
      rgba(255,248,180,0.22) 72%,
      transparent 100%
    );
    mix-blend-mode: overlay;
    transform: translateX(-100%);
    animation: shimmerSlide 2.6s cubic-bezier(0.4,0,0.2,1) 1.6s 1 forwards;
    pointer-events: none; z-index: 3;
  }
  @keyframes shimmerSlide {
    0%   { transform: translateX(-100%); }
    100% { transform: translateX(370%); }
  }

  /* ── PARTICLE LAYERS ── */
  #particles   { position: absolute; inset: 0; pointer-events: none; overflow: hidden;  z-index: 1; }
  #wordglitter { position: absolute; inset: 0; pointer-events: none; overflow: visible; z-index: 5; }
  @keyframes particleDrift {
    0%   { transform: translateY(0) scale(1);   opacity: 0; }
    10%  { opacity: 1; }
    85%  { opacity: 0.9; }
    100% { transform: translateY(-100px) scale(0.15); opacity: 0; }
  }
  @keyframes particleSparkle {
    0%, 100% { opacity: 0.1; transform: scale(0.6); }
    50%       { opacity: 1;   transform: scale(1.6); }
  }
  .top-line, .bottom-line { z-index: 4; }
</style>
</head>
<body>
<div id="particles"></div>
<div id="wordglitter"></div>
<div class="shimmer-stripe"></div>
<div class="top-line"></div>
<div class="center">
  <div class="label">PLACEHOLDER_LABEL</div>
  <div class="deco"></div>
  <div class="quote-mark">"</div>
  <p class="quote">PLACEHOLDER_QUOTE</p>
  <div class="divider"></div>
  <div class="attribution">PLACEHOLDER_ATTRIBUTION</div>
</div>
<div class="bottom">
  <div class="honey-dot"></div>
  <div class="date-chip">PLACEHOLDER_DATE</div>
</div>
<div class="bottom-line"></div>
<script>
(function(){
  var pc=document.getElementById('particles');
  var driftCols=['rgba(255,210,50,0.95)','rgba(232,184,75,0.92)','rgba(255,235,120,0.88)','rgba(255,200,40,0.85)','rgba(248,220,90,0.80)'];
  for(var i=0;i<26;i++){
    var p=document.createElement('div');
    var sz=(Math.random()*3+1.5).toFixed(2);
    var glow=parseFloat(sz)*2.5;
    var col=driftCols[Math.floor(Math.random()*driftCols.length)];
    var glowCol=col.replace(/[\d.]+\)$/,'0.6)');
    p.style.cssText=['position:absolute','width:'+sz+'px','height:'+sz+'px','left:'+(Math.random()*90+5).toFixed(1)+'%','top:'+(Math.random()*88+6).toFixed(1)+'%','background:'+col,'border-radius:50%','box-shadow:0 0 '+glow+'px '+glow+'px '+glowCol,'animation:particleDrift '+(Math.random()*8+6).toFixed(1)+'s ease-in-out '+(Math.random()*18).toFixed(1)+'s infinite','pointer-events:none'].join(';');
    pc.appendChild(p);
  }
  var sparkCols=['rgba(255,220,60,1)','rgba(255,245,160,1)','rgba(232,184,75,1)'];
  for(var j=0;j<12;j++){
    var s=document.createElement('div');
    var ssz=(Math.random()*2+1.8).toFixed(2);
    var sglow=parseFloat(ssz)*3;
    var scol=sparkCols[Math.floor(Math.random()*sparkCols.length)];
    s.style.cssText=['position:absolute','width:'+ssz+'px','height:'+ssz+'px','left:'+(Math.random()*90+5).toFixed(1)+'%','top:'+(Math.random()*88+6).toFixed(1)+'%','background:'+scol,'border-radius:50%','box-shadow:0 0 '+sglow+'px '+sglow+'px rgba(255,200,50,0.7)','animation:particleSparkle '+(Math.random()*3+2).toFixed(1)+'s ease-in-out '+(Math.random()*6).toFixed(1)+'s infinite','pointer-events:none'].join(';');
    pc.appendChild(s);
  }
})();
(function(){
  var wg=document.getElementById('wordglitter');
  var gc=['rgba(255,215,50,1)','rgba(255,235,120,0.97)','rgba(232,184,75,0.95)','rgba(255,255,160,0.92)','rgba(248,210,60,0.98)'];
  function spawnFaller(){
    var p=document.createElement('div');
    var W=window.innerWidth,H=window.innerHeight;
    var sz=(Math.random()*3.5+1.2).toFixed(1);
    var gl=parseFloat(sz)*2.8;
    var col=gc[Math.floor(Math.random()*gc.length)];
    var sx=(0.10+Math.random()*0.80)*W;
    var sy=(0.32+Math.random()*0.26)*H;
    var fall=Math.random()*140+90;
    var drift=(Math.random()-0.5)*80;
    var rot=(Math.random()>0.5?1:-1)*(Math.random()*360+180);
    var dur=Math.random()*2000+2200;
    var radius=Math.random()>0.35?'50%':'30%';
    var aspect=Math.random()>0.35?sz:(parseFloat(sz)*0.55).toFixed(1);
    p.style.cssText=['position:absolute','width:'+sz+'px','height:'+aspect+'px','left:'+sx.toFixed(0)+'px','top:'+sy.toFixed(0)+'px','background:'+col,'border-radius:'+radius,'box-shadow:0 0 '+gl+'px '+gl+'px rgba(255,200,50,0.65)','pointer-events:none'].join(';');
    wg.appendChild(p);
    var anim=p.animate([{transform:'translateY(0px) translateX(0px) rotate(0deg)',opacity:1},{transform:'translateY('+fall+'px) translateX('+drift+'px) rotate('+rot+'deg)',opacity:0}],{duration:dur,easing:'ease-in',fill:'forwards'});
    anim.onfinish=function(){if(wg.contains(p))wg.removeChild(p);};
  }
  for(var k=0;k<12;k++){setTimeout(spawnFaller,1400+k*150);}
  setInterval(spawnFaller,500);
})();
</script>
</body>
</html>'''


# ============================================================
# BUILD
# ============================================================

def build_html(label, quote, attribution, image_path, date_str):
    d = date.fromisoformat(date_str)
    months = ["January","February","March","April","May","June",
              "July","August","September","October","November","December"]
    pretty_date = f"{months[d.month-1]} {d.day} · {d.year}"

    return (TEMPLATE
        .replace("PLACEHOLDER_IMAGE",       image_path)
        .replace("PLACEHOLDER_LABEL",       label)
        .replace("PLACEHOLDER_QUOTE",       quote)
        .replace("PLACEHOLDER_ATTRIBUTION", attribution)
        .replace("PLACEHOLDER_DATE",        pretty_date)
    )


# ============================================================
# PREVIEW TEMPLATE — two-panel: Yemi (blue ribbons) + Ideka
# ============================================================

PREVIEW_TEMPLATE = '''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pulse Preview · PREVIEW_DATE_DISPLAY</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=Montserrat:wght@200;300;400&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; }

  /* ── PREVIEW BAR ── */
  .preview-bar {
    position: fixed; top: 0; left: 0; right: 0; height: 32px;
    background: rgba(5,5,18,0.92);
    border-bottom: 1px solid rgba(90,130,255,0.3);
    display: flex; align-items: center; justify-content: center; gap: 24px;
    font-family: 'Montserrat', sans-serif; font-size: 8px;
    letter-spacing: 3px; text-transform: uppercase; color: rgba(90,130,255,0.6);
    z-index: 999;
  }
  .preview-bar .dot { width: 5px; height: 5px; border-radius: 50%; background: #5a82ff; opacity: 0.5; }
  .preview-bar .ok { color: #4d9e6a; }
  .preview-bar .warn { color: rgba(232,184,75,0.7); }

  /* ── PANELS ── */
  .panels {
    display: flex; width: 100%; height: 100vh; padding-top: 32px;
  }
  .panel { flex: 1; position: relative; overflow: hidden; }
  .divider { width: 1px; background: linear-gradient(180deg, transparent, rgba(90,130,255,0.4), transparent); flex-shrink: 0; }

  /* ════════════════════════════════
     YEMI'S PANEL — dark bold + blue ribbons
  ════════════════════════════════ */
  .yemi-panel {
    background: linear-gradient(160deg, #0d0d1a 0%, #070710 100%);
    display: flex; flex-direction: column;
    align-items: center; justify-content: space-between;
    padding: 52px 36px 48px; text-align: center;
  }
  .yemi-panel::before { content: ''; position: absolute; width: 350px; height: 350px; border-radius: 50%; background: radial-gradient(circle, rgba(90,130,255,0.07) 0%, transparent 70%); top: -80px; right: -80px; pointer-events: none; }
  .yemi-panel::after  { content: ''; position: absolute; width: 250px; height: 250px; border-radius: 50%; background: radial-gradient(circle, rgba(90,130,255,0.05) 0%, transparent 70%); bottom: -60px; left: -50px; pointer-events: none; }

  /* ── Blue Ribbons ── */
  .ribbon { position: absolute; left: -5%; width: 110%; height: 1.5px; pointer-events: none; z-index: 1; }
  .ribbon::before {
    content: '';
    position: absolute; top: 0; left: 0; right: 0; bottom: 0;
    background: linear-gradient(90deg, transparent 0%, rgba(90,130,255,0.0) 5%, rgba(90,130,255,0.45) 25%, rgba(160,190,255,0.8) 50%, rgba(90,130,255,0.45) 75%, rgba(90,130,255,0.0) 95%, transparent 100%);
    filter: blur(0.5px);
  }
  .ribbon::after {
    content: '';
    position: absolute; top: -3px; left: -90px;
    width: 90px; height: 7px;
    background: linear-gradient(90deg, transparent, rgba(200,220,255,0.95), transparent);
    border-radius: 50%; filter: blur(1px);
  }
  .r1 { top: 18%; transform: rotate(-9deg);  animation: rPulse 5s ease-in-out 0.0s infinite; }
  .r2 { top: 36%; transform: rotate(-3deg);  animation: rPulse 5s ease-in-out 1.0s infinite; }
  .r3 { top: 56%; transform: rotate( 4deg);  animation: rPulse 5s ease-in-out 2.0s infinite; }
  .r4 { top: 74%; transform: rotate(-6deg);  animation: rPulse 5s ease-in-out 3.0s infinite; }
  @keyframes rPulse { 0%, 100% { opacity: 0.18; } 50% { opacity: 0.65; } }
  .r1::after { animation: rSweep 4.0s ease-in-out 0.5s infinite; }
  .r2::after { animation: rSweep 4.0s ease-in-out 1.4s infinite; }
  .r3::after { animation: rSweep 4.0s ease-in-out 2.3s infinite; }
  .r4::after { animation: rSweep 4.0s ease-in-out 3.1s infinite; }
  @keyframes rSweep {
    0%   { left: -90px; opacity: 0; }
    8%   { opacity: 1; }
    92%  { opacity: 1; }
    100% { left: calc(110% + 90px); opacity: 0; }
  }

  /* Yemi card content */
  .y-top-line { position: absolute; top: 32px; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, transparent, #5a82ff, #a0b4ff, #5a82ff, transparent); z-index: 4; }
  .y-bottom-line { position: absolute; bottom: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, rgba(90,130,255,0.35), transparent); z-index: 4; }
  .y-center { width: 100%; display: flex; flex-direction: column; align-items: center; opacity: 0; animation: fadeUp 1.2s ease 0.3s forwards; z-index: 2; position: relative; }
  .y-label { font-family: 'Montserrat', sans-serif; font-size: 9px; font-weight: 400; letter-spacing: 5px; color: #5a82ff; text-transform: uppercase; margin-bottom: 40px; opacity: 0.9; }
  .y-deco { width: 32px; height: 1px; background: linear-gradient(90deg, transparent, #a0b4ff, transparent); margin-bottom: 36px; }
  .y-quote-mark { font-size: 80px; line-height: 0.6; color: #5a82ff; opacity: 0.25; margin-bottom: 12px; font-style: italic; }
  .y-quote {
    font-size: 28px; font-weight: 300; font-style: italic; line-height: 1.6;
    letter-spacing: 0.3px; margin-bottom: 40px;
    background: linear-gradient(90deg, #5a82ff 0%, #e8e8ff 12%, #c0d0ff 22%, #a0b4ff 32%, #e8e8ff 44%, #7090ff 54%, #c0d0ff 64%, #a0b4ff 74%, #e8e8ff 86%, #5a82ff 100%);
    background-size: 260% 100%; background-position: 160% center;
    -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
    filter: drop-shadow(0 0 10px rgba(90,130,255,0.4));
    animation: yGlitter 5s linear 1.4s infinite;
  }
  @keyframes yGlitter { 0% { background-position: 160% center; } 100% { background-position: -60% center; } }
  .y-divider { width: 48px; height: 1px; background: linear-gradient(90deg, transparent, #5a82ff, transparent); margin-bottom: 20px; }
  .y-attribution { font-family: 'Montserrat', sans-serif; font-size: 10px; font-weight: 300; letter-spacing: 3px; color: #5a82ff; opacity: 0.6; text-transform: uppercase; }
  .y-bottom { display: flex; flex-direction: column; align-items: center; gap: 16px; opacity: 0; animation: fadeUp 0.8s ease 0.8s forwards; z-index: 2; position: relative; }
  .y-dot { width: 5px; height: 5px; border-radius: 50%; background: #5a82ff; opacity: 0.5; animation: yGlow 3s ease-in-out infinite; }
  @keyframes yGlow { 0%, 100% { opacity: 0.5; transform: scale(1); } 50% { opacity: 1; transform: scale(1.5); } }
  .y-date { font-family: 'Montserrat', sans-serif; font-size: 9px; font-weight: 300; letter-spacing: 3px; color: #e8e8ff; opacity: 0.2; text-transform: uppercase; }
  .y-panel-label { font-family: 'Montserrat', sans-serif; font-size: 7px; letter-spacing: 4px; color: rgba(90,130,255,0.35); text-transform: uppercase; margin-top: 8px; }

  /* ════════════════════════════════
     IDEKA'S PANEL — warm honey + glitter
  ════════════════════════════════ */
  .ideka-panel {
    background:
      linear-gradient(180deg, rgba(28,14,4,0.54) 0%, rgba(18,10,2,0.22) 28%, rgba(18,10,2,0.56) 62%, rgba(10,5,1,0.94) 100%),
      url('PIDEKA_IMAGE') center / cover no-repeat;
    display: flex; flex-direction: column;
    align-items: center; justify-content: space-between;
    padding: 52px 36px 48px; text-align: center;
  }
  .i-top-line { position: absolute; top: 32px; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, transparent, #c8922a, #e8b84b, #c8922a, transparent); z-index: 4; }
  .i-bottom-line { position: absolute; bottom: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, rgba(200,146,42,0.4), transparent); z-index: 4; }
  .i-center { width: 100%; display: flex; flex-direction: column; align-items: center; opacity: 0; animation: fadeUp 1.2s ease 0.3s forwards; z-index: 2; position: relative; }
  .i-label { font-family: 'Montserrat', sans-serif; font-size: 9px; font-weight: 400; letter-spacing: 5px; color: #c8922a; text-transform: uppercase; margin-bottom: 40px; opacity: 0.9; }
  .i-deco { width: 32px; height: 1px; background: linear-gradient(90deg, transparent, #e8b84b, transparent); margin-bottom: 36px; }
  .i-quote-mark { font-size: 80px; line-height: 0.6; color: #c8922a; opacity: 0.35; margin-bottom: 12px; font-style: italic; }
  .i-quote {
    font-size: 28px; font-weight: 300; font-style: italic; line-height: 1.6;
    letter-spacing: 0.3px; margin-bottom: 40px;
    background: linear-gradient(90deg, #c8922a 0%, #f5e6c8 10%, #fffbe6 18%, #ffd700 25%, #fff4b0 32%, #f5e6c8 42%, #e8b84b 52%, #fffbe6 60%, #ffd700 67%, #fff4b0 74%, #f5e6c8 84%, #ffe08a 92%, #c8922a 100%);
    background-size: 260% 100%; background-position: 160% center;
    -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
    filter: drop-shadow(0 0 12px rgba(232,184,75,0.45));
    animation: iGlitter 5s linear 1.4s infinite;
  }
  @keyframes iGlitter { 0% { background-position: 160% center; } 100% { background-position: -60% center; } }
  .i-divider { width: 48px; height: 1px; background: linear-gradient(90deg, transparent, #c8922a, transparent); margin-bottom: 20px; }
  .i-attribution { font-family: 'Montserrat', sans-serif; font-size: 10px; font-weight: 300; letter-spacing: 3px; color: #c8922a; opacity: 0.75; text-transform: uppercase; }
  .i-bottom { display: flex; flex-direction: column; align-items: center; gap: 16px; opacity: 0; animation: fadeUp 0.8s ease 0.8s forwards; z-index: 2; position: relative; }
  .i-dot { width: 5px; height: 5px; border-radius: 50%; background: #e8b84b; opacity: 0.6; animation: iGlow 3s ease-in-out infinite; }
  @keyframes iGlow { 0%, 100% { opacity: 0.6; transform: scale(1); } 50% { opacity: 1; transform: scale(1.5); } }
  .i-date { font-family: 'Montserrat', sans-serif; font-size: 9px; font-weight: 300; letter-spacing: 3px; color: #f5e6c8; opacity: 0.25; text-transform: uppercase; }
  .i-panel-label { font-family: 'Montserrat', sans-serif; font-size: 7px; letter-spacing: 4px; color: rgba(200,146,42,0.35); text-transform: uppercase; margin-top: 8px; }

  /* ── Ideka shimmer sweep ── */
  .i-shimmer {
    position: absolute; top: 0; left: 0; width: 38%; height: 100%;
    background: linear-gradient(90deg, transparent 0%, rgba(255,248,180,0.22) 28%, rgba(255,255,240,0.44) 50%, rgba(255,248,180,0.22) 72%, transparent 100%);
    mix-blend-mode: overlay; transform: translateX(-100%);
    animation: shimmerSlide 2.6s cubic-bezier(0.4,0,0.2,1) 1.6s 1 forwards;
    pointer-events: none; z-index: 3;
  }
  @keyframes shimmerSlide { 0% { transform: translateX(-100%); } 100% { transform: translateX(370%); } }

  /* ── Shared ── */
  @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
  #y-particles, #i-particles, #i-wordglitter { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 1; }
  #i-wordglitter { overflow: visible; z-index: 5; }
  @keyframes particleDrift { 0% { transform: translateY(0) scale(1); opacity: 0; } 10% { opacity: 1; } 85% { opacity: 0.9; } 100% { transform: translateY(-100px) scale(0.15); opacity: 0; } }
  @keyframes particleSparkle { 0%, 100% { opacity: 0.1; transform: scale(0.6); } 50% { opacity: 1; transform: scale(1.6); } }
</style>
</head>
<body>

<!-- Preview Bar -->
<div class="preview-bar">
  <div class="dot"></div>
  <span>Helm Preview</span>
  <span>PREVIEW_DATE_DISPLAY</span>
  <span class="warn">not pushed</span>
  <div class="dot"></div>
</div>

<div class="panels">

  <!-- ── YEMI'S PANEL ── -->
  <div class="panel yemi-panel">
    <div id="y-particles"></div>
    <div class="ribbon r1"></div>
    <div class="ribbon r2"></div>
    <div class="ribbon r3"></div>
    <div class="ribbon r4"></div>
    <div class="y-top-line"></div>
    <div class="y-center">
      <div class="y-label">PYEMI_LABEL</div>
      <div class="y-deco"></div>
      <div class="y-quote-mark">"</div>
      <p class="y-quote">PYEMI_QUOTE</p>
      <div class="y-divider"></div>
      <div class="y-attribution">for you today</div>
    </div>
    <div class="y-bottom">
      <div class="y-dot"></div>
      <div class="y-date">PYEMI_DATE</div>
      <div class="y-panel-label">your card</div>
    </div>
    <div class="y-bottom-line"></div>
  </div>

  <div class="divider"></div>

  <!-- ── IDEKA'S PANEL ── -->
  <div class="panel ideka-panel">
    <div id="i-particles"></div>
    <div id="i-wordglitter"></div>
    <div class="i-shimmer"></div>
    <div class="i-top-line"></div>
    <div class="i-center">
      <div class="i-label">PIDEKA_LABEL</div>
      <div class="i-deco"></div>
      <div class="i-quote-mark">"</div>
      <p class="i-quote">PIDEKA_QUOTE</p>
      <div class="i-divider"></div>
      <div class="i-attribution">for you today</div>
    </div>
    <div class="i-bottom">
      <div class="i-dot"></div>
      <div class="i-date">PIDEKA_DATE</div>
      <div class="i-panel-label">her card</div>
    </div>
    <div class="i-bottom-line"></div>
  </div>

</div>

<script>
// Yemi blue particles
(function(){
  var pc=document.getElementById('y-particles');
  var cols=['rgba(90,130,255,0.7)','rgba(120,160,255,0.65)','rgba(160,190,255,0.6)','rgba(90,130,255,0.55)'];
  for(var i=0;i<18;i++){
    var p=document.createElement('div');
    var sz=(Math.random()*2.5+1).toFixed(2);
    var gl=parseFloat(sz)*3;
    var col=cols[Math.floor(Math.random()*cols.length)];
    p.style.cssText=['position:absolute','width:'+sz+'px','height:'+sz+'px','left:'+(Math.random()*90+5).toFixed(1)+'%','top:'+(Math.random()*88+6).toFixed(1)+'%','background:'+col,'border-radius:50%','box-shadow:0 0 '+gl+'px '+gl+'px rgba(90,130,255,0.4)','animation:particleDrift '+(Math.random()*8+6).toFixed(1)+'s ease-in-out '+(Math.random()*18).toFixed(1)+'s infinite','pointer-events:none'].join(';');
    pc.appendChild(p);
  }
})();
// Ideka gold particles
(function(){
  var pc=document.getElementById('i-particles');
  var driftCols=['rgba(255,210,50,0.95)','rgba(232,184,75,0.92)','rgba(255,235,120,0.88)','rgba(255,200,40,0.85)','rgba(248,220,90,0.80)'];
  for(var i=0;i<26;i++){
    var p=document.createElement('div');
    var sz=(Math.random()*3+1.5).toFixed(2);
    var glow=parseFloat(sz)*2.5;
    var col=driftCols[Math.floor(Math.random()*driftCols.length)];
    var glowCol=col.replace(/[\d.]+\)$/,'0.6)');
    p.style.cssText=['position:absolute','width:'+sz+'px','height:'+sz+'px','left:'+(Math.random()*90+5).toFixed(1)+'%','top:'+(Math.random()*88+6).toFixed(1)+'%','background:'+col,'border-radius:50%','box-shadow:0 0 '+glow+'px '+glow+'px '+glowCol,'animation:particleDrift '+(Math.random()*8+6).toFixed(1)+'s ease-in-out '+(Math.random()*18).toFixed(1)+'s infinite','pointer-events:none'].join(';');
    pc.appendChild(p);
  }
  var sparkCols=['rgba(255,220,60,1)','rgba(255,245,160,1)','rgba(232,184,75,1)'];
  for(var j=0;j<12;j++){
    var s=document.createElement('div');
    var ssz=(Math.random()*2+1.8).toFixed(2);
    var sglow=parseFloat(ssz)*3;
    var scol=sparkCols[Math.floor(Math.random()*sparkCols.length)];
    s.style.cssText=['position:absolute','width:'+ssz+'px','height:'+ssz+'px','left:'+(Math.random()*90+5).toFixed(1)+'%','top:'+(Math.random()*88+6).toFixed(1)+'%','background:'+scol,'border-radius:50%','box-shadow:0 0 '+sglow+'px '+sglow+'px rgba(255,200,50,0.7)','animation:particleSparkle '+(Math.random()*3+2).toFixed(1)+'s ease-in-out '+(Math.random()*6).toFixed(1)+'s infinite','pointer-events:none'].join(';');
    pc.appendChild(s);
  }
})();
// Ideka word glitter
(function(){
  var wg=document.getElementById('i-wordglitter');
  var gc=['rgba(255,215,50,1)','rgba(255,235,120,0.97)','rgba(232,184,75,0.95)','rgba(255,255,160,0.92)','rgba(248,210,60,0.98)'];
  function spawnFaller(){
    var p=document.createElement('div');
    var panel=document.querySelector('.ideka-panel');
    var W=panel.offsetWidth, H=panel.offsetHeight;
    var sz=(Math.random()*3.5+1.2).toFixed(1);
    var gl=parseFloat(sz)*2.8;
    var col=gc[Math.floor(Math.random()*gc.length)];
    var sx=(0.10+Math.random()*0.80)*W;
    var sy=(0.32+Math.random()*0.26)*H;
    var fall=Math.random()*140+90;
    var drift=(Math.random()-0.5)*80;
    var rot=(Math.random()>0.5?1:-1)*(Math.random()*360+180);
    var dur=Math.random()*2000+2200;
    var radius=Math.random()>0.35?'50%':'30%';
    var aspect=Math.random()>0.35?sz:(parseFloat(sz)*0.55).toFixed(1);
    p.style.cssText=['position:absolute','width:'+sz+'px','height:'+aspect+'px','left:'+sx.toFixed(0)+'px','top:'+sy.toFixed(0)+'px','background:'+col,'border-radius:'+radius,'box-shadow:0 0 '+gl+'px '+gl+'px rgba(255,200,50,0.65)','pointer-events:none'].join(';');
    wg.appendChild(p);
    var anim=p.animate([{transform:'translateY(0px) translateX(0px) rotate(0deg)',opacity:1},{transform:'translateY('+fall+'px) translateX('+drift+'px) rotate('+rot+'deg)',opacity:0}],{duration:dur,easing:'ease-in',fill:'forwards'});
    anim.onfinish=function(){if(wg.contains(p))wg.removeChild(p);};
  }
  for(var k=0;k<12;k++){setTimeout(spawnFaller,1400+k*150);}
  setInterval(spawnFaller,500);
})();
</script>
</body>
</html>'''


# ============================================================
# BUILD PREVIEW
# ============================================================

def build_preview(preview_date_str):
    pulse_dir = os.path.expanduser("~/Pulse")
    months = ["January","February","March","April","May","June",
              "July","August","September","October","November","December"]

    d = date.fromisoformat(preview_date_str)
    pretty_date = f"{months[d.month-1]} {d.day} · {d.year}"

    # Ideka's card
    if preview_date_str not in CARDS:
        print(f"⚠️  No Ideka card scheduled for {preview_date_str}.")
        i_label, i_quote, i_image = "no card scheduled", f"Nothing scheduled for {preview_date_str}.", "images/i5_clutch_perfume.jpg"
    else:
        i_label, i_quote, _, i_image = CARDS[preview_date_str]

    # Yemi's card
    if preview_date_str not in YEMI_CARDS:
        y_label, y_quote = "no card scheduled", f"Nothing scheduled for {preview_date_str}."
    else:
        y_label, y_quote = YEMI_CARDS[preview_date_str]

    html = (PREVIEW_TEMPLATE
        .replace("PREVIEW_DATE_DISPLAY", pretty_date)
        .replace("PYEMI_LABEL",          y_label)
        .replace("PYEMI_QUOTE",          y_quote)
        .replace("PYEMI_DATE",           pretty_date)
        .replace("PIDEKA_IMAGE",         i_image)
        .replace("PIDEKA_LABEL",         i_label)
        .replace("PIDEKA_QUOTE",         i_quote)
        .replace("PIDEKA_DATE",          pretty_date)
    )

    preview_path = os.path.join(pulse_dir, "preview.html")
    with open(preview_path, "w") as f:
        f.write(html)

    print(f"✅ Preview built for {preview_date_str}")
    print(f"   Yemi  : {y_label}")
    print(f"   Ideka : {i_label}")
    print(f"   Image : {i_image}")
    print(f"   File  : {preview_path}")

    webbrowser.open(f"file://{preview_path}")
    print(f"🔍 Opened in browser — nothing pushed to GitHub.")


# ============================================================
# MAIN
# ============================================================

def main():
    # ── Preview mode ──────────────────────────────────────
    if len(sys.argv) >= 2 and sys.argv[1] == "--preview":
        if len(sys.argv) == 3:
            preview_date = sys.argv[2]          # specific date e.g. 2026-03-20
        else:
            tomorrow = date.today() + timedelta(days=1)
            preview_date = tomorrow.isoformat() # default: tomorrow
        build_preview(preview_date)
        return

    # ── Normal build mode ─────────────────────────────────
    today = date.today().isoformat()
    pulse_dir = os.path.expanduser("~/Pulse")

    if today not in CARDS:
        print(f"No card scheduled for {today}. Check PULSE_30DAYS.md.")
        return

    label, quote, attribution, image_path = CARDS[today]
    html = build_html(label, quote, attribution, image_path, today)

    output_path = os.path.join(pulse_dir, "index.html")
    with open(output_path, "w") as f:
        f.write(html)
    print(f"✅ Card built for {today}")
    print(f"   Label : {label}")
    print(f"   Image : {image_path}")

    # Git push
    os.chdir(pulse_dir)
    result = subprocess.run(["git", "add", "."], check=True)
    commit = subprocess.run(
        ["git", "commit", "-m", f"Pulse {today}"],
        capture_output=True, text=True
    )
    if commit.returncode == 0:
        subprocess.run(["git", "push"], check=True)
        print(f"✅ Pushed → Vercel deploying now")
        print(f"🔗 https://pulse-ruddy-three.vercel.app")
    else:
        print("ℹ️  Nothing to commit (card unchanged).")

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
gen_icons.py — generates the full icon set for MyAtlas.app
Outputs into  src-tauri/icons/  (all sizes required by Tauri v2).

Run:  python3 src-tauri/gen_icons.py
Deps: pip install Pillow --break-system-packages
"""

import math
import os
import struct
import subprocess
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("Installing Pillow…")
    subprocess.run(["pip3", "install", "Pillow", "--break-system-packages", "-q"])
    from PIL import Image, ImageDraw, ImageFont

ICONS_DIR = Path(__file__).parent / "icons"
ICONS_DIR.mkdir(exist_ok=True)

# ── Brand colours ──────────────────────────────────────────────────────────────
BG          = (8,   8,  15)        # #08080f — dashboard background
HEX_FILL    = (20,  28,  60)       # hex body (deep navy)
HEX_BORDER  = (90, 130, 255)       # #5a82ff — blue accent
TEXT_COLOR  = (224, 221, 214)      # #e0ddd6 — warm white


def hexagon_points(cx, cy, r, flat_top=True):
    """Return list of (x,y) for a regular hexagon centred at (cx,cy) with radius r."""
    pts = []
    for i in range(6):
        angle = math.radians(60 * i + (0 if flat_top else 30))
        pts.append((cx + r * math.cos(angle), cy + r * math.sin(angle)))
    return pts


def draw_icon(size: int) -> Image.Image:
    scale = 4                            # supersample factor
    S     = size * scale
    img   = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d     = ImageDraw.Draw(img)

    cx, cy = S / 2, S / 2
    pad    = S * 0.06
    r_out  = cx - pad                   # outer hex radius
    r_in   = r_out * 0.82               # inner hex (creates border effect)
    stroke = max(1, int(S * 0.025))     # glow ring thickness

    # ── Background circle (rounded feel) ──────────────────────────────────────
    d.ellipse([pad * 0.5, pad * 0.5, S - pad * 0.5, S - pad * 0.5],
              fill=BG + (255,))

    # ── Outer hex fill ─────────────────────────────────────────────────────────
    d.polygon(hexagon_points(cx, cy, r_out), fill=HEX_FILL + (255,))

    # ── Hex border (drawn as slightly smaller filled hex over the fill) ─────────
    # Simulate a thick border by drawing multiple offset rings
    for t in range(stroke, 0, -1):
        alpha = int(255 * (t / stroke) ** 1.4)
        d.polygon(hexagon_points(cx, cy, r_out - t + stroke // 2),
                  outline=HEX_BORDER + (alpha,), fill=None)

    # ── Inner hex (cut out darker centre for depth) ───────────────────────────
    inner_fill = tuple(max(0, c - 6) for c in HEX_FILL) + (255,)
    d.polygon(hexagon_points(cx, cy, r_in), fill=inner_fill)

    # ── Monogram "M·A" ────────────────────────────────────────────────────────
    font_size = int(S * 0.28)
    try:
        # Try system fonts on macOS
        for fname in [
            "/System/Library/Fonts/SFNS.ttf",
            "/System/Library/Fonts/SFNSText.ttf",
            "/Library/Fonts/SF-Pro-Display-Bold.otf",
            "/System/Library/Fonts/Helvetica.ttc",
        ]:
            if Path(fname).exists():
                font = ImageFont.truetype(fname, font_size)
                break
        else:
            font = ImageFont.load_default()
    except Exception:
        font = ImageFont.load_default()

    text = "MA"
    bbox = d.textbbox((0, 0), text, font=font)
    tw   = bbox[2] - bbox[0]
    th   = bbox[3] - bbox[1]
    tx   = cx - tw / 2 - bbox[0]
    ty   = cy - th / 2 - bbox[1] - S * 0.01   # slight upward nudge

    # Subtle shadow
    d.text((tx + 2, ty + 3), text, font=font, fill=(0, 0, 0, 120))
    # Main text
    d.text((tx, ty), text, font=font, fill=TEXT_COLOR + (255,))

    # ── Small hex accent dot (top-right corner) ────────────────────────────────
    dot_r   = S * 0.055
    dot_cx  = cx + r_out * math.cos(math.radians(30)) * 0.72
    dot_cy  = cy - r_out * math.sin(math.radians(30)) * 0.72
    d.polygon(hexagon_points(dot_cx, dot_cy, dot_r, flat_top=False),
              fill=HEX_BORDER + (200,))

    # ── Downsample ────────────────────────────────────────────────────────────
    return img.resize((size, size), Image.LANCZOS)


# ── PNG sizes required by Tauri ────────────────────────────────────────────────

PNG_SIZES = {
    "32x32.png":        32,
    "128x128.png":      128,
    "128x128@2x.png":   256,   # @2x = 256 px
    "icon.png":         512,   # base for .icns conversion
}

print("Generating PNG icons…")
images = {}
for filename, px in PNG_SIZES.items():
    img = draw_icon(px)
    out = ICONS_DIR / filename
    img.save(out, "PNG")
    images[px] = img
    print(f"  ✓  {filename}  ({px}px)")


# ── .icns via iconutil (macOS only) ──────────────────────────────────────────

ICNS_SIZES = {
    "icon_16x16.png":       16,
    "icon_16x16@2x.png":    32,
    "icon_32x32.png":       32,
    "icon_32x32@2x.png":    64,
    "icon_128x128.png":     128,
    "icon_128x128@2x.png":  256,
    "icon_256x256.png":     256,
    "icon_256x256@2x.png":  512,
    "icon_512x512.png":     512,
    "icon_512x512@2x.png":  1024,
}

iconset_dir = ICONS_DIR / "icon.iconset"
iconset_dir.mkdir(exist_ok=True)

print("\nBuilding .iconset for macOS…")
for fname, px in ICNS_SIZES.items():
    img = draw_icon(px)
    img.save(iconset_dir / fname, "PNG")

# Run iconutil if on macOS
try:
    result = subprocess.run(
        ["iconutil", "-c", "icns", str(iconset_dir), "-o", str(ICONS_DIR / "icon.icns")],
        capture_output=True, text=True
    )
    if result.returncode == 0:
        print("  ✓  icon.icns  (via iconutil)")
    else:
        # Fallback: copy the 512px PNG as a stand-in
        import shutil
        shutil.copy(ICONS_DIR / "icon.png", ICONS_DIR / "icon.icns")
        print("  ⚠  icon.icns  (iconutil unavailable — copied 512px PNG as placeholder)")
except FileNotFoundError:
    import shutil
    shutil.copy(ICONS_DIR / "icon.png", ICONS_DIR / "icon.icns")
    print("  ⚠  icon.icns  (iconutil not found — placeholder copied)")


# ── .ico (Windows, required by Tauri even on macOS bundles) ──────────────────

print("\nGenerating icon.ico…")
ico_sizes = [16, 24, 32, 48, 64, 128, 256]
ico_images = [draw_icon(s) for s in ico_sizes]
ico_images[0].save(
    ICONS_DIR / "icon.ico",
    format="ICO",
    sizes=[(s, s) for s in ico_sizes],
    append_images=ico_images[1:],
)
print("  ✓  icon.ico")


print(f"\n✓ All icons written to {ICONS_DIR.resolve()}\n")
print("Next step:")
print("  cd ~/myatlas && npm install && npm run tauri:build")

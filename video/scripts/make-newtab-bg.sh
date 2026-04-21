#!/usr/bin/env bash
set -euo pipefail
SRC="${1:-${HOME}/Downloads/fake-browser-background.jpg}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
OUT="${REPO_ROOT}/landing/public/assets/newtab-bg.webp"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

command -v magick >/dev/null || { echo "install ImageMagick 7"; exit 1; }
[[ -f "$SRC" ]] || { echo "missing $SRC"; exit 1; }
mkdir -p "$(dirname "$OUT")"

# 1. Fiber substrate (cardboard paper) — anisotropic fiber noise, not isotropic Gaussian.
magick -size 1920x1080 xc: +noise Random -virtual-pixel tile \
  -blur 0x0.6 -shade 120x25 -colorspace gray \
  -auto-level -evaluate multiply 0.55 -evaluate add 35% \
  "$TMP/paper.png"

# 2. 6-swatch pastel palette (warm Cursor-esque tones). Remap clamps the image
# into a cohesive painterly palette + kills JPEG microcolor noise.
magick -size 6x1 xc: \
  -fill '#E8D5C4' -draw 'point 0,0' \
  -fill '#D4A5A5' -draw 'point 1,0' \
  -fill '#8FA8B8' -draw 'point 2,0' \
  -fill '#C9B09B' -draw 'point 3,0' \
  -fill '#F2E3D0' -draw 'point 4,0' \
  -fill '#5A6B7A' -draw 'point 5,0' \
  "$TMP/palette.png"

# 3. Painterly base: LAB-space luma blur (keeps chroma), kuwahara, oilpaint,
# posterize + dithered remap.
magick "$SRC" \
  -resize 1920x1080^ -gravity center -extent 1920x1080 \
  -colorspace LAB -channel R -blur 0x1.5 +channel -colorspace sRGB \
  -modulate 102,72,104 \
  -kuwahara 3 \
  -paint 6 \
  -posterize 8 \
  -dither FloydSteinberg -remap "$TMP/palette.png" \
  "$TMP/base.png"

# 4. Edge-relief pass: Difference-of-Gaussians → faint dark outlines around
# shapes so the image has "etched" relief where brush strokes end.
magick "$TMP/base.png" \
  \( +clone -blur 0x1 \) \
  \( -clone 0 -blur 0x4 \) \
  -delete 0 -compose Minus -composite -negate \
  -level 88%,100% -colorspace gray \
  "$TMP/edges.png"

# 5. Composite everything: base + fiber Overlay (55) + edges Multiply (22) +
# vignette + faint Gaussian grain for final film feel.
magick "$TMP/base.png" \
  \( "$TMP/paper.png" \) -compose Overlay -define compose:args=55 -composite \
  \( "$TMP/edges.png" \) -compose Multiply -define compose:args=22 -composite \
  \( +clone -fill black -colorize 100 \
     -draw "circle 960,540 960,80" -blur 0x120 -negate \) \
  -compose Multiply -composite \
  -attenuate 0.25 +noise Gaussian \
  -quality 90 "$OUT"

# Mirror into Remotion's static-file directory so `staticFile("backgrounds/newtab-bg.webp")` resolves.
REMOTION_OUT="${REPO_ROOT}/video/public/backgrounds/newtab-bg.webp"
mkdir -p "$(dirname "$REMOTION_OUT")"
cp "$OUT" "$REMOTION_OUT"

echo "[make-newtab-bg] wrote $OUT + $REMOTION_OUT"

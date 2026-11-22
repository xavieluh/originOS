# OriginOS launch poster

Vertical promotional poster, 24 × 36 in (2:3), headline "The internet needs receipts."
OriginOS is in development (see `docs/BUILD_STATE.md`), so the poster presents it as upcoming and labels the receipt as an illustrative sample.

| File | What it is |
| --- | --- |
| `originos-poster-24x36.png` | 3600 × 5400 px (150 ppi at 24 × 36 in), for digital use and most print shops |
| `originos-poster-24x36.pdf` | 24 × 36 in PDF; text and shapes are vector, the glow, shadow and grain are rasterized |
| `poster.html` | Source. Canvas is 1200 × 1800 CSS px; edit copy and colors here |
| `render.js` | Playwright export script |
| `fonts/` | Instrument Serif, IBM Plex Mono, Inter (SIL Open Font License; license files included) |

The URL/QR area (bottom right) is reserved because no website or QR code exists yet.

## Re-export

Run from this folder; Playwright with Chromium must be available.

```bash
node render.js poster.html originos-poster-24x36.png 3
```

```bash
node render.js poster.html originos-poster-24x36.pdf 1
```

Add `clean` as a fourth argument to hide the "URL / QR reserved" label, leaving only the corner marks:

```bash
node render.js poster.html originos-poster-24x36-clean.png 3 clean
```

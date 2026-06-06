# Hand-supplied promo frames

Drop screenshots here to override the generator's live captures. `generate.mjs`
prefers `input/<slot>.{png,jpg,jpeg}` over the auto-captured `build/promo/raw/<slot>.png`,
so your image survives re-runs and gets the same branded frame + caption treatment.

## Slots

| File | Shot | Notes |
|---|---|---|
| `a-connect.png` | 1 — connect / push to controller | Ideally a real **connected** state (green pill + live panel). With no file here, shot 1 falls back to a rendered install card. |
| `c-preview.png` | 2 — 1D/2D/3D preview | Preview pane only. |
| `b-edit.png`    | 3 — edit in browser | Editor + preview deck. |
| `d-editor.png`  | 4 — editor intelligence | Autocomplete / error highlight / library code. |

## Tips

- **Don't pre-crop tightly.** The generator insets the frame into a branded canvas;
  give a little margin. I (Claude) will pick the crop from what you drop here.
- **Resolution:** capture at 2x / Retina if you can — sharper when scaled into the tile.
- **Format:** PNG preferred (lossless). JPEG/JPEG also accepted.
- After adding files, re-run `npm run promo` (or `node scripts/promo/generate.mjs`).
  Supplied slots skip live capture; the rest are still captured from the dev server.

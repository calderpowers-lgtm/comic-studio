# Comic Studio

## Free mode (default): uses your ChatGPT subscription, makes zero API calls

Open http://localhost:5180 (or the static build). Everything runs in the browser: plans, prompts, uploads, lettering and export. Data is stored on the device (localStorage + IndexedDB).

1. **Story**: paste a script or idea and choose the slide count (default 10).
2. **Plan slides**: either copy the prompt into ChatGPT and paste the JSON reply back (the parser tolerates code fences, chatty text, smart quotes, trailing commas and cut-off replies), or use the **Quick plan**, where `CAPTION:` / `NAME:` lines become slides.
3. **Characters** (optional): copy a reference-sheet prompt per character and upload the result.
4. **Draw in ChatGPT**: download the 4 style images (plus any sheets) as a zip, attach them to the first message of ONE ChatGPT chat, paste Slide 1's full prompt, then the short "Next panel" prompts. Copy-all is available.
5. **Add pictures**: drop or pick all images at once. They fill empty slides oldest-first and are auto-cropped to 4:5. Swap with ← →, drag tiles, Replace, Frame sliders.
6. **Text & export**: edit, move and re-aim the wavy boxes; download a PDF or PNG zip (or Share on phones).

**Hosting it as a static site:** `npm run build:static` creates `dist-static/` with relative paths and no server or API code. Upload that folder to any static host: Netlify Drop (drag the folder in), Cloudflare Pages, GitHub Pages or Vercel. It must be served over HTTPS for copy-to-clipboard and phone sharing. Each device keeps its own comics; there is no sync between phone and laptop.

The paid API studio below is still available at `/studio.html` when running the local server.

# Comic Studio · API mode (optional, paid)

Feed it a script or idea plus a style (text + reference images) and get a finished, lettered comic: an Instagram carousel (default) or multi-panel pages, exported as PNGs and a PDF.

## Run

```bash
cd /workspace/comic-studio
npm run dev            # http://localhost:5180  (one process: API + Vite/React UI)
# with OpenAI:
OPENAI_API_KEY=<your key> npm run dev
```

With no `OPENAI_API_KEY` the app runs in **mock mode**: a rule-based breakdown plus procedurally drawn placeholder art in the same flat, inked style. The whole pipeline works end to end, including lettering and export. You can also force mock mode per comic (Rendering → Engine).

Optional env: `OPENAI_TEXT_MODEL` (default `gpt-6.1-sol`), `OPENAI_IMAGE_MODEL` (default `gpt-image-2.5-sunburst`; use `gpt-image-2.5-flare` for faster and cheaper output), `IMAGE_CONCURRENCY` (3), `PORT` (5180).

## Pipeline

1. **Breakdown** (`gpt-6.1-sol`, Responses API, strict JSON schema). The script and the reference images (vision) produce a style bible (line art, shading, backgrounds, character design, texture, lighting, mood, hex palette, avoid-list), characters with drawable descriptions, and pages → panels (shot, size, setting, description, staging positions, and lettering with type and speaker). Everything is editable in the UI.
2. **Character sheets** (`/v1/images/edits` with the style refs). One three-view model sheet per character, generated once and reused.
3. **Panels** (`/v1/images/edits`). Each request sends that panel's character sheets plus 2 style refs. The output size matches the panel's aspect ratio (for example 1040×1312 for a 4:5 slide). Every prompt carries the style bible, a strict NO TEXT / no borders / no multi-panel rule, and anti-AI-look rules (hand-inked wobbly lines, flat fills, sparse backgrounds, no gradients, glow, bokeh, or CGI look). Carousel prompts keep the top 25% empty for the narration box.
4. **Composition and lettering in code** (`shared/compose.js`). The same module renders the live editor canvas in the browser and the exports on the server. It draws the borders, margins, gutters and varied panel grids, plus wavy hand-drawn caption boxes, speech balloons with thin curvy tails, thought clouds, shout bursts, whisper dashes and SFX. Fonts are Comic Neue Bold (default, all caps), Patrick Hand, and Bangers for SFX, all under the OFL licence (`assets/fonts`).
5. **Optional print look** (`server/postprocess.js`). Toggleable palette snap, halftone dots and paper grain. It is on by default in the Classic Ink Pages preset.

## Presets

- **Deadpan Carousel** (default): 10 slides, 1080×1350, one panel each, thick border with a white margin, wavy narration boxes at the top. Its built-in reference images are in `assets/presets/carousel/`.
- **Classic Ink Pages**: multi-panel pages (US comic, manga, square or landscape), classic oval balloons, halftone.

## Files

```
server/index.js        Express API + Vite middleware (one port)
server/pipeline.js     breakdown → sheets → panels, background render job
server/prompts.js      JSON schema, breakdown prompt, panel and sheet prompts
server/openai.js       REST client (Responses + Images), cost tracking from usage
server/mock.js         mock breakdown + procedural placeholder art
server/render.js       server-side page render, PDF (pdf-lib), PNG zip
server/postprocess.js  palette snap, halftone, grain
server/presets.js      style presets
shared/compose.js      layout + lettering (browser and Node)
client/src/*           React UI (Setup, Breakdown, Cast, Comic editor)
data/projects/<id>/    project.json, refs/, sheets/, art/
scripts/sample.js      mock end-to-end render → sample/
scripts/ui-check.js    headless-browser UI walkthrough → sample/ui/
scripts/fake-openai.js fake OpenAI server for testing the wiring without a key
```

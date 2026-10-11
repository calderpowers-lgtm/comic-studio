// Copy-paste prompts for the free ChatGPT workflow (no API calls).

const bibleLines = (b = {}) => [
  b.summary && `- Overall: ${b.summary}`,
  b.line_art && `- Lines: ${b.line_art}`,
  b.shading && `- Shading: ${b.shading}`,
  b.backgrounds && `- Backgrounds: ${b.backgrounds}`,
  b.character_design && `- Characters: ${b.character_design}`,
  b.lighting && `- Lighting: ${b.lighting}`,
  b.mood && `- Mood: ${b.mood}`,
  b.palette?.length && `- Colours: flat, bright, limited palette such as ${b.palette.map((p) => `${p.name} ${p.hex}`).join(', ')}`,
].filter(Boolean).join('\n');

const RULES = `- Tall PORTRAIT image, 4:5 shape (e.g. 1024×1280). One single picture that fills the whole frame.
- NO text at all: no words, letters, numbers, captions, speech bubbles, thought bubbles, signs with writing, sound effects, signatures or watermarks.
- NO panel border, frame, margin or multiple panels.
- Keep the TOP QUARTER of the picture simple and empty (plain sky, wall or foliage) with no faces or important things. I will add my own text box there.
- Hand-drawn look: thick, slightly wobbly black ink outlines; completely flat colour fills; no shading, no gradients, no glossy/airbrushed or 3D look, no glow, no blur; simple, sparse background.`;

export function planPrompt(project) {
  const n = project.settings?.slides || 10;
  return `You are a comic writer. Turn my script/idea below into an Instagram comic carousel of EXACTLY ${n} slides. Each slide is ONE single panel (portrait 4:5).

Rules:
- Pace it like a carousel: a hook on slide 1, deadpan escalation, a punchline or quiet twist on the last slide.
- Each slide has usually ONE short text item (a narration caption or one line of dialogue), at most two, max ~30 words each. Keep my wording where I wrote it.
- "picture" describes only what is visible, for an illustrator. Never mention text, signs, bubbles or captions in it.
- The top quarter of every picture will be covered by a text box, so faces and key action belong in the lower three quarters.
- Give every character a short lowercase id and a specific "look" (age, build, hair shape and colour, outfit colours) in this style: ${project.styleBible?.character_design || 'simple cartoon faces, dot eyes, line mouth, blocky hair'}.

Reply with ONLY one JSON code block, exactly in this format (no comments, no extra text):
\`\`\`json
{
  "title": "Short title",
  "characters": [
    { "id": "neil", "name": "Neil", "look": "52-year-old man, short brown blocky hair, short beard, grey suit" }
  ],
  "slides": [
    {
      "shot": "wide | full | medium | close-up | over-the-shoulder | birds-eye",
      "setting": "beach at sunset",
      "picture": "Neil stands on the sand holding a surfboard, staring at a tiny wave.",
      "characters": [ { "id": "neil", "position": "left | center | right", "action": "holding surfboard", "expression": "deadpan" } ],
      "text": [ { "type": "caption | speech | thought | shout", "speaker": "neil (or empty for caption)", "text": "He bought the surfboard eleven years ago." } ]
    }
  ]
}
\`\`\`

STYLE: ${project.styleText || ''}

SCRIPT / IDEA:
${project.script || ''}`;
}

export function sheetPrompt(project, ch) {
  return `Create a CHARACTER REFERENCE SHEET for my comic, in the exact drawing style of the reference images I attached (copy only the drawing style; ignore any text, speech boxes, page numbers or phone icons in them).

Character: ${ch.name}: ${ch.description || '(describe)'}

Show the same character three times side by side on a plain white background: front view, three-quarter view, side view. Full body, neutral standing pose, deadpan face.
Style:
${bibleLines(project.styleBible)}
- Landscape image. NO text, names, labels or colour swatches anywhere.`;
}

function panelBody(project, panel) {
  const ch = (id) => project.characters.find((c) => c.id === id);
  const who = (panel.staging || []).map((s) => `${ch(s.character_id)?.name || s.character_id} (${s.position}${s.action ? `, ${s.action}` : ''}${s.expression ? `, ${s.expression}` : ''})`).join('; ');
  return `${panel.shot ? `Shot: ${panel.shot}. ` : ''}${panel.setting ? `Setting: ${panel.setting}. ` : ''}${panel.description}${who ? `\nWho is in it: ${who}.` : '\nNo characters.'}${panel.direction ? `\nAlso: ${panel.direction}` : ''}`;
}

export function firstPanelPrompt(project, i = 0) {
  const total = project.pages.length;
  const sheets = project.characters.filter((c) => c.sheet);
  const castLines = project.characters.map((c) => `- ${c.name}: ${c.description}`).join('\n');
  return `I'm making a ${total}-slide comic carousel and I'll ask you for one panel at a time in this chat. Every panel must use the SAME drawing style and the SAME characters.

STYLE REFERENCES: I attached reference images in this chat. Copy only their drawing style (line work, flat colours, simple faces, simple backgrounds). Ignore any text, speech boxes, page numbers or phone icons in them, and don't copy their characters.${sheets.length ? `\nCHARACTER SHEETS: I also attached character sheets for ${sheets.map((c) => c.name).join(', ')}. Keep them looking exactly like that in every panel.` : ''}

STYLE:
${bibleLines(project.styleBible)}

CHARACTERS:
${castLines || '- (none)'}

RULES FOR EVERY PANEL:
${RULES}

Now draw PANEL ${i + 1} of ${total}:
${panelBody(project, project.pages[i].panels[0])}`;
}

export function nextPanelPrompt(project, i) {
  return `Next panel: PANEL ${i + 1} of ${project.pages.length}. Same style, same characters, same rules (4:5 portrait, no text, no speech bubbles, no border, top quarter simple and empty).
${panelBody(project, project.pages[i].panels[0])}`;
}

export const panelPrompt = (project, i) => (i === 0 ? firstPanelPrompt(project, 0) : nextPanelPrompt(project, i));
export const allPrompts = (project) => project.pages.map((_, i) => `===== SLIDE ${i + 1} =====\n${panelPrompt(project, i)}`).join('\n\n');
// For redoing one panel in a fresh chat: the full context + that panel.
export const standalonePrompt = (project, i) => firstPanelPrompt(project, i);

// ---------------- "one prompt, one upload" grid prompt ----------------
const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th'];
function shortPanel(project, panel) {
  const ch = (id) => project.characters.find((c) => c.id === id)?.name || id;
  const who = (panel.characters || []).map(ch);
  return `${panel.shot ? panel.shot.replace(/-/g, ' ') + ' shot' : 'Shot'}${panel.setting ? `, ${panel.setting}` : ''}. ${panel.description}${who.length ? ` (In it: ${who.join(', ')}.)` : ''}`.replace(/\s+/g, ' ').trim();
}

/**
 * The whole comic in ONE ChatGPT image (or one of two, when `sheets.length === 2`).
 * sheets: from shared/grid.js sheetPlan(); k: which sheet this prompt is for.
 */
export function gridPrompt(project, sheets, k = 0) {
  const sh = sheets[k];
  const { rows, cols, count, start, canvas } = sh;
  const total = project.pages.length;
  const sizeWord = canvas === 'landscape' ? 'WIDE landscape image (3:2, 1536×1024)' : canvas === 'portrait' ? 'TALL portrait image (2:3, 1024×1536)' : 'SQUARE image (1024×1024)';
  const castLines = project.characters.map((c) => `- ${c.name}: ${c.description}`).join('\n');
  const blanks = rows * cols - count;
  const panels = project.pages.slice(start, start + count).map((pg, i) => {
    const r = Math.floor(i / cols), c = i % cols;
    return `PANEL ${i + 1} (row ${r + 1}, ${ORD[c] || c + 1 + 'th'} from left): ${shortPanel(project, pg.panels[0])}`;
  }).join('\n');
  const intro = sheets.length > 1
    ? (k === 0
      ? `I'm making a ${total}-panel comic. You'll draw it as TWO images. This is IMAGE 1 of 2: panels 1–${count} of the story.`
      : `Now IMAGE 2 of 2, panels ${start + 1}–${start + count} of the story. Exactly the same style, characters and layout rules as image 1.`)
    : `Draw my whole ${count}-panel comic as ONE image: a grid of panels that I will cut apart into separate Instagram slides.`;
  if (k > 0) {
    return `${intro}

LAYOUT: ONE ${sizeWord}. Exactly ${rows} row${rows > 1 ? 's' : ''} × ${cols} column${cols > 1 ? 's' : ''} = ${rows * cols} panels${blanks ? ` (leave the last ${blanks} cell${blanks > 1 ? 's' : ''} as plain white paper)` : ''}, all the same size and the same tall 4:5 portrait shape, separated by thin plain WHITE gutters with a white margin around the edge. Reading order left→right, top→bottom.
No text anywhere (no words, numbers, speech bubbles, captions or sound effects). Keep the top quarter of every panel simple (plain sky, wall or foliage). Same characters, same faces, same outfits.

${panels}`;
  }
  return `${intro}

I attached style reference images. Copy only their DRAWING STYLE (line work, flat colours, simple faces, simple backgrounds). Ignore any text, speech boxes, page numbers or phone icons in them, and don't copy their characters.

LAYOUT (very important, the image will be cut automatically):
- ONE ${sizeWord}.
- An exact grid: ${rows} row${rows > 1 ? 's' : ''} × ${cols} column${cols > 1 ? 's' : ''} = ${rows * cols} panels${blanks ? `; panels 1–${count} hold the story and the last ${blanks} cell${blanks > 1 ? 's stay' : ' stays'} plain white paper` : ''}.
- Every panel is the SAME size and the SAME tall portrait shape (4:5, taller than wide). If space is left over, leave it as white margin outside the grid.
- Panels are separated by thin, straight, plain WHITE gutters of equal width, with a thin white margin around the outside. Nothing crosses a gutter; nothing overlaps.
- Reading order: left to right, then top to bottom. Panel 1 is top-left.
- Do NOT draw panel numbers, titles or captions; the numbers below are only for you.

STYLE:
${bibleLines(project.styleBible)}

CHARACTERS (keep them IDENTICAL in every panel: same face, hair, body and outfit):
${castLines || '- (none)'}

IN EVERY PANEL:
- NO text at all: no words, letters, numbers, speech bubbles, thought bubbles, captions, signs with writing, sound effects, signatures or watermarks. I add all the text myself later.
- Keep the TOP QUARTER of each panel simple and empty (plain sky, wall or foliage), with faces and important things in the lower three quarters. My text box goes on top.
- Thick, slightly wobbly black ink outlines; completely flat colours; no shading, gradients, glow, blur or 3D look; simple sparse backgrounds.
- Vary the camera (wide, medium, close-up) as described, like a real comic.

THE PANELS:
${panels}`;
}

// ---------------- default: separate images, one per reply, in ONE chat ----------------
export function seriesPrompt(project) {
  const total = project.pages.length;
  const castLines = project.characters.map((c) => `- ${c.name}: ${c.description}`).join('\n');
  const panels = project.pages.map((pg, i) => `PANEL ${i + 1}: ${shortPanel(project, pg.panels[0])}`).join('\n');
  return `I'm making a ${total}-panel comic for an Instagram carousel. Please draw it as ${total} SEPARATE images, ONE panel per image, ONE image per reply.

Start now with PANEL 1 only. After each image, stop and wait. When I reply "next", draw the next panel as a new, separate image. Keep going until panel ${total}. Never put two panels in one image, and never make a grid or comic page.

I attached style reference images. Copy only their DRAWING STYLE (line work, flat colours, simple faces, simple backgrounds). Ignore any text, speech boxes, page numbers or phone icons in them, and don't copy their characters.

EVERY IMAGE:
- One single picture, TALL PORTRAIT (1024×1536). Keep the important things in the middle so it can be cropped to 4:5.
- NO text at all: no words, letters, numbers, speech bubbles, thought bubbles, captions, signs with writing, sound effects, signatures or watermarks. I add all the text myself.
- Keep the TOP QUARTER simple and empty (plain sky, wall or foliage), with faces and important things lower down. My text box goes on top.
- No panel border or frame.
- Keep the characters IDENTICAL in every image: same face, hair, body and outfit.

STYLE:
${bibleLines(project.styleBible)}

CHARACTERS:
${castLines || '- (none)'}

THE ${total} PANELS (draw them in this order, one per reply):
${panels}

Draw PANEL 1 now.`;
}

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

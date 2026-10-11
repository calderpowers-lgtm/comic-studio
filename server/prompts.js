// Prompt + schema construction. Every image prompt carries the style bible,
// hard "no text / no layout" rules and anti-AI-look guidance.

const SHOTS = ['establishing', 'wide', 'full', 'medium', 'medium-close', 'close-up', 'extreme-close-up', 'over-the-shoulder', 'low-angle', 'high-angle', 'birds-eye'];
const POS = ['left', 'center-left', 'center', 'center-right', 'right'];
const LTYPES = ['caption', 'speech', 'thought', 'shout', 'whisper', 'sfx'];

export const breakdownSchema = {
  type: 'object', additionalProperties: false,
  required: ['title', 'style_bible', 'characters', 'pages'],
  properties: {
    title: { type: 'string' },
    style_bible: {
      type: 'object', additionalProperties: false,
      required: ['summary', 'line_art', 'shading', 'backgrounds', 'character_design', 'texture', 'lighting', 'mood', 'palette', 'avoid'],
      properties: {
        summary: { type: 'string' }, line_art: { type: 'string' }, shading: { type: 'string' }, backgrounds: { type: 'string' },
        character_design: { type: 'string' }, texture: { type: 'string' }, lighting: { type: 'string' }, mood: { type: 'string' },
        palette: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'hex'], properties: { name: { type: 'string' }, hex: { type: 'string' } } } },
        avoid: { type: 'array', items: { type: 'string' } },
      },
    },
    characters: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['id', 'name', 'visual_description', 'is_main'], properties: { id: { type: 'string' }, name: { type: 'string' }, visual_description: { type: 'string' }, is_main: { type: 'boolean' } } },
    },
    pages: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['panels'],
        properties: {
          panels: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false,
              required: ['shot', 'size', 'setting', 'description', 'characters', 'staging', 'lettering'],
              properties: {
                shot: { type: 'string', enum: SHOTS },
                size: { type: 'string', enum: ['small', 'medium', 'large', 'splash'] },
                setting: { type: 'string' },
                description: { type: 'string' },
                characters: { type: 'array', items: { type: 'string' } },
                staging: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['character_id', 'position', 'action', 'expression'], properties: { character_id: { type: 'string' }, position: { type: 'string', enum: POS }, action: { type: 'string' }, expression: { type: 'string' } } } },
                lettering: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['type', 'speaker', 'text'], properties: { type: { type: 'string', enum: LTYPES }, speaker: { type: 'string' }, text: { type: 'string' } } } },
              },
            },
          },
        },
      },
    },
  },
};

export function breakdownPrompts(project, nRefs) {
  const s = project.settings;
  const carousel = s.format !== 'pages';
  const system = `You are a veteran comic writer, editor and art director. You turn a script or a loose idea into a production-ready comic breakdown and a strict visual style bible.
Rules:
- Characters: give each recurring character a short lowercase id (e.g. "neil"), a name, and a very specific, drawable visual_description (age, build, face, hair shape and colour, outfit with exact colours, signature props). Keep descriptions consistent with the style.
- Panel description: what is literally visible, written for an illustrator. Never mention text, signs with words, speech bubbles or captions in descriptions.
- Lettering is placed by software later. Keep each balloon/caption short (max ~30 words). "speaker" is a character id for speech/thought/shout/whisper, or "" for captions and SFX.
- staging: horizontal position of each visible character so balloon tails can point at them.
- Style bible: derive it from the user's style text AND the attached reference images (if any). Ignore any text, speech boxes, page counters, play/sound icons or phone UI in the references — study only line work, colour, shapes and character design. Palette: 6-12 hex colours actually used. "avoid" lists things that would make the art look AI-generated or off-style.
${carousel
  ? `- FORMAT: Instagram carousel. Produce EXACTLY ${s.slides} pages; each page has EXACTLY ONE panel (portrait 4:5). Usually one lettering item per slide (narration caption or one line of dialogue), at most two. The top ~25% of every panel will be covered by a narration/speech box, so stage all faces and key action in the lower 75%. Pace it like a carousel: hook on slide 1, deadpan escalation, a punchline or quiet twist on the last slide.`
  : `- FORMAT: printed comic pages. Produce EXACTLY ${s.pages} pages with 3-6 panels each (vary it; use a "large" or "splash" panel for big moments, "small" for quick beats). Leave headroom in the upper part of panels for balloons.`}`;
  const user = `STYLE (from the user):\n${project.styleText || '(none given — infer from references)'}\n\n${nRefs ? `${nRefs} style reference image(s) attached.\n\n` : ''}SCRIPT / IDEA:\n${project.script}`;
  return { system, user };
}

const bibleText = (b) => [
  b.summary && `Overall: ${b.summary}`,
  b.line_art && `Line art: ${b.line_art}`,
  b.shading && `Shading: ${b.shading}`,
  b.backgrounds && `Backgrounds: ${b.backgrounds}`,
  b.character_design && `Character design: ${b.character_design}`,
  b.texture && `Texture: ${b.texture}`,
  b.lighting && `Lighting: ${b.lighting}`,
  b.mood && `Mood: ${b.mood}`,
  b.palette?.length && `Limited palette — use only these flat colours: ${b.palette.map((p) => `${p.name} ${p.hex}`).join(', ')}.`,
].filter(Boolean).join('\n');

const ANTI_AI = `Make it look hand-made by a human cartoonist, not AI-generated: hand-inked black outlines with natural slight wobble and uneven weight; flat colour fills; simple, sparse backgrounds with few objects; no glossy or airbrushed rendering; no soft gradients; no glow, bloom, rim lighting or lens flare; no depth-of-field blur or bokeh; no 3D/CGI or plastic look; no hyper-detailed textures; no extra fingers; restrained, deliberate composition.`;
const NO_TEXT = `ABSOLUTELY NO TEXT: no letters, words, numbers, captions, speech bubbles, thought balloons, sound-effect lettering, signs with writing, labels, logos, signatures or watermarks anywhere. Do NOT draw panel borders, frames, gutters, margins or multiple panels — one single full-bleed image only.`;

export function panelPrompt(project, page, panel, refInfo) {
  const b = project.styleBible || {};
  const carousel = project.settings.format !== 'pages';
  const chars = (panel.characters || []).map((id) => project.characters.find((c) => c.id === id)).filter(Boolean);
  const staging = (panel.staging || []).map((s) => {
    const c = project.characters.find((x) => x.id === s.character_id);
    return `- ${c ? c.name : s.character_id}: ${s.position} of frame; ${s.action}${s.expression ? `; expression: ${s.expression}` : ''}`;
  }).join('\n');
  const refs = [];
  refInfo.sheets.forEach((s, i) => refs.push(`Image ${i + 1} is the model sheet for ${s.name} — match their face, hair, body and outfit exactly (identity only, not the pose).`));
  if (refInfo.styleRefs) refs.push(`Images ${refInfo.sheets.length + 1}-${refInfo.sheets.length + refInfo.styleRefs} are STYLE references only: copy their line quality, colour flatness and character simplicity. Do not copy their characters, scenes, text boxes, or any text/UI in them.`);
  const avoid = (b.avoid || []).length ? `Avoid: ${b.avoid.join(', ')}.` : '';
  return [
    `A single comic panel illustration.`,
    `STYLE BIBLE\n${bibleText(b)}`,
    refs.length ? `REFERENCE IMAGES\n${refs.join('\n')}` : '',
    chars.length ? `CHARACTERS IN THIS PANEL\n${chars.map((c) => `- ${c.name}: ${c.description}`).join('\n')}` : 'No characters in this panel.',
    `SCENE\nShot: ${panel.shot}. Setting: ${panel.setting}.\n${panel.description}${staging ? `\nStaging:\n${staging}` : ''}${panel.direction ? `\nExtra direction: ${panel.direction}` : ''}`,
    carousel
      ? `COMPOSITION\nPortrait 4:5 frame. Keep the top 25% of the image simple, empty background (plain sky, wall or foliage) with no faces, heads, hands or important objects — a narration box will cover it. Place characters and action in the lower three quarters.`
      : `COMPOSITION\nKeep the upper part of the frame relatively simple so speech balloons can sit there; keep faces clear of the top edge.`,
    `RULES\n${NO_TEXT}\n${ANTI_AI}\n${avoid}`,
  ].filter(Boolean).join('\n\n');
}

export function sheetPrompt(project, ch, hasStyleRefs) {
  const b = project.styleBible || {};
  return [
    `Character model sheet for a comic: ${ch.name}. ${ch.description}`,
    `Show the same character three times side by side on a plain flat white background: front view, three-quarter view, side view, full body, neutral standing pose, relaxed deadpan expression. Identical design in all three views.`,
    hasStyleRefs ? `The attached images are STYLE references only: match their line work, flat colour and simplicity. Ignore any text or UI in them; do not copy their characters.` : '',
    `STYLE BIBLE\n${bibleText(b)}`,
    `RULES\n${NO_TEXT} No name labels, no colour swatches, no turnaround annotations.\n${ANTI_AI}`,
  ].filter(Boolean).join('\n\n');
}

// Built-in style presets. The first one is the default.
export const PRESETS = [
  {
    id: 'deadpan-carousel',
    name: 'Deadpan Carousel',
    blurb: 'Instagram-carousel webcomic. One 4:5 panel per slide, flat bright colours, wobbly hand-inked lines.',
    refs: ['carousel/ref-1.jpg', 'carousel/ref-2.jpg', 'carousel/ref-3.jpg', 'carousel/ref-4.jpg'],
    styleText:
      'Instagram-carousel webcomic. Each slide is one single panel, portrait 4:5, thick black panel border with a white margin. ' +
      'Thick, slightly wobbly hand-inked black outlines. Completely flat, bright colours: no shading, no gradients, no rendering. ' +
      'Minimal, simplified backgrounds; grass drawn as little black squiggle tufts; puffy flat clouds. ' +
      'Characters have very simple faces: dot eyes, a single line mouth, big blocky flat hair shapes. ' +
      'Deadpan and slightly absurd tone. Narration sits in a white rounded box with a wavy hand-drawn outline at the top of the panel.',
    settings: { format: 'carousel', slides: 10, pages: 6, pageAspect: 'us', quality: 'medium', postprocess: { enabled: false, paletteSnap: 0.35, halftone: false, grain: false } },
    lettering: { font: 'ComicNeueBold', uppercase: true, balloon: 'wavy', scale: 1 },
    styleBible: {
      summary: 'Deadpan Instagram webcomic: chunky wobbly black ink outlines, totally flat bright colour fills, minimal backgrounds, simple dot-eyed characters.',
      line_art: 'Thick (≈1% of image width) black outlines, slightly wobbly and uneven like a felt-tip/brush pen, closed shapes, a few loose interior lines for folds and texture marks.',
      shading: 'None. Pure flat fills. No gradients, no cell-shading, no highlights, no ambient occlusion.',
      backgrounds: 'Minimal and simplified: flat sky, a few flat puffy clouds, flat green ground with small black squiggle grass tufts, simple blob trees/bushes, simple rocks. Few objects.',
      character_design: 'Simple round faces, dot eyes, single-line mouths and brows, big blocky flat hair shapes, simple clothes in solid colours, slightly stiff deadpan poses.',
      texture: 'Clean digital flat colour with hand-drawn line irregularity. No paper texture, no halftone.',
      lighting: 'Even, flat daylight. No dramatic lighting, no rim light, no glow.',
      mood: 'Deadpan, understated, slightly absurd.',
      palette: [
        { name: 'sky', hex: '#86C9EA' }, { name: 'grass', hex: '#8DC56C' }, { name: 'foliage', hex: '#4F9A43' },
        { name: 'earth', hex: '#8B6A4E' }, { name: 'skin', hex: '#F2D3C2' }, { name: 'hair orange', hex: '#E5772B' },
        { name: 'sun yellow', hex: '#F3DB52' }, { name: 'lilac', hex: '#A57FC0' }, { name: 'stone', hex: '#9A9A96' },
        { name: 'ink', hex: '#141414' }, { name: 'white', hex: '#FFFFFF' },
      ],
      avoid: ['gradients', 'soft shading', 'airbrushing', 'glossy highlights', '3D/CGI look', 'painterly rendering', 'detailed realistic backgrounds', 'bokeh or depth of field', 'lens flares or glow', 'any text or lettering'],
    },
  },
  {
    id: 'classic-ink-pages',
    name: 'Classic Ink Pages',
    blurb: 'Multi-panel printed comic pages: brush inks, limited palette, halftone print texture.',
    refs: [],
    styleText:
      'Classic printed comic book page. Confident brush-and-nib black inks with varied line weight, spotted blacks, ' +
      'limited flat colour palette like 4-colour newsprint, subtle halftone dot texture, simple backgrounds.',
    settings: { format: 'pages', slides: 10, pages: 6, pageAspect: 'us', quality: 'medium', postprocess: { enabled: true, paletteSnap: 0.25, halftone: true, grain: true } },
    lettering: { font: 'ComicNeueBold', uppercase: true, balloon: 'classic', scale: 1 },
    styleBible: {
      summary: 'Printed comic look: brush inks, flat limited colours, halftone texture.',
      line_art: 'Hand-inked brush and nib lines with tapering line weight, heavier contour lines, spotted solid blacks for shadows.',
      shading: 'Flat colour with hard-edged spot blacks only. No gradients or airbrushing.',
      backgrounds: 'Simplified, suggestive backgrounds; drop backgrounds in close-ups.',
      character_design: 'Expressive cartoon-realist characters with clear silhouettes.',
      texture: 'Newsprint feel, subtle halftone dots in mid-tones, slight misregistration.',
      lighting: 'Graphic, high-contrast but flat.',
      mood: 'Classic adventure comic.',
      palette: [
        { name: 'ink', hex: '#151515' }, { name: 'paper', hex: '#F4EEDC' }, { name: 'red', hex: '#C8372D' },
        { name: 'blue', hex: '#2F5D8A' }, { name: 'yellow', hex: '#E9C23F' }, { name: 'skin', hex: '#E9B995' }, { name: 'teal', hex: '#4E8C83' },
      ],
      avoid: ['gradients', 'airbrushing', 'glossy rendering', '3D/CGI look', 'over-detailed backgrounds', 'any text or lettering'],
    },
  },
];
export const getPreset = (id) => PRESETS.find((p) => p.id === id) || PRESETS[0];

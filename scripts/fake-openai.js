// Minimal fake of the OpenAI endpoints used by the app, for wiring tests without a key.
import http from 'node:http';
import fs from 'node:fs';
import { mockBreakdown, mockPanel } from '../server/mock.js';
const png = fs.readFileSync(new URL('../sample/carousel/slide-01.png', import.meta.url)).toString('base64');
const log = [];
http.createServer((req, res) => {
  let chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const entry = { path: req.url, auth: req.headers.authorization, type: req.headers['content-type']?.split(';')[0], bytes: body.length };
    if (req.url === '/v1/responses') {
      const j = JSON.parse(body);
      entry.model = j.model; entry.format = j.text?.format?.type; entry.strict = j.text?.format?.strict; entry.images = j.input[1].content.filter((c) => c.type === 'input_image').length;
      const bd = mockBreakdown({ script: 'NEIL: Hi.\nDONNA: Hello.\nNEIL: Bye.', settings: { format: 'carousel', slides: 3 } });
      const out = { title: 'Fake', style_bible: { summary: 's', line_art: 'l', shading: 'none', backgrounds: 'b', character_design: 'c', texture: 't', lighting: 'f', mood: 'm', palette: [{ name: 'sky', hex: '#86C9EA' }], avoid: ['text'] },
        characters: bd.characters.map((c) => ({ id: c.id, name: c.name, visual_description: c.description, is_main: true })), pages: bd.pages };
      res.end(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(out) }] }], usage: { input_tokens: 3000, output_tokens: 1500 } }));
    } else {
      const s = body.toString('latin1');
      entry.model = (s.match(/name="model"\r\n\r\n([^\r]+)/) || [])[1] || JSON.parse(body.toString() || '{}').model;
      entry.size = (s.match(/name="size"\r\n\r\n([^\r]+)/) || [])[1] || (entry.type === 'application/json' ? JSON.parse(body).size : undefined);
      entry.refImages = (s.match(/name="image\[\]"/g) || []).length;
      entry.noTextRule = /ABSOLUTELY NO TEXT/.test(s);
      res.end(JSON.stringify({ data: [{ b64_json: png }], usage: { input_tokens: 1200, output_tokens: 1800, input_tokens_details: { image_tokens: 1000, text_tokens: 200 } } }));
    }
    log.push(entry); console.log(JSON.stringify(entry));
  });
}).listen(5199, () => console.log('fake openai on 5199'));

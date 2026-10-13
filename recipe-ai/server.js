// Zero-dependency Node server: serves the site and converts recipes using a local open-source LLM via Ollama.
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = process.env.PORT || 3000;
const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:3b';
const CATS = ['Starters & Snacks','Soups & Salads','Main Course','Rice, Noodles & Breads','Desserts','Beverages','Breakfast','Sides & Sauces'];
const PRICES = JSON.parse(fs.readFileSync(path.join(__dirname, 'prices.json'), 'utf8'));
const KEYS = Object.keys(PRICES.items).sort((a, b) => b.length - a.length); // longest match wins

const schema = {
  type: 'object',
  properties: {
    name: { type: 'string' }, original_name: { type: 'string' }, language: { type: 'string' },
    cuisine: { type: 'string' }, category: { type: 'string', enum: CATS }, description: { type: 'string' },
    servings: { type: 'number' },
    ingredients: { type: 'array', items: { type: 'object', properties: {
      name: { type: 'string' }, qty: { type: 'number' }, unit: { type: 'string', enum: ['g','ml','pcs','tsp','tbsp'] } },
      required: ['name','qty','unit'] } },
    steps: { type: 'array', items: { type: 'string' } },
    prep_min: { type: 'number' }, cook_min: { type: 'number' },
    heat_source: { type: 'string', enum: ['gas','induction','oven','microwave','none'] }
  },
  required: ['name','category','servings','ingredients','steps','prep_min','cook_min','heat_source']
};

const SYSTEM = `You convert a home cook's recipe, written in ANY language and casual wording, into a standard English recipe.
Rules:
- Translate everything to English. Ingredient names must be simple, common English nouns (e.g. "potato", "cumin", "basmati rice").
- Every ingredient needs a quantity and a unit from: g, ml, pcs, tsp, tbsp. Estimate sensible amounts when the user gave none.
- Use the serving count in the recipe if stated; otherwise use the default given.
- "name" is a clear, appetising menu-style name you choose. "original_name" is what the user called it, or "" if unnamed.
- "category" must be the best fit from the allowed list. "language" is the language of the input.
- "steps": 4-9 short, clear steps. prep_min and cook_min are realistic minutes. heat_source is the main appliance.
Return only JSON matching the schema.`;

async function llm(text, servings) {
  const r = await fetch(OLLAMA + '/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, stream: false, format: schema, options: { temperature: 0.2 },
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: `Default servings: ${servings}\nRecipe:\n${text}` }] })
  });
  if (!r.ok) throw new Error(`Ollama error ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return JSON.parse((await r.json()).message.content);
}

// Ingredient price lookup from prices.json (the LLM never guesses prices). Returns INR or null if unknown.
function priceOf(ing) {
  const n = String(ing.name || '').toLowerCase();
  const key = KEYS.find(k => n.includes(k));
  if (!key) return null;
  const it = PRICES.items[key], kgl = { g: .001, ml: .001, tsp: .005, tbsp: .015 }[ing.unit], pcG = it.pc_g || 100;
  let q;
  if (it.per === 'pc') q = ing.unit === 'pcs' ? ing.qty : ing.qty * kgl * 1000 / pcG;
  else q = kgl !== undefined ? ing.qty * kgl : ing.qty * pcG / 1000;
  return Math.round(q * it.price * 100) / 100;
}

function normalise(r, servings) {
  r.category = CATS.includes(r.category) ? r.category : 'Main Course';
  r.servings = Math.max(1, Math.round(+r.servings || servings));
  r.prep_min = Math.max(0, +r.prep_min || 10); r.cook_min = Math.max(0, +r.cook_min || 20);
  r.steps = (r.steps || []).map(String);
  r.ingredients = (r.ingredients || []).filter(i => i && i.name).map(i => ({ name: String(i.name), qty: +i.qty || 0, unit: i.unit, price: priceOf(i) }));
  return r;
}

const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/api/convert') {
      let body = ''; for await (const c of req) { body += c; if (body.length > 20000) return send(res, 413, { error: 'Recipe too long' }); }
      const { text, servings } = JSON.parse(body || '{}');
      if (!text || !text.trim()) return send(res, 400, { error: 'Please enter a recipe.' });
      let out;
      try { out = await llm(text.trim(), +servings || 4); }
      catch (e) { out = await llm(text.trim(), +servings || 4); } // one retry on bad JSON
      return send(res, 200, { recipe: normalise(out, +servings || 4), rates: PRICES.rates, model: MODEL });
    }
    if (req.url === '/api/health') {
      try { const r = await fetch(OLLAMA + '/api/tags'); const j = await r.json();
        return send(res, 200, { ok: true, model: MODEL, installed: (j.models || []).some(m => m.name.startsWith(MODEL.split(':')[0])) }); }
      catch { return send(res, 200, { ok: false, model: MODEL }); }
    }
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(fs.readFileSync(path.join(__dirname, 'public', 'index.html')));
    }
    send(res, 404, { error: 'Not found' });
  } catch (e) { send(res, 500, { error: String(e.message || e) }); }
}).listen(PORT, () => console.log(`Recipe Menu AI on http://localhost:${PORT}  (model: ${MODEL} via ${OLLAMA})`));

# Recipe → Menu Costing (open-source AI edition)

Paste a recipe in any language → a local open-source LLM standardises it, names it, categorises it → costs it (ingredients + electricity, water, labour, packaging, overhead) → adds it to the menu.
No API keys, no cloud, no per-request cost. Zero npm dependencies.

## Run it
1. Install Node.js 18+ and [Ollama](https://ollama.com/download).
2. Pull a model (pick one):
   - `ollama pull qwen2.5:3b`   – default, good multilingual quality, ~2 GB, runs on most laptops
   - `ollama pull qwen2.5:7b`   – noticeably better for Hindi and other non-English input (~5 GB RAM/VRAM)
   - `ollama pull gemma2:2b`    – smallest/fastest
3. Start the site:  `node server.js`   then open http://localhost:3000

Use another model:  `OLLAMA_MODEL=qwen2.5:7b node server.js`
Ollama on another machine:  `OLLAMA_URL=http://192.168.1.20:11434 node server.js`

## How it works
- `server.js`  sends the recipe to Ollama with a JSON schema, so output is always valid structured JSON.
- Ingredient prices come from `prices.json` (the LLM never invents prices). Unknown ingredients are flagged for manual entry. Edit/extend this file for your market.
- Electricity = appliance power x cook time (gas counted as kWh-equivalent). Water = 4 L + 1.5 L per serving. Tune these in `public/index.html` (`KW`, `calc`).
- The menu is saved in the browser (localStorage) and can be exported as CSV.

## Using your own fine-tuned model later
Fine-tune (Unsloth/LoRA), export to GGUF, then:
  ollama create my-recipe-model -f Modelfile      # Modelfile: FROM ./my-model.gguf
  OLLAMA_MODEL=my-recipe-model node server.js
Nothing else changes.

## Deploying for others
Run on a server with Ollama (a small GPU is much faster than CPU), put the Node app behind a reverse proxy (Caddy/nginx) with HTTPS. Add auth/rate limiting before exposing it publicly.

## Voice input (speech to text)
Uses OpenAI Whisper **large-v3-turbo** (open-source, ~100 languages) through `faster-whisper`, run locally by `stt_server.py`. Audio never leaves your computer.
1. Install Python 3.9+ (python.org, or `winget install Python.Python.3.12`) and tick "Add Python to PATH".
2. `pip install -r requirements.txt`
3. In a SECOND terminal in this folder: `python stt_server.py` (first run downloads ~1.6 GB; wait for "Speech model ready.")
4. Keep it running next to `node server.js`, open http://localhost:3000, click "Speak recipe", talk, press Stop.
Pick the spoken language for best accuracy (choose Hindi for mixed Hindi/English). Weak PC (under 8 GB RAM)? Use a smaller model:
  Windows PowerShell:  $env:WHISPER_MODEL="small"; python stt_server.py
  Mac/Linux:           WHISPER_MODEL=small python3 stt_server.py

import { GEMINI_API_KEY, GEMMA_MODEL } from './config.js';
import { compass } from './geo.js';

const OLLAMA_HOST = process.env.OLLAMA_HOST || '';
const LOCAL_MODEL = process.env.LOCAL_MODEL || 'gemma-4:9b';

const PROMPT = (data) => `You are a tactical dispatch assistant for a travel-safety system on Nigerian highways.
Turn the raw telemetry below into a short situation report for human responders (police, vigilantes, CJTF).

Rules:
- Use ONLY the data given. Do not invent facts, names, or numbers.
- Directions are possibilities with a confidence from 0 to 1, never certainties.
- "sitrep" must be under 60 words, factual, no speculation about people.
- "hausa_warning": 1-2 short, simple Hausa sentences telling nearby farmers and motorists to avoid the area and alert security. Calm tone, no graphic detail.
- "english_warning": the same message in English.
- "recommended_actions": 2-4 short items for responders.

Return ONLY valid JSON, no markdown, with exactly these keys:
{"sitrep": string, "likely_directions": [{"direction": string, "confidence": number, "reason": string}], "hausa_warning": string, "english_warning": string, "recommended_actions": [string]}

DATA:
${JSON.stringify(data, null, 2)}`;

function fallback(s) {
  const dir = Number.isFinite(s.track_bearing_deg) ? compass(s.track_bearing_deg) : null;
  return {
    sitrep: `${({ MANUAL: 'Silent alarm raised from the phone', DEAD_MAN: 'Phone stopped reporting', BUSH_DEVIATION: 'Vehicle left the highway' })[s.incident_type] || s.incident_type} on ${s.road}. Last position ${s.last_position.lat.toFixed(4)}, ${s.last_position.lng.toFixed(4)}.` +
      (dir ? ` Last heading ${dir}.` : '') + ` Local time ${s.local_time}.`,
    likely_directions: dir
      ? [{ direction: dir, confidence: 0.3, reason: 'Continuing last known heading' }]
      : [],
    hausa_warning: 'Gargadi: an samu rahoton matsalar tsaro a hanyar Kaduna zuwa Zariya. Ku nisanci yankin, ku sanar da jami’an tsaro.',
    english_warning: 'Warning: a security incident was reported on the Kaduna–Zaria road. Avoid the area and alert security forces.',
    recommended_actions: ['Dispatch nearest patrol to last known position', 'Alert checkpoints along last heading'],
    source: 'fallback',
  };
}

function parseJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('no JSON in model output');
  return JSON.parse(text.slice(start, end + 1));
}

export async function generateSitrep(summary) {
  // 1. Sovereign Local Edge Inference (Ollama / llama.cpp air-gapped support)
  if (OLLAMA_HOST) {
    try {
      console.log(`[dispatcher] Querying sovereign local edge model: ${LOCAL_MODEL} at ${OLLAMA_HOST}`);
      const res = await fetch(`${OLLAMA_HOST.replace(/\/$/, '')}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: LOCAL_MODEL,
          prompt: PROMPT(summary),
          stream: false,
          format: 'json',
        }),
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) throw new Error(`Local model HTTP ${res.status}`);
      const data = await res.json();
      return { ...parseJson(data.response), source: `local:${LOCAL_MODEL}` };
    } catch (err) {
      console.error('[dispatcher] local model error, falling back:', err.message);
    }
  }

  // 2. Cloud Google AI Studio / Gemini API Endpoint
  if (!GEMINI_API_KEY || !GEMMA_MODEL) return fallback(summary);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMMA_MODEL}:generateContent`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: PROMPT(summary) }] }],
        generationConfig: { temperature: 0.2 },
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    return { ...parseJson(text), source: GEMMA_MODEL };
  } catch (err) {
    console.error('[dispatcher] falling back:', err.message);
    return fallback(summary);
  }
}

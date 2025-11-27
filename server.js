import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS Headers für ElevenLabs
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  next();
});

app.use(express.json());

// Request Logger
app.use((req, res, next) => {
  console.log(`\n[${new Date().toISOString()}] ${req.method} ${req.path}`);
  console.log('  Headers:', JSON.stringify(req.headers, null, 2));
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('  Body:', JSON.stringify(req.body, null, 2).substring(0, 500));
  }
  next();
});

// ============================================================================
// Supabase Client
// ============================================================================

async function supabaseQuery(table, filters = {}) {
  const url = new URL(`${process.env.SUPABASE_URL}/rest/v1/${table}`);

  Object.entries(filters).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });

  const response = await fetch(url, {
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Supabase query failed: ${response.statusText}`);
  }

  return response.json();
}

// ============================================================================
// OpenAI Client
// ============================================================================

async function callOpenAI(messages, temperature = 0.3) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      temperature
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API failed: ${response.statusText}`);
  }

  return response.json();
}

// ============================================================================
// Intent Extraction
// ============================================================================

async function extractIntent(userMessage) {
  // Lade alle verfügbaren Intent-Slugs aus der Datenbank
  const intentIndex = await supabaseQuery('intent_index', {
    'select': 'slug,intent_group',
    'aktiv': 'eq.true'
  });

  const slugList = intentIndex.map(i => i.slug).join('\n- ');

  const systemPrompt = `Du bist ein Intent-Klassifizierungs-System für eine KFZ-Zulassungsstelle.

Verfügbare Intent-Slugs:
- ${slugList}

Aufgabe: Bestimme welcher Slug am besten zur Benutzer-Anfrage passt.

Antworte NUR mit dem Slug (nichts anderes). Wenn keine Übereinstimmung gefunden wird, antworte mit "unknown".`;

  const result = await callOpenAI([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage }
  ], 0.1);

  const extractedSlug = result.choices[0].message.content.trim();

  return extractedSlug === 'unknown' ? null : extractedSlug;
}

// ============================================================================
// Data Query
// ============================================================================

async function queryKfzVorgang(slug) {
  const results = await supabaseQuery('kfz_vorgaenge', {
    'slug': `eq.${slug}`,
    'aktiv': 'eq.true',
    'select': '*'
  });

  return results.length > 0 ? results[0] : null;
}

// ============================================================================
// Response Generation
// ============================================================================

async function generateNaturalResponse(userMessage, vorgangData) {
  const systemPrompt = `Du bist ein freundlicher Mitarbeiter einer KFZ-Zulassungsstelle.

Basierend auf den folgenden Informationen, beantworte die Frage des Benutzers klar und präzise:

TITEL: ${vorgangData.titel}

INHALT:
${vorgangData.inhalt}

Antworte natürlich und hilfreich. Fasse dich kurz, aber bleibe vollständig.`;

  const result = await callOpenAI([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage }
  ], 0.7);

  return result.choices[0].message.content;
}

// ============================================================================
// Main Endpoint: /chat/completions
// ============================================================================

app.post('/chat/completions', async (req, res) => {
  try {
    const { messages, mode = 'answer' } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        error: {
          message: 'Invalid request: messages array required',
          type: 'invalid_request_error'
        }
      });
    }

    // Extrahiere die letzte User-Nachricht
    const userMessage = messages
      .filter(m => m.role === 'user')
      .pop()?.content;

    if (!userMessage) {
      return res.status(400).json({
        error: {
          message: 'No user message found',
          type: 'invalid_request_error'
        }
      });
    }

    console.log(`[${new Date().toISOString()}] User: "${userMessage}"`);

    // 1. Intent-Extraktion
    const slug = await extractIntent(userMessage);

    if (!slug) {
      console.log('  → Intent: unknown');
      return res.json({
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: 'gpt-4o-mini',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'Entschuldigung, ich konnte Ihre Anfrage keinem bekannten Vorgang zuordnen. Könnten Sie bitte präzisieren, worum es geht?'
          },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        }
      });
    }

    console.log(`  → Intent: ${slug}`);

    // 2. Daten aus Supabase abfragen
    const vorgangData = await queryKfzVorgang(slug);

    if (!vorgangData) {
      console.log('  → Kein Vorgang gefunden');
      return res.json({
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: 'gpt-4o-mini',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'Entschuldigung, ich konnte keine Informationen zu diesem Vorgang finden.'
          },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        }
      });
    }

    // 3. Response generieren (je nach Modus)
    let responseContent;

    if (mode === 'data') {
      // Nur strukturierte Daten zurückgeben
      responseContent = JSON.stringify({
        intent: slug,
        data: vorgangData,
        needs_clarification: false
      }, null, 2);
      console.log('  → Mode: data (structured)');
    } else {
      // Natürliche Antwort generieren
      responseContent = await generateNaturalResponse(userMessage, vorgangData);
      console.log('  → Mode: answer (natural language)');
    }

    // 4. OpenAI-kompatible Response
    const response = {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'gpt-4o-mini',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: responseContent
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: 100, // Placeholder
        completion_tokens: 50, // Placeholder
        total_tokens: 150 // Placeholder
      }
    };

    console.log(`  → Response generated (${responseContent.length} chars)\n`);
    res.json(response);

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      error: {
        message: error.message,
        type: 'internal_error'
      }
    });
  }
});

// ============================================================================
// Health Check
// ============================================================================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    supabase: !!process.env.SUPABASE_URL,
    openai: !!process.env.OPENAI_API_KEY
  });
});

// ============================================================================
// Start Server
// ============================================================================

app.listen(PORT, () => {
  console.log(`\n🚀 ElevenLabs KFZ Middleware`);
  console.log(`   Listening on http://localhost:${PORT}`);
  console.log(`   Endpoint: POST /chat/completions`);
  console.log(`   Health: GET /health\n`);
});

# ElevenLabs KFZ Middleware

HTTP-Middleware für ElevenLabs Custom-LLM Integration mit Supabase-Datenbank.

## Überblick

Diese Middleware fungiert als Custom-LLM für ElevenLabs und liefert strukturierte Antworten basierend auf einer Supabase-Datenbank mit KFZ-Zulassungsinformationen.

**Keine RAG. Keine freien Antworten. Nur Intent → Datenbank → strukturierte Rückgabe.**

## Funktionsweise

```
User-Anfrage (ElevenLabs)
    ↓
POST /chat/completions (OpenAI-kompatibel)
    ↓
LLM-basierte Intent-Extraktion (gpt-4o-mini)
    ↓
Supabase-Abfrage (intent_index → kfz_vorgaenge)
    ↓
Response-Generierung (data oder answer)
    ↓
OpenAI-Format Response
    ↓
ElevenLabs spricht Antwort
```

## Features

- ✅ OpenAI Chat Completions API-kompatibel
- ✅ LLM-basierte Intent-Erkennung (gpt-4o-mini)
- ✅ Supabase REST-Integration
- ✅ Zwei Modi: `data` (strukturiert) und `answer` (natürlich)
- ✅ Automatisches Logging
- ✅ Fehlerbehandlung
- ✅ Health-Check Endpoint

## Installation

```bash
npm install
```

## Konfiguration

Erstelle eine `.env` Datei:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_key
OPENAI_API_KEY=sk-your-openai-key
PORT=3000
```

## Starten

```bash
npm start
```

Server läuft auf `http://localhost:3000`

## API Endpoints

### POST /chat/completions

OpenAI-kompatibler Endpoint für ElevenLabs.

**Request:**

```json
{
  "messages": [
    {"role": "user", "content": "Wie kann ich mein Auto abmelden?"}
  ],
  "mode": "answer"
}
```

**Parameter:**

- `messages` (required): Array von Chat-Messages im OpenAI-Format
- `mode` (optional): `"answer"` (default) oder `"data"`
  - `answer`: LLM generiert natürliche Antwort aus Datenbank-Inhalt
  - `data`: Nur strukturierte Daten zurückgeben

**Response (mode=answer):**

```json
{
  "id": "chatcmpl-1234567890",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "gpt-4o-mini",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "Um Ihr Auto abzumelden, gehen Sie bitte wie folgt vor:\n\n1. Unterlagen vorbereiten..."
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 100,
    "completion_tokens": 50,
    "total_tokens": 150
  }
}
```

**Response (mode=data):**

```json
{
  "choices": [{
    "message": {
      "content": "{\"intent\":\"abmeldung_ausserbetriebsetzung\",\"data\":{...},\"needs_clarification\":false}"
    }
  }]
}
```

### GET /health

Health-Check Endpoint.

**Response:**

```json
{
  "status": "ok",
  "timestamp": "2025-11-27T19:00:00.000Z",
  "supabase": true,
  "openai": true
}
```

## Beispiele

### Test 1: Natürliche Antwort

```bash
curl -X POST http://localhost:3000/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Wie kann ich mein Auto abmelden?"}
    ],
    "mode": "answer"
  }'
```

### Test 2: Strukturierte Daten

```bash
curl -X POST http://localhost:3000/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Was kostet eine Neuzulassung?"}
    ],
    "mode": "data"
  }'
```

## ElevenLabs Integration

1. **ElevenLabs Dashboard öffnen**
2. **Custom LLM konfigurieren:**
   - Server URL: `http://your-server:3000`
   - Format: OpenAI Chat Completions
3. **Optional:** Parameter `mode` in Request-Body setzen

ElevenLabs sendet automatisch Requests an `/chat/completions`.

## Datenbankstruktur

### intent_index
- `slug`: Intent-Slug (z.B. "abmeldung_ausserbetriebsetzung")
- `intent_group`: Gruppe (z.B. "abmeldung")
- `ziel_tabelle`: "kfz_vorgaenge"
- `aktiv`: true/false

### kfz_vorgaenge
- `slug`: Matching-Slug
- `titel`: Titel des Vorgangs
- `inhalt`: Detaillierte Informationen
- `quelle`: Datenquelle
- `aktiv`: true/false

## Logging

Der Server loggt automatisch:

```
[2025-11-27T19:00:00.000Z] User: "Wie kann ich mein Auto abmelden?"
  → Intent: abmeldung_ausserbetriebsetzung
  → Mode: answer (natural language)
  → Response generated (1042 chars)
```

## Edge Cases

### Kein Intent gefunden

```json
{
  "choices": [{
    "message": {
      "content": "Entschuldigung, ich konnte Ihre Anfrage keinem bekannten Vorgang zuordnen..."
    }
  }]
}
```

### Kein Datensatz gefunden

```json
{
  "choices": [{
    "message": {
      "content": "Entschuldigung, ich konnte keine Informationen zu diesem Vorgang finden."
    }
  }]
}
```

## Fehlerbehandlung

Alle Fehler werden im OpenAI-kompatiblen Format zurückgegeben:

```json
{
  "error": {
    "message": "Error description",
    "type": "internal_error"
  }
}
```

## Tech Stack

- **Node.js** (>= 18)
- **Express.js** - HTTP Server
- **OpenAI API** (gpt-4o-mini) - Intent-Extraktion
- **Supabase** (PostgREST) - Datenbank
- **Native fetch** - HTTP Requests

## Lizenz

Privates Projekt für KFZ-Zulassungsstelle.

// AI Provider Adapter — single integration point for LLM calls.
// Spec: §5 Provider Adapter Pattern.
//
// Implements a fallback chain:
//   1. Google Gemini (gemini-2.5-flash) — primary
//   2. Groq (llama-3.3-70b-versatile) — fallback if Gemini fails or rate-limits
//   3. Deterministic stub — last-resort fallback if both providers are down
//      or no API keys are configured (local dev)
//
// Every call goes through this layer. Switching providers is a one-file change.
// The LLM only proposes tasks and writes explanations — scheduling + risk
// detection are deterministic (see lib/scheduler/ + lib/risk/).

import { GoogleGenAI, Type } from '@google/genai';
import Groq from 'groq-sdk';
import { z } from 'zod';
import type { GoalBreakdown, TaskDraft } from '@/lib/types';

// ---------------------------------------------------------------------------
// Schemas (Zod validation before touching the database)
// ---------------------------------------------------------------------------

const TaskDraftSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional().nullable(),
  estimatedMinutes: z.number().int().min(5).max(60 * 24),
  dependsOn: z.number().int().min(0).optional().nullable(),
});

const BreakdownSchema = z.object({
  tasks: z.array(TaskDraftSchema).min(1).max(20),
  rationale: z.string().max(2000).optional().nullable(),
});

const RiskExplanationSchema = z.object({
  headline: z.string().min(1).max(200),
  body: z.string().min(1).max(1200),
  suggestedAction: z.string().min(1).max(400).optional().nullable(),
});

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

interface AIProvider {
  name: string;
  generateJSON(systemPrompt: string, userPrompt: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// Gemini provider (primary)
// ---------------------------------------------------------------------------

class GeminiProvider implements AIProvider {
  name = 'Gemini';
  private client: GoogleGenAI | null = null;
  private model = 'gemini-2.5-flash';

  private getClient(): GoogleGenAI {
    if (!this.client) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('GEMINI_API_KEY not set');
      this.client = new GoogleGenAI({ apiKey });
    }
    return this.client;
  }

  async generateJSON(systemPrompt: string, userPrompt: string): Promise<string> {
    const client = this.getClient();
    const response = await client.models.generateContent({
      model: this.model,
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        temperature: 0.7,
      },
    });
    const text = response.text;
    if (!text || !text.trim()) throw new Error('Empty Gemini response');
    return text;
  }
}

// ---------------------------------------------------------------------------
// Groq provider (fallback)
// ---------------------------------------------------------------------------

class GroqProvider implements AIProvider {
  name = 'Groq';
  private client: Groq | null = null;
  private model = 'llama-3.3-70b-versatile';

  private getClient(): Groq {
    if (!this.client) {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) throw new Error('GROQ_API_KEY not set');
      this.client = new Groq({ apiKey });
    }
    return this.client;
  }

  async generateJSON(systemPrompt: string, userPrompt: string): Promise<string> {
    const client = this.getClient();
    const completion = await client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });
    const content = completion.choices[0]?.message?.content ?? '';
    if (!content.trim()) throw new Error('Empty Groq response');
    return content;
  }
}

// ---------------------------------------------------------------------------
// Deterministic stub provider (last-resort fallback for local dev)
// ---------------------------------------------------------------------------

class StubProvider implements AIProvider {
  name = 'Stub';

  async generateJSON(systemPrompt: string, userPrompt: string): Promise<string> {
    // If the prompt mentions "breakdown", return a generic task list.
    // Otherwise return a generic risk explanation.
    if (systemPrompt.includes('planning engine')) {
      return JSON.stringify({
        tasks: [
          {
            title: 'Define the scope',
            estimatedMinutes: 30,
            description: 'Clarify exactly what needs to be done.',
          },
          {
            title: 'Break it into steps',
            estimatedMinutes: 45,
            description: 'List the individual steps required.',
          },
          {
            title: 'Do the first step',
            estimatedMinutes: 60,
            description: 'Start with the first item on your list.',
          },
          {
            title: 'Review and iterate',
            estimatedMinutes: 30,
            description: 'Check your work and adjust as needed.',
          },
          {
            title: 'Finalize and submit',
            estimatedMinutes: 20,
            description: 'Wrap up and deliver.',
          },
        ],
        rationale:
          'Generic 5-step breakdown (stub provider — set GEMINI_API_KEY + GROQ_API_KEY for real AI output).',
      });
    }
    return JSON.stringify({
      headline: 'You are behind schedule',
      body: 'Based on the remaining work and available time, you may not finish by the deadline. Consider reducing scope or increasing available time blocks.',
      suggestedAction:
        'Re-run the scheduler to fit remaining tasks into your available time.',
    });
  }
}

// ---------------------------------------------------------------------------
// Fallback chain: Gemini → Groq → Stub
// ---------------------------------------------------------------------------

const providers: AIProvider[] = [
  new GeminiProvider(),
  new GroqProvider(),
  new StubProvider(),
];

async function generateJSONWithFallback(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  let lastError: Error | null = null;
  for (const provider of providers) {
    try {
      // Skip providers that don't have API keys configured (except Stub which
      // always works).
      if (provider.name === 'Gemini' && !process.env.GEMINI_API_KEY) continue;
      if (provider.name === 'Groq' && !process.env.GROQ_API_KEY) continue;
      return await provider.generateJSON(systemPrompt, userPrompt);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Log the failure but don't throw — try the next provider.
      console.warn(
        `[AI] ${provider.name} failed: ${lastError.message}. Falling back...`
      );
    }
  }
  throw lastError ?? new Error('All AI providers failed');
}

// ---------------------------------------------------------------------------
// JSON sanitization (defensive parsing of LLM output)
// ---------------------------------------------------------------------------

function extractJson(raw: string): string {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    s = s.slice(first, last + 1);
  }
  s = s
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"');
  s = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  s = s.replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g, '$1"$2":');
  s = singleToDoubleQuotes(s);
  s = s.replace(/,(\s*[}\]])/g, '$1');
  return s;
}

function singleToDoubleQuotes(s: string): string {
  let out = '';
  let i = 0;
  let inDouble = false;
  let inSingle = false;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\' && (inDouble || inSingle)) {
      out += c + (s[i + 1] ?? '');
      i += 2;
      continue;
    }
    if (c === '"' && !inSingle) {
      inDouble = !inDouble;
      out += '"';
      i++;
      continue;
    }
    if (c === "'" && !inDouble) {
      inSingle = !inSingle;
      out += '"';
      i++;
      continue;
    }
    if (c === '"' && inSingle) {
      out += '\\"';
      i++;
      continue;
    }
    if (c === "'" && inDouble) {
      out += "'";
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function parseLenient(text: string): unknown {
  const cleaned = extractJson(text);
  try {
    return JSON.parse(cleaned);
  } catch (e1) {
    const lastBrace = cleaned.lastIndexOf('}');
    if (lastBrace > 0) {
      const candidate = cleaned.slice(0, lastBrace + 1);
      try {
        return JSON.parse(candidate);
      } catch {
        /* fall through */
      }
    }
    const taskMatches = cleaned.match(/\{[^{}]*\}/g);
    if (taskMatches && taskMatches.length > 0) {
      const tasks = taskMatches
        .map((m) => {
          try {
            return JSON.parse(extractJson(m));
          } catch {
            return null;
          }
        })
        .filter((x): x is Record<string, unknown> => x !== null);
      if (tasks.length > 0) return { tasks };
    }
    throw e1;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Break a fuzzy goal description into an ordered list of tasks.
 * LLM proposes tasks + estimated minutes; ranking is done deterministically
 * later (see lib/scheduler/prioritize.ts).
 */
export async function breakdownGoal(input: {
  title: string;
  rawInput: string;
  goalType: string;
  deadline: string | null;
  category?: string | null;
}): Promise<GoalBreakdown> {
  const system = [
    'You are a planning engine for a deadline-driven productivity copilot.',
    'Break the user\'s goal into concrete, actionable tasks.',
    'Respond with VALID JSON ONLY — no markdown, no preamble, no comments.',
    'Schema: { "tasks": [{ "title": string, "description"?: string, "estimatedMinutes": number, "dependsOn"?: number }], "rationale"?: string }',
    'Rules:',
    '- 1 to 12 tasks total. For simple, quick chores (e.g., watering plants, taking out trash), use 1 to 3 tasks. For complex projects, use more.',
    '- Each title is a single action starting with a verb, max 80 chars.',
    '- estimatedMinutes is an integer >= 5 and <= 480 (8 hours). Use short durations (e.g., 5-10 minutes) for easy steps.',
    '- dependsOn is the 0-based index of a task that must finish first, or null/omitted.',
    '- Order tasks in a sensible execution sequence.',
    '- Be extremely realistic about effort. Do not pad or inflate durations. The total time for all tasks combined should match how long a normal person takes to complete the goal.',
  ].join('\n');

  const user = [
    `Goal title: ${input.title}`,
    `Type: ${input.goalType}`,
    input.deadline ? `Deadline: ${input.deadline}` : 'Deadline: none (habit)',
    input.category ? `Category: ${input.category}` : '',
    `Original user description:\n${input.rawInput || input.title}`,
  ]
    .filter(Boolean)
    .join('\n');

  const raw = await generateJSONWithFallback(system, user);
  const parsed = parseLenient(raw);
  const validated = BreakdownSchema.parse(parsed);
  const tasks: TaskDraft[] = validated.tasks.map((t) => ({
    title: t.title,
    description: t.description ?? undefined,
    estimatedMinutes: t.estimatedMinutes,
    dependsOn: t.dependsOn ?? undefined,
  }));
  return { tasks, rationale: validated.rationale ?? undefined };
}

/**
 * Turn a numeric risk assessment into a short human-readable explanation.
 * This is the *only* place the LLM touches user-facing scheduling copy.
 */
export async function explainRisk(input: {
  goalTitle: string;
  deadline: string | null;
  riskLevel: string;
  remainingWork: number; // minutes
  remainingTime: number; // minutes
  completedTasks: number;
  totalTasks: number;
}): Promise<{ headline: string; body: string; suggestedAction: string | null }> {
  const system = [
    'You are the explanation layer of a deadline copilot.',
    'A deterministic engine has already computed the risk level and numbers.',
    'Your job: write a SHORT, honest, friendly explanation and a single concrete next action.',
    'Respond with VALID JSON ONLY — no markdown, no preamble.',
    'Schema: { "headline": string (<=120 chars), "body": string (<=800 chars), "suggestedAction"?: string (<=300 chars) }',
    'Tone: calm, specific, never alarmist. Use plain language. No emojis.',
  ].join('\n');

  const minutesToHuman = (m: number) => {
    if (m <= 0) return 'no time';
    const h = Math.floor(m / 60);
    const mm = m % 60;
    if (h === 0) return `${mm}m`;
    if (mm === 0) return `${h}h`;
    return `${h}h ${mm}m`;
  };

  const user = [
    `Goal: ${input.goalTitle}`,
    input.deadline ? `Deadline: ${input.deadline}` : 'Deadline: none',
    `Risk level (computed): ${input.riskLevel}`,
    `Remaining work: ${minutesToHuman(input.remainingWork)} (${input.remainingWork} min)`,
    `Remaining free time: ${minutesToHuman(input.remainingTime)} (${input.remainingTime} min)`,
    `Tasks: ${input.completedTasks}/${input.totalTasks} done`,
  ].join('\n');

  const raw = await generateJSONWithFallback(system, user);
  const parsed = parseLenient(raw);
  const validated = RiskExplanationSchema.parse(parsed);
  return {
    headline: validated.headline,
    body: validated.body,
    suggestedAction: validated.suggestedAction ?? null,
  };
}

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
import type {
  GoalBreakdown,
  TaskDraft,
  GoalClarificationQuestion,
  GoalClarificationResponse,
  GoalAIResult,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Schemas (Zod validation before touching the database)
// ---------------------------------------------------------------------------

const TaskDraftSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional().nullable(),
  estimatedMinutes: z.number().int().min(5).max(60 * 24),
  dependsOn: z.number().int().min(0).optional().nullable(),
});

const ClarificationQuestionSchema = z.object({
  id: z.string().min(1).max(100),
  text: z.string().min(1).max(300),
  options: z.array(z.string().min(1).max(100)).optional().nullable(),
});

const AIResultSchema = z.object({
  confidence: z.enum(['high', 'low']),
  question: ClarificationQuestionSchema.optional().nullable(),
  tasks: z.array(TaskDraftSchema).optional().nullable(),
  assumptions: z.array(z.string()).optional().nullable(),
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
    if (systemPrompt.includes('planning engine')) {
      const isIndianRights = userPrompt.includes('Indian civilian rights') || userPrompt.includes('indian law');
      const hasAnswers = userPrompt.includes('Question ID:') || userPrompt.includes('Answer:');
      const isForced = userPrompt.includes('Force final plan: true');

      // Clarification check: ask question only if not forced, no answers, and it's the Indian rights case
      if (isIndianRights && !hasAnswers && !isForced) {
        return JSON.stringify({
          confidence: 'low',
          question: {
            id: 'assignment_type',
            text: 'Is this a school assignment, college assignment, or professional report?',
            options: ['School assignment', 'College assignment', 'Professional report']
          }
        });
      }

      // Generate the plan (with assumptions)
      if (isIndianRights) {
        return JSON.stringify({
          confidence: 'high',
          tasks: [
            {
              title: 'Research fundamental civilian rights under the Indian Constitution',
              estimatedMinutes: 180,
              description: 'Read Part III of the Constitution, focusing on civilian rights.'
            },
            {
              title: 'Draft the detailed outline of the 24-page report',
              estimatedMinutes: 90,
              description: 'Structure sections: Introduction, Constitutional Basis, Key Rights, Remedies, Conclusion.'
            },
            {
              title: 'Write the introduction and Part III analysis sections',
              estimatedMinutes: 180,
              description: 'Draft pages covering civilian rights and constitutional articles.'
            },
            {
              title: 'Write enforcement mechanisms and legal remedies sections',
              estimatedMinutes: 120,
              description: 'Draft sections about article 32, habeas corpus, and other remedies.'
            },
            {
              title: 'Review, format, and edit the final document',
              estimatedMinutes: 90,
              description: 'Format to 24 A4 pages and correct any errors.'
            }
          ],
          assumptions: [
            'Assumed school assignment level of depth based on 10th grade context.',
            'Assumed written document format (24 A4 pages).',
            'Assumed a total time of 11 hours is appropriate.'
          ],
          rationale: 'High-confidence plan tailored for a school assignment on civilian rights.'
        });
      }

      // Default generic fallback plan
      return JSON.stringify({
        confidence: 'high',
        tasks: [
          {
            title: 'Define report scope and search legal sources',
            estimatedMinutes: 60,
            description: 'Clarify exactly what needs to be done.'
          },
          {
            title: 'Create detailed report outline',
            estimatedMinutes: 90,
            description: 'List the individual steps required.'
          },
          {
            title: 'Draft the core content sections',
            estimatedMinutes: 180,
            description: 'Start drafting the main sections of the goal.'
          },
          {
            title: 'Review and iterate',
            estimatedMinutes: 90,
            description: 'Check your work and adjust as needed.'
          }
        ],
        assumptions: [
          'Assumed a general audience.',
          'Assumed study/project style goals.'
        ],
        rationale: 'Generic planning breakdown.'
      });
    }
    return JSON.stringify({
      headline: 'You are behind schedule',
      body: 'Based on the remaining work and available time, you may not finish by the deadline. Consider reducing scope or increasing available time blocks.',
      suggestedAction:
        'Re-run the scheduler to fit remaining tasks into your available time.'
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
  answers?: GoalClarificationResponse[];
  forcePlan?: boolean;
}): Promise<GoalAIResult> {
  const system = [
    'You are a planning engine for a deadline-driven productivity copilot.',
    'Your goal is to break the user\'s goal into concrete, actionable tasks, OR ask clarifying questions if confidence is low.',
    'Respond with VALID JSON ONLY — no markdown, no preamble, no comments.',
    'Schema:',
    '{',
    '  "confidence": "high" | "low",',
    '  "question": { "id": string, "text": string, "options"?: string[] } | null,',
    '  "tasks": [{ "title": string, "description"?: string, "estimatedMinutes": number, "dependsOn"?: number }] | null,',
    '  "assumptions": string[] | null,',
    '  "rationale"?: string',
    '}',
    'Rules:',
    '1. First, analyze the user\'s input. Extract what you can (e.g. deliverable, length, topic).',
    '2. If you have enough information to create a precise, realistic, non-padded plan, return confidence "high", question null, and the "tasks" array (1 to 12 tasks total).',
    '3. If the input is ambiguous or lacks critical context (e.g., expected depth, format, or level of detail) causing your confidence to be low for an accurate plan, return confidence "low" and exactly ONE clarifying question (with a short camel_case/snake_case id, clear text, and optional choice options), tasks null, assumptions null.',
    '4. Do NOT always ask follow-up questions. Extract what you can first. Only ask a question if you cannot plan realistically without it.',
    '5. If the user has already answered/skipped clarifying questions (provided in the user prompt), integrate those answers. Your confidence should be "high" unless you truly need one more critical clarification (subject to the backend hard safety limit). Do not re-ask questions that have already been answered or skipped.',
    '6. If you are instructed to force a final plan (Force final plan: true), you MUST return confidence "high", question null, and the "tasks" array.',
    '7. For simple chores (e.g., watering plants, taking out trash), use 1 to 3 tasks and always output high confidence immediately. Do not ask questions for simple tasks.',
    '8. Task rules: each title starts with a verb (max 80 chars), estimatedMinutes is between 5 and 480 (8 hours), dependsOn is a 0-based index of a prerequisite task in the same array, and order them in sensible execution sequence.',
    '9. Be extremely realistic about effort. Do not pad or inflate durations. The total time for all tasks combined should match how long a normal person takes to complete the goal.',
    '10. If confidence is high, also return a list of "assumptions" you made about the goal (e.g., target depth, format) that were not explicitly stated, so the user can verify them.',
  ].join('\n');

  const userParts = [
    `Goal title: ${input.title}`,
    `Type: ${input.goalType}`,
    input.deadline ? `Deadline: ${input.deadline}` : 'Deadline: none (habit)',
    input.category ? `Category: ${input.category}` : '',
    `Original user description:\n${input.rawInput || input.title}`,
  ];

  if (input.answers && input.answers.length > 0) {
    userParts.push('\nPrevious Clarifying Questions and User Responses:');
    input.answers.forEach((ans) => {
      userParts.push(`- Question ID: ${ans.questionId}`);
      if (ans.skipped) {
        userParts.push('  Status: User skipped this question (proceed without this detail).');
      } else {
        userParts.push(`  Answer: ${ans.answer}`);
      }
    });
  }

  if (input.forcePlan) {
    userParts.push('\nForce final plan: true. You MUST generate the task list now. Do NOT ask any more questions.');
  }

  const user = userParts.filter(Boolean).join('\n');

  const raw = await generateJSONWithFallback(system, user);
  const parsed = parseLenient(raw);
  const validated = AIResultSchema.parse(parsed);

  const result: GoalAIResult = {
    confidence: validated.confidence,
    question: validated.question
      ? {
          id: validated.question.id,
          text: validated.question.text,
          options: validated.question.options ?? null,
        }
      : null,
    tasks: validated.tasks
      ? validated.tasks.map((t) => ({
          title: t.title,
          description: t.description ?? undefined,
          estimatedMinutes: t.estimatedMinutes,
          dependsOn: t.dependsOn ?? undefined,
        }))
      : null,
    assumptions: validated.assumptions ?? null,
    rationale: validated.rationale ?? null,
  };

  return result;
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

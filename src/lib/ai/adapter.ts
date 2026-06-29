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

import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';
import { z } from 'zod';
import type {
  GoalClarificationResponse,
  GoalAIResult,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Runtime Zod Schemas (for final validation and type safety)
// ---------------------------------------------------------------------------

const TaskDraftSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional().nullable(),
  estimatedMinutes: z.number().int().min(5).max(480), // Max 8 hours (aligned with prompt & schema)
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
// JSON Schemas for Native Structured Outputs (Groq & Gemini)
// ---------------------------------------------------------------------------

const goalAIResultJsonSchema = {
  type: 'object',
  properties: {
    confidence: {
      type: 'string',
      enum: ['high', 'low'],
      description: 'Confidence in creating a precise, realistic plan. Set to "high" if you can plan, or "low" if you need clarification.',
    },
    question: {
      anyOf: [
        {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Unique camelCase/snake_case identifier for the question' },
            text: { type: 'string', description: 'The question text to ask the user' },
            options: {
              anyOf: [
                {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'List of multiple choice options',
                },
                { type: 'null' }
              ],
            },
          },
          required: ['id', 'text', 'options'],
          additionalProperties: false,
        },
        { type: 'null' }
      ],
      description: 'Exactly one clarifying question if confidence is "low". Otherwise null.',
    },
    tasks: {
      anyOf: [
        {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Task title, starting with a verb (max 80 chars)' },
              description: {
                anyOf: [
                  { type: 'string' },
                  { type: 'null' }
                ],
                description: 'Optional task description (max 1000 chars)',
              },
              estimatedMinutes: { type: 'integer', description: 'Estimated minutes to complete (5 to 480)' },
              dependsOn: {
                anyOf: [
                  { type: 'integer' },
                  { type: 'null' }
                ],
                description: 'Optional 0-based index of prerequisite task in this array',
              },
            },
            required: ['title', 'description', 'estimatedMinutes', 'dependsOn'],
            additionalProperties: false,
          },
        },
        { type: 'null' }
      ],
      description: 'List of tasks (1 to 12) if confidence is "high". Otherwise null.',
    },
    assumptions: {
      anyOf: [
        {
          type: 'array',
          items: { type: 'string' },
        },
        { type: 'null' }
      ],
      description: 'Assumptions made about the goal (e.g., target depth, format) if confidence is "high". Otherwise null.',
    },
    rationale: {
      anyOf: [
        { type: 'string' },
        { type: 'null' }
      ],
      description: 'Brief rationale for the plan or the clarifying question.',
    },
  },
  required: ['confidence', 'question', 'tasks', 'assumptions', 'rationale'],
  additionalProperties: false,
};

const riskExplanationJsonSchema = {
  type: 'object',
  properties: {
    headline: { type: 'string', description: 'Short warning/status headline (<= 120 chars)' },
    body: { type: 'string', description: 'Honest, friendly explanation of the risk (<= 800 chars)' },
    suggestedAction: {
      anyOf: [
        { type: 'string' },
        { type: 'null' }
      ],
      description: 'Single concrete next action (<= 300 chars)',
    },
  },
  required: ['headline', 'body', 'suggestedAction'],
  additionalProperties: false,
};

// Helper to convert standard/Groq anyOf nullable schemas into Gemini-friendly nullable: true schemas
function transformToGeminiSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  // Handle anyOf (specifically for nullability: anyOf: [subSchema, { type: 'null' }])
  if (Array.isArray(schema.anyOf)) {
    const nullIndex = schema.anyOf.findIndex((s: any) => s && s.type === 'null');
    if (nullIndex !== -1) {
      const nonNullSchema = schema.anyOf.find((s: any) => !s || s.type !== 'null');
      if (nonNullSchema) {
        const transformed = transformToGeminiSchema(nonNullSchema);
        const { anyOf, ...rest } = schema;
        return {
          ...rest,
          ...transformed,
          nullable: true,
        };
      }
    }
  }

  const result: any = { ...schema };

  // Recursively transform properties of objects
  if (result.properties) {
    result.properties = Object.fromEntries(
      Object.entries(result.properties).map(([key, val]) => [
        key,
        transformToGeminiSchema(val),
      ])
    );
  }

  // Recursively transform items of arrays
  if (result.items) {
    result.items = transformToGeminiSchema(result.items);
  }

  return result;
}

// Helper to parse JSON safely (ignoring potential markdown fences)
function parseJsonSafe(text: string): any {
  let s = text.trim();
  if (s.startsWith('```')) {
    const match = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (match) s = match[1].trim();
  }
  return JSON.parse(s);
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

interface SchemaConfig {
  name: string;
  jsonSchema: any;
}

interface AIProvider {
  name: string;
  generateJSON(systemPrompt: string, userPrompt: string, schemaConfig: SchemaConfig): Promise<string>;
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

  async generateJSON(systemPrompt: string, userPrompt: string, schemaConfig: SchemaConfig): Promise<string> {
    const client = this.getClient();
    const geminiSchema = transformToGeminiSchema(schemaConfig.jsonSchema);

    const response = await client.models.generateContent({
      model: this.model,
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        responseSchema: geminiSchema,
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

  async generateJSON(systemPrompt: string, userPrompt: string, schemaConfig: SchemaConfig): Promise<string> {
    const client = this.getClient();
    const completion = await client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: schemaConfig.name,
          strict: true,
          schema: schemaConfig.jsonSchema,
        },
      },
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

  async generateJSON(systemPrompt: string, userPrompt: string, schemaConfig: SchemaConfig): Promise<string> {
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
          },
          tasks: null,
          assumptions: null,
          rationale: 'Need to clarify assignment type.'
        });
      }

      // Generate the plan (with assumptions)
      if (isIndianRights) {
        return JSON.stringify({
          confidence: 'high',
          question: null,
          tasks: [
            {
              title: 'Research fundamental civilian rights under the Indian Constitution',
              description: 'Read Part III of the Constitution, focusing on civilian rights.',
              estimatedMinutes: 180,
              dependsOn: null
            },
            {
              title: 'Draft the detailed outline of the 24-page report',
              description: 'Structure sections: Introduction, Constitutional Basis, Key Rights, Remedies, Conclusion.',
              estimatedMinutes: 90,
              dependsOn: 0
            },
            {
              title: 'Write the introduction and Part III analysis sections',
              description: 'Draft pages covering civilian rights and constitutional articles.',
              estimatedMinutes: 180,
              dependsOn: 1
            },
            {
              title: 'Write enforcement mechanisms and legal remedies sections',
              description: 'Draft sections about article 32, habeas corpus, and other remedies.',
              estimatedMinutes: 120,
              dependsOn: 2
            },
            {
              title: 'Review, format, and edit the final document',
              description: 'Format to 24 A4 pages and correct any errors.',
              estimatedMinutes: 90,
              dependsOn: 3
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
        question: null,
        tasks: [
          {
            title: 'Define report scope and search legal sources',
            description: 'Clarify exactly what needs to be done.',
            estimatedMinutes: 60,
            dependsOn: null
          },
          {
            title: 'Create detailed report outline',
            description: 'List the individual steps required.',
            estimatedMinutes: 90,
            dependsOn: 0
          },
          {
            title: 'Draft the core content sections',
            description: 'Start drafting the main sections of the goal.',
            estimatedMinutes: 180,
            dependsOn: 1
          },
          {
            title: 'Review and iterate',
            description: 'Check your work and adjust as needed.',
            estimatedMinutes: 90,
            dependsOn: 2
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
      suggestedAction: 'Re-run the scheduler to fit remaining tasks into your available time.'
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

async function generateJSONWithFallback<T>(
  systemPrompt: string,
  userPrompt: string,
  schemaConfig: SchemaConfig,
  validator: (raw: string) => T
): Promise<T> {
  let lastError: Error | null = null;
  for (const provider of providers) {
    try {
      // Skip providers that don't have API keys configured (except Stub which
      // always works).
      if (provider.name === 'Gemini' && !process.env.GEMINI_API_KEY) continue;
      if (provider.name === 'Groq' && !process.env.GROQ_API_KEY) continue;
      
      const raw = await provider.generateJSON(systemPrompt, userPrompt, schemaConfig);
      return validator(raw); // Validate inside the loop to trigger fallback if validation fails
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Log the failure but don't throw — try the next provider.
      console.warn(
        `[AI] ${provider.name} failed or validation failed: ${lastError.message}. Falling back...`
      );
    }
  }
  throw lastError ?? new Error('All AI providers failed');
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

  const validated = await generateJSONWithFallback(
    system,
    user,
    {
      name: 'GoalAIResult',
      jsonSchema: goalAIResultJsonSchema,
    },
    (raw) => {
      const parsed = parseJsonSafe(raw);
      return AIResultSchema.parse(parsed);
    }
  );

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

  const validated = await generateJSONWithFallback(
    system,
    user,
    {
      name: 'RiskExplanation',
      jsonSchema: riskExplanationJsonSchema,
    },
    (raw) => {
      const parsed = parseJsonSafe(raw);
      return RiskExplanationSchema.parse(parsed);
    }
  );

  return {
    headline: validated.headline,
    body: validated.body,
    suggestedAction: validated.suggestedAction ?? null,
  };
}

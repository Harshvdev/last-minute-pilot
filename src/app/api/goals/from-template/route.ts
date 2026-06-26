import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { GOAL_TEMPLATES, templateToGoalInput } from '@/lib/goal-templates';
import { prioritize } from '@/lib/scheduler/prioritize';
import { requireUser } from '@/lib/auth/session';

const BodySchema = z.object({
  templateId: z.string(),
  // Optional: override the title
  title: z.string().min(1).max(200).optional(),
  // Whether to run AI breakdown after creating the goal
  runBreakdown: z.boolean().default(true),
});

// POST /api/goals/from-template
// Creates a goal from a preset template, optionally runs AI breakdown.
// Scoped to the authenticated user — the created goal is owned by the user.
export async function POST(req: NextRequest) {
  const userIdOrResponse = await requireUser();
  if (userIdOrResponse instanceof NextResponse) return userIdOrResponse;
  const userId = userIdOrResponse;

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const template = GOAL_TEMPLATES.find((t) => t.id === parsed.data!.templateId);
  if (!template) {
    return NextResponse.json(
      { error: 'Template not found' },
      { status: 404 }
    );
  }

  const input = templateToGoalInput(template);
  if (parsed.data.title) {
    input.title = parsed.data.title;
  }

  const goal = await db.goal.create({
    data: {
      userId,
      title: input.title,
      rawInput: input.rawInput,
      goalType: input.goalType,
      deadline: input.deadline ? new Date(input.deadline) : null,
      category: input.category,
    },
  });

  // Add a starter set of default availability based on the template category
  // so the scheduler has something to work with immediately.
  const defaultAvailability = getDefaultAvailability(template.category);
  if (defaultAvailability.length > 0) {
    await db.availability.createMany({
      data: defaultAvailability.map((a) => ({
        goalId: goal.id,
        dayOfWeek: a.dayOfWeek,
        startTime: a.startTime,
        endTime: a.endTime,
      })),
    });
  }

  return NextResponse.json({ goal, runBreakdown: parsed.data.runBreakdown }, { status: 201 });
}

function getDefaultAvailability(category: string) {
  // Evening windows on weekdays + a weekend block, tuned per category.
  if (category === 'health') {
    return [
      { dayOfWeek: 1, startTime: '06:30', endTime: '07:15' },
      { dayOfWeek: 3, startTime: '06:30', endTime: '07:15' },
      { dayOfWeek: 5, startTime: '06:30', endTime: '07:15' },
    ];
  }
  return [
    { dayOfWeek: 1, startTime: '18:00', endTime: '21:00' },
    { dayOfWeek: 2, startTime: '18:00', endTime: '21:00' },
    { dayOfWeek: 3, startTime: '18:00', endTime: '21:00' },
    { dayOfWeek: 4, startTime: '18:00', endTime: '21:00' },
    { dayOfWeek: 5, startTime: '18:00', endTime: '21:00' },
    { dayOfWeek: 6, startTime: '09:00', endTime: '17:00' },
  ];
}

// Keep prioritize import used for future template task seeding.
void prioritize;

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { breakdownGoal } from '@/lib/ai/adapter';
import { prioritize } from '@/lib/scheduler/prioritize';
import { requireUser } from '@/lib/auth/session';

type Params = { params: Promise<{ id: string }> };

const BodySchema = z.object({
  // optional override of raw input for this breakdown call
  rawInput: z.string().max(5000).optional(),
});

// POST /api/goals/[id]/ai-breakdown
// Calls the LLM adapter to draft tasks, then writes them to the DB with
// deterministic priority scores. Returns the created tasks.
// Scoped to the authenticated user.
export async function POST(req: NextRequest, { params }: Params) {
  const userIdOrResponse = await requireUser();
  if (userIdOrResponse instanceof NextResponse) return userIdOrResponse;
  const userId = userIdOrResponse;

  const { id } = await params;
  const goal = await db.goal.findFirst({ where: { id, userId } });
  if (!goal) {
    return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  const rawInput = parsed.success ? parsed.data.rawInput : undefined;

  let drafts;
  try {
    drafts = await breakdownGoal({
      title: goal.title,
      rawInput: rawInput ?? goal.rawInput ?? goal.title,
      goalType: goal.goalType,
      deadline: goal.deadline?.toISOString() ?? null,
      category: goal.category,
    });
  } catch (err) {
    console.error('[ai-breakdown] failed', err);
    return NextResponse.json(
      {
        error: 'AI breakdown failed',
        detail: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 502 }
    );
  }

  // Delete existing pending tasks (keep done/in_progress to preserve progress)
  await db.task.deleteMany({
    where: { goalId: id, status: 'pending' },
  });

  // Count existing tasks for orderIndex base
  const existing = await db.task.count({ where: { goalId: id } });

  const now = new Date();
  const created = await db.$transaction(
    drafts.tasks.map((d, idx) =>
      db.task.create({
        data: {
          goalId: id,
          title: d.title,
          description: d.description ?? null,
          estimatedMinutes: d.estimatedMinutes,
          orderIndex: existing + idx,
          // dependsOn resolved below in a second pass
        },
      })
    )
  );

  // Resolve dependsOn indices to real task IDs (LLM emits 0-based indices
  // referring to the drafts array, which matches `created` order).
  for (let i = 0; i < drafts.tasks.length; i++) {
    const d = drafts.tasks[i];
    if (typeof d.dependsOn === 'number' && created[d.dependsOn]) {
      await db.task.update({
        where: { id: created[i].id },
        data: { dependsOnId: created[d.dependsOn].id },
      });
      created[i].dependsOnId = created[d.dependsOn].id;
    }
  }

  // Compute deterministic priority scores and persist them.
  const ranked = prioritize(
    created.map((t) => ({
      id: t.id,
      goalId: t.goalId,
      title: t.title,
      description: t.description,
      estimatedMinutes: t.estimatedMinutes,
      priorityScore: 0,
      dependsOnId: t.dependsOnId,
      status: t.status as 'pending' | 'in_progress' | 'done' | 'skipped',
      orderIndex: t.orderIndex,
      scheduleBlocks: [],
      progressLogs: [],
    })),
    goal.deadline,
    now
  );
  for (let i = 0; i < ranked.length; i++) {
    await db.task.update({
      where: { id: ranked[i].id },
      data: { priorityScore: ranked.length - i },
    });
  }

  return NextResponse.json({
    tasks: created,
    rationale: drafts.rationale ?? null,
  });
}

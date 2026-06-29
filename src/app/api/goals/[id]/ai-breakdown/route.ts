import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { breakdownGoal } from '@/lib/ai/adapter';
import { prioritize } from '@/lib/scheduler/prioritize';
import { requireUser } from '@/lib/auth/session';

type Params = { params: Promise<{ id: string }> };

const BodySchema = z.object({
  rawInput: z.string().max(5000).optional(),
  answers: z
    .array(
      z.object({
        questionId: z.string(),
        answer: z.string().optional().nullable(),
        skipped: z.boolean().optional(),
      })
    )
    .optional(),
  force: z.boolean().optional(),
});

// POST /api/goals/[id]/ai-breakdown
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
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { rawInput, answers = [], force = false } = parsed.data;

  // Safety cutoff: if we have 3 total turns, force the plan
  const forcePlan = force || answers.length >= 3;

  let aiResult;
  try {
    aiResult = await breakdownGoal({
      title: goal.title,
      rawInput: rawInput ?? goal.rawInput ?? goal.title,
      goalType: goal.goalType,
      deadline: goal.deadline?.toISOString() ?? null,
      category: goal.category,
      answers,
      forcePlan,
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

  if (aiResult.confidence === 'low' && aiResult.questions && aiResult.questions.length > 0) {
    return NextResponse.json({
      status: 'need_clarification',
      questions: aiResult.questions,
    });
  }

  const tasksDraft = aiResult.tasks || [];
  const assumptions = aiResult.assumptions || [];

  // 1. Fetch all existing tasks for this goal
  const existingTasks = await db.task.findMany({
    where: { goalId: id },
    orderBy: { orderIndex: 'asc' },
  });

  // Split into pending (which we can reconcile) and non-pending (active/done/skipped, which we MUST preserve)
  const existingPending = existingTasks.filter((t) => t.status === 'pending');
  const existingNonPending = existingTasks.filter((t) => t.status !== 'pending');

  // Helper for word-based Jaccard similarity
  function getSimilarity(s1: string, s2: string): number {
    const w1 = new Set(s1.toLowerCase().split(/\s+/).filter(Boolean));
    const w2 = new Set(s2.toLowerCase().split(/\s+/).filter(Boolean));
    if (w1.size === 0 && w2.size === 0) return 1;
    const intersection = new Set([...w1].filter((x) => w2.has(x)));
    const union = new Set([...w1, ...w2]);
    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  // 2. Perform delta matching
  const matchedExistingIds = new Set<string>();
  const finalTasks: any[] = [];

  for (let i = 0; i < tasksDraft.length; i++) {
    const draft = tasksDraft[i];
    let bestMatch: typeof existingPending[0] | null = null;
    let bestScore = 0;

    // First pass: Semantic similarity
    for (const ext of existingPending) {
      if (matchedExistingIds.has(ext.id)) continue;
      const score = getSimilarity(draft.title, ext.title);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = ext;
      }
    }

    // If similarity is decent (>= 0.35), match it
    if (bestMatch && bestScore >= 0.35) {
      matchedExistingIds.add(bestMatch.id);
      const updated = await db.task.update({
        where: { id: bestMatch.id },
        data: {
          title: draft.title,
          description: draft.description ?? null,
          estimatedMinutes: draft.estimatedMinutes,
        },
      });
      finalTasks.push(updated);
    } else {
      // Fallback: Match by positional index in the remaining unmatched pending tasks
      const positionMatch = existingPending.find((ext) => !matchedExistingIds.has(ext.id));
      if (positionMatch) {
        matchedExistingIds.add(positionMatch.id);
        const updated = await db.task.update({
          where: { id: positionMatch.id },
          data: {
            title: draft.title,
            description: draft.description ?? null,
            estimatedMinutes: draft.estimatedMinutes,
          },
        });
        finalTasks.push(updated);
      } else {
        // No match found — create a new task
        const createdNew = await db.task.create({
          data: {
            goalId: id,
            title: draft.title,
            description: draft.description ?? null,
            estimatedMinutes: draft.estimatedMinutes,
            orderIndex: existingTasks.length + i,
          },
        });
        finalTasks.push(createdNew);
      }
    }
  }

  // 3. Delete any remaining unmatched pending tasks
  const unmatchedPending = existingPending.filter((ext) => !matchedExistingIds.has(ext.id));
  if (unmatchedPending.length > 0) {
    await db.task.deleteMany({
      where: {
        id: { in: unmatchedPending.map((t) => t.id) },
      },
    });
  }

  // 4. Resolve dependsOn indices to real task IDs
  for (let i = 0; i < tasksDraft.length; i++) {
    const d = tasksDraft[i];
    const currentTask = finalTasks[i];
    if (typeof d.dependsOn === 'number' && finalTasks[d.dependsOn]) {
      const depTask = finalTasks[d.dependsOn];
      await db.task.update({
        where: { id: currentTask.id },
        data: { dependsOnId: depTask.id },
      });
      currentTask.dependsOnId = depTask.id;
    } else {
      await db.task.update({
        where: { id: currentTask.id },
        data: { dependsOnId: null },
      });
      currentTask.dependsOnId = null;
    }
  }

  // Combine non-pending tasks and final reconciled tasks to re-prioritize
  const allCurrentTasks = [
    ...existingNonPending,
    ...finalTasks,
  ];

  const now = new Date();
  const ranked = prioritize(
    allCurrentTasks.map((t) => ({
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

  // Update the Goal table to save the assumptions
  await db.goal.update({
    where: { id },
    data: { aiAssumptions: assumptions },
  });

  return NextResponse.json({
    status: 'completed',
    tasks: finalTasks,
    assumptions,
    rationale: aiResult.rationale ?? null,
  });
}



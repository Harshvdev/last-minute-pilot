import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { assessRisk } from '@/lib/risk/assess';
import { explainRisk } from '@/lib/ai/adapter';
import { requireUser } from '@/lib/auth/session';
import type { TaskRow, TaskStatus } from '@/lib/types';

type Params = { params: Promise<{ id: string }> };

// POST /api/goals/[id]/risk
// Runs the deterministic risk assessment, persists it, and asks the LLM to
// write the human-readable explanation. If the LLM is unavailable, we still
// persist the deterministic result with a fallback explanation.
// Scoped to the authenticated user.
export async function POST(_req: NextRequest, { params }: Params) {
  const userIdOrResponse = await requireUser();
  if (userIdOrResponse instanceof NextResponse) return userIdOrResponse;
  const userId = userIdOrResponse;

  const { id } = await params;
  const goal = await db.goal.findFirst({
    where: { id, userId },
    include: {
      tasks: true,
      availability: true,
    },
  });
  if (!goal) {
    return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
  }

  const assessment = assessRisk({
    tasks: goal.tasks.map(
      (t) =>
        ({
          id: t.id,
          goalId: t.goalId,
          title: t.title,
          description: t.description,
          estimatedMinutes: t.estimatedMinutes,
          priorityScore: t.priorityScore,
          dependsOnId: t.dependsOnId,
          status: t.status as TaskStatus,
          orderIndex: t.orderIndex,
          scheduleBlocks: [],
          progressLogs: [],
        }) as TaskRow
    ),
    availability: goal.availability.map((a) => ({
      id: a.id,
      goalId: a.goalId,
      dayOfWeek: a.dayOfWeek,
      startTime: a.startTime,
      endTime: a.endTime,
      specificDate: a.specificDate?.toISOString() ?? null,
    })),
    deadline: goal.deadline,
  });

  let headline = assessment.reason;
  let body = `Work remaining: ${assessment.remainingWork}m. Free time available: ${assessment.remainingTime}m.`;
  let suggestedAction: string | null = null;

  try {
    const explanation = await explainRisk({
      goalTitle: goal.title,
      deadline: goal.deadline?.toISOString() ?? null,
      riskLevel: assessment.riskLevel,
      remainingWork: assessment.remainingWork,
      remainingTime: assessment.remainingTime,
      completedTasks: assessment.completedTasks,
      totalTasks: assessment.totalTasks,
    });
    headline = explanation.headline;
    body = explanation.body;
    suggestedAction = explanation.suggestedAction;
  } catch (err) {
    console.error('[risk] LLM explanation failed, using fallback', err);
  }

  const saved = await db.riskAssessment.create({
    data: {
      goalId: id,
      riskLevel: assessment.riskLevel,
      reason: `${headline}\n\n${body}`,
      suggestedAction,
      remainingWork: assessment.remainingWork,
      remainingTime: assessment.remainingTime,
    },
  });

  return NextResponse.json({ assessment: saved });
}

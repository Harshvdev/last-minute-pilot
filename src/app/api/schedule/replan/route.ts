import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { prioritize } from '@/lib/scheduler/prioritize';
import { fitBlocks } from '@/lib/scheduler/fit-blocks';
import { assessRisk } from '@/lib/risk/assess';
import { explainRisk } from '@/lib/ai/adapter';
import { requireUser } from '@/lib/auth/session';
import { notifyRiskEscalation } from '@/lib/push/server';
import type { AvailabilityRow, TaskRow, TaskStatus } from '@/lib/types';
import type { RiskLevel } from '@/lib/types';

interface ReplanResult {
  goalId: string;
  goalTitle: string;
  riskLevel: string;
  blocksCreated: number;
  unscheduled: number;
  explanation?: string | null;
  suggestedAction?: string | null;
  skipped?: string;
}

// Replan every active goal for a single user. Returns per-goal results.
// Used both by the system CRON (loop over all users) and by a normal
// authenticated user request (just the calling user).
async function replanForUser(
  userId: string,
  now: Date = new Date()
): Promise<ReplanResult[]> {
  const goals = await db.goal.findMany({
    where: { userId, status: 'active' },
    include: {
      tasks: true,
      availability: true,
      riskAssessments: { orderBy: { assessedAt: 'desc' }, take: 1 },
    },
  });

  const results: ReplanResult[] = [];

  for (const goal of goals) {
    const tasks: TaskRow[] = goal.tasks.map((t) => ({
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
    }));
    const availability: AvailabilityRow[] = goal.availability.map((a) => ({
      id: a.id,
      goalId: a.goalId,
      dayOfWeek: a.dayOfWeek,
      startTime: a.startTime ? (a.startTime instanceof Date ? a.startTime.toISOString().slice(11, 16) : String(a.startTime)) : null,
      endTime: a.endTime ? (a.endTime instanceof Date ? a.endTime.toISOString().slice(11, 16) : String(a.endTime)) : null,
      specificDate: a.specificDate ? a.specificDate.toISOString() : null,
    }));

    // 1) Determine risk deterministically.
    const assessment = assessRisk({
      tasks,
      availability,
      deadline: goal.deadline,
      now,
    });

    // 2) Re-fit schedule blocks (only if work remains).
    let blocksCreated = 0;
    let unscheduledCount = 0;
    if (assessment.remainingWork > 0) {
      const ranked = prioritize(tasks, goal.deadline, now);
      const fit = fitBlocks({
        tasks: ranked,
        availability,
        start: now,
        deadline: goal.deadline,
      });
      // Replace future planned blocks for this goal.
      await db.scheduleBlock.deleteMany({
        where: {
          task: { goalId: goal.id },
          status: 'planned',
          startAt: { gt: now },
        },
      });
      if (fit.scheduled.length > 0) {
        await db.$transaction(
          fit.scheduled.map((b) =>
            db.scheduleBlock.create({
              data: {
                taskId: b.taskId,
                startAt: b.startAt,
                endAt: b.endAt,
                status: 'planned',
              },
            })
          )
        );
      }
      blocksCreated = fit.scheduled.length;
      unscheduledCount = fit.unscheduled.length;
    }

    // 3) On high/critical, persist a risk assessment + LLM explanation.
    let explanation: string | null = null;
    let suggestedAction: string | null = null;
    const previousRiskLevel = goal.riskAssessments[0]?.riskLevel as RiskLevel | undefined;
    const riskEscalated =
      assessment.riskLevel === 'high' || assessment.riskLevel === 'critical';
    const riskIncreased =
      riskEscalated &&
      previousRiskLevel !== 'high' &&
      previousRiskLevel !== 'critical';

    if (riskEscalated) {
      try {
        const exp = await explainRisk({
          goalTitle: goal.title,
          deadline: goal.deadline?.toISOString() ?? null,
          riskLevel: assessment.riskLevel,
          remainingWork: assessment.remainingWork,
          remainingTime: assessment.remainingTime,
          completedTasks: assessment.completedTasks,
          totalTasks: assessment.totalTasks,
        });
        explanation = exp.headline;
        suggestedAction = exp.suggestedAction;
        await db.riskAssessment.create({
          data: {
            goalId: goal.id,
            riskLevel: assessment.riskLevel,
            reason: `${exp.headline}\n\n${exp.body}`,
            suggestedAction,
            remainingWork: assessment.remainingWork,
            remainingTime: assessment.remainingTime,
          },
        });
      } catch (err) {
        console.error(
          `[replan] LLM explanation failed for goal ${goal.id}`,
          err
        );
        await db.riskAssessment.create({
          data: {
            goalId: goal.id,
            riskLevel: assessment.riskLevel,
            reason: assessment.reason,
            suggestedAction: null,
            remainingWork: assessment.remainingWork,
            remainingTime: assessment.remainingTime,
          },
        });
      }
    }

    // 4) If risk escalated (wasn't high/critical before, is now), send a push
    // notification. This is non-blocking — if push fails, the replan still
    // succeeds.
    if (riskIncreased) {
      notifyRiskEscalation(
        userId,
        goal.title,
        assessment.riskLevel,
        suggestedAction
      ).catch(() => {
        // Ignore — push is best-effort.
      });
    }

    results.push({
      goalId: goal.id,
      goalTitle: goal.title,
      riskLevel: assessment.riskLevel,
      blocksCreated,
      unscheduled: unscheduledCount,
      explanation,
      suggestedAction,
    });
  }

  return results;
}

// POST /api/schedule/replan
// Background-style job: re-evaluate every active goal, recompute its schedule
// blocks, and (if risk escalated to high/critical) ask the LLM to write the
// explanation + suggested action and persist a RiskAssessment.
//
// This is the "autonomous task planning & execution" loop from §1, run on
// demand by an external cron (cron-job.org style) or by the UI.
//
// Auth model:
//   - If the request carries `Authorization: Bearer <CRON_SECRET>`, run the
//     replan across ALL users (system CRON).
//   - Otherwise, require a normal authenticated session and only replan that
//     user's goals.
export async function POST(req: NextRequest) {
  const now = new Date();

  // System CRON path.
  const authHeader = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    const allUsers = await db.user.findMany({ select: { id: true } });
    const allResults: ReplanResult[] = [];
    for (const u of allUsers) {
      const r = await replanForUser(u.id, now);
      allResults.push(...r);
    }
    return NextResponse.json({
      replannedAt: now.toISOString(),
      mode: 'cron',
      usersProcessed: allUsers.length,
      goalsProcessed: allResults.length,
      results: allResults,
    });
  }

  // Normal authenticated user path.
  const userIdOrResponse = await requireUser();
  if (userIdOrResponse instanceof NextResponse) return userIdOrResponse;
  const userId = userIdOrResponse;

  const results = await replanForUser(userId, now);

  return NextResponse.json({
    replannedAt: now.toISOString(),
    mode: 'user',
    goalsProcessed: results.length,
    results,
  });
}

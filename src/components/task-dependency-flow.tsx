'use client';

import * as React from 'react';
import { ArrowRight, CheckCircle2, Circle, Lock, GitBranch } from 'lucide-react';

import { cn } from '@/lib/utils';
import { formatMinutes } from '@/lib/format';
import type { TaskStatus } from '@/lib/types';

interface DependencyTask {
  id: string;
  title: string;
  estimatedMinutes: number;
  status: TaskStatus;
  dependsOnId: string | null;
  orderIndex: number;
}

interface TaskDependencyFlowProps {
  tasks: DependencyTask[];
  onSelect?: (taskId: string) => void;
}

// Build forward chains starting from tasks that have no unmet dependency
// (i.e. root tasks). Walk down the dependsOn chain.
function buildChains(tasks: DependencyTask[]): DependencyTask[][] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const dependents = new Map<string, string[]>(); // taskId -> ids that depend on it
  for (const t of tasks) {
    if (t.dependsOnId) {
      const arr = dependents.get(t.dependsOnId) ?? [];
      arr.push(t.id);
      dependents.set(t.dependsOnId, arr);
    }
  }
  // Roots: tasks that have no dependsOnId OR whose dependsOnId is not in our set
  const roots = tasks.filter(
    (t) => !t.dependsOnId || !byId.has(t.dependsOnId)
  );
  // Sort roots by orderIndex for a stable starting order
  roots.sort((a, b) => a.orderIndex - b.orderIndex);

  const chains: DependencyTask[][] = [];
  const visited = new Set<string>();

  // DFS from each root, walking down the dependents map.
  // If a task has multiple dependents, we fork into multiple chains (BFS-style).
  const walk = (startId: string) => {
    const queue: DependencyTask[][] = [[byId.get(startId)!]];
    while (queue.length > 0) {
      const chain = queue.shift()!;
      const tail = chain[chain.length - 1];
      visited.add(tail.id);
      const childIds = dependents.get(tail.id) ?? [];
      if (childIds.length === 0) {
        chains.push(chain);
        continue;
      }
      // Sort children by orderIndex for stable output
      childIds.sort((a, b) => (byId.get(a)!.orderIndex) - (byId.get(b)!.orderIndex));
      for (const cid of childIds) {
        queue.push([...chain, byId.get(cid)!]);
      }
    }
  };

  for (const r of roots) walk(r.id);

  // Any tasks not visited (orphan cycles) get appended as singletons
  for (const t of tasks) {
    if (!visited.has(t.id)) chains.push([t]);
  }

  // Sort chains by the orderIndex of their root, then by length desc
  chains.sort((a, b) => {
    const ra = a[0]?.orderIndex ?? 0;
    const rb = b[0]?.orderIndex ?? 0;
    if (ra !== rb) return ra - rb;
    return b.length - a.length;
  });

  return chains;
}

export function TaskDependencyFlow({ tasks, onSelect }: TaskDependencyFlowProps) {
  // Only show this flow if there's at least one dependency.
  const hasDeps = tasks.some((t) => t.dependsOnId);
  if (!hasDeps) return null;

  const chains = buildChains(tasks);
  const doneIds = new Set(
    tasks.filter((t) => t.status === 'done').map((t) => t.id)
  );

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3 sm:p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
          <GitBranch className="h-3.5 w-3.5" />
        </div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Dependency flow
        </h4>
      </div>
      <div className="space-y-2">
        {chains.map((chain, ci) => (
          <div
            key={`chain-${ci}`}
            className="flex items-center gap-1.5 overflow-x-auto pb-1"
          >
            {chain.map((task, ti) => {
              const isDone = task.status === 'done';
              const isBlocked =
                !!task.dependsOnId && !doneIds.has(task.dependsOnId);
              const isInProgress = task.status === 'in_progress';
              return (
                <React.Fragment key={task.id}>
                  {ti > 0 && (
                    <ArrowRight
                      className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70"
                      aria-hidden
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => onSelect?.(task.id)}
                    className={cn(
                      'group inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-left transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      isDone
                        ? 'border-success/30 bg-success/10 text-success'
                        : isInProgress
                          ? 'border-primary/40 bg-primary/10 text-primary'
                          : isBlocked
                            ? 'border-warning/40 bg-warning/15 text-warning-foreground'
                            : 'border-border bg-card text-foreground hover:bg-accent/60'
                    )}
                    title={`${task.title} · ${formatMinutes(task.estimatedMinutes)}`}
                  >
                    {isDone ? (
                      <CheckCircle2 className="h-3 w-3 shrink-0" />
                    ) : isBlocked ? (
                      <Lock className="h-3 w-3 shrink-0" />
                    ) : (
                      <Circle className="h-3 w-3 shrink-0 opacity-50" />
                    )}
                    <span className="max-w-[10rem] truncate text-xs font-medium sm:max-w-[14rem]">
                      {task.title}
                    </span>
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

'use client';

import * as React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Check, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatMinutes } from '@/lib/format';

interface SortableTask {
  id: string;
  title: string;
  estimatedMinutes: number;
  status: string;
  orderIndex: number;
}

interface TaskReorderListProps {
  tasks: SortableTask[];
  onReorder: (orderedIds: string[]) => Promise<void>;
  onCancel: () => void;
}

// Drag-and-drop reorder mode for tasks. Replaces the accordion list with a
// flat sortable list while active. Uses dnd-kit (already installed).
export function TaskReorderList({
  tasks,
  onReorder,
  onCancel,
}: TaskReorderListProps) {
  const [items, setItems] = React.useState<SortableTask[]>(tasks);
  const [saving, setSaving] = React.useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const oldIndex = prev.findIndex((t) => t.id === active.id);
      const newIndex = prev.findIndex((t) => t.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onReorder(items.map((t) => t.id));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-3">
        <div className="flex items-center gap-2">
          <GripVertical className="h-4 w-4 text-primary" />
          <p className="text-sm font-medium text-foreground">
            Drag to reorder tasks
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={saving}
            className="gap-1 text-muted-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="gap-1"
          >
            <Check className="h-3.5 w-3.5" />
            Save order
          </Button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={items.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="space-y-2">
            {items.map((task, idx) => (
              <SortableTaskRow key={task.id} task={task} index={idx} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <p className="text-center text-[0.6875rem] text-muted-foreground">
        Tip: use arrow keys + space to reorder with the keyboard.
      </p>
    </div>
  );
}

function SortableTaskRow({
  task,
  index,
}: {
  task: SortableTask;
  index: number;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isDone = task.status === 'done';

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-2 rounded-lg border border-border bg-card p-3 transition-shadow',
        isDragging && 'z-50 border-primary shadow-lg'
      )}
    >
      <button
        type="button"
        className={cn(
          'flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground hover:text-foreground active:cursor-grabbing',
          isDragging && 'cursor-grabbing text-primary'
        )}
        aria-label={`Drag ${task.title} to reorder`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="w-6 shrink-0 text-center text-[0.625rem] font-semibold tabular-nums text-primary/70">
        {String(index + 1).padStart(2, '0')}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'truncate text-sm font-medium',
            isDone ? 'text-muted-foreground line-through' : 'text-foreground'
          )}
        >
          {task.title}
        </p>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">
        {formatMinutes(task.estimatedMinutes)}
      </span>
      {isDone && (
        <Badge variant="outline" className="shrink-0 bg-success/10 text-success border-success/20 text-[0.625rem]">
          Done
        </Badge>
      )}
    </li>
  );
}

import type { Task } from '../types/task';
import {
  formatTaskCreatedDate,
  getBadgeClassName,
  getCardClassName,
  getPriorityLabel,
} from './utils';
import { useDraggable } from '@dnd-kit/react';

interface CardProps {
  task: Task;
  dragDisabled?: boolean;
  editDisabled?: boolean;
  onEdit?: (task: Task) => void;
}

export function Card({
  task,
  dragDisabled = false,
  editDisabled = false,
  onEdit = () => { },
}: CardProps) {
  const { ref } = useDraggable({
    id: task.id,
    disabled: dragDisabled,
  });

  return (
    <article
      ref={ref}
      aria-label={task.title}
      className={getCardClassName(task.priority)}
    >
      <div className="card-header">
        <div className="card-title">{task.title}</div>
        <button
          type="button"
          className="card-edit-button"
          aria-label={`${task.title} 수정`}
          onClick={() => onEdit(task)}
          disabled={editDisabled}
        >
          수정
        </button>
      </div>

      <div className="card-meta">
        <span className={getBadgeClassName(task.priority)}>{getPriorityLabel(task.priority)}</span>

        <span className="date">{formatTaskCreatedDate(task.createdAt)}</span>
      </div>
    </article>
  );
}

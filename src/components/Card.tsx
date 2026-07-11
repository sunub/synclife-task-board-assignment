import type { Task } from '../types/task';
import {
  formatTaskCreatedDate,
  getBadgeClassName,
  getCardClassName,
  getPriorityLabel,
} from './utils';

interface CardProps {
  task: Task;
  dragDisabled?: boolean;
  onEdit?: (task: Task) => void;
}

export function Card({ task, dragDisabled = false, onEdit = () => {} }: CardProps) {
  return (
    <article
      aria-label={task.title}
      className={getCardClassName(task.priority)}
      draggable={!dragDisabled}
      onDragStart={event => {
        if (dragDisabled) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.setData('text/plain', task.id);
      }}
    >
      <div className="card-header">
        <div className="card-title">{task.title}</div>
        <button
          type="button"
          className="card-edit-button"
          aria-label={`${task.title} 수정`}
          onClick={() => onEdit(task)}
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

import { Priority, Status } from "../../types/task";
import type { TaskFormDraft, TaskFormState } from "@/types/form";

interface TaskFormPanelProps {
  formState: Exclude<TaskFormState, { mode: 'idle' }>;
  onChange: (patch: Partial<TaskFormDraft>) => void;
  onCancel: () => void;
  onSave: () => void;
  onDelete: () => void;
  isSubmitting?: boolean;
  isDeleting?: boolean;
}

export function TaskFormPanel({
  formState,
  onChange,
  onCancel,
  onSave,
  onDelete,
  isSubmitting = false,
  isDeleting = false,
}: TaskFormPanelProps) {
  const title = formState.mode === 'editing' ? '작업 수정' : '작업 생성';

  return (
    <div
      className="task-panel-backdrop"
      onMouseDown={event => {
        if (!isSubmitting && event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <aside
        aria-label={title}
        className="task-panel"
        role="dialog"
        onKeyDown={event => {
          if (!isSubmitting && event.key === 'Escape') {
            onCancel();
          }
        }}
      >
        <div className="task-panel-header">
          <h2>{title}</h2>
          <button
            type="button"
            aria-label="닫기"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            닫기
          </button>
        </div>

        <label className="task-panel-field">
          <span>제목</span>
          <textarea
            aria-label="제목"
            value={formState.draft.title}
            onChange={event => onChange({ title: event.target.value })}
            disabled={isSubmitting}
          />
        </label>

        <label className="task-panel-field">
          <span>설명</span>
          <textarea
            aria-label="설명"
            value={formState.draft.description}
            onChange={event => onChange({ description: event.target.value })}
            disabled={isSubmitting}
          />
        </label>

        <label className="task-panel-field">
          <span>우선순위</span>
          <select
            aria-label="우선순위"
            value={formState.draft.priority}
            onChange={event => onChange({ priority: event.target.value as Priority })}
            disabled={isSubmitting}
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>

        <label className="task-panel-field">
          <span>상태</span>
          <select
            aria-label="상태"
            value={formState.draft.status}
            onChange={event => onChange({ status: event.target.value as Status })}
            disabled={isSubmitting}
          >
            <option value="todo">To Do</option>
            <option value="in-progress">In Progress</option>
            <option value="done">Done</option>
          </select>
        </label>

        {formState.errorMessage ? (
          <p className="task-panel-error" role="alert">
            {formState.errorMessage}
          </p>
        ) : null}

        <div className="task-panel-actions">
          {formState.mode === 'editing' ? (
            <button
              type="button"
              className="danger-button"
              onClick={onDelete}
              disabled={isSubmitting}
            >
              {isDeleting ? '삭제 중...' : '삭제'}
            </button>
          ) : null}
          <button type="button" onClick={onCancel} disabled={isSubmitting}>
            취소
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={onSave}
            disabled={isSubmitting}
          >
            {isSubmitting && !isDeleting ? '저장 중...' : '저장'}
          </button>
        </div>
      </aside>
    </div>
  );
}

import { useVirtualizer } from '@tanstack/react-virtual';
import type { Task, Status } from '../types/task';
import { Card } from './Card';
import { useCallback, useEffect, useRef, useState } from 'react';
import { estimateCardHeight } from './utils';
import { useDroppable } from '@dnd-kit/react';

interface Props {
  title: string;
  status: Status;
  taskIds: string[];
  taskById: Record<string, Task>;
  onEditTask?: (task: Task) => void;
  dragDisabled?: boolean;
  scrollToTaskId?: string;
  scrollToTopVersion?: number;
}

export function Column({
  title,
  status,
  taskIds,
  taskById,
  onEditTask = () => { },
  dragDisabled = false,
  scrollToTaskId,
  scrollToTopVersion = 0,
}: Props) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const didMountRef = useRef(false);
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  const [cardWidth, setCardWidth] = useState(300);
  const titleId = `column-${status}-title`;
  const { ref: setDroppableRef, isDropTarget } = useDroppable({
    id: status,
    disabled: dragDisabled,
  });
  const setColumnBodyRef = useCallback((element: HTMLDivElement | null) => {
    parentRef.current = element;
    setScrollElement(current => (current === element ? current : element));
  }, []);

  const setColumnRef = useCallback((element: HTMLElement | null) => {
    setDroppableRef(element);
  }, [setDroppableRef]);

  useEffect(() => {
    if (!scrollElement) {
      return;
    }

    const updateWidth = (width: number): void => {
      if (width > 0) {
        setCardWidth(current => (current === width ? current : width));
      }
    };

    updateWidth(scrollElement.offsetWidth);

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }

      updateWidth(entry.contentRect.width);
    });

    observer.observe(scrollElement);

    return () => observer.disconnect();
  }, [scrollElement]);

  const virtualizer = useVirtualizer({
    count: taskIds.length,
    estimateSize: useCallback(
      index => estimateCardHeight(taskById[taskIds[index]]!, cardWidth),
      [cardWidth, taskById, taskIds]
    ),
    getItemKey: index => taskIds[index]!,
    getScrollElement: () => scrollElement,
    initialRect: { height: 600, width: 300 },
    gap: 8,
    overscan: 8,
  });
  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;

  useEffect(() => {
    if (!scrollToTaskId) {
      return;
    }

    const targetIndex = taskIds.indexOf(scrollToTaskId);

    if (targetIndex < 0) {
      return;
    }

    virtualizer.scrollToIndex(targetIndex, { align: 'center' });

    window.setTimeout(() => {
      const renderedCards = parentRef.current?.querySelectorAll('[data-task-id]');
      const targetCard = Array.from(renderedCards ?? []).find(
        element => element.getAttribute('data-task-id') === scrollToTaskId
      );

      targetCard?.scrollIntoView({ block: 'center' });
    }, 0);
  }, [scrollToTaskId, taskIds, virtualizer]);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }

    virtualizerRef.current?.scrollToOffset(0, { align: 'start' });
  }, [scrollToTopVersion]);

  return (
    <section
      ref={setColumnRef}
      aria-labelledby={titleId}
      className={isDropTarget ? 'column is-drop-target' : 'column'}
    >
      <h2 className="column-title" id={titleId}>
        {title} <span className="count">{taskIds.length}</span>
      </h2>

      <div className="column-body" ref={setColumnBodyRef}>
        {taskIds.length === 0 ? (
          <p className="hint">이 컬럼에는 작업이 없습니다.</p>
        ) : (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map(virtualRow => {
              const task = taskById[taskIds[virtualRow.index]]!;

              return (
                <div
                  key={task.id}
                  data-task-id={task.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <Card task={task} dragDisabled={dragDisabled} onEdit={onEditTask} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

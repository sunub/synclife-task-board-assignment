import type { Task, Status } from '../types/task'

export type TaskBoardModel = {
  byId: Record<string, Task>
  idsByStatus: Record<Status, string[]>
}

export type TaskSortKey = 'title' | 'priority' | 'createdAt' | 'updatedAt'
export type TaskSortDirection = 'asc' | 'desc'

export type TaskSortOptions = {
  sortBy: TaskSortKey
  direction?: TaskSortDirection
}

export type TaskBoardFilters = {
  searchText: string
  sortOptions?: TaskSortOptions
}

export type TaskEditablePatch = Partial<
  Pick<Task, 'title' | 'priority' | 'status' | 'description'>
>

const DEFAULT_TASK_SORT: Required<TaskSortOptions> = {
  sortBy: 'updatedAt',
  direction: 'desc',
}

const PRIORITY_ORDER: Record<Task['priority'], number> = {
  high: 3,
  medium: 2,
  low: 1,
}

const titleCollator = new Intl.Collator('ko-KR', {
  numeric: true,
  sensitivity: 'base',
})

function normalizeSortOptions(options?: TaskSortOptions): Required<TaskSortOptions> {
  return {
    sortBy: options?.sortBy ?? DEFAULT_TASK_SORT.sortBy,
    direction: options?.direction ?? DEFAULT_TASK_SORT.direction,
  }
}

function compareBySortKey(a: Task, b: Task, sortBy: TaskSortKey): number {
  if (sortBy === 'title') {
    return titleCollator.compare(a.title, b.title)
  }

  if (sortBy === 'priority') {
    return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
  }

  return Date.parse(a[sortBy]) - Date.parse(b[sortBy])
}

function compareTasksForBoard(a: Task, b: Task, options?: TaskSortOptions): number {
  const sortOptions = normalizeSortOptions(options)
  const directionMultiplier = sortOptions.direction === 'asc' ? 1 : -1
  const primaryDiff =
    compareBySortKey(a, b, sortOptions.sortBy) * directionMultiplier

  if (primaryDiff !== 0) return primaryDiff

  const createdAtDiff = Date.parse(b.createdAt) - Date.parse(a.createdAt)
  if (createdAtDiff !== 0) return createdAtDiff

  return a.id.localeCompare(b.id)
}

function sortTaskIdsByBoardOrder(
  ids: string[],
  byId: Record<string, Task>,
  options?: TaskSortOptions,
): string[] {
  return [...ids].sort((a: string, b: string) =>
    compareTasksForBoard(byId[a], byId[b], options),
  )
}

function createEmptyIdsByStatus(): Record<Status, string[]> {
  return {
    todo: [],
    'in-progress': [],
    done: [],
  }
}

export function normalizeTasks(tasks: Task[], options?: TaskSortOptions): TaskBoardModel {
  const byId: Record<string, Task> = {}
  const idsByStatus = createEmptyIdsByStatus()

  for (const task of tasks) {
    byId[task.id] = task
    idsByStatus[task.status].push(task.id)
  }

  return {
    byId,
    idsByStatus: {
      todo: sortTaskIdsByBoardOrder(idsByStatus.todo, byId, options),
      'in-progress': sortTaskIdsByBoardOrder(
        idsByStatus['in-progress'],
        byId,
        options,
      ),
      done: sortTaskIdsByBoardOrder(idsByStatus.done, byId, options),
    },
  }
}

export function moveTaskOptimistically(
  model: TaskBoardModel,
  id: string,
  status: Status,
  updatedAt: string,
  options?: TaskSortOptions,
): TaskBoardModel {
  const task = model.byId[id]

  if (!task) return model

  const nextTask: Task = {
    ...task,
    status,
    updatedAt,
  }
  const byId: Record<string, Task> = {
    ...model.byId,
    [id]: nextTask,
  }
  const idsByStatus: Record<Status, string[]> = {
    todo: model.idsByStatus.todo.filter((taskId) => taskId !== id),
    'in-progress': model.idsByStatus['in-progress'].filter((taskId) => taskId !== id),
    done: model.idsByStatus.done.filter((taskId) => taskId !== id),
  }

  idsByStatus[status] = sortTaskIdsByBoardOrder(
    [...idsByStatus[status], id],
    byId,
    options,
  )

  return {
    byId,
    idsByStatus,
  }
}

export function applyServerTask(
  model: TaskBoardModel,
  task: Task,
  options?: TaskSortOptions,
): TaskBoardModel {
  const byId: Record<string, Task> = {
    ...model.byId,
    [task.id]: task,
  }
  const idsByStatus: Record<Status, string[]> = {
    todo: model.idsByStatus.todo.filter((taskId) => taskId !== task.id),
    'in-progress': model.idsByStatus['in-progress'].filter((taskId) => taskId !== task.id),
    done: model.idsByStatus.done.filter((taskId) => taskId !== task.id),
  }

  idsByStatus[task.status] = sortTaskIdsByBoardOrder(
    [...idsByStatus[task.status], task.id],
    byId,
    options,
  )

  return {
    byId,
    idsByStatus,
  }
}

export function applyTaskPatchOptimistically(
  model: TaskBoardModel,
  taskId: string,
  patch: TaskEditablePatch,
  updatedAt: string,
  options?: TaskSortOptions,
): TaskBoardModel {
  const task = model.byId[taskId]

  if (!task) return model

  return applyServerTask(
    model,
    {
      ...task,
      ...patch,
      updatedAt,
    },
    options,
  )
}

export function addTaskOptimistically(
  model: TaskBoardModel,
  task: Task,
  options?: TaskSortOptions,
): TaskBoardModel {
  return applyServerTask(model, task, options)
}

export function removeTaskOptimistically(
  model: TaskBoardModel,
  taskId: string,
): TaskBoardModel {
  if (!model.byId[taskId]) return model

  const { [taskId]: _removedTask, ...byId } = model.byId

  return {
    byId,
    idsByStatus: {
      todo: model.idsByStatus.todo.filter((id) => id !== taskId),
      'in-progress': model.idsByStatus['in-progress'].filter(
        (id) => id !== taskId,
      ),
      done: model.idsByStatus.done.filter((id) => id !== taskId),
    },
  }
}

export function replaceTask(
  model: TaskBoardModel,
  previousTaskId: string,
  nextTask: Task,
  options?: TaskSortOptions,
): TaskBoardModel {
  return applyServerTask(
    removeTaskOptimistically(model, previousTaskId),
    nextTask,
    options,
  )
}

export function selectVisibleTaskIdsByStatus(
  model: TaskBoardModel,
  filters: TaskBoardFilters,
): Record<Status, string[]> {
  const searchText = filters.searchText.trim().toLowerCase()
  const matchesSearchText = (id: string): boolean => {
    if (!searchText) return true
    return model.byId[id].title.toLowerCase().includes(searchText)
  }

  return {
    todo: sortTaskIdsByBoardOrder(
      model.idsByStatus.todo.filter(matchesSearchText),
      model.byId,
      filters.sortOptions,
    ),
    'in-progress': sortTaskIdsByBoardOrder(
      model.idsByStatus['in-progress'].filter(matchesSearchText),
      model.byId,
      filters.sortOptions,
    ),
    done: sortTaskIdsByBoardOrder(
      model.idsByStatus.done.filter(matchesSearchText),
      model.byId,
      filters.sortOptions,
    ),
  }
}

/**
 * 순수 함수 예시 — 이런 로직을 테스트로 검증하세요. (tasks.test.ts 참고)
 * 필요하면 자유롭게 수정/삭제해도 됩니다.
 */
export function moveTask(tasks: Task[], id: string, status: Status): Task[] {
  return tasks.map((t) => (t.id === id ? { ...t, status } : t))
}

export function filterByTitle(tasks: Task[], query: string): Task[] {
  const q = query.trim().toLowerCase()
  if (!q) return tasks
  return tasks.filter((t) => t.title.toLowerCase().includes(q))
}

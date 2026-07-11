import { describe, it, expect } from 'vitest'
import {
  addTaskOptimistically,
  applyTaskPatchOptimistically,
  applyServerTask,
  filterByTitle,
  moveTask,
  moveTaskOptimistically,
  normalizeTasks,
  removeTaskOptimistically,
  replaceTask,
  selectVisibleTaskIdsByStatus,
} from './tasks'
import type { Task, Status } from '../types/task'
import { makeTask as make } from '../test/utils'

describe('moveTask', () => {
  it('대상 태스크의 status 만 바꾸고 나머지는 그대로 둔다', () => {
    const tasks = [make('a'), make('b')]
    const next = moveTask(tasks, 'a', 'done')
    expect(next.find((t) => t.id === 'a')?.status).toBe('done')
    expect(next.find((t) => t.id === 'b')?.status).toBe('todo')
  })

  it('불변성을 지킨다 (원본 배열/객체를 변경하지 않는다)', () => {
    const tasks = [make('a')]
    const next = moveTask(tasks, 'a', 'done')
    expect(tasks[0].status).toBe('todo')
    expect(next).not.toBe(tasks)
  })
})

describe('filterByTitle', () => {
  it('대소문자 구분 없이 제목으로 필터링한다', () => {
    const tasks = [make('a', { title: 'Fix login bug' }), make('b', { title: 'Write docs' })]
    expect(filterByTitle(tasks, 'FIX')).toHaveLength(1)
  })

  it('빈 검색어면 전체를 반환한다', () => {
    const tasks = [make('a'), make('b')]
    expect(filterByTitle(tasks, '   ')).toHaveLength(2)
  })
})

describe('moveTaskOptimistically', () => {
  it('작업을 정규화할 때 수정일 생성일 id 순서로 컬럼 표시 순서를 고정한다', () => {
    const laterCreatedTask = make('later-created-task', {
      status: 'todo',
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-10T00:00:00.000Z',
    })
    const earlierIdTask = make('a-earlier-id-task', {
      status: 'todo',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-10T00:00:00.000Z',
    })
    const laterIdTask = make('b-later-id-task', {
      status: 'todo',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-10T00:00:00.000Z',
    })
    const newestUpdatedTask = make('newest-updated-task', {
      status: 'todo',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-11T00:00:00.000Z',
    })

    const model = normalizeTasks([
      laterIdTask,
      earlierIdTask,
      laterCreatedTask,
      newestUpdatedTask,
    ])

    expect(model.idsByStatus.todo).toEqual([
      newestUpdatedTask.id,
      laterCreatedTask.id,
      earlierIdTask.id,
      laterIdTask.id,
    ])
  })

  it('작업을 낙관적으로 이동하고 최신 수정 시각 기준의 컬럼 정렬을 유지한다', () => {
    const todoTask = make('todo-task', {
      status: 'todo',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-03T00:00:00.000Z',
    })
    const olderDoneTask = make('older-done-task', {
      status: 'done',
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-04T00:00:00.000Z',
    })
    const newerDoneTask = make('newer-done-task', {
      status: 'done',
      createdAt: '2026-01-03T00:00:00.000Z',
      updatedAt: '2026-01-10T00:00:00.000Z',
    })
    const now = '2026-01-08T00:00:00.000Z'

    const model = normalizeTasks([todoTask, olderDoneTask, newerDoneTask])
    const next = moveTaskOptimistically(model, todoTask.id, 'done', now)

    expect(next.byId[todoTask.id]).toEqual({
      ...todoTask,
      status: 'done' satisfies Status,
      updatedAt: now,
    })
    expect(next.idsByStatus.todo).toEqual([])
    expect(next.idsByStatus.done).toEqual([
      newerDoneTask.id,
      todoTask.id,
      olderDoneTask.id,
    ])
  })
})

describe('applyServerTask', () => {
  it('서버가 반환한 작업을 반영하고 상태가 바뀌면 컬럼 목록을 함께 이동한다', () => {
    const originalTask = make('moving-task', {
      status: 'todo',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-03T00:00:00.000Z',
      version: 1,
    })
    const existingDoneTask = make('existing-done-task', {
      status: 'done',
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-04T00:00:00.000Z',
      version: 1,
    })
    const serverTask: Task = {
      ...originalTask,
      status: 'done' satisfies Status,
      updatedAt: '2026-01-10T00:00:00.000Z',
      version: 2,
    }

    const model = normalizeTasks([originalTask, existingDoneTask])
    const next = applyServerTask(model, serverTask)

    expect(next.byId[originalTask.id]).toEqual(serverTask)
    expect(next.idsByStatus.todo).toEqual([])
    expect(next.idsByStatus.done).toEqual([originalTask.id, existingDoneTask.id])
  })
})

describe('task CRUD optimistic helpers', () => {
  it('작업 patch를 낙관적으로 반영하고 status가 바뀌면 표시 컬럼을 이동한다', () => {
    const task = make('patch-task', {
      title: '수정 전 제목',
      description: '수정 전 설명',
      status: 'todo',
      priority: 'low',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    const existingDoneTask = make('existing-done-task', {
      status: 'done',
      updatedAt: '2026-01-03T00:00:00.000Z',
    })
    const model = normalizeTasks([task, existingDoneTask])

    const next = applyTaskPatchOptimistically(
      model,
      task.id,
      {
        title: '수정 후 제목',
        description: '수정 후 설명',
        status: 'done',
        priority: 'high',
      },
      '2026-01-04T00:00:00.000Z',
    )

    expect(next.byId[task.id]).toEqual({
      ...task,
      title: '수정 후 제목',
      description: '수정 후 설명',
      status: 'done',
      priority: 'high',
      updatedAt: '2026-01-04T00:00:00.000Z',
    })
    expect(next.idsByStatus.todo).toEqual([])
    expect(next.idsByStatus.done).toEqual([task.id, existingDoneTask.id])
    expect(model.byId[task.id]).toEqual(task)
  })

  it('새 작업을 낙관적으로 추가하고 컬럼 표시 순서를 유지한다', () => {
    const olderTask = make('older-task', {
      status: 'todo',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    const newTask = make('new-task', {
      status: 'todo',
      updatedAt: '2026-01-03T00:00:00.000Z',
    })
    const model = normalizeTasks([olderTask])

    const next = addTaskOptimistically(model, newTask)

    expect(next.byId[newTask.id]).toEqual(newTask)
    expect(next.idsByStatus.todo).toEqual([newTask.id, olderTask.id])
    expect(model.byId[newTask.id]).toBeUndefined()
  })

  it('작업을 낙관적으로 제거하고 다른 컬럼 목록은 유지한다', () => {
    const removingTask = make('removing-task', { status: 'todo' })
    const keepingTask = make('keeping-task', { status: 'done' })
    const model = normalizeTasks([removingTask, keepingTask])

    const next = removeTaskOptimistically(model, removingTask.id)

    expect(next.byId[removingTask.id]).toBeUndefined()
    expect(next.byId[keepingTask.id]).toEqual(keepingTask)
    expect(next.idsByStatus.todo).toEqual([])
    expect(next.idsByStatus.done).toEqual([keepingTask.id])
  })

  it('임시 작업 id를 서버 작업으로 교체한다', () => {
    const temporaryTask = make('temporary-task', {
      status: 'todo',
      updatedAt: '2026-01-03T00:00:00.000Z',
    })
    const serverTask = make('server-task', {
      title: temporaryTask.title,
      status: 'done',
      updatedAt: '2026-01-04T00:00:00.000Z',
    })
    const model = normalizeTasks([temporaryTask])

    const next = replaceTask(model, temporaryTask.id, serverTask)

    expect(next.byId[temporaryTask.id]).toBeUndefined()
    expect(next.byId[serverTask.id]).toEqual(serverTask)
    expect(next.idsByStatus.todo).toEqual([])
    expect(next.idsByStatus.done).toEqual([serverTask.id])
  })
})

describe('selectVisibleTaskIdsByStatus', () => {
  it('검색어와 일치하는 작업 id만 반환하고 기존 컬럼 정렬 순서를 유지한다', () => {
    const newestMatchingTask = make('newest-matching-task', {
      title: 'Fix payment bug',
      status: 'todo',
      updatedAt: '2026-01-10T00:00:00.000Z',
    })
    const nonMatchingTask = make('non-matching-task', {
      title: 'Write release notes',
      status: 'todo',
      updatedAt: '2026-01-09T00:00:00.000Z',
    })
    const olderMatchingTask = make('older-matching-task', {
      title: 'Fix login bug',
      status: 'todo',
      updatedAt: '2026-01-08T00:00:00.000Z',
    })
    const doneTask = make('done-task', {
      title: 'Fix completed task',
      status: 'done',
      updatedAt: '2026-01-07T00:00:00.000Z',
    })

    const model = normalizeTasks([
      olderMatchingTask,
      doneTask,
      nonMatchingTask,
      newestMatchingTask,
    ])
    const visibleIds = selectVisibleTaskIdsByStatus(model, { searchText: 'FIX' })

    expect(visibleIds.todo).toEqual([newestMatchingTask.id, olderMatchingTask.id])
    expect(visibleIds['in-progress']).toEqual([])
    expect(visibleIds.done).toEqual([doneTask.id])
    expect(model.idsByStatus.todo).toEqual([
      newestMatchingTask.id,
      nonMatchingTask.id,
      olderMatchingTask.id,
    ])
  })
})

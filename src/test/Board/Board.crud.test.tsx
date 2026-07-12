import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import type { Status, Task } from '@/types/task';
import {
  createBoardServer,
  expectTaskInColumn,
  getColumn,
  makeTask,
  renderBoard,
  startBoardServer,
  isPartialTask,
  isPartialTaskWithVersion,
} from './utils';

const server = createBoardServer();

startBoardServer(server);

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

function openEditor(task: Task): void {
  fireEvent.click(screen.getByRole('button', { name: `${task.title} 수정` }));
}

function fillTaskForm(input: {
  title?: string;
  description?: string;
  priority?: Task['priority'];
  status?: Status;
}): void {
  if (input.title !== undefined) {
    fireEvent.change(screen.getByRole('textbox', { name: '제목' }), {
      target: { value: input.title },
    });
  }

  if (input.description !== undefined) {
    fireEvent.change(screen.getByRole('textbox', { name: '설명' }), {
      target: { value: input.description },
    });
  }

  if (input.priority !== undefined) {
    fireEvent.change(screen.getByRole('combobox', { name: '우선순위' }), {
      target: { value: input.priority },
    });
  }

  if (input.status !== undefined) {
    fireEvent.change(screen.getByRole('combobox', { name: '상태' }), {
      target: { value: input.status },
    });
  }
}

describe('보드 task form CRUD', () => {
  it('수정 버튼은 side panel form을 열고 저장 전에는 캐시를 바꾸지 않는다', async () => {
    const task = makeTask({ title: '수정 전 작업', priority: 'low' });

    server.use(http.get('*/api/tasks', () => HttpResponse.json([task])));

    renderBoard();

    await screen.findByText(task.title);
    openEditor(task);

    expect(screen.getByRole('dialog', { name: '작업 수정' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '제목' })).toHaveValue(task.title);
    fillTaskForm({ title: '수정 중인 작업', priority: 'high' });

    expectTaskInColumn(task, 'To Do');
    expect(within(getColumn('To Do')).queryByText('수정 중인 작업')).not.toBeInTheDocument();
  });

  it('수정 저장은 최신 캐시 version으로 PATCH를 보내고 성공 시 전체 목록을 재조회하지 않는다', async () => {
    const task = makeTask({
      title: '수정 전 작업',
      description: '수정 전 설명',
      status: 'todo',
      priority: 'low',
      version: 3,
    });
    const patchRequests: Array<Partial<Task> & { version?: number }> = [];
    let getRequestCount = 0;

    server.use(
      http.get('*/api/tasks', () => {
        getRequestCount += 1;
        return HttpResponse.json([task]);
      }),
      http.patch('*/api/tasks/:id', async ({ request }) => {
        const json = await request.json();
        const body = isPartialTaskWithVersion(json) ? json : {};
        patchRequests.push(body);

        return HttpResponse.json({
          ...task,
          ...body,
          updatedAt: '2026-01-10T00:00:00.000Z',
          version: task.version + 1,
        });
      })
    );

    renderBoard();

    await screen.findByText(task.title);
    openEditor(task);
    fillTaskForm({
      title: '수정 후 작업',
      description: '수정 후 설명',
      priority: 'high',
      status: 'done',
    });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(screen.getByText('수정 후 작업')).toBeInTheDocument();

    await waitFor(() => expectTaskInColumn({ ...task, title: '수정 후 작업' }, 'Done'));
    expect(patchRequests).toEqual([
      expect.objectContaining({
        title: '수정 후 작업',
        description: '수정 후 설명',
        priority: 'high',
        status: 'done',
        version: 3,
      }),
    ]);
    expect(getRequestCount).toBe(1);
    expect(screen.queryByRole('dialog', { name: '작업 수정' })).not.toBeInTheDocument();
  });

  it('수정 실패는 이전 작업으로 rollback하고 panel에 오류를 표시한다', async () => {
    const task = makeTask({ title: '수정 전 작업', status: 'todo' });

    server.use(
      http.get('*/api/tasks', () => HttpResponse.json([task])),
      http.patch('*/api/tasks/:id', () =>
        HttpResponse.json(
          { message: '일시적인 서버 오류입니다. 다시 시도해 주세요.' },
          { status: 500 }
        )
      )
    );

    renderBoard();

    await screen.findByText(task.title);
    openEditor(task);
    fillTaskForm({ title: '실패할 작업', status: 'done' });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(screen.getByText('실패할 작업')).toBeInTheDocument();

    await waitFor(() => expectTaskInColumn(task, 'To Do'));
    expect(within(getColumn('Done')).queryByText('실패할 작업')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('수정에 실패해 이전 상태로 되돌렸습니다.');
  });

  it('409 충돌은 서버 current를 반영하고 사용자 draft를 보존한다', async () => {
    const task = makeTask({ title: '내가 열어둔 작업', status: 'todo', version: 1 });
    const currentTask = makeTask(task.id, {
      ...task,
      title: '서버 최신 작업',
      status: 'done',
      version: 2,
    });

    server.use(
      http.get('*/api/tasks', () => HttpResponse.json([task])),
      http.patch('*/api/tasks/:id', () =>
        HttpResponse.json(
          { message: '다른 곳에서 먼저 수정되었습니다.', current: currentTask },
          { status: 409 }
        )
      )
    );

    renderBoard();

    await screen.findByText(task.title);
    openEditor(task);
    fillTaskForm({ title: '내 draft 제목' });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expectTaskInColumn(currentTask, 'Done'));
    expect(screen.getByRole('textbox', { name: '제목' })).toHaveValue('내 draft 제목');
    expect(screen.getByRole('alert')).toHaveTextContent(
      '다른 변경이 먼저 반영되어 서버 최신 상태로 갱신했습니다.'
    );
  });

  it('삭제는 확인 후 카드를 즉시 제거하고 실패하면 복원한다', async () => {
    const task = makeTask({ title: '삭제 대상 작업', status: 'todo' });
    const deleteResponse = createDeferred<Response>();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    server.use(
      http.get('*/api/tasks', () => HttpResponse.json([task])),
      http.delete('*/api/tasks/:id', () => deleteResponse.promise)
    );

    renderBoard();

    await screen.findByText(task.title);
    openEditor(task);
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));

    await waitFor(() =>
      expect(within(getColumn('To Do')).queryByText(task.title)).not.toBeInTheDocument()
    );

    deleteResponse.resolve(
      HttpResponse.json(
        { message: '일시적인 서버 오류입니다. 다시 시도해 주세요.' },
        { status: 500 }
      )
    );

    await waitFor(() => expectTaskInColumn(task, 'To Do'));
    expect(screen.getByRole('alert')).toHaveTextContent('삭제에 실패해 작업을 복원했습니다.');
  });

  it('생성 저장은 임시 카드를 즉시 추가하고 성공 시 서버 작업으로 교체한다', async () => {
    const serverTask = makeTask('server-created-task', {
      title: '새 작업',
      description: '새 설명',
      status: 'in-progress',
      priority: 'medium',
      version: 1,
    });
    let getRequestCount = 0;

    server.use(
      http.get('*/api/tasks', () => {
        getRequestCount += 1;
        return HttpResponse.json([]);
      }),
      http.post('*/api/tasks', () => HttpResponse.json(serverTask, { status: 201 }))
    );

    renderBoard();

    await screen.findByText('표시할 작업이 없습니다.');
    fireEvent.click(screen.getByRole('button', { name: '작업 만들기' }));
    fillTaskForm({
      title: serverTask.title,
      description: serverTask.description,
      priority: serverTask.priority,
      status: serverTask.status,
    });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(screen.getByText(serverTask.title)).toBeInTheDocument();

    await waitFor(() => expectTaskInColumn(serverTask, 'In Progress'));
    expect(getRequestCount).toBe(1);
    expect(screen.queryByRole('dialog', { name: '작업 생성' })).not.toBeInTheDocument();
  });

  it('생성 요청이 처리 중이면 저장 반복 클릭이 POST 요청을 중복 전송하지 않는다', async () => {
    const createResponse = createDeferred<Response>();
    const postRequests: Array<Partial<Task>> = [];

    server.use(
      http.get('*/api/tasks', () => HttpResponse.json([])),
      http.post('*/api/tasks', async ({ request }) => {
        const rawJson = await request.json();
        const json = isPartialTask(rawJson) ? rawJson : {};
        postRequests.push(json);
        return createResponse.promise;
      })
    );

    renderBoard();

    await screen.findByText('표시할 작업이 없습니다.');
    fireEvent.click(screen.getByRole('button', { name: '작업 만들기' }));
    fillTaskForm({
      title: '중복 생성 방지 작업',
      description: '첫 요청이 끝나기 전 다시 저장한다',
      priority: 'high',
      status: 'todo',
    });

    const saveButton = screen.getByRole('button', { name: '저장' });
    fireEvent.click(saveButton);
    fireEvent.click(saveButton);

    await waitFor(() => expect(postRequests).toHaveLength(1));
  });

  it('수정 요청이 처리 중이면 저장 반복 클릭이 PATCH 요청을 중복 전송하지 않는다', async () => {
    const task = makeTask({
      title: '수정 중복 방지 대상',
      status: 'todo',
      version: 5,
    });
    const updateResponse = createDeferred<Response>();
    const patchRequests: Array<Partial<Task> & { version?: number }> = [];

    server.use(
      http.get('*/api/tasks', () => HttpResponse.json([task])),
      http.patch('*/api/tasks/:id', async ({ request }) => {
        const rawJson = await request.json();
        const json = isPartialTaskWithVersion(rawJson) ? rawJson : {};
        patchRequests.push(json);
        return updateResponse.promise;
      })
    );

    renderBoard();

    await screen.findByText(task.title);
    openEditor(task);
    fillTaskForm({ title: '수정 요청 1회만 전송' });

    const saveButton = screen.getByRole('button', { name: '저장' });
    fireEvent.click(saveButton);
    fireEvent.click(saveButton);

    await waitFor(() => expect(patchRequests).toHaveLength(1));
    expect(patchRequests[0]).toEqual(
      expect.objectContaining({
        title: '수정 요청 1회만 전송',
        version: task.version,
      })
    );
  });

  it('삭제 요청이 처리 중이면 삭제 반복 클릭이 confirm과 DELETE를 중복 실행하지 않는다', async () => {
    const task = makeTask({ title: '삭제 중복 방지 대상', status: 'todo' });
    const deleteResponse = createDeferred<Response>();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const deleteRequests: string[] = [];

    server.use(
      http.get('*/api/tasks', () => HttpResponse.json([task])),
      http.delete('*/api/tasks/:id', ({ params }) => {
        deleteRequests.push(typeof params.id === "string" ? params.id : "");
        return deleteResponse.promise;
      })
    );

    renderBoard();

    await screen.findByText(task.title);
    openEditor(task);

    const deleteButton = screen.getByRole('button', { name: '삭제' });
    fireEvent.click(deleteButton);
    fireEvent.click(deleteButton);

    await waitFor(() => expect(deleteRequests).toEqual([task.id]));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Card } from '@/components/Card';
import type { Task } from '@/types/task';
import { makeTask as makeTaskFixture } from '@/test/utils';

const stylesSource = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8');

const makeCardTask = (overrides: Partial<Task> = {}): Task =>
  makeTaskFixture('task-card-1', {
    title: '고객 계약서 검토와 결제 오류 재현 절차를 함께 정리한다',
    priority: 'high',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  });

describe('Card 접근 가능한 표현', () => {
  it('카드는 작업 제목을 접근 가능한 이름으로 가진 article로 렌더링된다', () => {
    const task = makeCardTask();

    render(<Card task={task} />);

    expect(screen.getByRole('article', { name: task.title })).toBeInTheDocument();
  });

  it('카드는 제목 전체와 우선순위, 생성일 메타 정보를 함께 표시한다', () => {
    const task = makeCardTask({
      title: '긴 제목을 줄 수 제한 없이 모두 노출해서 사용자가 업무 내용을 온전히 파악한다',
      priority: 'medium',
    });

    render(<Card task={task} />);

    expect(screen.getByText(task.title)).toBeInTheDocument();
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.getByText(/\d/)).toBeInTheDocument();
  });

  it('카드는 기본 표시 상태에서 긴 제목을 한 줄 입력이 아니라 본문 텍스트로 노출한다', () => {
    const task = makeCardTask({
      title:
        '매우 긴 작업 제목도 입력 필드 안에 가두지 않고 줄바꿈 가능한 카드 본문 텍스트로 모두 보여준다',
    });

    render(<Card task={task} />);

    expect(screen.queryByRole('textbox', { name: task.title })).not.toBeInTheDocument();
    expect(screen.getByText(task.title, { selector: '.card-title' })).toBeVisible();
  });

  it('카드 제목은 사용자가 입력한 줄바꿈을 보존하는 공백 정책으로 렌더링된다', () => {
    const cardTitleRule = stylesSource.match(/\.card-title\s*\{[^}]*\}/)?.[0] ?? '';

    expect(cardTitleRule).toContain('white-space: pre-wrap');
    expect(cardTitleRule).toContain('overflow-wrap: anywhere');
  });

  it('카드는 명시적 수정 버튼을 제공하고 inline textbox를 열지 않는다', () => {
    const task = makeCardTask();
    const onEdit = vi.fn();

    render(<Card task={task} onEdit={onEdit} />);

    const editButton = screen.getByRole('button', { name: `${task.title} 수정` });

    editButton.focus();
    expect(editButton).toHaveFocus();
    fireEvent.click(editButton);
    expect(onEdit).toHaveBeenCalledWith(task);
    expect(screen.queryByRole('textbox', { name: task.title })).not.toBeInTheDocument();
  });

  it('수정이 비활성화되면 수정 요청을 보내지 않는다', () => {
    const task = makeCardTask();
    const onEdit = vi.fn();

    render(<Card task={task} editDisabled onEdit={onEdit} />);

    const editButton = screen.getByRole('button', { name: `${task.title} 수정` });

    expect(editButton).toBeDisabled();
    fireEvent.click(editButton);
    expect(onEdit).not.toHaveBeenCalled();
  });
});

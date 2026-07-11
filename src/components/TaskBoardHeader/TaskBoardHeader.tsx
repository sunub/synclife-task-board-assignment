import { TaskFormState } from '@/types/form';
import { TaskSortKeySchema } from '@/types/task';
import { useCallback } from 'react';
import type { TaskSortKey } from '@/types/task';

interface TaskBoardHeaderProps {
  openCreator: () => void;
  searchText: string;
  changeSearchText: (text: string) => void;
  sortBy: string;
  changeSortBy: (sortKey: TaskSortKey) => void;
  formState: TaskFormState;
}

export function TaskBoardHeader({ openCreator, searchText, changeSearchText, sortBy, changeSortBy }: TaskBoardHeaderProps) {
    const handleSortByChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedSortKey = event.target.value;
        const parsedSortKey = TaskSortKeySchema.safeParse(selectedSortKey);
        if (!parsedSortKey.success) {
            console.error(`Invalid sort key: ${selectedSortKey}`);
            return;
        }
        changeSortBy(parsedSortKey.data);
    }, [changeSortBy]);

    const handleSearchTextChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        changeSearchText(event.target.value);
    }, [changeSearchText]);

    return (
        <div className="board-toolbar">
        <button type="button" onClick={() => openCreator()}>
          작업 만들기
        </button>
        <input
          aria-label="작업 검색"
          type="search"
          value={searchText}
          onChange={handleSearchTextChange}
        />
        <select
          aria-label="정렬 기준"
          value={sortBy}
          onChange={handleSortByChange}
        >
          <option value="title">제목 순</option>
          <option value="priority">우선순위</option>
          <option value="createdAt">생성 날짜</option>
          <option value="updatedAt">업데이트 날짜</option>
        </select>
      </div>
    )
}
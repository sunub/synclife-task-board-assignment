import { TaskSortKeySchema } from '@/types/task';
import { useCallback } from 'react';
import type { TaskSortKey } from '@/types/task';
import Select, { SelectItem } from '../Select/Select';

interface TaskBoardHeaderProps {
  openCreator: () => void;
  createDisabled?: boolean;
  searchText: string;
  changeSearchText: (text: string) => void;
  sortBy: TaskSortKey[];
  changeSortBy: (sortKey: TaskSortKey[]) => void;
}

const sortOptions: SelectItem[] = [
  { value: "title", label: "제목 순" },
  { value: "priority", label: "우선순위" },
  { value: "createdAt", label: "생성 날짜" },
  { value: "updatedAt", label: "업데이트 날짜" },
];

export function TaskBoardHeader({
  openCreator,
  createDisabled = false,
  searchText,
  changeSearchText,
  sortBy,
  changeSortBy,
}: TaskBoardHeaderProps) {
  const selectedSortOptions = sortBy
    .map((sortKey) => sortOptions.find((option) => option.value === sortKey))
    .filter((option): option is SelectItem => Boolean(option));

  const handleSortByChange = useCallback((items: SelectItem[]) => {
    const parsedSortKeys: TaskSortKey[] = [];

    for (const item of items) {
      const parsedSortKey = TaskSortKeySchema.safeParse(item.value);

      if (!parsedSortKey.success) {
        console.error(`Invalid sort key: ${item.value}`);
        return;
      }

      parsedSortKeys.push(parsedSortKey.data);
    }

    changeSortBy(parsedSortKeys);
  }, [changeSortBy]);

  const handleRemoveSortKey = useCallback((sortKey: TaskSortKey) => {
    changeSortBy(sortBy.filter((selectedSortKey) => selectedSortKey !== sortKey));
  }, [changeSortBy, sortBy]);

  const handleSearchTextChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    changeSearchText(event.target.value);
  }, [changeSearchText]);

  const renderSortTag = (item: SelectItem, index: number) => {
    const parsedSortKey = TaskSortKeySchema.safeParse(item.value);

    if (!parsedSortKey.success) {
      return;
    }

    return (
      <button
        key={item.value}
        type="button"
        className="selected-sort-tag"
        aria-label={`${item.label} 정렬 기준 제거`}
        onClick={() => handleRemoveSortKey(parsedSortKey.data)}
      >
        <span>{index + 1}</span>
        {item.label}
      </button>
    );
  };

  return (
    <div className="board-toolbar">
      <div className="board-toolbar-controls">
        <div className='task-search-input__wrapper'>
          <label htmlFor="task-search-input" className="task-search-input__title">
            작업 검색
          </label>
          <input
            id="task-search-input"
            aria-label="작업 검색"
            type="search"
            value={searchText}
            onChange={handleSearchTextChange}
          />
        </div>

        <Select
          name="sort"
          label="정렬 기준"
          options={sortOptions}
          selected={selectedSortOptions}
          onSelect={handleSortByChange}
          isPending={false}
        />
        {selectedSortOptions.length > 0 ? (
          <div className="selected-sort-tags" aria-label="선택된 정렬 순서">
            {selectedSortOptions.map(renderSortTag)}
          </div>
        ) : null}
      </div>

      <div className="create-task-button__wrapper">
        <button
          type="button"
          className='create-task-button'
          onClick={() => openCreator()}
          disabled={createDisabled}
        >
          작업 만들기
        </button>
      </div>
    </div>
  )
}

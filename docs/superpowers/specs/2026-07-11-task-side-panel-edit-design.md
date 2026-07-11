# Task Side Panel Edit Design

## Summary

Task editing will use a single side panel edit form. Cards remain read-only board items whose responsibilities are display, drag movement, and opening the edit form through an explicit button.

The design intentionally avoids inline double-click editing, detail-view-first panel behavior, and success-path query invalidation. The goal is to keep editing separate from drag and virtualization concerns while preserving the existing normalized `TaskBoardModel` cache strategy.

## Goals

- Allow a task to be edited from the board.
- Keep only one task edit session active at a time.
- Preserve the card as a stable read-only virtualized item.
- Keep drag movement and edit saving as separate mutation flows.
- Update the normalized query cache directly from the server task returned by `updateTask`.
- Avoid refetching the full task list after a single edit save.

## Non-Goals

- No inline card editing.
- No double-click edit mode.
- No card-level `Enter` keyboard shortcut for opening the editor.
- No task detail read-only view before the edit form.
- No dirty-change confirmation for the first implementation.
- No success-path `invalidateQueries` after edit save.
- No new dependency.

## UX Decisions

### Cards Stay Read-Only

`Card.tsx` should render the task title and metadata as read-only content. It should not own draft state and should not render an editable title input.

This avoids conflicts between:

- card dragging,
- form focus,
- double-click behavior,
- virtual row height calculation,
- optimistic move state,
- edit draft state.

### Explicit Edit Button

Each card should expose a clear edit button. Keyboard users reach it with `Tab` and activate it with the native button behavior, `Enter` or `Space`.

The card itself should not get a custom `onKeyDown` handler that opens the panel on `Enter`. A real button gives the action a clearer semantic target and avoids making the whole card behave like an oversized button.

### Side Panel Opens Directly As Edit Form

The current requirement is editing, not detailed task inspection. Therefore, opening the side panel should show the form immediately.

The panel should include:

- title textarea,
- priority control,
- status control,
- Save button,
- Cancel button,
- close button,
- inline error area for save failures.

### Explicit Save Model

Only `Save` persists changes.

The following actions discard the draft and close the panel:

- `Cancel`,
- close button,
- outside click,
- `Escape`.

This gives the form a simple mental model: draft changes are local until `Save`.

Dirty confirmation is intentionally excluded from the first implementation. It can be added later if long description editing or real-user feedback shows accidental input loss is a problem.

### Drag While Editing

When the edit panel is open, dragging should be disabled at least for the edited task. Disabling all card drag while the panel is open is also acceptable and simpler.

This is both a UX and data consistency decision. It prevents a user from editing a stale form while also moving the same task through the drag mutation flow.

## State Model

The provider should own the single edit session.

```ts
type EditingTaskState =
  | { mode: "idle" }
  | {
      mode: "editing";
      taskId: string;
      draft: {
        title: string;
        priority: Priority;
        status: Status;
      };
      errorMessage?: string;
    };
```

The draft should include only user-editable values. It should not store `version`.

`version` should be read from the latest `TaskBoardModel` cache at save time. This avoids saving with a version captured when the panel first opened.

Recommended provider actions:

```ts
openEditor(task: Task): void
updateDraft(patch: Partial<EditingTaskDraft>): void
setSaveError(message: string): void
clearSaveError(): void
cancelEditor(): void
```

The existing `Editting` naming is misspelled. If this feature touches the provider API, rename it to `Editing` before the typo spreads further.

## Data Flow

### Opening The Panel

1. User activates the card edit button.
2. Provider enters `editing` mode with the selected task id and an initial draft copied from the task.
3. `TaskEditPanel` renders the form from provider state.

### Canceling Or Closing

1. User clicks `Cancel`, close, outside the panel, or presses `Escape`.
2. Provider returns to `idle`.
3. No PATCH request is sent.
4. The board cache remains unchanged.

### Saving

1. User clicks `Save`.
2. `Board.tsx` or a small edit-save hook reads the latest task from `TaskBoardModel` cache by `taskId`.
3. If the task is missing, the panel stays open and shows an error.
4. Call `updateTask(taskId, { title, priority, status, version })`.
5. On success, update the query cache with `applyServerTask(old, updatedTask)`.
6. Close the panel.

Success handler:

```ts
queryClient.setQueryData<TaskBoardModel>(
  defaultTaskQueryOptions.queryKey,
  (old) => (old ? applyServerTask(old, updatedTask) : old),
);
```

Do not call `invalidateQueries` on the success path. The server already returns the authoritative updated task, and the normalized board model can update a single task without refetching every task.

## Mutation Policy

### Keep Move And Edit Mutations Separate

The current drag mutation is a move-specific mutation, even though it calls `updateTask`.

It is optimized for:

- status-only movement,
- optimistic move,
- temporary optimistic `updatedAt`,
- task-specific client sequence,
- stale response suppression,
- rollback of previous task position.

The edit save mutation has different behavior:

- patch can include title, priority, and status,
- optimistic update is not required,
- form can be disabled while saving,
- draft should remain available after failure,
- conflict handling should preserve user input.

Therefore, do not force both flows into one generic mutation abstraction yet. Share small helpers such as `applyServerTask` and conflict payload parsing, but keep the mutation objects separate.

### Edit Save Does Not Optimistically Update

Edit save should wait for the server response before changing `TaskBoardModel`.

This is acceptable because the form is an explicit save workflow, not a direct manipulation gesture like dragging. It also avoids showing a saved card state that might immediately fail with validation or conflict errors.

### Conflict Handling

For 409 conflict responses:

1. If `ApiError.payload.current` contains a valid task, apply it to the cache with `applyServerTask`.
2. Keep the panel open.
3. Preserve the user's draft.
4. Show a conflict error message.

The first implementation should not auto-retry the user's draft against the new server version. That policy can be added later if needed.

## Virtualization Impact

Side panel editing keeps form height outside the virtualized card row.

This means `Column.tsx` can continue estimating card height from the read-only task title using Pretext. The virtualizer does not need to account for a growing textarea inside the card.

When save succeeds, the returned task updates the cache. If the title changed, subsequent card height estimation uses the updated title.

The existing fixed `300` width used by `estimateCardHeight` remains a separate virtualization improvement area. This edit design should not make that problem worse because editing no longer changes card DOM height before save.

## Testing Criteria

- Card renders title and metadata as read-only content.
- Card exposes an accessible edit button.
- Activating the edit button opens the side panel form.
- The form initializes from the selected task.
- Editing title, priority, and status changes only the provider draft before save.
- `Cancel`, close button, outside click, and `Escape` close the panel without sending PATCH.
- `Save` sends PATCH with the latest cached task version.
- Successful save applies the returned task with `applyServerTask` and closes the panel.
- Successful status edit moves the card to the returned task's status column.
- Failed save keeps the panel open and preserves the draft.
- 409 conflict applies `payload.current` to the cache but preserves the draft and shows an error.
- Dragging is disabled while the edit panel is open, at least for the edited task.
- Edit save success does not call `invalidateQueries`.

## Open Implementation Notes

- Prefer a native `select` for priority and status unless the existing `ComboBox.tsx` is upgraded to a complete accessible combobox.
- If a side panel outside click handler is added, ensure clicks inside the panel do not bubble into the close behavior.
- If the provider is renamed from `Editting` to `Editing`, update imports in one focused change.
- Keep edit save tests separate from drag move tests so the two mutation policies remain understandable.

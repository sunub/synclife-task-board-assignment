import { z } from "zod";

export const statusSchema = z.enum(["todo", "in-progress", "done"]);
export const prioritySchema = z.enum(["high", "medium", "low"]);

export const taskSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().optional(),
    status: statusSchema,
    priority: prioritySchema,
    tags: z.array(z.string()).optional(),
    assignee: z.string().optional(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    version: z.number().int().nonnegative(),
  })
  .strict();

export const taskListSchema = z.array(taskSchema);

export const conflictCurrentTaskPayloadSchema = z
  .strictObject({
    message: z.string().optional(),
    current: taskSchema,
  });

export type Status = z.infer<typeof statusSchema>;
export type Priority = z.infer<typeof prioritySchema>;

export type Task = z.infer<typeof taskSchema>;

export type TaskColumn = {
  status: Status;
  title: string;
};

export type MoveTaskVariables = {
  id: string;
  status: Status;
  version: number;
};

export type MoveTaskContext = {
  taskId: string;
  sequence: number;
  previousTask: Task;
};

export function getConflictCurrentTaskFromPayload(value: unknown): Task | null {
  const result = conflictCurrentTaskPayloadSchema.safeParse(value);

  return result.success ? (result.data.current satisfies Task) : null;
}

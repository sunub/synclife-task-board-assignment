import { z } from "zod"

export const statusSchema = z.enum(["todo", "in-progress", "done"])
export const prioritySchema = z.enum(["high", "medium", "low"])

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
    .strict()

export const taskListSchema = z.array(taskSchema)

export const conflictCurrentTaskPayloadSchema = z.strictObject({
    message: z.string().optional(),
    current: taskSchema,
})

export type Status = z.infer<typeof statusSchema>
export type Priority = z.infer<typeof prioritySchema>

export type Task = z.infer<typeof taskSchema>

export type TaskColumn = {
    status: Status
    title: string
}

export type MoveTaskVariables = {
    id: string
    status: Status
    version: number
    rebased?: boolean
}

export type MoveTaskContext = {
    taskId: string
    sequence: number
    previousTask: Task
}

export function getConflictCurrentTaskFromPayload(value: unknown): Task | null {
    const result = conflictCurrentTaskPayloadSchema.safeParse(value)

    return result.success ? (result.data.current satisfies Task) : null
}

export const TaskBoardModelSchema = z.object({
    byId: z.record(z.string(), taskSchema),
    idsByStatus: z.object({
        todo: z.array(z.string()),
        "in-progress": z.array(z.string()),
        done: z.array(z.string()),
    }),
})

export type TaskBoardModel = z.infer<typeof TaskBoardModelSchema>

export function isTaskBoardModel(value: unknown): value is TaskBoardModel {
    return TaskBoardModelSchema.safeParse(value).success
}

export const TaskSortKeySchema = z.enum([
    "title",
    "priority",
    "createdAt",
    "updatedAt",
])
export const TaskSortDirectionSchema = z.enum(["asc", "desc"])

export const TaskSortOptionsSchema = z.object({
    sortBy: TaskSortKeySchema,
    direction: TaskSortDirectionSchema.optional(),
})

export const TaskSortCriteriaSchema = z.union([
    TaskSortOptionsSchema,
    z.array(TaskSortOptionsSchema),
])

export const TaskBoardFiltersSchema = z.object({
    searchText: z.string(),
    sortOptions: TaskSortCriteriaSchema.optional(),
})

export const TaskEditablePatchSchema = z
    .object({
        title: z.string().optional(),
        priority: prioritySchema.optional(),
        status: statusSchema.optional(),
        description: z.string().optional(),
    })
    .strict()

export type TaskSortKey = z.infer<typeof TaskSortKeySchema>
export type TaskSortDirection = z.infer<typeof TaskSortDirectionSchema>

export type TaskSortOptions = z.infer<typeof TaskSortOptionsSchema>
export type TaskSortCriteria = z.infer<typeof TaskSortCriteriaSchema>

export type TaskBoardFilters = z.infer<typeof TaskBoardFiltersSchema>

export type TaskEditablePatch = z.infer<typeof TaskEditablePatchSchema>

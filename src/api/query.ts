import { queryOptions } from "@tanstack/react-query"
import { normalizeTasks } from "../lib/tasks"
import { getTasks } from "./client"

export const defaultTaskQueryOptions = queryOptions({
    queryKey: ["tasks"],
    queryFn: () => getTasks().then(normalizeTasks),
})

import type { Task } from "../types/task";
import {
  formatTaskCreatedDate,
  getBadgeClassName,
  getCardClassName,
  getPriorityLabel,
} from "./utils";

export function Card({ task }: { task: Task }) {
  return (
    <article
      className={getCardClassName(task.priority)}
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", task.id)}
    >
      {/* <div className="card-title"> */}
      {/*   <label className="sr-only" htmlFor={`card-${task.id}`}> */}
      {/*     {task.title} */}
      {/*   </label> */}
      {/*   <input type="tel" id={`card-${task.id}`} value={task.id} readOnly /> */}
      {/* </div> */}
      <div className="card-title">{task.title}</div>

      <div className="card-meta">
        <span className={getBadgeClassName(task.priority)}>
          {getPriorityLabel(task.priority)}
        </span>
        <span className="date">{formatTaskCreatedDate(task.createdAt)}</span>
      </div>
    </article>
  );
}

import { layout, prepare, type PreparedText } from "@chenglou/pretext";
import {
  CARD_BORDER_HORIZONTAL_WIDTH,
  CARD_BORDER_VERTICAL_WIDTH,
  CARD_META_HEIGHT,
  CARD_PADDING_HORIZONTAL,
  CARD_TITLE_FONT,
  CARD_TITLE_LETTER_SPACING,
  CARD_TITLE_LINE_HEIGHT,
  CARD_TITLE_META_GAP,
  CARD_VERTICAL_PADDING,
} from "../constants/styles";
import type { Task } from "../types/task";

const preparedTitleCache = new Map<string, PreparedText>();
const titleLayoutHeightCache = new Map<string, number>();

const PRIORITY_LABEL: Record<Task["priority"], string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export function getCardClassName(priority: Task["priority"]): string {
  return `card priority-${priority}`;
}

export function getBadgeClassName(priority: Task["priority"]): string {
  return `badge badge-${priority}`;
}

export function getPriorityLabel(priority: Task["priority"]): string {
  return PRIORITY_LABEL[priority];
}

export function formatTaskCreatedDate(createdAt: string): string {
  return new Date(createdAt).toLocaleDateString();
}

function getPreparedCardTitle(task: Task): PreparedText {
  const key = `${task.id}:${task.title}:${CARD_TITLE_FONT}:${CARD_TITLE_LETTER_SPACING}`;
  const cached = preparedTitleCache.get(key);

  if (cached) {
    return cached;
  }

  const prepared = prepare(task.title, CARD_TITLE_FONT, {
    letterSpacing: CARD_TITLE_LETTER_SPACING,
    whiteSpace: "pre-wrap",
  });

  preparedTitleCache.set(key, prepared);
  return prepared;
}

export function estimateCardHeight(task: Task, cardWidth: number): number {
  const titleTextWidth =
    cardWidth - CARD_PADDING_HORIZONTAL * 2 - CARD_BORDER_HORIZONTAL_WIDTH;

  const preparedTitle = getPreparedCardTitle(task);
  const layoutKey = `${task.id}:${task.title}:${CARD_TITLE_FONT}:${CARD_TITLE_LETTER_SPACING}:${titleTextWidth}:${CARD_TITLE_LINE_HEIGHT}`;
  let titleHeight = titleLayoutHeightCache.get(layoutKey);

  if (titleHeight === undefined) {
    titleHeight = layout(
      preparedTitle,
      titleTextWidth,
      CARD_TITLE_LINE_HEIGHT,
    ).height;
    titleLayoutHeightCache.set(layoutKey, titleHeight);
  }

  return (
    CARD_VERTICAL_PADDING +
    CARD_BORDER_VERTICAL_WIDTH +
    titleHeight +
    CARD_TITLE_META_GAP +
    CARD_META_HEIGHT
  );
}

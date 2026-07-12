'use client';

import {
    type KeyboardEvent as ReactKeyboardEvent,
    useCallback,
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
} from 'react';

import styles from './Select.module.css';

export type SelectItem = {
    value: string;
    label: string;
};

export type SelectProps = {
    name: string;
    selected: SelectItem[];
    label: string;
    options: SelectItem[];
    hideSpinner?: boolean;
    isPending?: boolean;
    variant?: 'primary' | 'secondary';
    onSelect?: (items: SelectItem[]) => void;
};

type InitialFocus = 'first' | 'last';

function classNames(
    ...classes: Array<string | false | null | undefined>
): string {
    return classes.filter(Boolean).join(' ');
}

export default function Select({
    name,
    options,
    label,
    selected,
    hideSpinner = false,
    isPending = false,
    variant = 'secondary',
    onSelect,
}: SelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);

    const rootRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const optionRefs = useRef<Array<HTMLLIElement | null>>([]);
    const focusOnOpenRef = useRef(false);

    const generatedId = useId();
    const triggerId = `${generatedId}-trigger`;
    const labelId = `${generatedId}-label`;
    const valueId = `${generatedId}-value`;
    const listboxId = `${generatedId}-listbox`;

    const selectedValueSet = useMemo(
        () => new Set(selected.map(item => item.value)),
        [selected],
    );

    const hasActiveFilter = selected.length > 0;
    const resolvedVariant = hasActiveFilter ? 'primary' : variant;

    const displayText =
        selected.length === 0
            ? `${label} 선택`
            : selected.length === 1
                ? selected[0].label
                : `${selected.length}개 선택됨`;

    const closeListbox = useCallback((restoreFocus = false) => {
        setIsOpen(false);
        setActiveIndex(-1);

        if (restoreFocus) {
            requestAnimationFrame(() => {
                triggerRef.current?.focus();
            });
        }
    }, []);

    const moveFocus = useCallback(
        (nextIndex: number) => {
            if (nextIndex < 0 || nextIndex >= options.length) {
                return;
            }

            setActiveIndex(nextIndex);
            optionRefs.current[nextIndex]?.focus();
        },
        [options.length],
    );

    const openListbox = useCallback(
        (initialFocus: InitialFocus = 'first') => {
            if (options.length === 0) {
                return;
            }

            const firstSelectedIndex = options.findIndex(option =>
                selectedValueSet.has(option.value),
            );

            const nextIndex =
                firstSelectedIndex >= 0
                    ? firstSelectedIndex
                    : initialFocus === 'last'
                        ? options.length - 1
                        : 0;

            focusOnOpenRef.current = true;
            setActiveIndex(nextIndex);
            setIsOpen(true);
        },
        [options, selectedValueSet],
    );

    const toggleOption = useCallback(
        (option: SelectItem) => {
            const isSelected = selectedValueSet.has(option.value);

            const nextSelected = isSelected
                ? selected.filter(item => item.value !== option.value)
                : [...selected, option];

            onSelect?.(nextSelected);
        },
        [onSelect, selected, selectedValueSet],
    );

    const handleTriggerKeyDown = (
        event: ReactKeyboardEvent<HTMLButtonElement>,
    ) => {
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();

                if (isOpen) {
                    moveFocus(Math.min(activeIndex + 1, options.length - 1));
                } else {
                    openListbox('first');
                }
                break;

            case 'ArrowUp':
                event.preventDefault();

                if (isOpen) {
                    moveFocus(Math.max(activeIndex - 1, 0));
                } else {
                    openListbox('last');
                }
                break;

            case 'Escape':
                if (isOpen) {
                    event.preventDefault();
                    closeListbox(true);
                }
                break;
        }
    };

    const handleOptionKeyDown = (
        event: ReactKeyboardEvent<HTMLLIElement>,
        option: SelectItem,
        index: number,
    ) => {
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                moveFocus(Math.min(index + 1, options.length - 1));
                break;

            case 'ArrowUp':
                event.preventDefault();
                moveFocus(Math.max(index - 1, 0));
                break;

            case 'Home':
                event.preventDefault();
                moveFocus(0);
                break;

            case 'End':
                event.preventDefault();
                moveFocus(options.length - 1);
                break;

            case ' ':
            case 'Enter':
                event.preventDefault();
                toggleOption(option);
                break;

            case 'Escape':
                event.preventDefault();
                closeListbox(true);
                break;

            case 'Tab':
                closeListbox(false);
                break;
        }
    };

    useEffect(() => {
        if (!isOpen || !focusOnOpenRef.current || activeIndex < 0) {
            return;
        }

        focusOnOpenRef.current = false;
        optionRefs.current[activeIndex]?.focus();
    }, [activeIndex, isOpen]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const handleOutsidePointerDown = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) {
                closeListbox(false);
            }
        };

        document.addEventListener('pointerdown', handleOutsidePointerDown);

        return () => {
            document.removeEventListener('pointerdown', handleOutsidePointerDown);
        };
    }, [closeListbox, isOpen]);

    return (
        <div ref={rootRef} className={styles.root}>
            {selected.map(item => (
                <input
                    key={item.value}
                    type="hidden"
                    name={name}
                    value={item.value}
                />
            ))}

            <span
                id={labelId}
                className={styles.label}
            >
                {label}
            </span>

            <div className={styles.controlRow}>
                <button
                    ref={triggerRef}
                    id={triggerId}
                    type="button"
                    aria-labelledby={`${labelId} ${valueId}`}
                    aria-haspopup="listbox"
                    aria-expanded={isOpen}
                    aria-controls={listboxId}
                    aria-busy={isPending || undefined}
                    disabled={options.length === 0}
                    className={classNames(
                        styles.trigger,
                        resolvedVariant === 'primary'
                            ? styles.primary
                            : styles.secondary,
                        isPending && styles.pending,
                    )}
                    onClick={() => {
                        if (isOpen) {
                            closeListbox(false);
                        } else {
                            openListbox('first');
                        }
                    }}
                    onKeyDown={handleTriggerKeyDown}
                >
                    <span id={valueId} className={styles.value}>
                        {displayText}
                    </span>

                    <svg
                        aria-hidden="true"
                        viewBox="0 0 20 20"
                        className={classNames(
                            styles.arrow,
                            isOpen && styles.arrowOpen,
                        )}
                    >
                        <path
                            d="m5 7.5 5 5 5-5"
                            fill="none"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.8"
                        />
                    </svg>
                </button>

                {isPending && !hideSpinner && (
                    <span
                        role="status"
                        aria-label="Loading"
                        className={styles.spinner}
                    />
                )}
            </div>

            {isOpen && (
                <ul
                    id={listboxId}
                    role="listbox"
                    aria-labelledby={labelId}
                    aria-multiselectable="true"
                    className={styles.listbox}
                >
                    {options.map((option, index) => {
                        const isSelected = selectedValueSet.has(option.value);

                        return (
                            <li
                                ref={element => {
                                    optionRefs.current[index] = element;
                                }}
                                key={option.value}
                                role="option"
                                aria-selected={isSelected}
                                tabIndex={activeIndex === index ? 0 : -1}
                                className={styles.option}
                                onFocus={() => {
                                    setActiveIndex(index);
                                }}
                                onMouseEnter={() => {
                                    setActiveIndex(index);
                                }}
                                onClick={() => {
                                    toggleOption(option);
                                }}
                                onKeyDown={event => {
                                    handleOptionKeyDown(event, option, index);
                                }}
                            >
                                <span className={styles.optionLabel}>
                                    {option.label}
                                </span>

                                <svg
                                    aria-hidden="true"
                                    viewBox="0 0 20 20"
                                    className={classNames(
                                        styles.checkIcon,
                                        isSelected && styles.checkIconVisible,
                                    )}
                                >
                                    <path
                                        d="m4 10.5 3.5 3.5L16 5.5"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="2"
                                    />
                                </svg>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

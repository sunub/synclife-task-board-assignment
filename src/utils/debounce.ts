type Options = {
    leading?: boolean
    trailing?: boolean
    maxWait?: number
}

function isObject(value: unknown): value is Record<string, unknown> {
    const type = typeof value
    return value !== null && (type === "object" || type === "function")
}

// biome-ignore lint/suspicious/noExplicitAny: 함수의 매개변수 타입을 제네릭으로 유연하게 받기 위한 표준 패턴입니다.
interface DebouncedFunction<T extends (...args: any[]) => unknown> {
    (
        this: ThisParameterType<T>,
        ...args: Parameters<T>
    ): ReturnType<T> | undefined
    cancel: () => void
    flush: () => ReturnType<T> | undefined
}

// 호출 컨텍스트를 저장하기 위한 타입 정의 (lastArgs와 lastThis를 묶음)
type CallContext<Args extends unknown[], This> = {
    args: Args
    thisArg: This
}

// biome-ignore lint/suspicious/noExplicitAny: Args가 배열임을 명시하기 위해 any[]가 필요합니다 (unknown[]은 호환성 문제가 발생할 수 있음).
function debounce<Args extends any[], Return>(
    func: (...args: Args) => Return,
    wait = 0,
    options: Options = {},
): DebouncedFunction<(...args: Args) => Return> {
    const maxWait = Math.max(options.maxWait || 0, wait)

    // ! 사용을 피하기 위해 args와 this를 하나의 객체로 관리합니다.
    // 이렇게 하면 lastCall이 존재할 때 args와 thisArg가 반드시 존재함을 보장할 수 있습니다.
    let lastCall:
        | CallContext<Args, ThisParameterType<(...args: Args) => Return>>
        | undefined

    let result: Return | undefined
    let timerId: ReturnType<typeof setTimeout> | undefined
    let lastCallTime: number | undefined
    let lastInvokeTime = 0
    let leading = false
    let maxing = false
    let trailing = true

    if (typeof func !== "function") {
        throw new TypeError("함수 타입이 아닙니다.")
    }

    if (isObject(options)) {
        leading = !!options.leading
        maxing = "maxWait" in options
        trailing = options.trailing ?? true
    }

    function invokeFunction(time: number): Return {
        // lastCall이 없으면 이전 결과를 반환 (Type Guard 역할)
        if (!lastCall) {
            return result as Return
        }

        const { args, thisArg } = lastCall
        lastCall = undefined
        lastInvokeTime = time

        // biome-ignore lint/suspicious/noExplicitAny: func.apply의 특성상 타입 단언이 필요할 수 있습니다.
        result = func.apply(thisArg, args) as any
        return result as Return
    }

    function remainingWait(time: number): number {
        const timeSinceLastCall =
            lastCallTime === undefined ? 0 : time - lastCallTime
        const timeSinceLastInvoke = time - lastInvokeTime
        const timeWaiting = wait - timeSinceLastCall

        return maxing
            ? Math.min(timeWaiting, maxWait - timeSinceLastInvoke)
            : timeWaiting
    }

    function shouldInvoke(time: number): boolean {
        const timeSinceLastCall =
            lastCallTime === undefined ? 0 : time - lastCallTime
        const timeSinceLastInvoke = time - lastInvokeTime

        return (
            lastCallTime === undefined ||
            timeSinceLastCall >= wait ||
            timeSinceLastCall < 0 ||
            (maxing && timeSinceLastInvoke >= maxWait)
        )
    }

    function timerExpired() {
        const time = Date.now()
        if (shouldInvoke(time)) {
            return trailingEdge(time)
        }
        timerId = setTimeout(timerExpired, remainingWait(time))
    }

    function leadingEdge(time: number): Return | undefined {
        lastInvokeTime = time
        timerId = setTimeout(timerExpired, wait)
        return leading ? invokeFunction(time) : result
    }

    function trailingEdge(time: number): Return | undefined {
        timerId = undefined

        // lastCall이 존재하는지 확인하여 안전하게 호출
        if (trailing && lastCall) {
            return invokeFunction(time)
        }
        lastCall = undefined
        return result
    }

    function cancel() {
        if (timerId !== undefined) {
            clearTimeout(timerId)
        }
        lastInvokeTime = 0
        lastCall = undefined // 객체 초기화
        lastCallTime = timerId = undefined
    }

    function flush(): Return | undefined {
        return timerId === undefined ? result : trailingEdge(Date.now())
    }

    function debounced(
        this: ThisParameterType<(...args: Args) => Return>,
        ...args: Args
    ): Return | undefined {
        const time = Date.now()
        const isInvoking = shouldInvoke(time)

        // 개별 변수 대신 객체로 묶어서 저장
        lastCall = {
            args,
            thisArg: this,
        }
        lastCallTime = time

        if (isInvoking) {
            if (timerId === undefined) {
                return leadingEdge(lastCallTime)
            }
            if (maxing) {
                clearTimeout(timerId)
                timerId = setTimeout(timerExpired, wait)
                return invokeFunction(lastCallTime)
            }
        }
        if (timerId === undefined) {
            timerId = setTimeout(timerExpired, wait)
        }
        return result
    }

    debounced.cancel = cancel
    debounced.flush = flush

    return debounced
}

export { debounce }

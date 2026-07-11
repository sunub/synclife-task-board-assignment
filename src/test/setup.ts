import "@testing-library/jest-dom"

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: () => ({
        font: "",
        measureText: (text: string) => ({
            actualBoundingBoxAscent: 10,
            actualBoundingBoxDescent: 4,
            width: text.length * 7,
        }),
    }),
})

if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = () => undefined
}

const originalGetBoundingClientRect =
    HTMLElement.prototype.getBoundingClientRect

HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    if (this instanceof HTMLElement && this.classList.contains("column-body")) {
        return {
            bottom: 600,
            height: 600,
            left: 0,
            right: 300,
            top: 0,
            width: 300,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        }
    }

    return originalGetBoundingClientRect.call(this)
}

Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get() {
        if (
            this instanceof HTMLElement &&
            this.classList.contains("column-body")
        ) {
            return 600
        }

        return 0
    },
})

Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get() {
        if (
            this instanceof HTMLElement &&
            this.classList.contains("column-body")
        ) {
            return 300
        }

        return 0
    },
})

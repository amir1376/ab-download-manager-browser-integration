let holdingKey = ""
type Listener = (key: string, pressed: boolean) => void

export function clear() {
    holdingKey = ""
}

export function getHoldingKey() {
    return holdingKey
}

export function boot(listener?: Listener) {
    const keydown = (e: KeyboardEvent) => {
        holdingKey = e.key
        listener?.(holdingKey, true)
    }

    const keyup = (e: KeyboardEvent) => {
        listener?.(e.key, false)
        clear()
    }

    const blur = () => {
        if (holdingKey) listener?.(holdingKey, false)
        clear()
    }
    document.addEventListener("keydown", keydown)
    document.addEventListener("keyup", keyup)
    window.addEventListener('blur', blur)
    return () => {
        document.removeEventListener("keydown", keydown)
        document.removeEventListener("keyup", keyup)
        window.removeEventListener('blur', blur)
        clear()
    }
}

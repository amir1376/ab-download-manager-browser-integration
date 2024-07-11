let x: number | null = null;
let y: number | null = null;
export type PositionInPage = {
    x: number
    y: number
}

export function getMousePositionInPage(): PositionInPage | null {
    if (x === null || y === null) return null
    else return {x, y}
}

function onMouseUpdate(e: MouseEvent) {
    x = e.pageX;
    y = e.pageY;
}

function clearMouse(e: MouseEvent) {
    x = null;
    y = null;
}

export function boot() {
    document.addEventListener('mousemove', onMouseUpdate, false);
    document.addEventListener('mouseenter', onMouseUpdate, false);
    document.addEventListener('mouseleave', clearMouse, false);
}

export function dispose() {
    document.removeEventListener('mousemove', onMouseUpdate, false);
    document.removeEventListener('mouseenter', onMouseUpdate, false);
    document.removeEventListener('mouseleave', clearMouse, false);
}
export function inRange(n:number,min:number,max:number){
    if (n>=min && n<=max){
        return true
    }
    return false
}

export function constraintIn(
    value: number,
    min: number,
    max: number
): number {
    if (value < min) {
        return min
    } else if (value > max) {
        return max
    } else {
        return value
    }
}

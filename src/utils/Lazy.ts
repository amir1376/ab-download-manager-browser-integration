import {Nullable} from "~/utils/Types";

const NOT_SET: Symbol = Symbol("NOT_SET");

interface Lazy<T> {
    get(): T

    getOrNull(): Nullable<T>
    isInitialized(): boolean
}


export function lazy<T>(calculation: () => T): Lazy<T> {
    let value: T | typeof NOT_SET = NOT_SET

    function isInitialized(): boolean {
        return value !== NOT_SET
    }

    function get(): T {
        if (value === NOT_SET) {
            value = calculation()
        }
        return value as T
    }

    function getOrNull(): Nullable<T> {
        if (value === NOT_SET) {
            return null
        }
        return value as T
    }

    return {get, getOrNull, isInitialized}
}

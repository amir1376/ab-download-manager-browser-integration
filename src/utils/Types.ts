/**
 * create setters for each property
 */
export type WithSetters<T> = T & {
    [K in keyof T as `set${Capitalize<string & K>}`]: (value: T[K]) => void
}

export type Nullable<T> = T | null

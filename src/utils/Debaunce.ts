
export function debounce(
    delay:number,
): ((fun: () => void) => void) & { cancel: () => void } {
    let lastHandle:any|null=null
    const debounced = (fun:()=>void)=>{
        if (lastHandle){
            clearTimeout(lastHandle)
        }
        lastHandle=setTimeout(fun,delay)
    }
    debounced.cancel = () => {
        if (lastHandle) {
            clearTimeout(lastHandle)
            lastHandle = null
        }
    }
    return debounced
}
export function debounceFn<T extends any[]>(
    fn:(...args:T)=>void,
    delay:number,
): (...args:T)=>void {
    let lastHandle:any|null=null
    return (...args:T)=>{
        if(lastHandle){
            clearTimeout(lastHandle)
        }
        lastHandle=setTimeout(()=>{
            fn(...args)
        },delay)
    }
}

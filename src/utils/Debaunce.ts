
export function debounce(
    delay:number,
): (fun: () => void) => void {
    let lastHandle:any|null=null
    return (fun:()=>void)=>{
        if (lastHandle){
            clearTimeout(lastHandle)
        }
        lastHandle=setTimeout(fun,delay)
    }
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

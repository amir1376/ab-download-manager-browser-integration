export function run<R>(block:()=>R):R{
    return block()
}
export function letIt<T,R>(
    item:T,
    block:(item: T)=>R
):R{
    return block(item)
}
export function also<T>(
    item:T,
    block:(item: T)=>void
):T{
    block(item)
    return item
}

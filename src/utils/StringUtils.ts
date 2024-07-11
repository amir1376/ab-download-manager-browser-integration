export function isNullOrEmpty(string:string|null|undefined):boolean{
    if (isNullOrUndefined(string)){
        return true
    }else {
        return isEmpty(string)
    }
}
export function isNullOrBlank(string:string|null|undefined):boolean{
    if (isNullOrUndefined(string)){
        return true
    }else {
        return isBlank(string)
    }
}
export function isNullOrUndefined(string:string|null|undefined):string is undefined|null{
    return string === undefined || string === null;
}
export function isEmpty(string:string){
    return string.length===0
}
export function isBlank(string:string){
    return isEmpty(string.trim())
}

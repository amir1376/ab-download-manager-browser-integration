export interface PermissionRuntimeStateV2 {
    fullAuthority: boolean
    privateAllowed: boolean
    grantedOrigins: string[]
}

let current: PermissionRuntimeStateV2 = {
    fullAuthority: false,
    privateAllowed: false,
    grantedOrigins: [],
}

export function setPermissionRuntimeStateV2(value: PermissionRuntimeStateV2): void {
    current = {...value, grantedOrigins: [...value.grantedOrigins]}
}

export function getPermissionRuntimeStateV2(): Readonly<PermissionRuntimeStateV2> {
    return current
}

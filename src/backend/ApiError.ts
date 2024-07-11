export class ApiError extends Error {
    constructor(public response:Response) {
        super();
    }
}
export class NetworkError extends Error{}
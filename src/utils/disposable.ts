
export type DisposableFunction = () => any;
export type DisposablePossibleType = Disposable | DisposableFunction
export class Disposable{
    private disposables: Array<DisposablePossibleType> = [];
    add(disposable: DisposablePossibleType){
        this.disposables.push(disposable)
    }

    private _dispose(disposable: DisposablePossibleType){
        if (disposable instanceof Disposable){
            //nested
            disposable.dispose()
        }else {
            //fun
            disposable()
        }
    }

    dispose():void{
        for (const disposable of this.disposables) {
            try {
                this._dispose(disposable)
            }catch (e){
                console.error("can't dispose a disposable",e)
            }
        }
        this.disposables=[]
    }
}

export type AsyncDisposableFunction = () => Promise<void>;
export type AsyncDisposablePossibleType =
    | DisposablePossibleType
    | AsyncDisposable
    | AsyncDisposableFunction

export class AsyncDisposable{
    private disposables: Array<AsyncDisposablePossibleType> = [];
    add(disposable:AsyncDisposablePossibleType){
        this.disposables.push(disposable)
    }

    private async _dispose(disposable:AsyncDisposablePossibleType){
        if (disposable instanceof AsyncDisposable){
            await disposable.dispose()
        } else if ( disposable instanceof Disposable){
            disposable.dispose()
        }else {
            await disposable()
        }
    }

    async dispose(){
        for (const disposable of this.disposables) {
            try {
                await this._dispose(disposable)
            }catch (e){
                console.error("can't dispose a disposable: ",e)
            }
        }
        this.disposables=[]
    }
}
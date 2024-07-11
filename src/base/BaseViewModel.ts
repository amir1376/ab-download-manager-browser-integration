import {useEffect, useState} from "react";
import {EventHandler, EventListener} from "~/base/EventListener";


export abstract class BaseViewModel {
    protected setUp() {
    }

    protected cleanUp() {
    }

    isUp = false

    _start() {
        if (this.isUp) {
            this._stop()
        }
        this.setUp()
        this.isUp = true
    }

    _stop() {
        if (this.isUp) {
            this.cleanUp()
        }
        this.isUp = false
    }
}
export abstract class EventAwareViewModel<EventType> extends BaseViewModel{
    private eventHandler = new EventListener<EventType>()

    addEventListener(eventListener:EventHandler<EventType>){
        this.eventHandler.addEventListener(eventListener)
    }
    removeEventListener(eventListener:EventHandler<EventType>){
        this.eventHandler.removeEventListener(eventListener)
    }
    onEvent(event:EventType){
        this.eventHandler.onEvent(event)
    }
}
export function useViewModel<T extends BaseViewModel>(getViewModel: () => T) {
    const [vm] = useState(getViewModel)
    useEffect(() => {
        vm._start()
        return () => vm._stop()
    }, [])
    return vm
}
export interface EventHandler<Event>{
    (event:Event):void
}

export class EventListener<Event>{
    private listeners:Set<EventHandler<Event>> =new Set<EventHandler<Event>>()
    addEventListener(eventHandler:EventHandler<Event>){
        this.listeners.add(eventHandler)
    }
    removeEventListener(eventHandler:EventHandler<Event>){
        this.listeners.delete(eventHandler)
    }

    onEvent(event:Event){
        for (let eventListener of this.listeners){
            eventListener(event)
        }
    }
}

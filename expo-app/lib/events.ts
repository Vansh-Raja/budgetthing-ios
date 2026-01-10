type Listener = () => void;

class SimpleEventEmitter {
    private listeners: Record<string, Listener[]> = {};

    on(event: string, callback: Listener) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
        return () => {
            this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
        };
    }

    emit(event: string) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb());
        }
    }
}

export const GlobalEvents = new SimpleEventEmitter();

type Listener = () => void;

export const Events = {
    accountsChanged: 'accounts_changed',
    categoriesChanged: 'categories_changed',
    transactionsChanged: 'transactions_changed',
    tripsChanged: 'trips_changed',
    tripParticipantsChanged: 'trip_participants_changed',
    tripExpensesChanged: 'trip_expenses_changed',
    tripSettlementsChanged: 'trip_settlements_changed',
    userSettingsChanged: 'user_settings_changed',
} as const;

export type GlobalEventName = (typeof Events)[keyof typeof Events];

class SimpleEventEmitter {
    private listeners: Record<string, Listener[]> = {};
    private batchDepth = 0;
    private queuedEvents = new Set<string>();

    on(event: GlobalEventName | string, callback: Listener) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
        return () => {
            this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
        };
    }

    /**
     * Begin batching events. While batching, `emit()` queues event names.
     */
    beginBatch() {
        this.batchDepth += 1;
    }

    /**
     * End batching events.
     * - If `flush` is true and this was the outermost batch, queued events are emitted.
     * - If `flush` is false, queued events are dropped.
     */
    endBatch(flush: boolean) {
        if (this.batchDepth === 0) return;

        this.batchDepth -= 1;
        if (this.batchDepth > 0) return;

        const queued = Array.from(this.queuedEvents);
        this.queuedEvents.clear();

        if (!flush) return;

        for (const event of queued) {
            this.emitNow(event);
        }
    }

    emit(event: GlobalEventName | string) {
        if (this.batchDepth > 0) {
            this.queuedEvents.add(event);
            return;
        }

        this.emitNow(event);
    }

    private emitNow(event: string) {
        const callbacks = this.listeners[event];
        if (!callbacks || callbacks.length === 0) return;

        // Copy to avoid issues if listeners mutate during emit
        [...callbacks].forEach(cb => cb());
    }
}

export const GlobalEvents = new SimpleEventEmitter();

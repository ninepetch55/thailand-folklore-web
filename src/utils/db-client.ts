export type WorkerMessage = {
    id: string;
    action: string;
    payload?: any;
};

export type WorkerResponse = {
    id: string;
    status: 'success' | 'error' | 'connected';
    data?: any;
    message?: string;
};

class DatabaseClient {
    private worker: SharedWorker | null = null;
    private port: MessagePort | null = null;
    private pendingRequests: Map<string, { resolve: (val: any) => void; reject: (err: any) => void }> = new Map();

    constructor() {
        if (typeof window !== 'undefined' && 'SharedWorker' in window) {
            this.initWorker();
        } else {
            console.warn('SharedWorker is not supported in this environment.');
        }
    }

    private initWorker() {
        try {
            // Point to the built worker file from the dist/assets or public if dev
            // In Vite dev mode, we can import it directly, but for SharedWorker, we usually need a URL.
            // Using the new URL(...) pattern is standard for Vite.
            this.worker = new SharedWorker(new URL('../workers/db-worker.ts', import.meta.url), {
                type: 'module',
                name: 'thfolklore-db-worker'
            });

            this.port = this.worker.port;
            this.port.start();

            this.port.onmessage = (event: MessageEvent<WorkerResponse>) => {
                const { id, status, data, message } = event.data;

                if (status === 'connected') {
                    console.log('[DB Client] Worker Connected:', message);
                    return;
                }

                const request = this.pendingRequests.get(id);
                if (request) {
                    if (status === 'success') {
                        request.resolve(data);
                    } else {
                        request.reject(new Error(message || 'Unknown worker error'));
                    }
                    this.pendingRequests.delete(id);
                }
            };
        } catch (e) {
            console.error('[DB Client] SharedWorker Initialization Failed:', e);
        }
    }

    public async query(action: string, payload: any = {}): Promise<any> {
        if (!this.port) {
            throw new Error('Database Worker not operational');
        }

        const id = crypto.randomUUID();
        const message: WorkerMessage = { id, action, payload };

        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });
            this.port!.postMessage(message);

            // Timeout safety
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error(`Query timeout for action: ${action}`));
                }
            }, 10000);
        });
    }
}

// Singleton instance
export const dbClient = new DatabaseClient();

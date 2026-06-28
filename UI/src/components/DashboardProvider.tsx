import { useEffect, useRef, useState, createContext, useContext, type ReactNode } from 'react';
import { HubConnectionBuilder, type HubConnection } from '@microsoft/signalr';
import currentVersion from '../version';
import { InfiniteRetryPolicy, type BaseDto } from './util';

// --- Types ---

interface BlockState {
    data: any;
    error: string | null;
}

type BlockListener = () => void;

// --- External Store ---

/**
 * Manages block data outside of React state to avoid re-rendering all blocks
 * when a single block updates. Each block subscribes its own listener and
 * only that block's component re-renders on update.
 */
class DashboardStore {
    private blocks: Record<string, BlockState> = {};
    private listeners: Map<string, Set<BlockListener>> = new Map();
    private connectionError: string | null = null;
    private connectionErrorListeners: Set<BlockListener> = new Set();

    getBlock(blockName: string): BlockState {
        return this.blocks[blockName] ?? { data: null, error: null };
    }

    setBlock(blockName: string, state: BlockState): void {
        this.blocks[blockName] = state;
        const blockListeners = this.listeners.get(blockName);
        if (blockListeners) {
            blockListeners.forEach(listener => listener());
        }
    }

    subscribeBlock(blockName: string, listener: BlockListener): () => void {
        if (!this.listeners.has(blockName)) {
            this.listeners.set(blockName, new Set());
        }
        this.listeners.get(blockName)!.add(listener);
        return () => {
            this.listeners.get(blockName)?.delete(listener);
        };
    }

    getConnectionError(): string | null {
        return this.connectionError;
    }

    setConnectionError(error: string | null): void {
        this.connectionError = error;
        this.connectionErrorListeners.forEach(listener => listener());
    }

    subscribeConnectionError(listener: BlockListener): () => void {
        this.connectionErrorListeners.add(listener);
        return () => {
            this.connectionErrorListeners.delete(listener);
        };
    }
}

// --- Context ---

const DashboardStoreContext = createContext<DashboardStore | null>(null);

// --- DashboardProvider ---

interface DashboardProviderProps {
    blocks: string[];
    children: ReactNode;
}

export function DashboardProvider({ blocks, children }: DashboardProviderProps) {
    const storeRef = useRef<DashboardStore | null>(null);
    if (storeRef.current === null) {
        storeRef.current = new DashboardStore();
    }
    const store = storeRef.current;

    const connectionRef = useRef<HubConnection | null>(null);
    const reconnectingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const url = window.location.protocol + '//' + window.location.host + '/hub/dashboard';

        const connection = new HubConnectionBuilder()
            .withUrl(url)
            .withAutomaticReconnect(new InfiniteRetryPolicy())
            .build();

        connectionRef.current = connection;

        connection.on('BlockUpdate', (blockName: string, dto: BaseDto) => {
            // Check server version mismatch
            if (currentVersion !== 'local' && dto.serverVersion && dto.serverVersion !== currentVersion) {
                window.location.reload();
                return;
            }

            // Clear any reconnecting error on successful update
            if (reconnectingTimerRef.current) {
                clearTimeout(reconnectingTimerRef.current);
                reconnectingTimerRef.current = null;
            }
            store.setConnectionError(null);

            // Update block state
            store.setBlock(blockName, {
                data: dto,
                error: dto.errorMessage || null,
            });
        });

        connection.onreconnecting(() => {
            // Delay showing connection error by 10 seconds
            reconnectingTimerRef.current = setTimeout(() => {
                store.setConnectionError('Reconnecting...');
            }, 10000);
        });

        connection.onreconnected(() => {
            if (reconnectingTimerRef.current) {
                clearTimeout(reconnectingTimerRef.current);
                reconnectingTimerRef.current = null;
            }
            store.setConnectionError(null);

            // Re-subscribe after reconnection
            connection.invoke('Subscribe', blocks).catch((err) => {
                store.setConnectionError('Failed to re-subscribe: ' + (err instanceof Error ? err.message : String(err)));
            });
        });

        connection.onclose(() => {
            store.setConnectionError('Connection lost.');
        });

        connection.start()
            .then(() => {
                return connection.invoke('Subscribe', blocks);
            })
            .catch((err) => {
                store.setConnectionError('Failed to connect: ' + (err instanceof Error ? err.message : String(err)));
            });

        return () => {
            if (reconnectingTimerRef.current) {
                clearTimeout(reconnectingTimerRef.current);
            }
            connection.stop();
        };
    }, [blocks, store]);

    return (
        <DashboardStoreContext.Provider value={store}>
            {children}
        </DashboardStoreContext.Provider>
    );
}

// --- useBlock Hook ---

export function useBlock<TDto extends BaseDto>(blockName: string): { data: TDto | null; error: string | null } {
    const store = useContext(DashboardStoreContext);
    if (!store) {
        throw new Error('useBlock must be used within a DashboardProvider');
    }

    const [, forceUpdate] = useState(0);

    useEffect(() => {
        return store.subscribeBlock(blockName, () => {
            forceUpdate(n => n + 1);
        });
    }, [store, blockName]);

    const blockState = store.getBlock(blockName);
    return {
        data: blockState.data as TDto | null,
        error: blockState.error,
    };
}

// --- ConnectionErrorOverlay ---

export function ConnectionErrorOverlay() {
    const store = useContext(DashboardStoreContext);
    if (!store) {
        throw new Error('ConnectionErrorOverlay must be used within a DashboardProvider');
    }

    const [, forceUpdate] = useState(0);

    useEffect(() => {
        return store.subscribeConnectionError(() => {
            forceUpdate(n => n + 1);
        });
    }, [store]);

    const connectionError = store.getConnectionError();

    if (!connectionError) {
        return null;
    }

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(200, 0, 0, 0.85)',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 9999,
            fontSize: '1.2rem',
        }}>
            {connectionError}
        </div>
    );
}

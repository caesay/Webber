import { useEffect, useRef, useState, createContext, useContext, type ReactNode } from 'react';
import { HubConnectionBuilder, type HubConnection } from '@microsoft/signalr';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
import currentVersion from '../version';
import { InfiniteRetryPolicy, type BaseDto } from './util';

function conciseError(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err);
    const statusMatch = raw.match(/Status code '?(\d{3})'?/i);
    if (statusMatch) {
        const codeDescriptions: Record<string, string> = {
            '400': 'Bad Request', '401': 'Unauthorized', '403': 'Forbidden',
            '404': 'Not Found', '408': 'Timeout', '429': 'Too Many Requests',
            '500': 'Server Error', '502': 'Bad Gateway', '503': 'Unavailable',
            '504': 'Gateway Timeout',
        };
        return codeDescriptions[statusMatch[1]] ?? `HTTP ${statusMatch[1]}`;
    }
    if (/failed to fetch|networkerror|net::err/i.test(raw)) return 'Network error';
    if (/timed?\s*out/i.test(raw)) return 'Timed out';
    const segments = raw.split(/:\s*/);
    const last = segments[segments.length - 1].trim();
    return last.length > 30 ? last.substring(0, 27) + '...' : last;
}

interface BlockState {
    data: any;
    error: string | null;
}

export interface ConnectionErrorState {
    isReconnecting: boolean;
    message: string | null;
}

type BlockListener = () => void;

class DashboardStore {
    private blocks: Record<string, BlockState> = {};
    private listeners: Map<string, Set<BlockListener>> = new Map();
    private connectionState: ConnectionErrorState = { isReconnecting: false, message: null };
    private connectionStateListeners: Set<BlockListener> = new Set();

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

    getConnectionState(): ConnectionErrorState {
        return this.connectionState;
    }

    setConnectionState(state: ConnectionErrorState): void {
        this.connectionState = state;
        this.connectionStateListeners.forEach(listener => listener());
    }

    subscribeConnectionState(listener: BlockListener): () => void {
        this.connectionStateListeners.add(listener);
        return () => {
            this.connectionStateListeners.delete(listener);
        };
    }
}

const DashboardStoreContext = createContext<DashboardStore | null>(null);

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

    useEffect(() => {
        const url = window.location.protocol + '//' + window.location.host + '/hub/dashboard';
        let disposed = false;
        const retryPolicy = new InfiniteRetryPolicy();
        let retryCount = 0;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;

        const connection = new HubConnectionBuilder()
            .withUrl(url)
            .build();
        connectionRef.current = connection;

        connection.on('BlockUpdate', (blockName: string, dto: BaseDto) => {
            if (currentVersion !== 'local' && dto.serverVersion && dto.serverVersion !== currentVersion) {
                window.location.reload();
                return;
            }

            store.setConnectionState({ isReconnecting: false, message: null });

            store.setBlock(blockName, {
                data: dto,
                error: dto.errorMessage || null,
            });
        });

        connection.onclose(() => {
            if (disposed) return;
            scheduleRetry('Connection lost');
        });

        function attempt() {
            if (disposed) return;
            store.setConnectionState({ isReconnecting: true, message: 'Reconnecting...' });
            connection.start()
                .then(() => {
                    retryCount = 0;
                    return connection.invoke('Subscribe', blocks);
                })
                .catch((err) => {
                    if (disposed) return;
                    scheduleRetry(conciseError(err));
                });
        }

        function scheduleRetry(errorMsg: string) {
            const delay = retryPolicy.nextRetryDelayInMilliseconds({ previousRetryCount: retryCount, elapsedMilliseconds: 0, retryReason: new Error() })!;
            retryCount++;
            store.setConnectionState({ isReconnecting: false, message: errorMsg });
            retryTimer = setTimeout(attempt, delay);
        }

        attempt();

        return () => {
            disposed = true;
            if (retryTimer) {
                clearTimeout(retryTimer);
            }
            connectionRef.current?.stop();
        };
    }, [blocks, store]);

    return (
        <DashboardStoreContext.Provider value={store}>
            {children}
        </DashboardStoreContext.Provider>
    );
}

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

export function useConnectionState(): ConnectionErrorState {
    const store = useContext(DashboardStoreContext);
    if (!store) {
        throw new Error('useConnectionState must be used within a DashboardProvider');
    }

    const [, forceUpdate] = useState(0);

    useEffect(() => {
        return store.subscribeConnectionState(() => {
            forceUpdate(n => n + 1);
        });
    }, [store]);

    return store.getConnectionState();
}

const spinKeyframes = `
@keyframes dashboard-pill-spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}
`;

export function ConnectionErrorPill() {
    const { isReconnecting, message } = useConnectionState();

    if (!message) {
        return null;
    }

    return (
        <>
            <style>{spinKeyframes}</style>
            <div style={{
                position: 'absolute',
                top: 20,
                right: 20,
                height: 40,
                backgroundColor: 'rgba(200, 0, 0, 0.85)',
                color: 'white',
                borderRadius: 20,
                padding: '0 14px',
                fontSize: 14,
                fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', 'Consolas', monospace",
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                zIndex: 9999,
            }}>
                {isReconnecting ? (
                    <>
                        <div style={{
                            width: 14,
                            height: 14,
                            border: '2px solid rgba(255, 255, 255, 0.3)',
                            borderTopColor: 'white',
                            borderRadius: '50%',
                            animation: 'dashboard-pill-spin 0.8s linear infinite',
                            flexShrink: 0,
                        }} />
                        Reconnecting...
                    </>
                ) : (
                    <>
                        <FontAwesomeIcon icon={faExclamationTriangle} />
                        {message}
                    </>
                )}
            </div>
        </>
    );
}

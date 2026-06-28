import { useState, useEffect, useRef, type ComponentType } from 'react';
import { HubConnectionBuilder, HubConnection, type IRetryPolicy, type RetryContext } from '@microsoft/signalr';
import { DateTime } from 'luxon';
import currentVersion from '../version';

// --- Interfaces ---

export interface BaseDto {
    localOffsetHours: number;
    errorMessage: string;
    serverVersion: string;
}

// --- InfiniteRetryPolicy ---

class InfiniteRetryPolicy implements IRetryPolicy {
    nextRetryDelayInMilliseconds(retryContext: RetryContext): number | null {
        if (retryContext.previousRetryCount < 3) return 2000;
        if (retryContext.previousRetryCount < 10) return 10000;
        return 30000;
    }
}

// --- ErrorOverlay ---

function ErrorOverlay({ message }: { message: string }) {
    return (
        <div style={{
            position: 'absolute',
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
            {message}
        </div>
    );
}

// --- useSubscription Hook ---

export function useSubscription<TDto extends BaseDto>(hubName: string): { data: TDto | null; errorMessage: string | null } {
    const [data, setData] = useState<TDto | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const connectionRef = useRef<HubConnection | null>(null);
    const reconnectingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const url = window.location.protocol + '//' + window.location.host + '/hub/' + hubName;

        const connection = new HubConnectionBuilder()
            .withUrl(url)
            .withAutomaticReconnect(new InfiniteRetryPolicy())
            .build();

        connectionRef.current = connection;

        connection.on('Update', (dto: TDto) => {
            // Check server version mismatch
            if (currentVersion !== 'local' && dto.serverVersion && dto.serverVersion !== currentVersion) {
                window.location.reload();
                return;
            }

            // Clear any reconnecting error
            if (reconnectingTimerRef.current) {
                clearTimeout(reconnectingTimerRef.current);
                reconnectingTimerRef.current = null;
            }
            setErrorMessage(null);

            // Set error from DTO or set data
            if (dto.errorMessage) {
                setErrorMessage(dto.errorMessage);
            } else {
                setErrorMessage(null);
            }
            setData(dto);
        });

        connection.onreconnecting(() => {
            // Delay showing error by 10 seconds
            reconnectingTimerRef.current = setTimeout(() => {
                setErrorMessage('Reconnecting...');
            }, 10000);
        });

        connection.onreconnected(() => {
            if (reconnectingTimerRef.current) {
                clearTimeout(reconnectingTimerRef.current);
                reconnectingTimerRef.current = null;
            }
            setErrorMessage(null);
        });

        connection.onclose(() => {
            setErrorMessage('Connection lost.');
        });

        connection.start().catch((err) => {
            setErrorMessage('Failed to connect: ' + (err instanceof Error ? err.message : String(err)));
        });

        return () => {
            if (reconnectingTimerRef.current) {
                clearTimeout(reconnectingTimerRef.current);
            }
            connection.stop();
        };
    }, [hubName]);

    return { data, errorMessage };
}

// --- withSubscription HOC ---

export function withSubscription<TDto extends BaseDto>(
    WrappedComponent: ComponentType<{ data: TDto }>,
    hubName: string
): ComponentType {
    function WithSubscriptionWrapper() {
        const { data, errorMessage } = useSubscription<TDto>(hubName);

        if (errorMessage && !data) {
            return <ErrorOverlay message={errorMessage} />;
        }

        if (!data) {
            return null;
        }

        return (
            <>
                {errorMessage && <ErrorOverlay message={errorMessage} />}
                <WrappedComponent data={data} />
            </>
        );
    }

    WithSubscriptionWrapper.displayName = `withSubscription(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;
    return WithSubscriptionWrapper;
}

// --- Utility Functions ---

export function round2places(num: number): number {
    return Math.round((num + Number.EPSILON) * 100) / 100;
}

export function roundStrAuto(num: number): string {
    num = round2places(num);
    if (num > 100) return Math.round(num).toFixed(0);
    return (Math.round((num + Number.EPSILON) * 10) / 10).toFixed(1);
}

export function formatBytes(bytes: number, div: number = 1024): string {
    if (bytes < div) return roundStrAuto(bytes) + " b";
    if (bytes < div * div) return roundStrAuto(bytes / div) + " kb";
    if (bytes < div * div * div) return roundStrAuto(bytes / (div * div)) + " mb";
    return roundStrAuto(bytes / (div * div * div)) + " gb";
}

// --- Time Utility ---

export function isTimeBetween(time: DateTime | string, start: string, end: string): boolean {
    const t = typeof time === 'string' ? DateTime.fromFormat(time, 'H:mm') : time;
    const s = DateTime.fromFormat(start, 'H:mm');
    const e = DateTime.fromFormat(end, 'H:mm');
    return t > s && t < e;
}

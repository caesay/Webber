import { type IRetryPolicy, type RetryContext } from '@microsoft/signalr';
import { DateTime } from 'luxon';

// --- Interfaces ---

export interface BaseDto {
    localOffsetHours: number;
    errorMessage: string;
    serverVersion: string;
}

// --- InfiniteRetryPolicy ---

export class InfiniteRetryPolicy implements IRetryPolicy {
    nextRetryDelayInMilliseconds(retryContext: RetryContext): number | null {
        if (retryContext.previousRetryCount < 3) return 2000;
        if (retryContext.previousRetryCount < 10) return 10000;
        return 30000;
    }
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

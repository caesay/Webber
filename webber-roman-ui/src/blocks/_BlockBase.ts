import { HubConnectionBuilder } from "@microsoft/signalr";
import { useEffect, useState } from "react";
import { useDebugBlock } from "./DebugBlock";

export type BlockConnectionStatus = "disconnected" | "connecting" | "connected";

export interface BaseDto {
    localOffsetHours: number;
    sentUtc: Temporal.Instant;
    validUntilUtc: Temporal.Instant;
    errorMessage: string;
}

export interface BlockState {
    status: BlockConnectionStatus;
    updates: number;
    dto: { validUntilUtc: Temporal.Instant } | null;
}

export interface BlockStateDto<TDto extends BaseDto> extends BlockState {
    dto: TDto | null;
}

function basePatcher(dto: BaseDto) {
    dto.sentUtc = Temporal.Instant.from(dto.sentUtc as any);
    dto.validUntilUtc = Temporal.Instant.from(dto.validUntilUtc as any);
}

const timeDiffs: number[] = [];
export let timeCorrectionMs: number = 0;

export function useBlock<TDto extends BaseDto>(url: string, patcher: (dto: TDto) => void): BlockStateDto<TDto> {
    const [dto, setDto] = useState<TDto | null>(null);
    const [status, setStatus] = useState<BlockConnectionStatus>("disconnected");
    const [updates, setUpdates] = useState(0);
    const { pushLog } = useDebugBlock();

    useEffect(() => {
        let exited = false;
        const instance = Math.random();
        function dbg(str: string) { /* console.log(`[wbbr ${instance}] ${str}`); if (url.endsWith('PingBlock')) pushLog(str); */ }
        dbg("START " + url);
        const conn = new HubConnectionBuilder()
            .withUrl(url)
            .withAutomaticReconnect({ nextRetryDelayInMilliseconds: () => null }) // auto reconnects mean we lose the distinction between 'connecting' and 'disconnected'; we need manual reconnect anyway because the initial connection failure is not subject to auto retries // (rc) => rc.previousRetryCount <= 2 ? 2_000 : 10_000 })
            .build();
        conn.on("Update", (dto: TDto) => {
            try {
                basePatcher(dto);
                patcher(dto);
                setDto(dto);
                setUpdates(u => u + 1);
                timeDiffs.push(dto.sentUtc.since(Temporal.Now.instant()).total("milliseconds"));
                if (timeDiffs.length > 20)
                    timeDiffs.shift();
                if (timeDiffs.length >= 3)
                    timeCorrectionMs = timeDiffs.reduce(function (a, b) { return a + b; }, 0) / timeDiffs.length;
                if (dto.errorMessage)
                    console.error(url + ": " + dto.errorMessage);
            } catch (e) {
                console.error(e); // otherwise SignalR just swallows it and pretends everything is fine, thanks for wasting my time SignalR
            }
        });
        conn.onreconnecting(() => { setStatus("connecting"); dbg("on reconnecting"); });
        conn.onreconnected(() => { setStatus("connected"); dbg("on reconnected"); });
        conn.onclose(() => { setStatus("disconnected"); dbg("on close"); void connect(); });
        async function connect() {
            setStatus("connecting"); dbg("connecting");
            try {
                if (exited) return;
                await conn.start();
                setStatus("connected"); dbg("connected");
                if (exited) void conn.stop();
            } catch (error) {
                dbg("catch: " + JSON.stringify(error));
                setStatus("disconnected");
                void conn.stop();
                await new Promise(r => setTimeout(r, 10_000));
                if (!exited)
                    void connect();
            }
        }
        void connect();
        return () => { exited = true; void conn.stop(); dbg("STOP"); }
    }, []);

    return { dto, status, updates };
}

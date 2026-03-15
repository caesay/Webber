import { useEffect, useState } from "react";
import styled from "styled-components";
import { BlockConnectionStatus, BlockState } from "../blocks/_BlockBase";

export const BlockPanelContainerDiv = styled.div`
    position: relative;
    overflow: hidden;
`;
export const BlockPanelDot = styled.div`
    position: absolute;
    width: 0.8vw;
    height: 0.8vw;
    right: 0.8vw;
    top: 0.8vw;
    box-shadow: 0 0 0.25vw 0.25vw #000;
    z-index: 999;
`;
const BlockPanelDisconnectedDot = styled(BlockPanelDot) <{ connection: BlockConnectionStatus }>`
    background-color: ${p => p.connection == "disconnected" ? "red" : "cyan"};
`;
const BlockPanelStatusDot = styled(BlockPanelDot)`
    background-color: yellow;
    animation: fadeout 1s linear 0s 1 normal forwards;

    @keyframes fadeout {
        from { opacity: 1; }
        to { opacity: 0; }
    }
`;
const StripesOverlay = styled.div<{ opacity?: number, color1: string, color2: string }>`
    position: absolute;
    top: 0; bottom: 0; left: 0; right: 0;
    background: repeating-linear-gradient(45deg, ${p => p.color1}, ${p => p.color1} 5vmin, ${p => p.color2} 5vmin, ${p => p.color2} 10vmin);
    background-attachment: fixed;
    opacity: ${p => p.opacity ?? 1.0};
`;

interface BlockPanelProps extends React.HTMLAttributes<HTMLDivElement> {
    state: BlockState;
}

export function BlockPanelContainer({ state, children, ...rest }: BlockPanelProps): React.ReactNode {
    const [visible, setVisible] = useState(false);
    const [valid, setValid] = useState<"empty" | "valid" | "invalid">("empty"); // empty occurs before we have received the first dto from server
    useEffect(() => {
        setVisible(true);
        setTimeout(() => setVisible(false), 1500);
    }, [state.updates]);
    useEffect(() => {
        if (!state.dto) {
            setValid("empty");
        } else {
            const validForMs = Temporal.Now.instant().until(state.dto.validUntilUtc).total("milliseconds");
            setValid(validForMs > 0 ? "valid" : "invalid");
            const timer = setTimeout(() => setValid("invalid"), validForMs);
            return () => clearTimeout(timer);
        }
    }, [state.dto?.validUntilUtc]);

    return <BlockPanelContainerDiv {...rest}>
        {valid == "invalid" && <StripesOverlay opacity={0.3} color1="#a21" color2="#0000" />}
        {valid == "empty" && <StripesOverlay color1="#0c1d4b" color2="#181818" />}
        {visible && <BlockPanelStatusDot />}
        {state.status != "connected" && <BlockPanelDisconnectedDot connection={state.status} />}
        {children}
        {valid == "invalid" && <StripesOverlay opacity={0.3} color1="#a21" color2="#0000" />}
    </BlockPanelContainerDiv>;
}

export const BlockPanelBorderedContainer = styled(BlockPanelContainer)`
    padding: 1.5vw;
    border: 0.5vw solid #444;
    background: #111;
`;

export function makeState(s: { status?: BlockConnectionStatus, updates?: number, validUntilUtc?: Temporal.Instant }) {
    return {
        status: s.status ?? "connected",
        updates: s.updates ?? 0,
        dto: {
            validUntilUtc: s.validUntilUtc ?? Temporal.Now.instant().add({ hours: 24 * 365 * 10 }),
        },
    };
}

export function joinState(s1: BlockState, s2: BlockState): BlockState {
    const result: BlockState = {
        status: (s1.status == s2.status) ? s1.status : (s1.status == "disconnected" || s2.status == "disconnected") ? "disconnected" : "connecting",
        updates: s1.updates + s2.updates,
        dto: null,
    };
    // dto null indicates component is waiting for first data; we want the result to have null only if neither part has loaded
    if (s1.dto)
        result.dto = { validUntilUtc: s1.dto.validUntilUtc };
    if (s2.dto)
        if (!result.dto)
            result.dto = { validUntilUtc: s2.dto.validUntilUtc };
        else
            result.dto.validUntilUtc = Temporal.Instant.compare(result.dto.validUntilUtc, s2.dto.validUntilUtc) < 0 ? result.dto.validUntilUtc : s2.dto.validUntilUtc;
    return result;
}

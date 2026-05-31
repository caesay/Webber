import { useEffect, useState } from "react";
import styled from "styled-components";
import { subscribeErrors } from "../util/errorBus";

const TOAST_DURATION_MS = 8000;

const ToastDiv = styled.div`
    position: fixed;
    right: 1rem;
    bottom: 1rem;
    background: #1a1b23;
    border: 1px solid #a04040;
    color: #eee;
    padding: 0.1rem 0.5rem;
    border-radius: 6px;
    word-wrap: break-word;
    z-index: 1000;
`;

export function ErrorToast(): React.ReactNode {
    const [shown, setShown] = useState<{ message: string; nonce: number } | undefined>(undefined);

    useEffect(() => subscribeErrors(message => {
        setShown(prev => ({ message, nonce: (prev?.nonce ?? 0) + 1 }));
    }), []);

    useEffect(() => {
        if (!shown) return;
        const t = setTimeout(() => setShown(undefined), TOAST_DURATION_MS);
        return () => clearTimeout(t);
    }, [shown]);

    if (!shown) return null;
    return <ToastDiv>{shown.message}</ToastDiv>;
}

import { Component, ReactNode } from "react";
import { reportError } from "../util/errorBus";

interface State {
    hasError: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
    state: State = { hasError: false };

    static getDerivedStateFromError(): State {
        return { hasError: true };
    }

    componentDidCatch(error: Error): void {
        reportError(error);
    }

    render(): ReactNode {
        if (this.state.hasError) return null;
        return this.props.children;
    }
}

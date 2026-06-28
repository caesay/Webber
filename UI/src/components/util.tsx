import _ from 'lodash';
import * as React from 'react';
import styled from 'styled-components';
import { HubConnectionBuilder, HubConnection, IRetryPolicy, RetryContext } from '@microsoft/signalr';
import currentVersion from "../version";
import moment from 'moment';

const ErrorOverlay = styled.div`
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    bottom: 0;
    background-color: rgba(127,0,0,0.7);
    color: white;
    padding: 20px;
    border: 2px solid black;
    font-size: 20px;
    overflow: hidden;
    font-weight: bold;
`;

async function setStateAsync<P, S, K extends keyof S>(
    component: React.Component<P, S>,
    state:
        ((prevState: Readonly<S>, props: Readonly<P>) => (Pick<S, K> | S | null)) |
        Pick<S, K> |
        S |
        null
) {
    return new Promise(resolve => component.setState(state, resolve as any));
}

export interface BaseDto {
    localOffsetHours: number;
    errorMessage: string;
    serverVersion: string;
}

export function withSubscription<TDto extends BaseDto>(WrappedComponent: (React.ComponentType<{ data: TDto }>), hubName: string) {
    interface BlockPanelBaseState {
        lastUpdate?: TDto;
        errorMessage?: string;
        reconnectingDelay?: any;
    }
    class InfiniteRetryPolicy implements IRetryPolicy {
        nextRetryDelayInMilliseconds(retryContext: RetryContext): number {
            if (retryContext.previousRetryCount < 3)
                return 2000;
            if (retryContext.previousRetryCount < 10)
                return 10000;
            return 30000;
        }
    }
    return class BlockPanelBase extends React.Component<{}, BlockPanelBaseState>
    {
        connection: HubConnection = null;

        constructor(props: {}) {
            super(props);
            this.state = {};
        }

        componentDidMount = () => {
            this.connect();
        }

        connect = async () => {
            if (this.connection) {
                try { await this.connection.stop(); } catch { }
                this.connection = null;
            }

            try {
                this.connection = new HubConnectionBuilder()
                    .withUrl(window.location.protocol + '//' + window.location.host + '/hub/' + hubName)
                    .withAutomaticReconnect(new InfiniteRetryPolicy())
                    .build();

                this.connection.on('Update', this.onUpdateReceived);
                this.connection.onreconnecting(this.onReconnecting);
                this.connection.onreconnected(this.onReconnected);
                await this.connection.start();
                await setStateAsync(this, { errorMessage: "" });
            } catch (e) {
                if (_.isError(e)) {
                    await setStateAsync(this, { errorMessage: "Failed to connect: " + e.message });
                } else {
                    await setStateAsync(this, { errorMessage: "Failed to connect: " + e });
                }
                setTimeout(this.connect, 10000);
            }
        }

        onReconnecting = (e: Error) => {

            var timeoutHandle = setTimeout(() => {
                this.setState({ reconnectingDelay: null });
            }, 10000);

            this.setState((prevState) => ({ errorMessage: "Reconnecting: " + e.message, reconnectingDelay: timeoutHandle }));
        }

        onReconnected = (connectionId: string) => {
            this.setState((prevState) => { 
                clearTimeout(prevState.reconnectingDelay);
                return { reconnectingDelay: null };
            });
        }

        onUpdateReceived = (dto: TDto) => {
            if (currentVersion != "local" && currentVersion != dto.serverVersion) {
                window.location.reload();
            }
            this.setState({ lastUpdate: dto, errorMessage: dto.errorMessage });
        }

        render() {
            const { lastUpdate, errorMessage, reconnectingDelay } = this.state;

            return (
                <React.Fragment>
                    {!_.isEmpty(lastUpdate) && <WrappedComponent data={lastUpdate} />}
                    {!_.isEmpty(errorMessage) && !reconnectingDelay && <ErrorOverlay onClick={this.connect}>{errorMessage}</ErrorOverlay>}
                </React.Fragment>
            );
        }
    }
}

export function round2places(num: number): number {
    return Math.round((num + Number.EPSILON) * 100) / 100;
}

export function roundStrAuto(num: number): string {
    num = round2places(num);
    if (num > 100)
        return Math.round(num).toFixed(0);
    return (Math.round((num + Number.EPSILON) * 10) / 10).toFixed(1)
    // return (Math.round((num + Number.EPSILON) * 100) / 100).toFixed(2);
}

export function formatBytes(bytes: number, div: number = 1024): string {
    if (bytes < div) return roundStrAuto(bytes) + " b";
    if (bytes < div * div) return roundStrAuto(bytes / div) + " kb";
    if (bytes < div * div * div) return roundStrAuto(bytes / (div * div)) + " mb";
    return roundStrAuto(bytes / (div * div * div)) + " gb";
}

export function isTimeBetween(time, start, end): boolean {
    if (_.isString(time)) time = moment(time, ['h:m a', 'H:m']);
    if (_.isString(start)) start = moment(start, ['h:m a', 'H:m']);
    if (_.isString(end)) end = moment(end, ['h:m a', 'H:m']);

    const c1 = time.diff(start);
    const c2 = time.diff(end);
    return c1 > 0 && c2 < 0;
}
import * as _ from 'lodash';
import * as React from 'react';
import styled from 'styled-components';
import { withSubscription, BaseDto } from './util';
import { formatBytes } from './util';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCaretSquareUp, faCaretSquareDown, faEthernet, faNetworkWired, faWifi, faLink } from '@fortawesome/free-solid-svg-icons'

interface SynologyRouterBlockDto extends BaseDto {
    rx: number;
    rxMax: number;
    rxHistory: number[];
    tx: number;
    txMax: number;
    txHistory: number[];
    topDevices: TxRxDevicePairGroup;
    activeTorrents: ActiveTorrentDetail[];
    wan1: boolean;
    wan2: boolean;
    wifiClientCount: number;
    lanClientCount: number;
}

interface ActiveTorrentDetail {
    name: string;
    size: number;
    totalRx: number;
    totalTx: number;
    rx: number;
    tx: number;
}

interface TxRxPair {
    timestamp: string;
    txRate: number;
    rxRate: number;
}

interface TxRxDevicePair extends TxRxPair {
    deviceId: string;
    deviceIpv4: string;
    deviceHostname: string;
    isWireless: boolean;
}

interface TxRxDevicePairGroup {
    timestamp: string;
    pairs: TxRxDevicePair[];
}

const PingBubble = styled.div`
    margin: 6px;
    display: block;
    flex-grow: 0;
    flex-shrink: 1;
    flex-basis: auto;
    align-self: auto;
    order: 0;
`;

const FillDiv = styled.div`
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    overflow: hidden;
`;

const LabelContainer = styled.div`
    display: flex;
    position: relative;
    flex-direction: row;
    flex-wrap: nowrap;
    justify-content: flex-start;
    align-items: flex-start;
    align-content: normal;
`;

const PingText = styled.span`
    align-self: center;
    font-size: 30px;
    opacity: 1;
    padding: 0px 4px;
    margin-right: 10px;
    background-color: rgba(0,0,0,0.7);
`

function getClr(v: number, warn: number, danger: number, defaultClr: string = "rgb(0,149,255)"): string {
    if (v >= danger) return "red";
    if (v >= warn) return "yellow";
    return defaultClr;
}

function getBars(series: number[], minHeight: number, warn: number, danger: number, defaultClr: string = "rgb(0,149,255)") {
    const vMax = Math.max(minHeight, _.max(series));
    const barW = 4;
    const barS = 2;

    var min_f = Math.log(10000) / Math.log(10),
        max_f = Math.log(vMax) / Math.log(10),
        range = max_f - min_f;

    const getH = (n: number) => {
        var position_px = (Math.log(n) / Math.log(10) - min_f) / range * 50;
        return Math.max(1, position_px);
    };
    const getL = (idx: number) => (idx * (barW + barS));
    const bars = _.map(series, (v, i) => (
        <div key={i} style={{ position: "absolute", width: barW, height: getH(v), left: getL(i), bottom: 0, backgroundColor: getClr(v, warn, danger, defaultClr) }}></div>
    ));

    const lineNums = _.range(0, range - 1, 1);
    const lines = _.map(lineNums, (i) => (
        <div style={{ height: 1, position: "absolute", left: 8, right: 8, backgroundColor: "rgba(255, 255, 255, 0.4)", top: 40 + (50 / range * i) }} />
    ));

    return (
        <FillDiv>
            {bars}
            {lines}
        </FillDiv>
    );
}

const getDeviceRow = (mainIcon: any, rowName: string, isDown: boolean, upTxt: string, dwnTxt: string) => {
    return (
        <LabelContainer key={rowName} style={{ height: 45 }}>
            <FontAwesomeIcon icon={mainIcon} style={{ alignSelf: "center", fontSize: 24, margin: 10, opacity: 0.7, width: 30 }} />
            <div style={{ alignSelf: "center", fontSize: 24, width: 180, textOverflow: "ellipsis", whiteSpace: "nowrap", overflow: "hidden" }}>{rowName}</div>
            <FontAwesomeIcon icon={isDown ? faCaretSquareDown : faCaretSquareUp}
                style={{ alignSelf: "center", margin: 10, fontSize: 24, color: isDown ? "rgb(0,149,255)" : "#FF6A00" }} />
            <div style={{ alignSelf: "center", fontSize: 24, whiteSpace: "nowrap", width: 90, opacity: 0.7 }}>{isDown ? dwnTxt : upTxt}</div>
        </LabelContainer>
    )
}

const SynologyRouterBlock: React.FunctionComponent<{ data: SynologyRouterBlockDto }> = ({ data }) => {

    const { rx, rxMax, rxHistory, tx, txMax, txHistory, topDevices, activeTorrents } = data;

    const rxIconClr = getClr(rx, rxMax * 0.5, rxMax * 0.75);
    const rxTextClr = getClr(rx, rxMax * 0.5, rxMax * 0.75, "rgba(255, 255, 255, 1)");
    const txIconClr = getClr(tx, txMax * 0.5, txMax * 0.75, "#FF6A00");
    const txTextClr = getClr(tx, txMax * 0.5, txMax * 0.75, "rgba(255, 255, 255, 1)");

    // const _10MB = 1 * 1000 * 1000;

    return (
        <React.Fragment>
            <div className="l1t1 w2h1">
                {getBars(rxHistory, rxMax, rxMax * 0.75, rxMax * 0.75)}
                <LabelContainer>
                    <PingBubble>
                        <FontAwesomeIcon icon={faCaretSquareDown} style={{ fontSize: 27, color: rxIconClr }} />
                    </PingBubble>
                    <PingText style={{ color: rxTextClr }}>{formatBytes(rx)}</PingText>
                </LabelContainer>
            </div>
            <div className="l3t1 w2h1">
                {getBars(txHistory, txMax, txMax * 0.75, txMax * 0.75, "#FF6A00")}
                <LabelContainer>
                    <PingBubble>
                        <FontAwesomeIcon icon={faCaretSquareUp} style={{ fontSize: 27, color: txIconClr }} />
                    </PingBubble>
                    <PingText style={{ color: txTextClr }}>{formatBytes(tx)}</PingText>
                </LabelContainer>
            </div>
            <div className="l1t2 w4h2">
                {_.map(topDevices.pairs, (e, i) => getDeviceRow(e.isWireless ? faWifi : faNetworkWired, e.deviceHostname, Math.max(e.rxRate, e.txRate) == e.rxRate, formatBytes(e.txRate), formatBytes(e.rxRate)))}
                {_.map(activeTorrents, (e, i) => getDeviceRow(faLink, e.name, e.totalRx < e.size, formatBytes(e.tx), (e.totalRx / e.size * 100).toString() + "%"))}
            </div>
        </React.Fragment>
    );
}

export default withSubscription(SynologyRouterBlock, "SynologyRouterBlock");
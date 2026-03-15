import styled from "styled-components";
import { RouterHistoryPoint, useRouterBlock } from "../blocks/RouterBlock";
import { BarChart, BarChartPt, ScaleY } from "./BarChart";
import { BlockPanelBorderedContainer, BlockPanelContainer } from "./Container";

const RouterBoxDiv = styled(BlockPanelBorderedContainer)`
    display: flex;
    flex-direction: column;
`;

const RouterChartDiv = styled.div`
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    padding: 0 0.5vw;
    border-bottom: 1px solid #999;
`;

const RouterChartDownDiv = styled(RouterChartDiv)`
    border-bottom: none;
    border-top: 1px solid #999;
`;

function rate2str(rate: number): string { return rate >= 1_000_000 ? `${(rate / 1_000_000).toFixed(1)}M` : `${(rate / 1000).toFixed(0)}`; }

function getPt(val: number | undefined, max: number, c1: string, c2: string, c3: string, c4: string): BarChartPt {
    if (val === undefined)
        return { Value: 1.0, Color: "#404040" };
    return {
        Value: ScaleY(val, max / 1000, max, x => Math.log10(x)),
        Color: val < max / 100 ? c1 : val < max / 10 ? c2 : val < max * 0.6 ? c3 : c4,
    };
}

function getTxPt(pt: RouterHistoryPoint | null) {
    return getPt(pt?.txRate, 3_250_000, "#05305c", "#0959aa", "#1985f3", "#64adf7");
}
function getRxPt(pt: RouterHistoryPoint | null) {
    return getPt(pt?.rxRate, 26_000_000, "#573805", "#966008", "#ed980d", "#f6bb5a");
}

export function RouterPanel(props: React.HTMLAttributes<HTMLDivElement>): React.ReactNode {
    const router = useRouterBlock();
    if (!router.dto)
        return <RouterBoxDiv state={router} {...props} />;

    return <RouterBoxDiv state={router} {...props}>
        <div style={{ display: "grid", width: "100%", height: "100%", gap: "2vw", gridTemplateColumns: "min-content 1fr min-content 1fr min-content", gridTemplateRows: "min-content 1fr 1fr", alignItems: "center", justifyItems: "center" }}>
            <div style={{ color: "#777" }}>KB/s</div>
            <div>Recent traffic</div>
            <div></div>
            <div>Hourly traffic</div>
            <div style={{ color: "#777" }}>KB/s</div>

            <div>{rate2str(router.dto.txLast)}</div>
            <RouterChartDownDiv>
                <BarChart Data={router.dto.historyRecent.map(getTxPt)} BarCount={24} Downwards={true} />
            </RouterChartDownDiv>
            <div style={{ color: "#1985f3" }}>Up</div>
            <RouterChartDownDiv>
                <BarChart Data={router.dto.historyHourly.map(getTxPt)} BarCount={24} Downwards={true} />
            </RouterChartDownDiv>
            <div>{rate2str(router.dto.txAverageRecent)}</div>

            <div>{rate2str(router.dto.rxLast)}</div>
            <RouterChartDiv>
                <BarChart Data={router.dto.historyRecent.map(getRxPt)} BarCount={24} />
            </RouterChartDiv>
            <div style={{ color: "#ed980d" }}>Dn</div>
            <RouterChartDiv>
                <BarChart Data={router.dto.historyHourly.map(getRxPt)} BarCount={24} />
            </RouterChartDiv>
            <div>{rate2str(router.dto.rxAverageRecent)}</div>
            {/* <div style={{ padding: '0 0.5vw', borderBottom: '1px solid #999', flex: '1', minHeight: '0' }}>
                <BarChart Data={router.dto.recent.map(pingToPt)} BarCount={router.dto.recent.length} />
            </div> */}
        </div>
    </RouterBoxDiv>
}

const MiniRouterBoxDiv = styled(BlockPanelContainer)`
    display: grid;
    grid-template-columns: 1fr 1fr;
    border: 1px solid #555;
`;
const MiniChartDiv = styled.div`
    position: relative;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    padding: 0 0.5vw;
    background: #181818;
`;
const MiniChartBottomDiv = styled(MiniChartDiv)`
    border-top: 1px solid #999;
`;
const MiniLabelDiv = styled.div`
    position: absolute;
    left: 0; right: 0; top: 0; bottom: 0;
    display: grid;
    justify-content: center;
    align-content: start;

    ${MiniChartBottomDiv} & {
        align-content: end;
    }
`;
function Rate(p: { rate: number }): React.ReactNode {
    let num: string;
    let unit: string;
    if (p.rate >= 1_000_000) {
        num = (p.rate / 1_000_000).toFixed(1);
        unit = "MB/s";
    }
    else {
        num = (p.rate / 1000).toFixed(0);
        unit = "kB/s";
    }
    return <>
        <MiniLabelDiv style={{ WebkitTextStroke: "1vw #18181880" }}><div>{num} <span style={{ fontSize: "60%" }}>{unit}</span></div></MiniLabelDiv>
        <MiniLabelDiv><div>{num} <span style={{ fontSize: "60%" }}>{unit}</span></div></MiniLabelDiv>
    </>;
}

export function MiniRouterPanel(props: React.HTMLAttributes<HTMLDivElement>): React.ReactNode {
    const router = useRouterBlock();
    if (!router.dto)
        return <MiniRouterBoxDiv state={router} {...props} />;

    return <MiniRouterBoxDiv state={router} {...props}>
        <MiniChartDiv>
            <BarChart Data={router.dto.historyRecent.map(getTxPt)} BarCount={24} />
            <Rate rate={router.dto.txLast} />
        </MiniChartDiv>
        <MiniChartDiv style={{ borderLeft: "1px solid #555" }}>
            <BarChart Data={router.dto.historyHourly.map(getTxPt)} BarCount={24} />
            <Rate rate={router.dto.txAverage60min} />
        </MiniChartDiv>

        <MiniChartBottomDiv>
            <BarChart Data={router.dto.historyRecent.map(getRxPt)} BarCount={24} Downwards={true} />
            <Rate rate={router.dto.rxLast} />
        </MiniChartBottomDiv>
        <MiniChartBottomDiv style={{ borderLeft: "1px solid #555" }}>
            <BarChart Data={router.dto.historyHourly.map(getRxPt)} BarCount={24} Downwards={true} />
            <Rate rate={router.dto.rxAverage60min} />
        </MiniChartBottomDiv>
    </MiniRouterBoxDiv >
}

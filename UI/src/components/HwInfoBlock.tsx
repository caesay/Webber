import * as _ from 'lodash';
import * as React from 'react';
import { withSubscription, BaseDto } from './util';

interface HwInfoDto extends BaseDto {
    memoryUtilization: number;
    cpuTotalLoad: number;
    cpuMaxCoreLoad: number;
    cpuMaxCoreName: string;
    gpuLoad: number;
}

const MiniBlock: React.FunctionComponent<{ perc: number, title: string, className: string }> = ({ perc, title, className }) => {
    let blueColor = "rgb(0,149,255)";
    let redColor = "red";
    var blueOpacity = Math.min(1, perc / 0.7);
    var redOpacity = Math.max(0, Math.min(1, (perc - 0.7) / 0.3));
    return (
        <div className={className}>
            <div style={{ position: "absolute", top: 2, left: 2, right: 2, bottom: 2, backgroundColor: blueColor, opacity: blueOpacity }}></div>
            <div style={{ position: "absolute", top: 2, left: 2, right: 2, bottom: 2, backgroundColor: redColor, opacity: redOpacity }}></div>
            <div style={{ position: "relative", color: "rgba(255, 255, 255, 0.7)", textAlign: "center", fontSize: 18, marginTop: 8, marginBottom: -4 }}>{title} %</div>
            <div style={{ position: "relative", color: "rgba(255, 255, 255, 0.9)", textAlign: "center", fontSize: 40 }}>{(perc * 100).toFixed(0)}</div>
        </div>
    )
}

const HwInfoBlock: React.FunctionComponent<{ data: HwInfoDto }> = ({ data }) => {
    return (
        <React.Fragment>
            <MiniBlock className="l1t1 w1h1" title="CPU" perc={data.cpuTotalLoad} />
            <MiniBlock className="l2t1 w1h1" title={data.cpuMaxCoreName} perc={data.cpuMaxCoreLoad} />
            <MiniBlock className="l3t1 w1h1" title="GPU" perc={data.gpuLoad} />
            <MiniBlock className="l4t1 w1h1" title="RAM" perc={data.memoryUtilization} />
        </React.Fragment>
    );
}

export default withSubscription(HwInfoBlock, "HwInfoBlock");
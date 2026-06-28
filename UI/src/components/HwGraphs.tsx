import * as _ from 'lodash';
import * as React from 'react';
import Chart from "react-apexcharts";
import { ApexOptions } from 'apexcharts';
import moment from 'moment';
import styled from 'styled-components';
import { formatBytes } from './util';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCaretDown, faCaretUp } from '@fortawesome/free-solid-svg-icons'

const gridOptions: ApexGrid = {
    show: true,
    borderColor: "rgba(255, 255, 255, 0.2)",
    padding: {
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
    }
};

const gridX: ApexXAxis = {
    type: 'datetime',
    range: 30 * 1000,
    labels: { show: false },
    axisBorder: { show: false },
    axisTicks: { show: false },
};

const loadOptions: ApexOptions = {
    colors: ["#8f140b", "#0095ff"],
    chart: {
        parentHeightOffset: 0,
        animations: {
            enabled: false,
            easing: 'linear',
            dynamicAnimation: {
                speed: 1000
            }
        },
        toolbar: { show: false },
        zoom: { enabled: false }
    },
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth' },
    markers: { size: 0 },
    xaxis: gridX,
    yaxis: {
        max: 100,
        min: 0,
        decimalsInFloat: 0,
        labels: { show: false },
        axisBorder: { show: false },
        axisTicks: { show: false },
    },
    legend: { show: false },
    grid: gridOptions,
    tooltip: { enabled: false },
};

const networkOptions: ApexOptions = {
    colors: ["#F57BB6", "#7AF57C", "#62E1F5"],
    chart: {
        parentHeightOffset: 0,
        animations: { enabled: false },
        toolbar: { show: false },
        zoom: { enabled: false },
    },
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth' },
    markers: { size: 0 },
    xaxis: gridX,
    yaxis: {
        max: 40 * 1024 * 1024,
        logarithmic: true,
        min: 0,
        decimalsInFloat: 0,
        labels: {
            show: true,
            formatter: f => (formatBytes(f, 1000) + "/s"),
        },
        axisBorder: { show: false },
        axisTicks: { show: false },
    },
    legend: { show: false },
    grid: gridOptions,
    tooltip: { enabled: false },
};

interface TimedMetric {
    timeUtc: string;
    value: number;
}

interface HwLoadGraphProps {
    totalLoad: number;
    totalLoadHistory: TimedMetric[];
    packageTemp: number;
    packageTempHistory: TimedMetric[];
    label: string;
}

function createSeries(...args: TimedMetric[][]) {
    const series: any[] = [];
    for (let x of args) {
        series.push({
            data: _.map(x, l => ({ "x": moment(l.timeUtc).valueOf(), "y": l.value }))
        });
    }
    return series;
}

const HwLoadGraph: React.FunctionComponent<HwLoadGraphProps> = ({ totalLoad, totalLoadHistory, packageTemp, packageTempHistory, label }) => {
    const series = createSeries(packageTempHistory, totalLoadHistory);

    const loadCurrent = Math.ceil(totalLoad).toString();
    const tempCurrent = Math.ceil(packageTemp).toString();

    const width = 356;
    const height = 176;

    return (
        <div style={{ width, height, position: "relative", overflow: "hidden", border: "black 2px solid" }}>
            <Chart
                options={loadOptions}
                type="area"
                height={height + 45}
                width={width + 10 - 63}
                series={series}
                style={{ position: "relative", left: 63 }}
            />
            <span style={{ fontSize: "62px", fontWeight: "bold", position: "absolute", top: 10, left: 60, textAlign: "right", width: 130, display: "block" }}>{loadCurrent}%</span>
            <span style={{ fontSize: "62px", fontWeight: "bold", position: "absolute", top: 10, right: 4, color: "#FE5571" }}>{tempCurrent}°</span>
            <span style={{ fontSize: "40px", fontWeight: "bold", position: "absolute", bottom: 0, left: 70, opacity: 0.8 }}>{label}</span>
        </div>
    );
}

interface HwNetworkGraphProps {
    ping: number;
    up: number;
    down: number;
    upHistory: TimedMetric[];
    downHistory: TimedMetric[];
    pingHistory: TimedMetric[];
}

function getPingColor(ping: number) {
    if (ping > 30) return "red";
    if (ping > 6) return "yellow";
    return "green";
}

const NetworkLabelContainer = styled.div`
    position: absolute;
    width: 100%;
    height: 50px;
    top: 0;
    left: 0;
`;

const PingBubble = styled.div<{ ping: number }>`
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background-color: ${props => getPingColor(props.ping)};
    margin: 10px;
    position: absolute;
    left: 0;
    bottom: 0;
    line-height: 40px;
    font-weight: bold;
    font-size: 30px;
    text-align: center;
`;

const SmallNetworkLabel = styled.span`
    height: 50px;
    line-height: 50px;
    font-weight: bold;
    font-size: 30px;
    position: absolute;
    top: 0;
`;

const HwNetworkGraph: React.FunctionComponent<HwNetworkGraphProps> = ({ ping, up, down, upHistory, downHistory, pingHistory }) => {
    const series = createSeries(downHistory, upHistory, pingHistory);
    series[0].type = "line";
    series[1].type = "line";
    series[2].type = "bar";

    const width = 356;
    const height = 176;
    return (
        <div style={{ width, height, position: "relative", overflow: "hidden", border: "black 2px solid" }}>
            <Chart
                options={networkOptions}
                type="line"
                height={height + 45 + 80}
                width={width + 12 + 16}
                series={series}
                style={{ position: "relative", left: -16 }}
            />
            <PingBubble ping={ping}>{Math.round(ping)}</PingBubble>
            <NetworkLabelContainer>
                <SmallNetworkLabel style={{ color: "#F57BB6", right: "50%" }}><FontAwesomeIcon icon={faCaretDown} style={{ paddingRight: 6 }} />{formatBytes(down)}</SmallNetworkLabel>
                <SmallNetworkLabel style={{ color: "#7AF57C", right: 0 }}><FontAwesomeIcon icon={faCaretUp} style={{ paddingRight: 6 }} />{formatBytes(up)}</SmallNetworkLabel>
            </NetworkLabelContainer>
        </div>
    );
}

export { HwLoadGraph, HwNetworkGraph };
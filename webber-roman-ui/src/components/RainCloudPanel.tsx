import styled from "styled-components";
import { RainCloudPtDto, useRainCloudBlock } from "../blocks/RainCloudBlock";
import { useWeatherBlock } from "../blocks/WeatherBlock";
import { useWeatherDotComBlock } from "../blocks/WeatherDotComBlock";
import { ns, zonedHere } from "../util/util";
import { BlockPanelContainer, joinState } from "./Container";

const RainCloudDiv = styled(BlockPanelContainer)`
    display: grid;
    grid-template-columns: 1fr;
`;

interface bar {
    pt: RainCloudPtDto;
    centerX: number;
    widthL?: number;
    widthR?: number;
    samples: barSample[];
}
interface barSample {
    y: number;
    height: number;
    color: string;
}

function RainChart(p: { from: Temporal.Instant }): React.ReactNode {
    const rb = useRainCloudBlock();
    const wdc = useWeatherDotComBlock();
    const wb = useWeatherBlock();

    const hoursTotal = 48;
    function getX(dt: Temporal.Instant): number { return 100 * p.from.until(dt).total("hours") / hoursTotal; }

    const nightColor = "#013"; // #081133
    const dayColor = "#330";
    const sunlineColor = "#880"; // sunrise & sunset line
    const gridColor = "#777";

    let daynight;
    if (wb.dto) {
        daynight = {
            nend1: getX(wb.dto.sunriseUtc.add({ hours: -1 })),
            rise1: getX(wb.dto.sunriseUtc),
            set1: getX(wb.dto.sunsetUtc),
            nbeg2: getX(wb.dto.sunsetUtc.add({ hours: 1 })),
            nend2: getX(wb.dto.sunrise2Utc.add({ hours: -1 })),
            rise2: getX(wb.dto.sunrise2Utc),
            set2: getX(wb.dto.sunset2Utc),
            nbeg3: getX(wb.dto.sunset2Utc.add({ hours: 1 })),
        };
    }

    function getPts(data: RainCloudPtDto[], colormap: string[], scalemap: number[]) {
        function getSamples(p: RainCloudPtDto): barSample[] {
            const total = p.counts.reduce((a, b) => a + b, 0);
            let y = 0;
            const result: barSample[] = [];
            for (let i = p.counts.length - 1; i >= 0; i--) {
                if (p.counts[i] > 0 && colormap[i] != "#000") {
                    const height = 100 * p.counts[i] * (p.isForecast ? scalemap[i] : 1) / total;
                    result.push({ y, height, color: colormap[i] });
                    y += height;
                }
            }
            return result;
        }
        const pts: bar[] = data.filter(pt => pt.counts != null).map(pt => ({ pt, centerX: getX(pt.atUtc), samples: getSamples(pt) })).filter(pt => pt.centerX >= 0 && pt.centerX <= 100);
        for (let i = 1; i < pts.length; i++) {
            const mX = (pts[i - 1].centerX + pts[i].centerX) / 2;
            pts[i - 1].widthR = mX - pts[i - 1].centerX;
            pts[i].widthL = pts[i].centerX - mX;
        }
        if (pts.length > 0) {
            pts[0].widthL = pts[0].widthR;
            pts[pts.length - 1].widthR = pts[pts.length - 1].widthL;
        }
        return pts;
    }
    const rainPts = rb.dto && getPts(rb.dto.rain,
        ["#000", "#0000fe", "#0660fe", "#0cbcfe", "#00a300", "#fecb00", "#fe9800", "#fe0000", "#b30000"],
        [0, 0.4, 0.6, 0.75, 0.9, 1, 1, 1, 1]);
    // const cloudPts = rb.dto && getPts(rb.dto.cloud,
    //     ["#aaa0", "#aaa2", "#aaa2", "#aaa2", "#aaa3", "#aaa4", "#aaa5", "#aaa5", "#aaa5", "#aaa5"],
    //     [0, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.7, 0.9, 1]);
    function getPrecipMmColor(mm: number): string {
        if (mm <= 0.1) return "#777";
        if (mm <= 0.3) return "#0000fe";
        if (mm <= 0.6) return "#0660fe";
        if (mm <= 1.0) return "#0cbcfe"; // like metoffice but shifted by one
        if (mm <= 2.0) return "#00a300";
        if (mm <= 4.0) return "#fecb00";
        if (mm <= 8.0) return "#fe9800";
        if (mm <= 16) return "#fe0000";
        return "#b30000";
    }

    const firstHour = zonedHere(p.from).round({ smallestUnit: "hour", roundingMode: "floor" });
    const hours = Array.from(Array(hoursTotal + 1), (_, i) => firstHour.add({ hours: i })).map(h => ({ hour: h.hour, centerX: getX(h.toInstant()) })).filter(h => h.centerX > 0 && h.centerX < 100);

    const textHeight = 15;
    const tickHeight = 11;
    const markerHeight = tickHeight * 1.3;
    const chartHeight = 100 - textHeight - tickHeight;

    let rainlines = wdc.dto && wdc.dto.hours.map(h => ({ xm1: getX(h.dateTime), y: 100 - h.precipChance, c: getPrecipMmColor(h.precipMm), ym1: 0, yp1: 0, x: 0, xp1: 999 }));
    if (rainlines) {
        for (let i = 1; i < rainlines.length - 1; i++) {
            rainlines[i].ym1 = (rainlines[i].y + rainlines[i - 1].y) / 2;
            rainlines[i].yp1 = (rainlines[i].y + rainlines[i + 1].y) / 2;
            rainlines[i].x = rainlines[i].xm1 + 0.5 * 100 / hoursTotal;
            rainlines[i].xp1 = rainlines[i].xm1 + 100 / hoursTotal;
        }
        rainlines = rainlines.filter(h => h.xm1 >= 0 && h.xp1 <= 100);
    }

    let templines = wdc.dto && wdc.dto.hours.map(h => ({
        xm1: getX(h.dateTime),
        x: getX(h.dateTime) + 0.5 * 100 / hoursTotal,
        xp1: getX(h.dateTime) + 100 / hoursTotal,
        tempC: h.tempC,
        y: 0, ym1: 0, yp1: 0,
    }));
    let tempMinPt: { x: number; y: number; tempC: number } | undefined;
    let tempMaxPt: { x: number; y: number; tempC: number } | undefined;
    if (templines) {
        templines = templines.filter(h => h.xm1 >= 0 && h.xp1 <= 100);
        if (templines.length > 0) {
            const tempMin = Math.min(...templines.map(h => h.tempC));
            const tempMax = Math.max(...templines.map(h => h.tempC));
            const range = tempMax - tempMin || 1;
            const pad = 5;
            for (const h of templines) h.y = (100 - pad) - (100 - 2 * pad) * (h.tempC - tempMin) / range;
            for (let i = 0; i < templines.length; i++) {
                templines[i].ym1 = i > 0 ? (templines[i].y + templines[i - 1].y) / 2 : templines[i].y;
                templines[i].yp1 = i < templines.length - 1 ? (templines[i].y + templines[i + 1].y) / 2 : templines[i].y;
            }
            const longestRun = (target: number) => {
                let bestStart = -1, bestEnd = -1, bestLen = 0;
                for (let i = 0; i < templines!.length;) {
                    if (templines![i].tempC === target) {
                        let j = i;
                        while (j + 1 < templines!.length && templines![j + 1].tempC === target) j++;
                        if (j - i + 1 > bestLen) { bestLen = j - i + 1; bestStart = i; bestEnd = j; }
                        i = j + 1;
                    } else i++;
                }
                if (bestStart < 0) return undefined;
                return { x: (templines![bestStart].x + templines![bestEnd].x) / 2, y: templines![bestStart].y, tempC: target };
            };
            tempMinPt = longestRun(tempMin);
            tempMaxPt = longestRun(tempMax);
        }
    }

    return <svg width="100%" height="100%">
        <linearGradient id="lighttime" key="lighttime" x1="0" x2="0" y1="0" y2="1"><stop key="1" offset="0%" stopColor="#fff" /><stop key="2" offset="100%" stopColor="#000" /></linearGradient>
        <mask id="lightmask" key="lightmask">
            <rect key="r1" fill="url(#lighttime)" x="0%" y="0%" width="100%" height={chartHeight + "%"} />
            <rect key="r2" fill="url(#lighttime)" x="0%" y={chartHeight + "%"} width="100%" height={(115 - chartHeight) + "%"} />
        </mask>
        <linearGradient id="cloudgrad" key="cloudgrad" x1="0" x2="0" y1="0" y2="1"><stop key="1" offset="0%" stopColor="#0" /><stop key="2" offset="10%" stopColor="#fff" /></linearGradient>
        <mask id="cloudmask" key="cloudmask">
            <rect fill="url(#cloudgrad)" x="0%" y="0%" width="100%" height={chartHeight + "%"} />
        </mask>
        <linearGradient id="twilight1gr" key="twilight1gr"><stop key="1" offset="0%" stopColor={nightColor} /><stop key="2" offset="100%" stopColor={dayColor} /></linearGradient>
        <linearGradient id="twilight2gr" key="twilight2gr"><stop key="1" offset="0%" stopColor={dayColor} /><stop key="2" offset="100%" stopColor={nightColor} /></linearGradient>

        {daynight && <g key="glight" mask="url(#lightmask)">
            <rect key="night1" x="0%" y="0%" height="100%" width={daynight.nend1 + "%"} fill={nightColor} />
            <rect key="twi1r" x={daynight.nend1 + "%"} y="0%" height="100%" width={(daynight.rise1 - daynight.nend1) + "%"} fill="url(#twilight1gr)" />
            <rect key="day1" x={daynight.rise1 + "%"} y="0%" height="100%" width={(daynight.set1 - daynight.rise1) + "%"} fill={dayColor} />
            <rect key="twi1s" x={daynight.set1 + "%"} y="0%" height="100%" width={(daynight.nbeg2 - daynight.set1) + "%"} fill="url(#twilight2gr)" />
            <rect key="night2" x={daynight.nbeg2 + "%"} y="0%" height="100%" width={(daynight.nend2 - daynight.nbeg2) + "%"} fill={nightColor} />
            <rect key="twi2r" x={daynight.nend2 + "%"} y="0%" height="100%" width={(daynight.rise2 - daynight.nend2) + "%"} fill="url(#twilight1gr)" />
            <rect key="day2" x={daynight.rise2 + "%"} y="0%" height="100%" width={(daynight.set2 - daynight.rise2) + "%"} fill={dayColor} />
            <rect key="twi2s" x={daynight.set2 + "%"} y="0%" height="100%" width={(daynight.nbeg3 - daynight.set2) + "%"} fill="url(#twilight2gr)" />
            <rect key="night3" x={daynight.nbeg3 + "%"} y="0%" height="100%" width={(100 - daynight.nbeg3) + "%"} fill={nightColor} />
        </g>}

        {hours.filter(hr => (hr.hour % 2) == 0).map((hr, i) => <svg key={`${i}_tx`} x={(hr.centerX - textHeight / 2) + "%"} y={(100 - textHeight) + "%"} width={textHeight + "%"} height={textHeight + "%"} viewBox="0 0 1 1">
            <text x="0.5" y="0" fontSize="1" fill="#ccc" textAnchor="middle" dominantBaseline="hanging">{hr.hour.toLocaleString("en-GB", { minimumIntegerDigits: 2 })}</text>
        </svg>)}
        {wdc.dto && <g key="clouds" mask="url(#cloudmask)">
            {wdc.dto.hours.map((pt, i) =>
                <rect
                    key={`${i}_1`}
                    x={`${getX(pt.dateTime)}%`}
                    y={`${chartHeight / 100 * (100 - pt.cloudCover)}%`}
                    width={`${100 / hoursTotal}%`}
                    height={`${chartHeight / 100 * pt.cloudCover}%`}
                    fill={`#aaaaaa${pt.cloudCover > 50 ? "55" : Math.round(0x11 + 0x33 * pt.cloudCover / 60).toString(16)}`}
                    strokeWidth="0">
                </rect>
            )}
        </g>}
        {daynight && <g key="grise">
            <line key="sunrise1" x1={daynight.rise1 + "%"} x2={daynight.rise1 + "%"} y1="0%" y2={chartHeight + "%"} stroke={sunlineColor} strokeDasharray="3" />
            <line key="sunset1" x1={daynight.set1 + "%"} x2={daynight.set1 + "%"} y1="0%" y2={chartHeight + "%"} stroke={sunlineColor} strokeDasharray="3" />
            <line key="sunrise2" x1={daynight.rise2 + "%"} x2={daynight.rise2 + "%"} y1="0%" y2={chartHeight + "%"} stroke={sunlineColor} strokeDasharray="3" />
            <line key="sunset2" x1={daynight.set2 + "%"} x2={daynight.set2 + "%"} y1="0%" y2={chartHeight + "%"} stroke={sunlineColor} strokeDasharray="3" />
        </g>}
        {rainPts && rainPts.map((pt, i) => pt.samples.map((sm, j) => {
            const gap = pt.widthL! + pt.widthR! > 0.4 ? 0.05 : -0.15; // negative to make them blend together
            return <rect
                key={`${i}_${j}_2`}
                x={`${pt.centerX - pt.widthL! + gap}%`}
                y={`${chartHeight / 100 * (100 - sm.y - sm.height)}%`}
                width={`${pt.widthL! + pt.widthR! - gap}%`}
                height={`${chartHeight / 100 * sm.height}%`}
                fill={sm.color}
                strokeWidth="0">
            </rect>;
        }))}

        <line key="xaxis" x1="0%" x2="100%" y1={chartHeight + "%"} y2={chartHeight + "%"} stroke={gridColor} />
        <line key="topb" x1="0%" x2="100%" y1="0%" y2="0%" stroke={gridColor} />
        {hours.map((hr, i) => <line key={`${i}_hr`} x1={hr.centerX + "%"} x2={hr.centerX + "%"} y1={chartHeight + "%"} y2={(chartHeight + tickHeight * 0.7) + "%"} stroke={gridColor} strokeWidth={(hr.hour % 2) == 0 ? 3 : 1} />)}

        {rainlines && <svg key="rpch" x="0" y="0" width="100%" height={chartHeight + "%"} viewBox="0 0 100 100" preserveAspectRatio="none">
            {rainlines.map((pt, i) => <path key={`k${i}`} stroke={pt.c} strokeWidth="0.3vw" fill="none" d={`M ${pt.xm1} ${pt.ym1} ${pt.x} ${pt.y} ${pt.xp1} ${pt.yp1}`} vectorEffect="non-scaling-stroke" />)}
        </svg>}

        {templines && <svg key="tpch" x="0" y="0" width="100%" height={chartHeight + "%"} viewBox="0 0 100 100" preserveAspectRatio="none">
            {templines.map((pt, i) => <path key={`tk${i}`} stroke="#000" strokeWidth="0.4vw" fill="none" d={`M ${pt.xm1} ${pt.ym1} ${pt.x} ${pt.y} ${pt.xp1} ${pt.yp1}`} vectorEffect="non-scaling-stroke" />)}
            {templines.map((pt, i) => <path key={`tk${i}`} stroke="#ddd" strokeWidth="0.15vw" fill="none" d={`M ${pt.xm1} ${pt.ym1} ${pt.x} ${pt.y} ${pt.xp1} ${pt.yp1}`} vectorEffect="non-scaling-stroke" />)}
        </svg>}
        {tempMinPt && <svg key="tmin" x={(tempMinPt.x - textHeight / 2) + "%"} y={((chartHeight / 100) * tempMinPt.y - textHeight) + "%"} width={textHeight + "%"} height={textHeight + "%"} viewBox="0 0 1 1">
            <text x="0.5" y="0.85" fontSize="1" fill="#fff" stroke="#000" strokeWidth="0.3vw" paintOrder="stroke" vectorEffect="non-scaling-stroke" textAnchor="middle" dominantBaseline="auto">{tempMinPt.tempC.toString()}</text>
        </svg>}
        {tempMaxPt && <svg key="tmax" x={(tempMaxPt.x - textHeight / 2) + "%"} y={((chartHeight / 100) * tempMaxPt.y) + "%"} width={textHeight + "%"} height={textHeight + "%"} viewBox="0 0 1 1">
            <text x="0.5" y="0" fontSize="1" fill="#fff" stroke="#000" strokeWidth="0.3vw" paintOrder="stroke" vectorEffect="non-scaling-stroke" textAnchor="middle" dominantBaseline="hanging">{tempMaxPt.tempC.toString()}</text>
        </svg>}

        <svg key="marker" x={(getX(Temporal.Now.instant()) - markerHeight / 2) + "%"} y={(chartHeight - markerHeight + tickHeight * 0.7 / 2) + "%"} width={markerHeight + "%"} height={markerHeight + "%"} viewBox="-0.1 -0.2 1.2 1.1">
            <path d="M 0 1 .5 0 1 1 z" fill="red" stroke="#000" strokeWidth="0.15" strokeLinejoin="miter" />
        </svg>
    </svg>;
}

export function RainCloudPanel(props: React.HTMLAttributes<HTMLDivElement>): React.ReactNode {
    const rb = useRainCloudBlock();
    const wdc = useWeatherDotComBlock();

    const startHour = 5;
    let from = zonedHere(Temporal.Now.plainDateISO().toPlainDateTime({ hour: startHour }));
    if (ns(Temporal.Now.instant()) < ns(from))
        from = from.subtract({ days: 1 });

    return <RainCloudDiv state={joinState(rb, wdc)} {...props}>
        <RainChart from={from.toInstant()} />
    </RainCloudDiv >;
}

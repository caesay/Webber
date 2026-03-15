import styled from "styled-components";
import { useWeatherBlock } from "../blocks/WeatherBlock";
import { useWeatherForecastBlock, WeatherForecastDayDto } from "../blocks/WeatherForecastBlock";
import { WeatherTypeIcon } from "./WeatherTypeIcon";
import { BlockPanelContainer } from "./Container";

const weekdays = [null, "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const ForecastDiv = styled(BlockPanelContainer)`
    display: flex;
`;
const ForecastDayDiv = styled.div`
    flex: 1;
    display: grid;
    border: 1px solid #444;
    justify-items: center;
    position: relative;
    &:last-child {
        margin-right: 0 !important;
    }
`;

const HeadingDiv = styled.div`
    font-size: 1.9vw;
`;

const WeatherIconDiv = styled.div`
    width: 100%;
    padding: 0 10%;
    position: relative;
`;
const WeatherIcon = styled(WeatherTypeIcon)`
    width: 100%;
    height: 6vw;
`;
const RainProbDiv = styled.div`
    position: absolute;
    left: 0; top: 0; right: 0; bottom: 0.2vw;
    display: grid;
    align-content: center;
    justify-content: center;
    font-size: 2.3vw;
    font-weight: bold;
`;

function temperatureClr(temp: number, mean: number | null, stdev: number | null): string {
    function blend1(c1: number, c2: number, pos: number) { return Math.round(c1 * pos + c2 * (1 - pos)); }
    function blend3(c1: number[], c2: number[], pos: number) { return [blend1(c1[0], c2[0], pos), blend1(c1[1], c2[1], pos), blend1(c1[2], c2[2], pos)]; }
    let color = [0xDF, 0x72, 0xFF]; // purple = can't color by deviation
    if (mean !== null && stdev !== null) {
        const coldest = [0x2F, 0x9E, 0xFF];
        const warmest = [0xFF, 0x5D, 0x2F];
        if (temp < mean - stdev)
            color = coldest;
        else if (temp > mean + stdev)
            color = warmest;
        else
            color = blend3(warmest, coldest, (temp - (mean - stdev)) / (2 * stdev));
    }
    function hex(c: number) {
        let r = c.toString(16);
        if (r.length == 1) r = "0" + r;
        return r;
    }
    return `#${hex(color[0])}${hex(color[1])}${hex(color[2])}`;
}

const WindDiv = styled.div`
    display: flex;
    height: 0.15vw;
    margin-bottom: 0.4vw;
    justify-content: center;
`;
const WindDash = styled.div`
    flex: 1;
    height: 0.15vw;
`;
function WindLine(p: { windMph: number }): React.ReactNode {
    const beaufort = [1, 3, 7, 12, 18, 24, 31, 38, 46, 54, 63, 73, 999]; // Beaufort Wind Scale; levels 11-12 only at sea; level 10 is "rare on land"
    const b = beaufort.findIndex(v => p.windMph <= v);
    const color = ["#333", "#555", "#666", "#777", "#ccc", "#ff0", "#ff6738", "#f00", "#f0f", "#f0f", "#f0f", "#f0f", "#f0f"][b];
    const width = [0, 15, 30, 40, 50, 60, 70, 80, 90, 90, 90, 90, 90][b] + "%";
    const gap = [15, 15, 15, 12, 10, 7, 6, 6, 5, 3, 0, 0, 0][b] + "%";
    return <WindDiv style={{ width, gap }}>
        {new Array(b).fill(0).map((_, i) => <WindDash key={i} style={{ background: color }} />)}
    </WindDiv>
}

function ForecastDay(p: { dto: WeatherForecastDayDto, mode: "today" | "big" | "small" }): React.ReactNode {
    const w = useWeatherBlock();

    const cellSize = 1.0; // flex size to vary by date
    const cellBack = p.dto.date.dayOfWeek >= 6 ? "#333" : "#181818";
    const cellBorder = p.dto.date.dayOfWeek >= 6 ? "#777" : "#444";
    const cellMargin = p.dto.date.dayOfWeek == 7 ? "2vw" : "0";
    const headingText = p.mode == "today" ? (p.dto.night ? "Night" : "Today") : weekdays[p.dto.date.dayOfWeek];
    const rainShowLimit = p.mode == "today" ? 15 : p.mode == "big" ? 20 : 999;
    const rainText = p.dto.rainProbability < rainShowLimit || p.dto.weatherKind == "sun" ? null : (p.dto.rainProbability / 10).toFixed(0);
    const windVal = Math.max(p.dto.windMph, p.dto.gustMph / 2);
    const wind = windVal > 27 ? 1 : windVal >= 18 ? 0.6 : 0;
    const tempColor = !w.dto ? "#fff" : p.dto.night
        ? temperatureClr(p.dto.tempMinC, w.dto.recentLowTempMean, w.dto.recentLowTempStdev)
        : temperatureClr(p.dto.tempMaxC, w.dto.recentHighTempMean, w.dto.recentHighTempStdev);

    return <ForecastDayDiv style={{ flex: cellSize, background: cellBack, marginRight: cellMargin, borderColor: cellBorder }}>
        <HeadingDiv>{headingText}</HeadingDiv>
        <WindLine windMph={windVal} />
        <WeatherIconDiv>
            <WeatherIcon kind={p.dto.weatherKind} night={p.dto.night} wind={wind} />
            {!!rainText && <RainProbDiv style={{ color: "#0000", WebkitTextStroke: "0.25vw #fff" }}>{rainText}</RainProbDiv>}
            {!!rainText && <RainProbDiv style={{ color: "#000" }}>{rainText}</RainProbDiv>}
        </WeatherIconDiv>
        <div style={{ color: tempColor }}>{p.dto.night ? p.dto.tempMinC : p.dto.tempMaxC}°</div>
    </ForecastDayDiv>;
}

export function WeatherForecastPanel(props: React.HTMLAttributes<HTMLDivElement>): React.ReactNode {
    const fc = useWeatherForecastBlock();
    if (!fc.dto)
        return <ForecastDiv state={fc} {...props} />;

    return <ForecastDiv state={fc} {...props}>
        <ForecastDay key="d1" dto={fc.dto.days[0]} mode="today" />
        {fc.dto.days.slice(1, 8).map(dto => <ForecastDay key={dto.date.toString()} dto={dto} mode="big" />)}
        {fc.dto.days.slice(8, 14).map(dto => <ForecastDay key={dto.date.toString()} dto={dto} mode="small" />)}
    </ForecastDiv>;
}

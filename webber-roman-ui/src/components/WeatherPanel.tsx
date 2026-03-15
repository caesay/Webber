import { faMoon, faSun } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import styled from "styled-components";
import { useWeatherBlock } from "../blocks/WeatherBlock";
import { timeHHmm, zonedHere } from "../util/util";
import { BlockPanelBorderedContainer } from "./Container";

const WeatherBoxDiv = styled(BlockPanelBorderedContainer)`
    display: grid;
    grid-template-rows: min-content min-content 1fr min-content;
`;

const RecentMinMaxDiv = styled.div`
    padding-left: 1.3vw;
    color: #777;
`;

export function WeatherPanel(props: React.HTMLAttributes<HTMLDivElement>): React.ReactNode {
    const weather = useWeatherBlock();
    if (!weather.dto)
        return <WeatherBoxDiv state={weather} {...props} />;
    function temp2str(temp: number): string {
        return (temp < 0 ? "−" : "") + Math.abs(temp).toFixed(0);
    }
    const sunsetDelta = weather.dto.sunsetUtc.until(weather.dto.sunset2Utc).total("minutes") - 1440;
    return <WeatherBoxDiv state={weather} {...props}>
        <div style={{ color: weather.dto.curTemperatureColor, fontSize: "280%", fontWeight: "bold", textAlign: "center", marginTop: "-1.7vw", marginBottom: "0.1vw" }}>{temp2str(weather.dto.curTemperature)} °C</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr repeat(4, min-content) 1fr" }}>
            <div></div>
            <div style={{ color: weather.dto.minTemperatureColor, textAlign: "right" }}>{temp2str(weather.dto.minTemperature)} °C</div>
            <RecentMinMaxDiv style={{ paddingRight: "1.3vw" }}>at</RecentMinMaxDiv>
            <div>{weather.dto.minTemperatureAtTime}</div>
            <RecentMinMaxDiv>{weather.dto.minTemperatureAtDay}</RecentMinMaxDiv>
            <div></div>

            <div></div>
            <div style={{ color: weather.dto.maxTemperatureColor, textAlign: "right" }}>{temp2str(weather.dto.maxTemperature)} °C</div>
            <RecentMinMaxDiv style={{ paddingRight: "1.3vw" }}>at</RecentMinMaxDiv>
            <div>{weather.dto.maxTemperatureAtTime}</div>
            <RecentMinMaxDiv>{weather.dto.maxTemperatureAtDay}</RecentMinMaxDiv>
            <div></div>
        </div>
        <div></div>
        <div style={{ display: "grid", gridTemplateColumns: "min-content 1fr min-content 1fr min-content", alignItems: "baseline" }}>
            <div><FontAwesomeIcon icon={faSun} color="#ff0" /> {timeHHmm(zonedHere(weather.dto.sunriseUtc))}</div>
            <div></div>
            <div><FontAwesomeIcon icon={faMoon} color="#4479ff" /> {timeHHmm(zonedHere(weather.dto.sunsetUtc))}</div>
            <div></div>
            <div style={{ fontSize: "80%", color: "#999" }}>{sunsetDelta > 0 ? "+" : "−"}{sunsetDelta.toFixed(1)}m</div>
        </div>
    </WeatherBoxDiv>
}

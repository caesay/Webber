import styled from "styled-components";
import { NavOverlay, useNavOverlayState } from "../components/NavOverlay";
import { MiniPingPanel } from "../components/PingPanel";
import { RainCloudPanel } from "../components/RainCloudPanel";
import { MiniRouterPanel } from "../components/RouterPanel";
import { WeatherForecastPanel } from "../components/WeatherForecastPanel";
import { WeatherPanel } from "../components/WeatherPanel";
import { useTime } from "../util/useTime";
import { timeHHmm, zonedHere } from "../util/util";

const ZonesClockDiv = styled.div`
    display: grid;
    grid-auto-flow: column;
    grid-template-rows: 1fr 1fr;
    justify-items: center;
`;
const ZoneName = styled.div`
    color: #777;
`;
const ZoneTime = styled.div`
`;

function ZonesClock(props: React.HTMLAttributes<HTMLDivElement>): React.ReactNode {
    const { time } = useTime();
    return <ZonesClockDiv {...props}>
        <ZoneName>Ukr</ZoneName><ZoneTime>{timeHHmm(time.withTimeZone("Europe/Kiev"))}</ZoneTime>
        <ZoneName style={{ fontWeight: "bold" }}>UTC</ZoneName><ZoneTime style={{ fontWeight: "bold" }}>{timeHHmm(time)}</ZoneTime>
        <ZoneName>Cal</ZoneName><ZoneTime>{timeHHmm(time.withTimeZone("America/Los_Angeles"))}</ZoneTime>
    </ZonesClockDiv>;
}

const MainClockDiv = styled.div`
    font-size: 350%;
    font-weight: bold;
    text-align: center;
`;

function MainClock(props: React.HTMLAttributes<HTMLDivElement>): React.ReactNode {
    const { time } = useTime();
    return <MainClockDiv {...props}>
        {timeHHmm(zonedHere(time))}
    </MainClockDiv>;
}

const DateClockDiv = styled.div`
    font-size: 160%;
    font-weight: bold;
    text-align: center;
`;

function DateClock(props: React.HTMLAttributes<HTMLDivElement>): React.ReactNode {
    const { time } = useTime();
    return <DateClockDiv {...props}>
        {time.toLocaleString("en-GB", { weekday: "short" })}, {time.toLocaleString("en-GB", { day: "numeric" })} {time.toLocaleString("en-US" /*for "Sep"*/, { month: "short" })}
    </DateClockDiv>
}

export function WeatherPage(): React.ReactNode {
    const overlay = useNavOverlayState();

    return (
        <>
            <WeatherPanel style={{ position: "absolute", top: "0vw", left: "0vw", width: "37vw", height: "26vw" }} />
            <MainClock style={{ position: "absolute", left: "38vw", top: "-5vh", width: "27vw" }} onClick={overlay.show} />
            <ZonesClock style={{ position: "absolute", left: "38vw", top: "18vh", width: "27vw" }} />
            <DateClock style={{ position: "absolute", left: "38vw", bottom: "55vh", width: "27vw" }} />
            <MiniPingPanel style={{ position: "absolute", top: "0vw", right: "0", width: "33vw", height: "18vh" }} />
            <MiniRouterPanel style={{ position: "absolute", top: "18vh", right: "0", width: "33vw", bottom: "55.8vh" }} />

            <WeatherForecastPanel style={{ position: "absolute", left: "0vw", top: "48.2vh", width: "100vw" }} />
            <RainCloudPanel style={{ position: "absolute", left: "0vw", top: "75vh", width: "100vw", height: "25vh" }} />

            <NavOverlay state={overlay} />
        </>
    );
}

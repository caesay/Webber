import styled from "styled-components";
import { useTime } from "../util/useTime";
import { timeHHmm } from "../util/util";
import { BlockPanelBorderedContainer, makeState } from "./Container";

const TimeBoxDiv = styled(BlockPanelBorderedContainer)`
    display: grid;
    grid-template-columns: 1fr min-content min-content 1fr;
`;

export function TimePanel(props: React.HTMLAttributes<HTMLDivElement>): React.ReactNode {
    const { time, updates } = useTime();
    return <TimeBoxDiv state={makeState({ updates })} {...props}>
        <div style={{ gridColumnEnd: "span 4", textAlign: "center", fontSize: "280%", fontWeight: "bold", marginTop: "-1.7vw", marginBottom: "0.8vw" }}>{timeHHmm(time)}</div>

        <div></div>
        <div style={{ color: "#777", marginRight: "1.5vw" }}>UTC</div>
        <div>{timeHHmm(time.withTimeZone("UTC"))}</div>
        <div></div>

        <div></div>
        <div style={{ color: "#777", marginRight: "1.5vw" }}>Cal</div>
        <div>{timeHHmm(time.withTimeZone("America/Los_Angeles"))}</div>
        <div></div>

        <div></div>
        <div style={{ color: "#777", marginRight: "1.5vw" }}>Ukr</div>
        <div>{timeHHmm(time.withTimeZone("Europe/Kiev"))}</div>
        <div></div>
    </TimeBoxDiv>
}

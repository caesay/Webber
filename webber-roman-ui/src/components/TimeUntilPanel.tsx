import { Fragment } from "react";
import styled from "styled-components";
import { useTimeUntilBlock } from "../blocks/TimeUntilBlock";
import { endOfLocalDay, localDay, ns, timeHHmm, zonedHere } from "../util/util";
import { BlockPanelContainer } from "./Container";

const CalContentDiv = styled.div`
    display: grid;
    grid-template-columns: min-content min-content;
    column-gap: 1rem;
    margin-right: -1.5vw;
    margin-bottom: -1.5vw;

    &::after {
        box-shadow: inset -3vw -3vw 2vw #000;
        position: absolute;
        content: "";
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
    }
`;

const SpanTime = styled.span`
`;
const SpanLeft = styled.span`
    margin-left: 0.5rem;
`;
const SpanDesc = styled.span`
`;

const TimeDiv = styled.div<{ $newGroup: boolean }>`
    ${p => p.$newGroup ? "margin-top: 0.4rem;" : ""}
`;

const DivMins = styled(TimeDiv)`
    & ${SpanLeft} {
        color: #d60e0e;
        font-weight: bold;
    }
    & ${SpanTime}, & ${SpanDesc} {
        color: #ff7979;
    }
`;
const DivHrs = styled(TimeDiv)`
    & ${SpanLeft} {
        color: #d26c23;
    }
    & ${SpanTime}, & ${SpanDesc} {
        color: #fff;
    }
`;
const DivTmrw = styled(TimeDiv)`
    & ${SpanLeft} {
        color: #2e80ff;
    }
    & ${SpanTime}, & ${SpanDesc} {
        color: #bbb;
        font-weight: 300;
    }
`;
const DivWeek = styled(TimeDiv)`
    & ${SpanLeft} {
        color: #888;
    }
    & ${SpanTime}, & ${SpanDesc} {
        color: #888;
        font-weight: 300;
    }
`;
const DivLong = styled(TimeDiv)`
    & ${SpanTime}, & ${SpanDesc} {
        color: #666;
        font-weight: 100;
    }
`;

export function TimeUntilPanel({ ...rest }: React.HTMLAttributes<HTMLDivElement>): React.ReactNode {
    const calendar = useTimeUntilBlock();
    const endOfToday = endOfLocalDay(Temporal.Now.instant());
    const endOfTomorrow = endOfToday.add({ days: 1 });

    let prevGroup = "";
    return <BlockPanelContainer state={calendar} {...rest}>
        {!!calendar.dto && <CalContentDiv>
            {[...calendar.dto.regularEvents].concat(calendar.dto.allDayEvents).sort((a, b) => Temporal.Instant.compare(a.startTimeUtc, b.startTimeUtc)).map(e => {
                const curGroup = ns(e.startTimeUtc) < ns(endOfToday) ? "today" : ns(e.startTimeUtc) < ns(endOfTomorrow) ? "tomorrow" : "rest";
                const newGroup = prevGroup != "" && prevGroup != curGroup;
                prevGroup = curGroup;

                const start = zonedHere(e.startTimeUtc);
                const left = Temporal.Now.instant().until(e.startTimeUtc);
                const totalHours = left.total("hours");
                const totalMinutes = left.total("minutes");
                if (totalMinutes < 60)
                    return <Fragment key={e.id}>
                        <DivMins $newGroup={newGroup}><SpanTime>{timeHHmm(start)}</SpanTime><SpanLeft>{`${Math.floor(totalMinutes).toFixed(0)}min`}</SpanLeft></DivMins>
                        <DivMins $newGroup={newGroup}><SpanDesc>{e.displayName}</SpanDesc></DivMins>
                    </Fragment>;
                if (ns(e.startTimeUtc) < ns(endOfToday))
                    return <Fragment key={e.id}>
                        <DivHrs $newGroup={newGroup}><SpanTime>{timeHHmm(start)}</SpanTime><SpanLeft>{`${totalHours.toFixed(1)}hr`}</SpanLeft></DivHrs>
                        <DivHrs $newGroup={newGroup}><SpanDesc>{e.displayName}</SpanDesc></DivHrs>
                    </Fragment>;
                if (ns(e.startTimeUtc) < ns(endOfTomorrow))
                    return <Fragment key={e.id}>
                        <DivTmrw $newGroup={newGroup}><SpanTime>{timeHHmm(start)}</SpanTime><SpanLeft>{`${totalHours.toFixed(1)}hr`}</SpanLeft></DivTmrw>
                        <DivTmrw $newGroup={newGroup}><SpanDesc>{e.displayName}</SpanDesc></DivTmrw>
                    </Fragment>;
                if (ns(e.startTimeUtc) < ns(endOfToday.add({ days: 7 })))
                    return <Fragment key={e.id}>
                        <DivWeek $newGroup={newGroup}><SpanTime>{timeHHmm(start)}</SpanTime><SpanLeft>{start.toLocaleString("en-GB", { weekday: "short" })}</SpanLeft></DivWeek>
                        <DivWeek $newGroup={newGroup}><SpanDesc>{e.displayName}</SpanDesc></DivWeek>
                    </Fragment>;
                return <Fragment key={e.id}>
                    <DivLong $newGroup={newGroup}><SpanTime>{`${localDay(Temporal.Now.instant()).until(localDay(e.startTimeUtc)).total("days")} days`}</SpanTime></DivLong>
                    <DivLong $newGroup={newGroup}><SpanDesc>{e.displayName}</SpanDesc></DivLong>
                </Fragment>;
            })}
        </CalContentDiv>}
    </BlockPanelContainer>
}

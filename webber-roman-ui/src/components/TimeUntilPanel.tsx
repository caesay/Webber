import { DateTime } from "luxon";
import { Fragment } from "react";
import styled from "styled-components";
import { useTimeUntilBlock } from "../blocks/TimeUntilBlock";
import { endOfLocalDay } from "../util/util";
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
    const endOfToday = endOfLocalDay(DateTime.utc(), true);
    const endOfTomorrow = endOfToday.plus({ days: 1 });

    let prevGroup = "";
    return <BlockPanelContainer state={calendar} {...rest}>
        {!!calendar.dto && <CalContentDiv>
            {[...calendar.dto.regularEvents].concat(calendar.dto.allDayEvents).sort((a, b) => a.startTimeUtc.toMillis() - b.startTimeUtc.toMillis()).map(e => {
                const curGroup = e.startTimeUtc < endOfToday ? "today" : e.startTimeUtc < endOfTomorrow ? "tomorrow" : "rest";
                const newGroup = prevGroup != "" && prevGroup != curGroup;
                prevGroup = curGroup;

                const start = e.startTimeUtc.toLocal();
                const left = start.diffNow();
                const totalHours = left.as("hours");
                const totalMinutes = left.as("minutes");
                const startHHmm = start.toFormat("HH:mm");
                if (totalMinutes < 60)
                    return <Fragment key={e.id}>
                        <DivMins $newGroup={newGroup}><SpanTime>{startHHmm}</SpanTime><SpanLeft>{`${Math.floor(totalMinutes).toFixed(0)}min`}</SpanLeft></DivMins>
                        <DivMins $newGroup={newGroup}><SpanDesc>{e.displayName}</SpanDesc></DivMins>
                    </Fragment>;
                if (start < endOfToday)
                    return <Fragment key={e.id}>
                        <DivHrs $newGroup={newGroup}><SpanTime>{startHHmm}</SpanTime><SpanLeft>{`${totalHours.toFixed(1)}hr`}</SpanLeft></DivHrs>
                        <DivHrs $newGroup={newGroup}><SpanDesc>{e.displayName}</SpanDesc></DivHrs>
                    </Fragment>;
                if (start < endOfToday.plus({ days: 1 }))
                    return <Fragment key={e.id}>
                        <DivTmrw $newGroup={newGroup}><SpanTime>{startHHmm}</SpanTime><SpanLeft>{`${totalHours.toFixed(1)}hr`}</SpanLeft></DivTmrw>
                        <DivTmrw $newGroup={newGroup}><SpanDesc>{e.displayName}</SpanDesc></DivTmrw>
                    </Fragment>;
                if (start < endOfToday.plus({ days: 7 }))
                    return <Fragment key={e.id}>
                        <DivWeek $newGroup={newGroup}><SpanTime>{startHHmm}</SpanTime><SpanLeft>{start.toFormat("ccc")}</SpanLeft></DivWeek>
                        <DivWeek $newGroup={newGroup}><SpanDesc>{e.displayName}</SpanDesc></DivWeek>
                    </Fragment>;
                return <Fragment key={e.id}>
                    <DivLong $newGroup={newGroup}><SpanTime>{`${endOfLocalDay(start, true).diff(endOfToday).as("days").toFixed(0)} days`}</SpanTime></DivLong>
                    <DivLong $newGroup={newGroup}><SpanDesc>{e.displayName}</SpanDesc></DivLong>
                </Fragment>;
            })}
        </CalContentDiv>}
    </BlockPanelContainer>
}

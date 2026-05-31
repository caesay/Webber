import { Config } from "../config";
import { makeContext } from "../util/makeContext";
import { BaseDto, useBlock } from "./_BlockBase";

export interface TimeUntilBlockDto extends BaseDto {
    regularEvents: RegularCalendarEvent[];
    allDayEvents: AllDayCalendarEvent[];
}

interface CalendarEventBase {
    id: string;
    displayName: string;
    startTimeUtc: string;
    endTimeUtc: string;
    hasStarted: boolean;
    isNextUp: boolean;
    isRecurring: boolean;
}

export interface RegularCalendarEvent extends CalendarEventBase {
    isAllDay: false;
    startTime: Temporal.Instant;
    endTime: Temporal.Instant;
}

export interface AllDayCalendarEvent extends CalendarEventBase {
    isAllDay: true;
    startDate: Temporal.PlainDate;
    endDate: Temporal.PlainDate;
}

export type CalendarEvent = RegularCalendarEvent | AllDayCalendarEvent;

function dtoPatcher(dto: TimeUntilBlockDto) {
    for (const e of dto.regularEvents) {
        e.isAllDay = false;
        e.startTime = Temporal.Instant.from(e.startTimeUtc);
        e.endTime = Temporal.Instant.from(e.endTimeUtc);
    }
    for (const e of dto.allDayEvents) {
        e.isAllDay = true;
        e.startDate = Temporal.PlainDate.from(e.startTimeUtc.replace("T00:00:00", ""));
        e.endDate = Temporal.PlainDate.from(e.endTimeUtc.replace("T00:00:00", ""));
    }
}

const ctx = makeContext(() => {
    const block = useBlock<TimeUntilBlockDto>(`${Config.ServerUrl}/hub/TimeUntilBlock`, dtoPatcher);
    return block;
});

export const useTimeUntilBlock = ctx.useFunc;
export const TimeUntilBlockProvider = ctx.provider;

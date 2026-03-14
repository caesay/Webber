import { DateTime } from "luxon";
import { Config } from "../config";
import { makeContext } from "../util/makeContext";
import { BaseDto, useBlock } from "./_BlockBase";

export interface TimeUntilBlockDto extends BaseDto {
    regularEvents: CalendarEvent[];
    allDayEvents: CalendarEvent[];
}

interface CalendarEvent {
    id: string;
    displayName: string;
    startTimeUtc: DateTime;
    hasStarted: boolean;
    isNextUp: boolean;
    isRecurring: boolean;
}

function dtoPatcher(dto: TimeUntilBlockDto) {
    for (let i = 0; i < dto.regularEvents.length; i++) {
        dto.regularEvents[i].startTimeUtc = DateTime.fromISO(dto.regularEvents[i].startTimeUtc as any);
    }
    for (let i = 0; i < dto.allDayEvents.length; i++) {
        dto.allDayEvents[i].startTimeUtc = DateTime.fromISO(dto.allDayEvents[i].startTimeUtc as any);
    }
}

const ctx = makeContext(() => {
    const block = useBlock<TimeUntilBlockDto>(`${Config.ServerUrl}/hub/TimeUntilBlock`, dtoPatcher);
    return block;
});

export const useTimeUntilBlock = ctx.useFunc;
export const TimeUntilBlockProvider = ctx.provider;

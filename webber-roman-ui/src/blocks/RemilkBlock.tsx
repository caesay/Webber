import { Config } from "../config";
import { makeContext } from "../util/makeContext";
import { BaseDto, useBlock } from "./_BlockBase";

export interface RemilkBlockDto extends BaseDto {
    tasks: RemilkTask[];
}

export interface RemilkTask {
    id: string;
    dueDate: Temporal.PlainDate | null;
    dueUtc: Temporal.Instant | null;
    priority: number;
    description: string;
    tags: string[];
}

function dtoPatcher(dto: RemilkBlockDto) {
    for (let i = 0; i < dto.tasks.length; i++) {
        const task = dto.tasks[i];
        if (task.dueDate)
            task.dueDate = Temporal.PlainDate.from(task.dueDate);
        if (task.dueUtc)
            task.dueUtc = Temporal.Instant.from(task.dueUtc);
    }
}

const ctx = makeContext(() => {
    const block = useBlock<RemilkBlockDto>(`${Config.ServerUrl}/hub/RemilkBlock`, dtoPatcher);
    return block;
});

export const useRemilkBlock = ctx.useFunc;
export const RemilkBlockProvider = ctx.provider;

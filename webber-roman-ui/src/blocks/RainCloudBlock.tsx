import { Config } from "../config";
import { makeContext } from "../util/makeContext";
import { BaseDto, useBlock } from "./_BlockBase";

export interface RainCloudBlockDto extends BaseDto {
    rain: RainCloudPtDto[];
    cloud: RainCloudPtDto[];
}

export interface RainCloudPtDto {
    atUtc: Temporal.Instant;
    counts: number[];
    isForecast: boolean;
}

function dtoPatcher(dto: RainCloudBlockDto) {
    for (let i = 0; i < dto.rain.length; i++) {
        dto.rain[i].atUtc = Temporal.Instant.from(dto.rain[i].atUtc);
    }
    for (let i = 0; i < dto.cloud.length; i++) {
        dto.cloud[i].atUtc = Temporal.Instant.from(dto.cloud[i].atUtc);
    }
}

const ctx = makeContext(() => {
    const block = useBlock<RainCloudBlockDto>(`${Config.ServerUrl}/hub/RainCloudBlock`, dtoPatcher);
    return block;
});

export const useRainCloudBlock = ctx.useFunc;
export const RainCloudBlockProvider = ctx.provider;

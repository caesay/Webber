import { Config } from "../config";
import { makeContext } from "../util/makeContext";
import { BaseDto, useBlock } from "./_BlockBase";

export interface WeatherBlockDto extends BaseDto {
    curTemperature: number;
    curTemperatureColor: string;
    minTemperature: number;
    minTemperatureColor: string;
    minTemperatureAtTime: string;
    minTemperatureAtDay: string;
    maxTemperature: number;
    maxTemperatureColor: string;
    maxTemperatureAtTime: string;
    maxTemperatureAtDay: string;
    sunriseUtc: Temporal.Instant;
    sunsetUtc: Temporal.Instant;
    sunrise2Utc: Temporal.Instant;
    sunset2Utc: Temporal.Instant;

    recentHighTempMean: number | null;
    recentHighTempStdev: number | null;
    recentLowTempMean: number | null;
    recentLowTempStdev: number | null;
}

function dtoPatcher(dto: WeatherBlockDto) {
    dto.sunriseUtc = Temporal.Instant.from(dto.sunriseUtc);
    dto.sunsetUtc = Temporal.Instant.from(dto.sunsetUtc);
    dto.sunrise2Utc = Temporal.Instant.from(dto.sunrise2Utc);
    dto.sunset2Utc = Temporal.Instant.from(dto.sunset2Utc);
}

const ctx = makeContext(() => {
    const block = useBlock<WeatherBlockDto>(`${Config.ServerUrl}/hub/WeatherBlock`, dtoPatcher);
    return block;
});

export const useWeatherBlock = ctx.useFunc;
export const WeatherBlockProvider = ctx.provider;

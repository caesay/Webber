import { Config } from "../config";
import { makeContext } from "../util/makeContext";
import { BaseDto, useBlock } from "./_BlockBase";

export interface WeatherDotComBlockDto extends BaseDto {
    hours: WeatherDotComForecastHourDto[];
}

export interface WeatherDotComForecastHourDto {
    dateTime: Temporal.Instant; // utc
    cloudCover: number;
    precipChance: number;
    precipMm: number;
    tempC: number;
    tempCColor?: string;
}

function dtoPatcher(dto: WeatherDotComBlockDto) {
    for (let k = 0; k < dto.hours.length; k++) {
        dto.hours[k].dateTime = Temporal.Instant.from(dto.hours[k].dateTime);
    }
}

const ctx = makeContext(() => {
    const block = useBlock<WeatherDotComBlockDto>(`${Config.ServerUrl}/hub/WeatherDotComBlock`, dtoPatcher);
    return block;
});

export const useWeatherDotComBlock = ctx.useFunc;
export const WeatherDotComBlockProvider = ctx.provider;

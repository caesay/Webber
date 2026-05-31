import { Config } from "../config";
import { makeContext } from "../util/makeContext";
import { BaseDto, useBlock } from "./_BlockBase";

export interface WeatherForecastBlockDto extends BaseDto {
    days: WeatherForecastDayDto[];
    hours: WeatherForecastHourDto[];
}

export interface WeatherForecastDayDto {
    date: Temporal.PlainDate; // local date
    tempMinC: number;
    tempMaxC: number;
    rainProbability: number;
    windMph: number;
    gustMph: number;
    weatherKind: WeatherForecastKindDte;
    night: boolean;
}

export interface WeatherForecastHourDto {
    dateTime: Temporal.PlainDateTime; // local date/time, which means can have duplicates or missing hours during DST changes
    rainProbability: number;
}

export type WeatherForecastKindDte =
    "sun" |
    "sunIntervals" |
    "cloudLight" |
    "cloudThick" |
    "drizzle" |
    "rainLightSun" |
    "rainLight" |
    "rainHeavySun" |
    "rainHeavy" |
    "snowRainSun" |
    "snowRain" |
    "snowLightSun" |
    "snowLight" |
    "snowHeavySun" |
    "snowHeavy" |
    "hailSun" |
    "hail" |
    "thunderstormSun" |
    "thunderstorm" |
    "mist" |
    "fog" |
    "haze" |
    "sandstorm" |
    "tropicalStorm";

function dtoPatcher(dto: WeatherForecastBlockDto) {
    for (let i = 0; i < dto.days.length; i++) {
        dto.days[i].date = Temporal.PlainDate.from(dto.days[i].date);
    }
    for (let k = 0; k < dto.hours.length; k++) {
        dto.hours[k].dateTime = Temporal.PlainDateTime.from(dto.hours[k].dateTime);
    }
}

const ctx = makeContext(() => {
    const block = useBlock<WeatherForecastBlockDto>(`${Config.ServerUrl}/hub/WeatherForecastBlock`, dtoPatcher);
    return block;
});

export const useWeatherForecastBlock = ctx.useFunc;
export const WeatherForecastBlockProvider = ctx.provider;

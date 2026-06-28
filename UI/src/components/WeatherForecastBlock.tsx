import React, { useMemo } from 'react';
import styled from 'styled-components';
import { type BaseDto } from './util';
import { useBlock } from './DashboardProvider';
import { DateTime } from 'luxon';

interface WeatherForecastHourDto {
    dateTime: string;
    rainProbability: number;
}

interface WeatherForecastBlockDto extends BaseDto {
    hours: WeatherForecastHourDto[];
}

const ForecastContianer = styled.div`
    position: relative;
    width: 576px;
    height: 80px;
    overflow: hidden;
`;

const RainBar = styled.div`
    position: absolute;
    bottom: 0px;
    width: 22px;
    background-color: rgb(30, 53, 89);
    border-top: 2px solid #8AB4F8;
`;

const TimeText = styled.div`
    position: absolute;
    text-align: center;
    width: 72px;
    bottom: 12px;
    font-size: 16px;
`;

const PercipText = styled.div`
    position: absolute;
    text-align: center;
    width: 72px;
    top: 12px;
    font-size: 16px;
    margin-left: 2px;
`;

const NowTime = styled.div`
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    border-radius: 3px;
    background-color: red;
`;

const TopBar = styled.div`
    position: absolute;
    top: 0;
    left: 0;
    width: 574px;
    border-top: 2px dotted #ffffff27;
`;

const TIME_INDICES = [1, 4, 7, 10, 13, 16, 19, 22] as const;

const WeatherForecastBlock: React.FunctionComponent = () => {
    const { data } = useBlock<WeatherForecastBlockDto>("WeatherForecastBlock");

    const processedData = useMemo(() => {
        if (!data) return null;

        let allhours = data.hours;
        const hourms = 3600000; // 1 hour in ms

        const firstInRange = allhours.findIndex(v => DateTime.fromISO(v.dateTime).diff(DateTime.now()).as('milliseconds') >= -hourms * 6);
        if (firstInRange > 0)
            allhours = allhours.slice(firstInRange);

        const t4hours = allhours.slice(0, 24);

        if (!allhours || !t4hours || t4hours.length < 8) {
            return null;
        }

        const getPercip = (i: number) => {
            let prob = Math.max(t4hours[i].rainProbability, t4hours[i - 1].rainProbability, t4hours[i + 1].rainProbability);
            return prob.toString() + "%";
        };

        const start = DateTime.fromISO(t4hours[0].dateTime).toMillis();
        const now = DateTime.now().toMillis() - start;
        const end = DateTime.fromISO(t4hours[23].dateTime).plus({ hours: 1 }).toMillis() - start;

        const maxWidth = 576;
        const nowPosition = (now / end) * maxWidth;

        const timeLabels = TIME_INDICES.map(i => DateTime.fromISO(t4hours[i].dateTime).toFormat("HH:mm"));
        const percipLabels = TIME_INDICES.map(i => getPercip(i));

        return { t4hours, nowPosition, timeLabels, percipLabels };
    }, [data]);

    if (!processedData) return !data ? null : <div>Insufficient data</div>;

    const { t4hours, nowPosition, timeLabels, percipLabels } = processedData;

    return (
        <ForecastContianer>
            <TopBar />
            {t4hours.map((e, i) => (<RainBar key={i} style={{ left: i * 24, height: 78 * (e.rainProbability / 100) }} />))}
            <NowTime style={{ left: nowPosition - 2 }} />
            {TIME_INDICES.map((_, i) => (
                <TimeText key={i} style={{ left: 72 * i }}>{timeLabels[i]}</TimeText>
            ))}
            {TIME_INDICES.map((_, i) => (
                <PercipText key={i} style={{ left: 72 * i }}>{percipLabels[i]}</PercipText>
            ))}
        </ForecastContianer>
    );
}

export default WeatherForecastBlock;

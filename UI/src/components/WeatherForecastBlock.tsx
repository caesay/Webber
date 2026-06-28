import * as _ from 'lodash';
import * as React from 'react';
import styled from 'styled-components';
import { withSubscription, BaseDto } from './util';
import moment from 'moment';

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
`

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

const WeatherForecastBlock: React.FunctionComponent<{ data: WeatherForecastBlockDto }> = ({ data }) => {
    var allhours = data.hours;

    const hourms = 3600000; // 1 hour in ms

    const firstInRange = _.findIndex(allhours, v => moment(v.dateTime).diff(moment()) >= -hourms * 6);
    if (firstInRange > 0)
        allhours = _.drop(allhours, firstInRange);

    var t4hours = _.take(allhours, 24);

    if (!allhours || !t4hours || t4hours.length < 8) {
        return (<div>Insufficient data</div>);
    }

    const getPercip = (i: number) => {
        let prob = Math.max(t4hours[i].rainProbability, t4hours[i - 1].rainProbability, t4hours[i + 1].rainProbability);
        return prob.toString() + "%";
    }

    const start = moment(t4hours[0].dateTime).valueOf();
    let now = moment().valueOf() - start;
    let end = moment(t4hours[23].dateTime).add(1, "hour").valueOf() - start;

    const maxWidth = 576;
    const nowPosition = (now / end) * maxWidth;

    return (
        <ForecastContianer>
            <TopBar />
            {_.map(t4hours, (e, i) => (<RainBar key={i} style={{ left: i * 24, height: 78 * (e.rainProbability / 100) }} />))}
            <NowTime style={{ left: nowPosition - 2 }} />
            <TimeText style={{ left: 72 * 0 }}>{moment(t4hours[1].dateTime).format("HH:mm")}</TimeText>
            <TimeText style={{ left: 72 * 1 }}>{moment(t4hours[4].dateTime).format("HH:mm")}</TimeText>
            <TimeText style={{ left: 72 * 2 }}>{moment(t4hours[7].dateTime).format("HH:mm")}</TimeText>
            <TimeText style={{ left: 72 * 3 }}>{moment(t4hours[10].dateTime).format("HH:mm")}</TimeText>
            <TimeText style={{ left: 72 * 4 }}>{moment(t4hours[13].dateTime).format("HH:mm")}</TimeText>
            <TimeText style={{ left: 72 * 5 }}>{moment(t4hours[16].dateTime).format("HH:mm")}</TimeText>
            <TimeText style={{ left: 72 * 6 }}>{moment(t4hours[19].dateTime).format("HH:mm")}</TimeText>
            <TimeText style={{ left: 72 * 7 }}>{moment(t4hours[22].dateTime).format("HH:mm")}</TimeText>
            <PercipText style={{ left: 72 * 0 }}>{getPercip(1)}</PercipText>
            <PercipText style={{ left: 72 * 1 }}>{getPercip(4)}</PercipText>
            <PercipText style={{ left: 72 * 2 }}>{getPercip(7)}</PercipText>
            <PercipText style={{ left: 72 * 3 }}>{getPercip(10)}</PercipText>
            <PercipText style={{ left: 72 * 4 }}>{getPercip(13)}</PercipText>
            <PercipText style={{ left: 72 * 5 }}>{getPercip(16)}</PercipText>
            <PercipText style={{ left: 72 * 6 }}>{getPercip(19)}</PercipText>
            <PercipText style={{ left: 72 * 7 }}>{getPercip(22)}</PercipText>
        </ForecastContianer>
    );
}

export default withSubscription(WeatherForecastBlock, "WeatherForecastBlock");
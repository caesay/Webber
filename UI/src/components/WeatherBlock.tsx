import * as React from 'react';
import { withSubscription, BaseDto, isTimeBetween } from './util';
import styled from "styled-components";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCloud, faMoon, faSun, faSunPlantWilt } from '@fortawesome/free-solid-svg-icons'
import moment from 'moment';

interface WeatherBlockDto extends BaseDto {
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
    sunriseTime: string;
    solarNoonTime: string;
    sunsetTime: string;
    sunsetDeltaTime: string;
}

const CurrentWeatherLabel = styled.div`
    height: 70px;
    line-height: 70px;
    font-weight: bold;
    font-size: 70px;
    opacity: 0.9;
`;

const SunriseContainer = styled.div`
    margin-top: -3px;
    margin-bottom: 5px;
    height: 24px;
    line-height: 24px;
    font-weight: bold;
    font-size: 24px;
`;

const SunsetDimmer = styled.div`
    position: fixed;
    left: 0;
    right: 0;
    top: 0;
    z-index: 1000;
    bottom: 0;
    background-color: rgba(0,0,0,0.4);
`

const WeatherBlock: React.FunctionComponent<{ data: WeatherBlockDto }> = ({ data }) => {
    const sunriseTime = moment.utc(data.sunriseTime, "HH:mm").utcOffset(data.localOffsetHours).format("HH:mm");
    const sunsetTime = moment.utc(data.sunsetTime, "HH:mm").utcOffset(data.localOffsetHours).format("HH:mm");
    const shouldDim = !isTimeBetween(moment(), sunriseTime, sunsetTime);

    return (
        <React.Fragment>
            <FontAwesomeIcon icon={faCloud} style={{ fontSize: 40, marginBottom: 18, color: "#548BAB" }} />
            <SunriseContainer>
                <FontAwesomeIcon icon={faSun} style={{ paddingRight: 10, color: "#EDBF24" }} />
                <span>{sunriseTime}</span>
                <FontAwesomeIcon icon={faMoon} style={{ paddingLeft: 20, paddingRight: 10, fontSize: 30, color: "#548BAB" }} />
                <span>{sunsetTime}</span>
            </SunriseContainer>
            <CurrentWeatherLabel style={{ color: data.curTemperatureColor }}>{data.curTemperature.toFixed(1)}°C</CurrentWeatherLabel>
            {shouldDim && <SunsetDimmer />}
        </React.Fragment>
    );
}

export default withSubscription(WeatherBlock, "WeatherBlock");
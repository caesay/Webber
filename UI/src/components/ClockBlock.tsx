import * as _ from 'lodash';
import * as React from 'react';
import styled from 'styled-components';
import { withSubscription, BaseDto } from './util';
import moment from 'moment';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMoon, faClock } from '@fortawesome/free-solid-svg-icons';

const DateLabel = styled.div`
    height: 24px;
    line-height: 24px;
    font-weight: bold;
    font-size: 24px;
    opacity: 1;
`;

const Time = styled.div`
    height: 70px;
    line-height: 70px;
    font-weight: bold;
    font-size: 70px;
    opacity: 0.9;
`;

const SecondaryTime = styled(Time)`
    height: 17px;
    margin-top: 6px;
    line-height: 17px;
    font-weight: bold;
    font-size: 17px;
    opacity: 0.7;
`;

interface TimeZone {
    displayName: string;
    offsetHours: number;
}

interface ClockBlockDto extends BaseDto {
    timeZones: TimeZone[];
}

const ClockBlock: React.FunctionComponent<{ data: ClockBlockDto }> = ({ data }) => {

    const [time, setTime] = React.useState(moment.utc().valueOf());

    React.useEffect(() => {
        const interval = setInterval(() => { setTime(moment.utc().valueOf()); }, 1000);
        return () => clearInterval(interval);
    });

    function getTimeString(offset: number): string {
        return moment(time).utcOffset(offset).format("HH:mm");
    }

    const firstTwoTz = _.take(data.timeZones, 2);
    const restTz = _.drop(data.timeZones, 2);

    return (
        <React.Fragment>
            <FontAwesomeIcon icon={faClock} style={{ fontSize: 40, marginBottom: 20, color: "#548BAB" }} />
            <DateLabel>{moment(time).format("dddd").substring(0, 3).toUpperCase() + ", " + moment(time).format("DD MMM").toUpperCase()}</DateLabel>
            <Time>{getTimeString(data.localOffsetHours)}</Time>
            {_.map(firstTwoTz, t => (
                <React.Fragment key={t.displayName}>
                    <SecondaryTime>{getTimeString(t.offsetHours)} &nbsp; {t.displayName}</SecondaryTime>
                </React.Fragment>
            ))}
            <div style={{ position: "relative", left: 280, top: -48 }}>
                {_.map(restTz, t => (
                    <React.Fragment key={t.displayName}>
                        <SecondaryTime>{getTimeString(t.offsetHours)} &nbsp; {t.displayName}</SecondaryTime>
                    </React.Fragment>
                ))}
            </div>
        </React.Fragment>
    );
}

export default withSubscription(ClockBlock, "TimeBlock");
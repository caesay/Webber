import * as React from 'react';
import styled from 'styled-components';
import { withSubscription, type BaseDto } from './util';
import { DateTime } from 'luxon';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClock } from '@fortawesome/free-solid-svg-icons';

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

    const [time, setTime] = React.useState(DateTime.utc().toMillis());

    React.useEffect(() => {
        const interval = setInterval(() => { setTime(DateTime.utc().toMillis()); }, 1000);
        return () => clearInterval(interval);
    });

    function getTimeString(offset: number): string {
        return DateTime.fromMillis(time).setZone(`UTC${offset >= 0 ? '+' : ''}${offset}`).toFormat("HH:mm");
    }

    const firstTwoTz = data.timeZones.slice(0, 2);
    const restTz = data.timeZones.slice(2);

    return (
        <React.Fragment>
            <FontAwesomeIcon icon={faClock} style={{ fontSize: 40, marginBottom: 20, marginLeft: -5, color: "#548BAB" }} />
            <DateLabel>{DateTime.fromMillis(time).toFormat("cccc").substring(0, 3).toUpperCase() + ", " + DateTime.fromMillis(time).toFormat("dd MMM").toUpperCase()}</DateLabel>
            <Time>{getTimeString(data.localOffsetHours)}</Time>
            {firstTwoTz.map(t => (
                <React.Fragment key={t.displayName}>
                    <SecondaryTime>{getTimeString(t.offsetHours)} &nbsp; {t.displayName}</SecondaryTime>
                </React.Fragment>
            ))}
            <div style={{ position: "relative", left: 280, top: -48 }}>
                {restTz.map(t => (
                    <React.Fragment key={t.displayName}>
                        <SecondaryTime>{getTimeString(t.offsetHours)} &nbsp; {t.displayName}</SecondaryTime>
                    </React.Fragment>
                ))}
            </div>
        </React.Fragment>
    );
}

export default withSubscription(ClockBlock, "TimeBlock");

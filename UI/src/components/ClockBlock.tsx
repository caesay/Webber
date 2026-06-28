import * as React from 'react';
import styled from 'styled-components';
import { type BaseDto } from './util';
import { useBlock, useConnectionState } from './DashboardProvider';
import { DateTime } from 'luxon';
import { faClock } from '@fortawesome/free-solid-svg-icons';
import BlockIcon from './BlockIcon';

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

const ClockBlock: React.FunctionComponent = () => {
    const { data, error } = useBlock<ClockBlockDto>("TimeBlock");
    const connState = useConnectionState();
    const connectionDown = connState.isReconnecting || connState.message !== null;

    const [time, setTime] = React.useState(DateTime.utc().toMillis());

    React.useEffect(() => {
        const interval = setInterval(() => { setTime(DateTime.utc().toMillis()); }, 1000);
        return () => clearInterval(interval);
    }, []);

    if (!data) return null;

    function getTimeString(offset: number): string {
        return DateTime.fromMillis(time).setZone(`UTC${offset >= 0 ? '+' : ''}${offset}`).toFormat("HH:mm");
    }

    const firstTwoTz = data.timeZones.slice(0, 2);
    const restTz = data.timeZones.slice(2);

    return (
        <React.Fragment>
            <div style={{ marginBottom: 20, marginLeft: -5 }}>
                <BlockIcon icon={faClock} blockName="Clock" error={error} connectionDown={connectionDown} />
            </div>
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

export default ClockBlock;

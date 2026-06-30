import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { type BaseDto, isTimeBetween } from './util';
import { useBlock, useConnectionState } from './DashboardProvider';
import { TextFit } from './TextFit';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCalendarDays, faCalendarWeek, faCaretRight } from '@fortawesome/free-solid-svg-icons'
import BlockIcon from './BlockIcon';
import { DateTime } from 'luxon';

function formatRelative(dt: DateTime, withWrapper: boolean = true): string {
    const diff = dt.diff(DateTime.now(), ['days', 'hours', 'minutes', 'seconds']);
    const totalSeconds = diff.as('seconds');
    if (Math.abs(totalSeconds) < 60) return 'NOW';
    const absDays = Math.abs(diff.days);
    const absHours = Math.abs(diff.hours);
    const absMinutes = Math.abs(diff.minutes);
    if (!withWrapper) {
        if (absDays > 0) return absDays + 'd';
        if (absHours > 0) return absHours + 'h';
        return absMinutes + 'm';
    }
    if (absDays > 0) return (totalSeconds < 0 ? '' : 'in ') + absDays + 'd' + (totalSeconds < 0 ? ' ago' : '');
    if (absHours > 0) return (totalSeconds < 0 ? '' : 'in ') + absHours + 'h' + (totalSeconds < 0 ? ' ago' : '');
    return (totalSeconds < 0 ? '' : 'in ') + absMinutes + 'm' + (totalSeconds < 0 ? ' ago' : '');
}

interface CalendarEvent {
    displayName: string;
    startTimeUtc: string;
    endTimeUtc: string;
    hasStarted: boolean;
    isNextUp: boolean;
    isAllDay: boolean;
    specialEvent: boolean;
    color?: string;
}

interface TimeUntilBlockDto extends BaseDto {
    regularEvents: CalendarEvent[];
    allDayEvents: CalendarEvent[];
}

function getTimeString(e: CalendarEvent, alt: boolean) {

    const dstart = DateTime.fromISO(e.startTimeUtc);
    const dend = DateTime.fromISO(e.endTimeUtc);
    const secondsUntil = dstart.diff(DateTime.now()).as('seconds');

    let momentStr = e.hasStarted
        ? formatRelative(dstart, true)
        : formatRelative(dstart, e.isNextUp);

    if (secondsUntil > 0 && secondsUntil < 60) {
        momentStr = "in " + secondsUntil.toFixed(0).toString();
    }
    else if (secondsUntil <= 0 && secondsUntil > -90) {
        momentStr = "NOW";
    }

    let color = "white";

    let opacity = 0.6;
    if (e.hasStarted) opacity = 0.4;
    if (e.isNextUp) {
        opacity = 1;
        if (alt) {
            color = "yellow";
        }
    }

    if (e.isAllDay) {
        opacity = 0.6;
        if (secondsUntil < 86400) { // less than 1 day until event
            color = "orange";
            opacity = 0.8;
        }
        if (secondsUntil < 345600) { // less than 4 days until event
            momentStr = dstart.toFormat("ccc").toUpperCase();
            const diff = dend.diff(dstart).as('milliseconds');
            if (diff > 90000000) { // event is longer than 25 hours
                momentStr += "~" + dend.toFormat("ccc").toUpperCase();
            }
        }
    }

    if (e.specialEvent) {
        color = "#88B2F5";
        opacity = 1.0;
    }

    const colorDot = e.color ? (
        <span style={{ flexShrink: 0, width: 6, height: 16, borderRadius: 3, backgroundColor: e.color, position: "relative", top: 1 }} />
    ) : null;

    const wrapLen = e.color ? 45 : 50;
    let displayText = momentStr + " - " + e.displayName;

    if (displayText.length > wrapLen) {
        var breakpt = displayText.lastIndexOf(" ", wrapLen);
        var str1 = displayText.substring(0, breakpt);
        var str2 = displayText.substring(breakpt);
        if (str2.length > str1.length) {
            str2 = str2.substring(0, str1.length - 3) + "...";
        }
        return (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color, lineHeight: "16px" }}>{colorDot}<span style={{ opacity }}>{str1}<br />{str2}</span></div>
        );
    }

    return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color }}>{colorDot}<span style={{ opacity }}>{momentStr} - {e.displayName}</span></span>
    );
}

var audioSoon = new Audio('/soon.wav');
var audioNow = new Audio('/now.mp3');

const TimeUntilBlock: React.FunctionComponent = () => {
    const { data, error } = useBlock<TimeUntilBlockDto>("TimeUntilBlock");
    const connState = useConnectionState();
    const connectionDown = connState.isReconnecting || connState.message !== null;
    const warnRef = useRef<string>(null);
    const nowRef = useRef<string>(null);
    const [_until, setUntil] = useState<number>();
    const [alt, setAlt] = useState<boolean>(false);

    useEffect(() => {
        if (!data) return;
        const id = setInterval(() => {
            const nowTime = DateTime.now();
            const nextIdx = data.regularEvents.findIndex(e => e.isNextUp);
            if (nextIdx >= 0) {
                const evt = data.regularEvents[nextIdx];

                const secondsUntil = Math.round(DateTime.fromISO(evt.startTimeUtc).diff(nowTime).as('seconds'));

                // force re-render each tick when approaching event start time and alternate caret color
                if (secondsUntil <= 180 && secondsUntil >= -120) {
                    setUntil(secondsUntil);
                    setAlt(secondsUntil < 60 && secondsUntil > -30 ? (secondsUntil % 2) == 0 : false);
                }

                // play warning 3 minutes before meeting
                if (secondsUntil > 30 && secondsUntil < 180 && warnRef.current != evt.displayName) {
                    warnRef.current = evt.displayName;
                    if (isTimeBetween(nowTime, "8:00", "18:00")) {
                        audioSoon.play();
                    }
                }

                // play second warning 30 seconds before meeting
                else if (secondsUntil <= 30 && nowRef.current != evt.displayName) {
                    nowRef.current = evt.displayName;
                    if (isTimeBetween(nowTime, "8:00", "18:00")) {
                        audioNow.play();
                    }
                }
            }
        }, 1000);
        return () => clearInterval(id);
    }, [data]);

    if (!data) return null;

    return (
        <React.Fragment>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0 }}>
                <div style={{ marginBottom: 20, marginLeft: -7 }}>
                    <BlockIcon icon={faCalendarWeek} blockName="Calendar" error={error} connectionDown={connectionDown} />
                </div>
                {data.allDayEvents.map((e, i) => (
                    <div key={i} style={{ position: "absolute", width: 400, top: i * 34 + 59, height: 24, lineHeight: "24px", overflow: "visible" }}>
                        <TextFit mode="single" max={24}>{getTimeString(e, alt!)}</TextFit>
                    </div>
                ))}
            </div>
            <div style={{ position: "absolute", left: 420, top: 0, bottom: 0 }}>
                <div style={{ marginBottom: 20, marginLeft: 39 }}>
                    <BlockIcon icon={faCalendarDays} blockName="Calendar" error={error} connectionDown={connectionDown} />
                </div>
                {data.regularEvents.map((e, i) => (
                    <div key={i} style={{ position: "absolute", left: 46, width: 400, top: i * 34 + 59, height: 24, lineHeight: "24px", overflow: "visible" }}>
                        {e.isNextUp && <FontAwesomeIcon icon={faCaretRight} style={{ color: alt ? "yellow" : "red", fontSize: 60, position: "absolute", left: -60, top: -13, width: 60, textAlign: "center" }} />}
                        <TextFit mode="single" max={24}>{getTimeString(e, alt!)}</TextFit>
                    </div>
                ))}
            </div>
        </React.Fragment>
    );
}

export default TimeUntilBlock;

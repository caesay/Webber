import * as _ from 'lodash';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { withSubscription, BaseDto, isTimeBetween } from './util';
import { Textfit } from 'react-textfit';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCalendarAlt, faCalendarDay, faCalendarDays, faCalendarWeek, faCaretRight } from '@fortawesome/free-solid-svg-icons'
import moment from 'moment';

moment.locale('en', {
    relativeTime: {
        future: 'in %s',
        past: '%s ago',
        s: 'NOW',
        ss: 'NOW',
        m: '%dm',
        mm: '%dm',
        h: '%dh',
        hh: '%dh',
        d: '%dd',
        dd: '%dd',
        M: '%dM',
        MM: '%dM',
        y: '%dY',
        yy: '%dY'
    }
});

interface CalendarEvent {
    displayName: string;
    startTimeUtc: string;
    endTimeUtc: string;
    hasStarted: boolean;
    isNextUp: boolean;
    isAllDay: boolean;
    specialEvent: boolean;
}

interface TimeUntilBlockDto extends BaseDto {
    regularEvents: CalendarEvent[];
    allDayEvents: CalendarEvent[];
}

function getTimeString(e: CalendarEvent, alt: boolean) {

    const dstart = moment(e.startTimeUtc);
    const dend = moment(e.endTimeUtc);
    const secondsUntil = dstart.diff(moment()) / 1000;

    let momentStr = e.hasStarted
        ? dstart.fromNow(false)
        : dstart.fromNow(!e.isNextUp);

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
            momentStr = dstart.format("dddd").substring(0, 3).toUpperCase();
            const diff = dend.diff(dstart);
            if (diff > 90000000) { // event is longer than 25 hours
                momentStr += "~" + dend.format("dddd").substring(0, 3).toUpperCase();
            }
        }
    }

    if (e.specialEvent) {
        color = "#88B2F5";
        opacity = 1.0;
    }

    const wrapLen = 50;
    let displayText = momentStr + " - " + e.displayName;

    if (displayText.length > wrapLen) {
        var breakpt = displayText.lastIndexOf(" ", wrapLen);
        var str1 = displayText.substring(0, breakpt);
        var str2 = displayText.substring(breakpt);
        if (str2.length > str1.length) {
            str2 = str2.substring(0, str1.length - 3) + "...";
        }
        return (
            <div style={{ opacity, color, lineHeight: "16px" }}>{str1}<br />{str2}</div>
        );
    }

    return (
        <span style={{ opacity, color }}>{momentStr} - {e.displayName}</span>
    );
}

var audioSoon = new Audio('/soon.wav');
var audioNow = new Audio('/now.mp3');

const TimeUntilBlock: React.FunctionComponent<{ data: TimeUntilBlockDto }> = ({ data }) => {
    const [warn, setWarn] = useState<string>();
    const [now, setNow] = useState<string>();
    const [until, setUntil] = useState<number>();
    const [alt, setAlt] = useState<boolean>();

    useEffect(() => {
        const id = setInterval(() => {
            const nowTime = moment();
            const nextIdx = data.regularEvents.findIndex(e => e.isNextUp);
            if (nextIdx >= 0) {
                const evt = data.regularEvents[nextIdx];

                const secondsUntil = Math.round(moment(evt.startTimeUtc).diff(nowTime) / 1000);

                // force re-render each tick when approaching event start time and alternate caret color
                if (secondsUntil <= 180 && secondsUntil >= -120) {
                    setUntil(secondsUntil);
                    setAlt(secondsUntil < 60 && secondsUntil > -30 ? (secondsUntil % 2) == 0 : false);
                }

                // play warning 3 minutes before meeting
                if (secondsUntil > 30 && secondsUntil < 180 && warn != evt.displayName) {
                    setWarn(evt.displayName);
                    if (isTimeBetween(nowTime, "8:00", "18:00")) {
                        audioSoon.play();
                    }
                }

                // play second warning 30 seconds before meeting
                else if (secondsUntil <= 30 && now != evt.displayName) {
                    setNow(evt.displayName);
                    if (isTimeBetween(nowTime, "8:00", "18:00")) {
                        audioNow.play();
                    }
                }
            }
        }, 100);
        return () => clearInterval(id);
    });
    return (
        <React.Fragment>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0 }}>
                <FontAwesomeIcon icon={faCalendarWeek} style={{ fontSize: 40, marginBottom: 20, color: "#548BAB" }} />
                {_.map(data.allDayEvents, (e, i) => (
                    <div key={i} style={{ position: "absolute", width: 400, top: i * 34 + 59, height: 24, lineHeight: "24px" }}>
                        <Textfit mode="single" max={24}>{getTimeString(e, alt)}</Textfit>
                    </div>
                ))}
            </div>
            <div style={{ position: "absolute", left: 420, top: 0, bottom: 0 }}>
                <FontAwesomeIcon icon={faCalendarDays} style={{ fontSize: 40, marginBottom: 20, marginLeft: 46, color: "#548BAB" }} />
                {_.map(data.regularEvents, (e, i) => (
                    <div key={i} style={{ position: "absolute", left: 46, width: 400, top: i * 34 + 59, height: 24, lineHeight: "24px" }}>
                        {e.isNextUp && <FontAwesomeIcon icon={faCaretRight} style={{ color: alt ? "yellow" : "red", fontSize: 60, position: "absolute", left: -60, top: -15, width: 60, textAlign: "center" }} />}
                        <Textfit mode="single" max={24}>{getTimeString(e, alt)}</Textfit>
                    </div>
                ))}
            </div>
        </React.Fragment>
    );
}

export default withSubscription(TimeUntilBlock, "TimeUntilBlock");
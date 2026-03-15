import { makeContext } from "./makeContext";
import { timeCorrectionMs } from "../blocks/_BlockBase";
import { useEffect, useState } from "react";

const ctx = makeContext(() => {
    const [updates, setUpdates] = useState(0);
    useEffect(() => {
        let timer = 0;
        function setTimer() { timer = setTimeout(() => { setUpdates(u => u + 1); setTimer(); }, 60000 - (Date.now() + timeCorrectionMs) % 60000); }
        setTimer();
        return () => {
            clearTimeout(timer);
        }
    }, []);
    let time = Temporal.Now.instant().add({ nanoseconds: Math.round(timeCorrectionMs * 1_000_000) }).toZonedDateTimeISO("UTC");
    if (time.second >= 58) // we schedule the update as close as possible to the minute change; if it triggers slightly before then fast forward it to the next minute
        time = time.add({ seconds: 60 - time.second });
    return { time, updates };
});

export const useTime = ctx.useFunc;
export const TimeProvider = ctx.provider;

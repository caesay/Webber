const dayStartHour = 3; // we consider a day to last from 3am to 3am next day, so that what's due today or tomorrow doesn't change right after midnight

export function localDay(d: Temporal.Instant | Temporal.PlainDate): Temporal.PlainDate {
    if (d instanceof Temporal.PlainDate)
        return d; // pass-through to simplify start/end
    const dt = zonedHere(d);
    let result = dt.toPlainDate();
    if (dt.hour < dayStartHour)
        result = result.subtract({ days: 1 });
    return result;
}

export function startOfLocalDay(d: Temporal.Instant | Temporal.PlainDate): Temporal.ZonedDateTime {
    return zonedHere(localDay(d).toPlainDateTime({ hour: dayStartHour }));
}

export function endOfLocalDay(d: Temporal.Instant | Temporal.PlainDate): Temporal.ZonedDateTime {
    return zonedHere(localDay(d).add({ days: 1 }).toPlainDateTime({ hour: dayStartHour }));
}

export function zonedHere(d: Temporal.Instant | Temporal.PlainDateTime | Temporal.ZonedDateTime): Temporal.ZonedDateTime {
    const tz = Temporal.Now.timeZoneId();
    if (d instanceof Temporal.Instant)
        return d.toZonedDateTimeISO(tz);
    if (d instanceof Temporal.PlainDateTime)
        return d.toZonedDateTime(tz);
    return d.withTimeZone(tz);
}

export function ns(dt: { epochNanoseconds: bigint }): bigint {
    return dt.epochNanoseconds;
}

export function timeHHmm(d: Temporal.ZonedDateTime | Temporal.PlainDateTime | Temporal.PlainTime | undefined): string | undefined {
    return d?.toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

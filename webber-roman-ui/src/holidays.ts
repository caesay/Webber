export interface HolidayInstance {
    date: Temporal.PlainDate;
    description: string;
    holiday: Holiday;
}

export interface Holiday {
    next: (from: Temporal.PlainDate) => HolidayInstance | null;
    annual?: { day: number; month: number };
    year?: number;
    description: string;
    color: string;
    priorityDays: number; // not used at the moment
    interestDays: number;
    pastDays: number;
    isHoliday?: boolean; // false for birthdays/anniversaries
}

type NextFunc = Holiday["next"];

function annual(day: number, month: number, description: string, priorityDays: number, interestDays: number, color?: string): Holiday {
    const holiday = {
        next: (() => null) as NextFunc,
        annual: { day, month },
        description,
        color: color ?? "",
        priorityDays,
        interestDays,
        pastDays: 0,
    };
    holiday.next = (from) => {
        let date = Temporal.PlainDate.from({ year: from.year, month, day });
        if (Temporal.PlainDate.compare(date, from) < 0)
            date = Temporal.PlainDate.from({ year: from.year + 1, month, day });
        return { date, description, holiday };
    };
    return holiday;
}

function anniversary(day: number, month: number, year: number, description: string, priorityDays: number, interestDays: number, color?: string): Holiday {
    const holiday = annual(day, month, description, priorityDays, interestDays, color);
    holiday.pastDays = 1;
    holiday.year = year;
    const next = holiday.next;
    holiday.next = (from) => {
        const h = next(from);
        if (!h) return null;
        h.description = `${h.description} (${h.date.year - year} yr)`;
        return h;
    };
    return holiday;
}

function holiday(holiday: Holiday): Holiday {
    holiday.isHoliday = true;
    return holiday;
}

function list(description: string, priorityDays: number, interestDays: number, dates: string[], color?: string): Holiday {
    const holiday = {
        next: (() => null) as NextFunc,
        description,
        color: color ?? "",
        interestDays,
        priorityDays,
        pastDays: 0,
    };
    const pdates = dates.map(d => Temporal.PlainDate.from(d));
    holiday.next = (from) => {
        const nexts = pdates.filter(pd => pd.since(from).total("days") >= 0);
        if (nexts.length === 0)
            return null;
        return { date: nexts[0], description, holiday };
    }
    return holiday;
}

export const holidays: Holiday[] = [
    holiday(annual(8, 3, "8 марта", 30, 90)),
    holiday(annual(25, 12, "Christmas", 30, 90)),
    holiday(annual(31, 12, "Новый Год", 30, 90)),

    holiday(list("Good Friday", 15, 40, ["2025-04-18", "2026-04-03", "2027-03-26", "2028-04-14", "2029-03-30", "2030-04-19"])),
    holiday(list("Easter Monday", 15, 40, ["2025-04-21", "2026-04-06", "2027-03-29", "2028-04-17", "2029-04-02", "2030-04-22"])),
    holiday(list("Early May BH", 15, 40, ["2025-05-05", "2026-05-04", "2027-05-03", "2028-05-01", "2029-05-07", "2030-05-06"])),
    holiday(list("Spring BH", 15, 40, ["2025-05-26", "2026-05-25", "2027-05-31", "2028-05-29", "2029-05-28", "2030-05-27"])),
    holiday(list("Summer BH", 15, 40, ["2025-08-25", "2026-08-31", "2027-08-30", "2028-08-28", "2029-08-27", "2030-08-26"])),
];

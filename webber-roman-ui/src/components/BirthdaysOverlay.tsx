import { Dialog } from "@ariakit/react";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Fragment, useState } from "react";
import styled from "styled-components";
import { Holiday, holidays } from "../holidays";
import { useTime } from "../util/useTime";

const BirthdaysOverlayDiv = styled.div`
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    bottom: 0;
    background: rgba(37, 39, 49, 0.87);
    display: grid;
    grid-template-columns: max-content;
`;

const ContentBox = styled.div`
    background: #1a1b23;
    border: 1px solid #444;
    border-radius: 8px;
    padding: 1rem;
    margin: 1rem;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
`;

const ScrollableContent = styled.div`
    overflow-y: auto;
    padding-right: 1rem;
`;

const BirthdaysGrid = styled.div`
    display: grid;
    grid-template-columns: max-content max-content max-content;
    gap: 0.2rem 1.5rem;
`;

interface BirthdaysOverlayState {
    open: boolean;
    show: () => void;
    hide: () => void;
}

type Annual = Holiday & { annual: NonNullable<Holiday["annual"]>; }

export function BirthdaysOverlay(props: { state: BirthdaysOverlayState }): React.ReactNode {
    useTime(); // refresh every minute

    let bdays = holidays.filter(h => !!h.annual && !h.isHoliday) as Annual[];
    bdays = bdays.sort((a, b) => (a.annual.month * 100 + a.annual.day) - (b.annual.month * 100 + b.annual.day));
    const now = Temporal.Now.plainDateISO();

    function age(year: number, month: number, day: number): number {
        const birthDate = Temporal.PlainDate.from({ year, month, day });
        const years = birthDate.until(now).total({ unit: "year", relativeTo: birthDate });
        const frac = years - Math.floor(years);
        return frac > 0.9 ? (Math.floor(years) + 0.9) : years; // ensure it shows as X.9 before the birthday
    }

    return <Dialog open={props.state.open} onClose={props.state.hide}>
        <BirthdaysOverlayDiv>
            <button style={{ position: "absolute", top: "1rem", right: "1rem" }} onClick={props.state.hide}><FontAwesomeIcon icon={faXmark} /></button>
            <ContentBox>
                <ScrollableContent>
                    <BirthdaysGrid>
                        {bdays.map((h, idx) => (
                            <Fragment key={`${h.description}-${idx}`}>
                                <div>{`${h.annual.day}`.padStart(2, "0")}.{`${h.annual.month}`.padStart(2, "0")}{h.year && `.${h.year}`}</div>
                                <div>{h.year && age(h.year, h.annual.month, h.annual.day).toFixed(1)}</div>
                                <div>{h.description}</div>
                            </Fragment>
                        ))}
                    </BirthdaysGrid>
                </ScrollableContent>
            </ContentBox>
        </BirthdaysOverlayDiv>
    </Dialog>;
}

export function useBirthdaysOverlayState(): BirthdaysOverlayState {
    const [open, setOpen] = useState(false);
    return {
        open,
        show: () => setOpen(true),
        hide: () => setOpen(false),
    };
}

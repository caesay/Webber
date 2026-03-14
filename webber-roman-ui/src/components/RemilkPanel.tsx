import { DateTime } from "luxon";
import styled from "styled-components";
import { RemilkTask, useRemilkBlock } from "../blocks/RemilkBlock";
import { startOfLocalDay } from "../util/util";
import { BlockPanelContainer } from "./Container";

const RemilkPanelContainer = styled(BlockPanelContainer)`
    display: grid;
    grid-auto-flow: columns;
    grid-template-rows: 1fr auto;
`;

const OverflowFaderDiv = styled.div`
    overflow: hidden;
    &::after {
        box-shadow: inset -3vw -3vw 2vw #000;
        position: absolute;
        content: "";
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
    }
`;

function TaskToday(p: { task: RemilkTask }): React.ReactNode {
    const overdue = p.task.dueUtc < DateTime.utc();
    return <p key={p.task.id}>{overdue && "OVERDUE: "}{p.task.description}</p>
}

function byPriority(a: RemilkTask, b: RemilkTask): number {
    if (a.priority != b.priority)
        return a.priority - b.priority;
    if (a.description != b.description)
        return a.description.localeCompare(b.description);
    return a.id.localeCompare(b.id);
}
function byDueDate(a: RemilkTask, b: RemilkTask): number {
    const c = a.dueUtc.toMillis() - b.dueUtc.toMillis();
    if (c != 0)
        return c;
    return a.id.localeCompare(b.id);
}

const PrioColors = ["", "#EA5200", "#0060BF", "#359AFF", "#555"];
const TaskDiv = styled.div`
    padding-left: 0.3rem;
    line-height: 1.0;
    margin: 0.3rem 0;
    border-left: 0.2rem solid yellow;
`;
const NonTaskDiv = styled(TaskDiv)`
    border-left-color: rgba(0,0,0,0);
`;
const DueSpan = styled.span<{ $overdue: boolean }>`
    margin-right: 0.35rem;
    font-size: 83%;
    font-weight: bold;
    color: ${p => p.$overdue ? "red" : "#359AFF"};
`;

function Task(p: { task: RemilkTask, nolate?: boolean }): React.ReactNode {
    const overdue = p.task.dueUtc < DateTime.utc();
    return <TaskDiv style={{ borderLeftColor: PrioColors[p.task.priority] }}>
        {p.task.hasDueTime && <DueSpan $overdue={overdue}>{p.task.dueUtc.toLocal().toFormat("HH:mm")}</DueSpan>}
        {!p.task.hasDueTime && overdue && !p.nolate && <DueSpan $overdue={overdue}>late</DueSpan>}
        {p.task.description}
    </TaskDiv>;
}

const TaskSectionDiv = styled.div`
    padding-bottom: 0.07rem;
    padding-top: 0.05rem;
    border-bottom: 0.15rem solid #666;
    &:last-child {
        border-bottom: none;
    }
`;

const TaskCountContainerDiv = styled.div`
    font-size: 75%;
    color: #999;
    display: grid;
    grid-template-columns: auto auto auto;
    justify-content: space-between;
    z-index: 999;
    position: relative;
`;

export function RemilkPanel({ ...rest }: React.HTMLAttributes<HTMLDivElement>): React.ReactNode {
    const remilk = useRemilkBlock();
    const tasks = remilk.dto?.tasks ?? [];

    const cutoffNeglected = startOfLocalDay(DateTime.utc(), true).minus({ day: 5 });
    const cutoffStartOfToday = startOfLocalDay(DateTime.utc(), true);
    const cutoffEndOfToday = cutoffStartOfToday.plus({ day: 1 });
    const cutoffTomorrow = cutoffStartOfToday.plus({ day: 2 });
    const cutoffSoon = cutoffStartOfToday.plus({ day: 5 });

    function tagFilter(t: RemilkTask) { return !t.tags.includes("easy") && !t.tags.includes("backlog"); }
    const tasksNeglected = tasks.filter(t => tagFilter(t) && t.dueUtc <= cutoffNeglected).sort(byPriority);
    const tasksTodayPrio = tasks.filter(t => tagFilter(t) && t.dueUtc > cutoffNeglected && t.dueUtc <= cutoffEndOfToday && t.priority == 1).sort(byPriority);
    const tasksToday = tasks.filter(t => tagFilter(t) && t.dueUtc > cutoffNeglected && t.dueUtc <= cutoffEndOfToday && t.priority != 1).sort(byPriority);
    const tasksTomorrow = tasks.filter(t => tagFilter(t) && t.dueUtc > cutoffEndOfToday && t.dueUtc <= cutoffTomorrow).sort(byPriority);
    const tasksSoon = tasks.filter(t => tagFilter(t) && t.dueUtc > cutoffTomorrow && t.dueUtc <= cutoffSoon).sort(byDueDate);
    const tasksEasy = tasks.filter(t => t.tags.includes("easy") && t.dueUtc <= cutoffEndOfToday).sort(byPriority);
    const tasksBacklog = tasks.filter(t => t.tags.includes("backlog") && t.dueUtc <= cutoffEndOfToday).sort(byPriority);

    const dayCount = tasks.filter(t => !t.tags.includes("easy") && t.dueUtc <= cutoffEndOfToday).length;
    const weekCount = tasks.filter(t => !t.tags.includes("easy") && t.dueUtc <= cutoffEndOfToday.plus({ day: 7 })).length;
    const monthCount = tasks.filter(t => !t.tags.includes("easy") && t.dueUtc <= cutoffEndOfToday.plus({ day: 31 })).length;

    // if all tasks don't fit then we collapse sections in the following order: soon, tomorrow, backlog, easy, neglected
    let remainingCount = 12 - tasksEasy.length - tasksTodayPrio.length - tasksToday.length - tasksNeglected.length - tasksBacklog.length - tasksTomorrow.length - tasksSoon.length;
    remainingCount += tasksSoon.length;
    const cSoon = Math.min(tasksSoon.length, Math.max(0, remainingCount)); // 0: allow it to scroll off entirely
    remainingCount -= cSoon;
    remainingCount += tasksTomorrow.length;
    const cTomorrow = Math.min(tasksTomorrow.length, Math.max(0, remainingCount)); // 0: allow it to scroll off entirely
    remainingCount -= cTomorrow;
    remainingCount += tasksBacklog.length;
    const cBacklog = Math.min(tasksBacklog.length, Math.max(1, remainingCount));
    remainingCount -= cBacklog;
    remainingCount += tasksEasy.length;
    const cEasy = Math.min(tasksEasy.length, Math.max(3, remainingCount));
    remainingCount -= cEasy;
    remainingCount += tasksNeglected.length;
    const cNeglected = Math.min(tasksNeglected.length, Math.max(1, remainingCount));
    //remainingCount -= cNeglected;

    function m1(v: number) { return Math.max(v, 1); }

    return <RemilkPanelContainer state={remilk} {...rest}>
        <OverflowFaderDiv>
            {tasksEasy.length > 0 && <TaskSectionDiv style={{ color: "#73ff73" }}>
                {tasksEasy.slice(0, cEasy).map(t => <Task key={t.id} task={t} nolate={true} />)}
                {tasksEasy.length > cEasy && <NonTaskDiv style={{ fontSize: "70%" }}>... and {tasksEasy.length - cEasy} more</NonTaskDiv>}
            </TaskSectionDiv>}
            {tasksTodayPrio.length > 0 && <TaskSectionDiv style={{ color: PrioColors[1] }}>
                {tasksTodayPrio.map(t => <Task key={t.id} task={t} />)}
            </TaskSectionDiv>}
            {tasksNeglected.length > 0 && <TaskSectionDiv style={{ color: "#f0f" }}>
                {tasksNeglected.slice(0, cNeglected).map(t => <Task key={t.id} task={t} />)}
                {tasksNeglected.length > cNeglected && <NonTaskDiv style={{ fontSize: "70%" }}>... and {tasksNeglected.length - cNeglected} more</NonTaskDiv>}
            </TaskSectionDiv>}
            {tasksToday.length > 0 && <TaskSectionDiv>
                {tasksToday.map(t => <Task key={t.id} task={t} />)}
            </TaskSectionDiv>}
            {tasksBacklog.length > 0 && <TaskSectionDiv style={{ color: "rgb(10, 139, 190)" }}>
                {tasksBacklog.slice(0, cBacklog).map(t => <Task key={t.id} task={t} nolate={true} />)}
                {tasksBacklog.length > cBacklog && <NonTaskDiv style={{ fontSize: "70%" }}>... and {tasksBacklog.length - cBacklog} more</NonTaskDiv>}
            </TaskSectionDiv>}
            {tasksTomorrow.length > 0 && <TaskSectionDiv style={{ opacity: 0.5 }}>
                {tasksTomorrow.slice(0, m1(cTomorrow)).map(t => <Task key={t.id} task={t} />)}
                {tasksTomorrow.length > m1(cTomorrow) && <NonTaskDiv style={{ fontSize: "70%" }}>... and {tasksTomorrow.length - m1(cTomorrow)} more</NonTaskDiv>}
            </TaskSectionDiv>}
            {tasksSoon.length > 0 && <TaskSectionDiv style={{ opacity: 0.25 }}>
                {tasksSoon.slice(0, m1(cSoon)).map(t => <Task key={t.id} task={t} />)}
                {tasksSoon.length > m1(cSoon) && <NonTaskDiv style={{ fontSize: "70%" }}>... and {tasksSoon.length - m1(cSoon)} more</NonTaskDiv>}
            </TaskSectionDiv>}
        </OverflowFaderDiv>
        <TaskCountContainerDiv>
            <div>{dayCount} now</div><div>{weekCount} week</div><div>{monthCount} month</div>
        </TaskCountContainerDiv>
    </RemilkPanelContainer >;
}

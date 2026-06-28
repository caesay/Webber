import * as _ from 'lodash';
import * as React from 'react';
import styled from 'styled-components';
import { withSubscription, BaseDto } from './util';

interface PingBlockDto extends BaseDto {
    last: number;
    recent: number[];
}

const PingBubble = styled.div`
    background-color: red;
    width: 24px;
    height: 24px;
    border-radius: 6px;
    margin: 4px;
    display: block;
    flex-grow: 0;
    flex-shrink: 1;
    flex-basis: auto;
    align-self: auto;
    order: 0;
    border: 2px solid black;
`;

const FillDiv = styled.div`
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    overflow: hidden;
`;

const LabelContainer = styled.div`
    display: flex;
    position: relative;
    flex-direction: row;
    flex-wrap: nowrap;
    justify-content: flex-start;
    align-items: flex-start;
    align-content: normal;
`;

const PingText = styled.span`
    align-self: center;
    font-size: 30px;
    margin-top: -2px;
    padding: 0px 4px;
    background-color: rgba(0,0,0,0.7);
`

function pingColor(ping: number) {
    let color = "lime";
    if (ping > 12)
        color = "yellow";
    if (ping > 24)
        color = "red";
    return color;
}

const PingBlock: React.FunctionComponent<{ data: PingBlockDto }> = ({ data }) => {
    // get rid of any null values
    const last = (data?.last)+0;
    const recent = _.map(data?.recent ?? [], v => v + 0);
    const vMax = Math.max(30, _.max(recent));
    const barW = 4;
    const barS = 2;
    const getH = (ping: number) => (ping / vMax) * 50;
    const getR = (idx: number) => (idx * (barW + barS));
    const bars = _.map(recent, (v, i) => (<div key={i} style={{ position: "absolute", width: barW, height: getH(v), left: getR(i), bottom: 0, backgroundColor: pingColor(v) }}></div>));

    // calculate the average distance between each ping value
    let jitter = 0;
    for (let i = 0; i < recent.length - 1; i++) {
        jitter += Math.abs(recent[i] - recent[i + 1]);
    }
    jitter /= (recent.length - 1);

    return (
        <React.Fragment>
            <FillDiv>{bars}</FillDiv>
            <LabelContainer>
                <PingBubble style={{ backgroundColor: pingColor(last) }} />
                <PingText>{last.toFixed(0)}ms</PingText>
                <PingText style={{ opacity: 0.8, fontSize: 24 }}>±{jitter.toFixed(1)}</PingText>
            </LabelContainer>
        </React.Fragment>
    );
}

export default withSubscription(PingBlock, "PingBlock");
import * as React from 'react';
import { useRef, useEffect, useState } from 'react';
import styled from 'styled-components';
import { withSubscription, BaseDto } from './util';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMicrochip, faBolt, faImage, faMemory, faPlug } from '@fortawesome/free-solid-svg-icons';

interface CpuCoreInfo {
    load: number;
    temp: number;
    core: number;
}

interface GpuLayout {
    load: number;
    memory: number;
}

interface GpuInfo {
    layout: GpuLayout[];
}

interface ComputerStats {
    name: string;
    cpuCores: CpuCoreInfo[];
    gpu: GpuInfo;
    avgCpuUtilization: number;
    maxCoreUtilization: number;
    maxGpuUtilization: number;
    powerConsumptionWatts?: number;
    ramUtilization: number;
    isOffline: boolean;
}

interface ComputerStatsBlockDto extends BaseDto {
    computers: ComputerStats[];
    sentUtc: string;
}

// Configurable sizing constants
const BLOCK_WIDTH = 72; // Width of each block (CPU/RAM, Cores, GPU/Power)
const BLOCK_HEIGHT = 78; // Height of each block (CPU/RAM, Cores, GPU/Power)
const LABEL_HEIGHT = 20; // Height of computer name label
const BLOCK_GAP = 2; // Gap between bars within a block
const SECTION_GAP = 8; // Gap between computer sections
const STAT_BAR_HEIGHT = (BLOCK_HEIGHT - BLOCK_GAP) / 2; // Height of individual stat bars (CPU, RAM, GPU, Power)
const CONTAINER_HEIGHT = BLOCK_HEIGHT + LABEL_HEIGHT; // Total container height

// Configurable font sizes
const LABEL_FONT_SIZE = 14; // Computer name label font size
const STAT_BAR_FONT_SIZE = 16; // Percentage text in horizontal stat bars
const STAT_BAR_ICON_SIZE = 16; // Icon size in horizontal stat bars
const FULL_HEIGHT_FONT_SIZE = 16; // Percentage text in full-height bars
const FULL_HEIGHT_ICON_SIZE = 20; // Icon size in full-height bars

const Container = styled.div`
    width: 504px;
    height: ${CONTAINER_HEIGHT}px;
    display: flex;
    flex-direction: row;
    gap: ${SECTION_GAP}px;
    overflow: hidden;
`;

const ComputerSection = styled.div`
    display: flex;
    flex-direction: column;
    height: 100%;
`;

const NameLabel = styled.div`
    width: 100%;
    height: ${LABEL_HEIGHT}px;
    display: flex;
    align-items: left;
    justify-content: left;
    font-size: ${LABEL_FONT_SIZE}px;
    font-weight: bold;
    margin-left: 4px;
    color: white;
`;

const InnerContainer = styled.div`
    display: flex;
    flex-direction: row;
    flex: 1;
    gap: ${BLOCK_GAP}px;
    margin-top: 2px;
`;

const BarsSection = styled.div`
    display: flex;
    flex-direction: column;
    width: ${BLOCK_WIDTH}px;
    height: ${BLOCK_HEIGHT}px;
    gap: ${BLOCK_GAP}px;
`;

const StatBar = styled.div`
    width: 100%;
    height: ${STAT_BAR_HEIGHT}px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: ${STAT_BAR_FONT_SIZE}px;
    font-weight: bold;
    color: white;
    position: relative;
    background-color: rgba(138, 180, 248, 0.15);
    transition: background-color 0.4s ease;
    border-radius: 2px;
`;

const CoreGrid = styled.div`
    width: ${BLOCK_WIDTH}px;
    height: ${BLOCK_HEIGHT}px;
    position: relative;
`;

const CoreCell = styled.div`
    position: absolute;
    background-color: rgba(138, 180, 248, 0.15);
    transition: background-color 0.4s ease;
    border-radius: 2px;
`;

const OfflineCard = styled.div`
    width: ${BLOCK_WIDTH * 3 + BLOCK_GAP * 2}px;
    height: ${BLOCK_HEIGHT}px;
    background-color: #303f577c;
    border-radius: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: #ffffff9c;
    font-size: 18px;
    font-weight: bold;
`;

// Calculate color based on percentage: blue (0-85%), red (85-100%)
// Blue: #8AB4F8 with varying transparency, Red: #FF0000 with varying transparency
const getColorForPercentage = (percent: number): string => {
    if (percent < 0) percent = 0;
    if (percent > 100) percent = 100;

    if (percent <= 85) {
        // 0-85%: #8AB4F8 with transparency from 15% to 100%
        const intensity = percent / 85;
        const alpha = 0.15 + (intensity * 0.85); // 0.15 to 1.0
        return `rgba(138, 180, 248, ${alpha})`;
    } else {
        // 85-100%: #FF0000 with transparency from 30% to 100%
        const range = percent - 85;
        const intensity = range / 15;
        const alpha = 0.4 + (intensity * 0.6); // 0.4 to 1.0
        return `rgba(255, 0, 0, ${alpha})`;
    }
};

// Utilization history graph component
interface UtilizationGraphBarProps {
    utilization: number;
    timestamp: string; // Add timestamp to detect new data updates
    icon: any; // FontAwesome icon
    fillHeight?: boolean; // If true, fills 100% height instead of 29px
}

const UtilizationGraphBar: React.FC<UtilizationGraphBarProps> = ({ utilization, timestamp, icon, fillHeight = false }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const historyRef = useRef<number[]>([]);
    const maxHistoryLength = BLOCK_WIDTH + 20; // One point per pixel width (plus extra for smoothness)
    const barHeight = fillHeight ? BLOCK_HEIGHT : STAT_BAR_HEIGHT;

    useEffect(() => {
        // Add current utilization to history
        historyRef.current.push(utilization);
        if (historyRef.current.length > maxHistoryLength) {
            historyRef.current.shift();
        }

        // Draw graph
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = canvas.width;
        const height = canvas.height;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        // Draw utilization line graph
        const history = historyRef.current;
        if (history.length < 2) return;

        // Scale from 0-100%
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();

        history.forEach((value, index) => {
            const x = (index / (maxHistoryLength - 1)) * width;
            const y = height - (value / 100) * (height - 4) - 2; // 2px padding, scale 0-100%

            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });

        ctx.stroke();
    }, [utilization, timestamp]); // Depend on timestamp to update even when value doesn't change

    return (
        <StatBar style={{
            height: fillHeight ? '100%' : `${STAT_BAR_HEIGHT}px`,
            backgroundColor: getColorForPercentage(utilization),
            position: 'relative',
            overflow: 'hidden',
            flexDirection: fillHeight ? 'column' : 'row',
            justifyContent: fillHeight ? 'center' : 'center',
            alignItems: fillHeight ? 'center' : 'center'
        }}>
            <canvas
                ref={canvasRef}
                width={BLOCK_WIDTH + 20}
                height={barHeight}
                style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none'
                }}
            />
            {fillHeight ? (
                <>
                    <FontAwesomeIcon
                        icon={icon}
                        style={{
                            position: 'relative',
                            fontSize: FULL_HEIGHT_ICON_SIZE,
                            zIndex: 1,
                            opacity: 0.6,
                            marginBottom: 6
                        }}
                    />
                    <span style={{ position: 'relative', zIndex: 1, fontSize: FULL_HEIGHT_FONT_SIZE }}>
                        {Math.round(utilization)}%
                    </span>
                </>
            ) : (
                <>
                    <FontAwesomeIcon
                        icon={icon}
                        style={{
                            position: 'absolute',
                            left: 6,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            fontSize: STAT_BAR_ICON_SIZE,
                            zIndex: 1,
                            opacity: 0.6
                        }}
                    />
                    <span style={{ position: 'relative', zIndex: 1, width: '100%', textAlign: 'right', paddingRight: 6 }}>
                        {Math.round(utilization)}%
                    </span>
                </>
            )}
        </StatBar>
    );
};

// Power consumption graph component
interface PowerGraphBarProps {
    watts: number;
    timestamp: string;
}

const PowerCard = styled.div`
    width: ${BLOCK_WIDTH}px;
    height: ${STAT_BAR_HEIGHT}px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: ${STAT_BAR_FONT_SIZE}px;
    font-weight: bold;
    color: white;
    position: relative;
    background-color: rgba(138, 180, 248, 0.15);
    transition: background-color 0.4s ease;
    border-radius: 2px;
`;

const PowerGraphBar: React.FC<PowerGraphBarProps> = ({ watts, timestamp }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const historyRef = useRef<number[]>([]);
    const maxHistoryLength = BLOCK_WIDTH; // One point per pixel width

    useEffect(() => {
        // Add current watts to history
        historyRef.current.push(watts);
        if (historyRef.current.length > maxHistoryLength) {
            historyRef.current.shift();
        }

        // Draw graph
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = canvas.width;
        const height = canvas.height;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        // Draw watts line graph
        const history = historyRef.current;
        if (history.length < 2) return;

        // Find max value for scaling
        const maxWatts = Math.max(...history, 1); // At least 1 to avoid division by zero

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();

        history.forEach((value, index) => {
            const x = (index / (maxHistoryLength - 1)) * width;
            const y = height - (value / maxWatts) * (height - 4) - 2; // 2px padding, scale to max

            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });

        ctx.stroke();
    }, [watts, timestamp]);

    // Calculate color based on watts (assuming typical range 0-500W)
    // Use similar color scheme as CPU/GPU but scale differently
    const percentage = Math.min((watts / 500) * 100, 100);

    return (
        <PowerCard style={{
            backgroundColor: getColorForPercentage(percentage),
            overflow: 'hidden'
        }}>
            <canvas
                ref={canvasRef}
                width={BLOCK_WIDTH}
                height={STAT_BAR_HEIGHT}
                style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none'
                }}
            />
            <FontAwesomeIcon
                icon={faBolt}
                style={{
                    position: 'absolute',
                    left: 6,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: STAT_BAR_ICON_SIZE,
                    zIndex: 1,
                    opacity: 0.6
                }}
            />
            <span style={{ position: 'relative', zIndex: 1, width: '100%', textAlign: 'right', paddingRight: 6 }}>
                {Math.round(watts)}W
            </span>
        </PowerCard>
    );
};

// Calculate grid layout for cores
const calculateGridLayout = (numCores: number): { cols: number, rows: number, doubleWidthSpan: number } => {
    if (numCores === 0) return { cols: 0, rows: 0, doubleWidthSpan: 1 };

    // Try to find a near-square layout
    const sqrt = Math.sqrt(numCores);
    let cols = Math.ceil(sqrt);
    let rows = Math.ceil(numCores / cols);

    // Check if we need a double-width core
    const totalCells = cols * rows;
    const extraSpots = totalCells - numCores;
    // Highest core spans (extraSpots + 1) cells horizontally
    const doubleWidthSpan = extraSpots > 0 ? extraSpots + 1 : 1;

    return { cols, rows, doubleWidthSpan };
};

// Calculate position and size for each core
interface CoreLayout {
    left: number;
    top: number;
    width: number;
    height: number;
}

const getCoreLayout = (
    coreIndex: number,
    cols: number,
    rows: number,
    doubleWidthSpan: number
): CoreLayout => {
    const gap = BLOCK_GAP;
    const gridWidth = BLOCK_WIDTH;
    const gridHeight = BLOCK_HEIGHT;
    const cellWidth = (gridWidth - (cols - 1) * gap) / cols;
    const cellHeight = (gridHeight - (rows - 1) * gap) / rows;

    // First core (highest loaded) gets double width if needed
    if (doubleWidthSpan > 1 && coreIndex === 0) {
        return {
            left: 0,
            top: 0,
            width: cellWidth * doubleWidthSpan + gap * (doubleWidthSpan - 1),
            height: cellHeight
        };
    }

    // Calculate position for other cores
    let position = coreIndex;

    // If we have a double-width core, skip the cells it occupies
    if (doubleWidthSpan > 1 && coreIndex > 0) {
        // The first core takes up 'doubleWidthSpan' cells in the first row
        position = coreIndex + (doubleWidthSpan - 1);
    }

    const col = position % cols;
    const row = Math.floor(position / cols);

    return {
        left: col * (cellWidth + gap),
        top: row * (cellHeight + gap),
        width: cellWidth,
        height: cellHeight
    };
};

const ComputerStatsBlock: React.FunctionComponent<{ data: ComputerStatsBlockDto }> = ({ data }) => {
    if (!data || !data.computers || data.computers.length === 0) {
        return <Container />;
    }

    return (
        <Container>
            {data.computers.map((computer, idx) => {
                // Render offline card if computer is offline
                if (computer.isOffline) {
                    return (
                        <ComputerSection key={idx}>
                            <NameLabel>{computer.name}</NameLabel>
                            <OfflineCard>
                                <FontAwesomeIcon icon={faPlug} color="#ff00007e" size="lg" />
                                <span>
                                    Offline
                                    {computer.powerConsumptionWatts != null &&
                                        ` (${Math.round(computer.powerConsumptionWatts)}W)`}
                                </span>
                            </OfflineCard>
                        </ComputerSection>
                    );
                }

                const { cols, rows, doubleWidthSpan } = calculateGridLayout(computer.cpuCores.length);

                // Sort cores by load (highest to lowest), with core number as tiebreaker for stability
                const sortedCores = [...computer.cpuCores].sort((a, b) => {
                    if (b.load !== a.load) return b.load - a.load;
                    return a.core - b.core; // Stable sort: same load -> sort by core number
                });

                return (
                    <ComputerSection key={idx}>
                        {/* Computer Name Label */}
                        <NameLabel>{computer.name}</NameLabel>

                        {/* Inner container with all bars and grids */}
                        <InnerContainer>
                            {/* CPU/RAM Bars Section */}
                            <BarsSection>
                                {/* Avg CPU Bar with Utilization Graph */}
                                <UtilizationGraphBar
                                    utilization={computer.avgCpuUtilization}
                                    timestamp={data.sentUtc}
                                    icon={faMicrochip}
                                />

                                {/* RAM Utilization Bar */}
                                <UtilizationGraphBar
                                    utilization={computer.ramUtilization}
                                    timestamp={data.sentUtc}
                                    icon={faMemory}
                                />
                            </BarsSection>

                            {/* CPU Core Grid */}
                            <CoreGrid>
                                {Array.from({ length: computer.cpuCores.length }).map((_, positionIndex) => {
                                    const layout = getCoreLayout(positionIndex, cols, rows, doubleWidthSpan);
                                    const coreData = sortedCores[positionIndex];
                                    return (
                                        <CoreCell
                                            key={positionIndex}
                                            style={{
                                                backgroundColor: getColorForPercentage(coreData.load),
                                                left: `${layout.left}px`,
                                                top: `${layout.top}px`,
                                                width: `${layout.width}px`,
                                                height: `${layout.height}px`
                                            }}
                                        />
                                    );
                                })}
                            </CoreGrid>

                            {/* GPU and Power Section */}
                            <BarsSection>
                                {/* Max GPU Bar with Utilization Graph */}
                                <UtilizationGraphBar
                                    utilization={computer.maxGpuUtilization}
                                    timestamp={data.sentUtc}
                                    icon={faImage}
                                    fillHeight={computer.powerConsumptionWatts == null}
                                />

                                {/* Power Consumption Bar */}
                                {computer.powerConsumptionWatts != null && (
                                    <PowerGraphBar
                                        watts={computer.powerConsumptionWatts}
                                        timestamp={data.sentUtc}
                                    />
                                )}
                            </BarsSection>
                        </InnerContainer>
                    </ComputerSection>
                );
            })}
        </Container>
    );
}

export default withSubscription(ComputerStatsBlock, "ComputerStatsBlock");

export interface BarChartPt {
    Value: number;
    Color: string;
    // Value2?: number;
    // Color2?: string;
    // Value3?: number;
    // Color3?: string;
    // Value4?: number;
    // Color4?: string;
}

export function ModifiedLog(value: number, newBase: number): number {
    return value >= newBase ? (Math.log(value) / Math.log(newBase)) : value / newBase;
}

export function ScaleY(value: number, min: number, max: number, transform: (v: number) => number): number {
    if (transform == null) transform = x => x;
    const res = (transform(value) - transform(min)) / (transform(max) - transform(min));
    return res < 0 ? 0 : res > 1 ? 1 : res;
}


export function BarChart({ Data, BarCount, BarSpacing, Downwards }: { Data: BarChartPt[], BarCount?: number, BarSpacing?: number, Downwards?: boolean }): React.ReactNode {
    BarSpacing ??= 0.2;
    BarCount ??= 10;
    Downwards ??= false;

    const barWidth = (100 - BarSpacing * (BarCount - 1)) / BarCount;

    return <svg width="100%" height="100%">
        <g>
            {[...Data].reverse().map((pt, i) => {
                return <rect
                    key={`${i}_1`}
                    x={`${100 - barWidth - i * (barWidth + (BarSpacing ?? 0))}%`}
                    y={`${(Downwards ? 0 : (100 - pt.Value * 100))}%`}
                    width={`${barWidth}%`}
                    height={`${pt.Value * 100}%`}
                    fill={pt.Color}
                    strokeWidth="0">
                </rect>;
            })}
        </g>
    </svg >
}

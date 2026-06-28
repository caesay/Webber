import { useRef, useEffect, useState, type ReactNode } from 'react';

interface TextFitProps {
    children: ReactNode;
    max?: number;
    min?: number;
    mode?: 'single' | 'multi';
    style?: React.CSSProperties;
}

export function TextFit({ children, max = 100, min = 1, mode = 'single', style }: TextFitProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const innerRef = useRef<HTMLSpanElement>(null);
    const [fontSize, setFontSize] = useState(max);

    useEffect(() => {
        const container = containerRef.current;
        const inner = innerRef.current;
        if (!container || !inner) return;

        let lo = min;
        let hi = max;
        let mid: number;

        // Binary search for the largest font size that fits
        while (lo <= hi) {
            mid = Math.floor((lo + hi) / 2);
            inner.style.fontSize = mid + 'px';

            const fits = mode === 'single'
                ? inner.scrollWidth <= container.clientWidth
                : inner.scrollHeight <= container.clientHeight;

            if (fits) {
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }

        setFontSize(hi);
    }, [children, max, min, mode]);

    return (
        <div ref={containerRef} style={{ ...style, overflow: 'visible', width: '100%', height: '100%' }}>
            <span ref={innerRef} style={{ fontSize, whiteSpace: mode === 'single' ? 'nowrap' : 'normal', display: 'inline-block' }}>
                {children}
            </span>
        </div>
    );
}

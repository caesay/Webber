import * as React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
import type { IconProp } from '@fortawesome/fontawesome-svg-core';

interface BlockIconProps {
    icon: IconProp;
    blockName: string;
    error: string | null;
    connectionDown: boolean;
}

const BlockIcon: React.FunctionComponent<BlockIconProps> = ({ icon, blockName, error, connectionDown }) => {
    if (error && !connectionDown) {
        return (
            <div style={{ display: 'flex', alignItems: 'center' }}>
                <FontAwesomeIcon icon={faExclamationTriangle} style={{ fontSize: 40, color: "#c84040", flexShrink: 0 }} />
                <span style={{
                    fontSize: 11,
                    color: "#c84040",
                    opacity: 0.8,
                    maxWidth: 200,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    marginLeft: 8,
                }}>
                    {blockName}: {error}
                </span>
            </div>
        );
    }

    return (
        <FontAwesomeIcon icon={icon} style={{ fontSize: 40, color: "#548BAB" }} />
    );
};

export default BlockIcon;

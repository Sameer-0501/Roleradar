import React from 'react';
import { CheckCircle, Clock } from 'lucide-react';
import './TopBar.css';

interface TopBarProps {
    projectName?: string;
    stepCurrent: number;
    stepTotal: number;
    status?: 'not-started' | 'in-progress' | 'shipped';
}

export const TopBar: React.FC<TopBarProps> = ({
    projectName = "KodNest Premium Build System",
    stepCurrent,
    stepTotal,
    status = 'not-started'
}) => {
    return (
        <div className="top-bar">
            <div className="top-bar-left">
                <span className="project-name">{projectName}</span>
            </div>
            <div className="top-bar-center">
                <span className="progress-indicator">Step {stepCurrent} / {stepTotal}</span>
            </div>
            <div className="top-bar-right">
                <div className={`status-badge status-${status}`}>
                    {status === 'shipped' && <CheckCircle size={14} />}
                    {(status === 'in-progress' || status === 'not-started') && <Clock size={14} />}
                    <span>{status.replace('-', ' ')}</span>
                </div>
            </div>
        </div>
    );
};

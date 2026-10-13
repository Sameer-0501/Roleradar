import React from 'react';
import './ContextHeader.css';

interface ContextHeaderProps {
    title: string;
    description: string;
}

export const ContextHeader: React.FC<ContextHeaderProps> = ({ title, description }) => {
    return (
        <div className="context-header">
            <h1 className="context-title">{title}</h1>
            <p className="context-description">{description}</p>
        </div>
    );
};

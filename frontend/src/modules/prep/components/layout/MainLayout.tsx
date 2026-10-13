import React from 'react';
import './MainLayout.css';
import { TopBar } from './TopBar';
import { ProofFooter } from './ProofFooter';

interface MainLayoutProps {
    children: React.ReactNode;
    header?: React.ReactNode;
    stepCurrent?: number;
    stepTotal?: number;
    status?: 'not-started' | 'in-progress' | 'shipped';
}

export const MainLayout: React.FC<MainLayoutProps> = ({
    children,
    header,
    stepCurrent = 1,
    stepTotal = 1,
    status
}) => {
    return (
        <div className="main-layout">
            <TopBar stepCurrent={stepCurrent} stepTotal={stepTotal} status={status} />

            <div className="main-content-scroll">
                {header}

                <main className="workspace-container">
                    {children}
                </main>
            </div>

            <ProofFooter />
        </div>
    );
};

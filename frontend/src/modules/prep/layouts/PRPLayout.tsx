
import React, { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { MainLayout } from '../components/layout/MainLayout';

export const PRPLayout: React.FC = () => {
    const [status, setStatus] = useState<'in-progress' | 'shipped'>('in-progress');

    useEffect(() => {
        const isShipped = localStorage.getItem('prp_shipped_status') === 'true';
        if (isShipped) setStatus('shipped');
    }, []);

    return (
        <MainLayout
            status={status}
            stepCurrent={8}
            stepTotal={8}
        >
            <Outlet />
        </MainLayout>
    );
};

import React from 'react';

export const MainWorkspace: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return (
        <div className="flex-1 h-full overflow-y-auto bg-white p-8 pb-32">
            <div className="max-w-4xl mx-auto">
                {children}
            </div>
        </div>
    );
};

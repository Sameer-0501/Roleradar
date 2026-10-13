import React, { useState } from 'react';
import { Square, CheckSquare } from 'lucide-react';
import './ProofFooter.css';

interface ProofItem {
    id: string;
    label: string;
    checked: boolean;
}

export const ProofFooter: React.FC = () => {
    const [items, setItems] = useState<ProofItem[]>([
        { id: 'ui', label: 'UI Built', checked: false },
        { id: 'logic', label: 'Logic Working', checked: false },
        { id: 'test', label: 'Test Passed', checked: false },
        { id: 'deployed', label: 'Deployed', checked: false },
    ]);

    const toggleItem = (id: string) => {
        setItems(items.map(item =>
            item.id === id ? { ...item, checked: !item.checked } : item
        ));
    };

    return (
        <div className="proof-footer">
            <div className="proof-container">
                {items.map(item => (
                    <div
                        key={item.id}
                        className={`proof-item ${item.checked ? 'checked' : ''}`}
                        onClick={() => toggleItem(item.id)}
                    >
                        {item.checked ?
                            <CheckSquare size={18} className="proof-icon" /> :
                            <Square size={18} className="proof-icon" />
                        }
                        <span className="proof-label">{item.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

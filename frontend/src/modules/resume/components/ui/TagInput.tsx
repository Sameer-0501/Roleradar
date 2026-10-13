import React, { useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';

interface TagInputProps {
    placeholder?: string;
    tags: string[];
    onTagsChange: (tags: string[]) => void;
}

export const TagInput: React.FC<TagInputProps> = ({ placeholder, tags, onTagsChange }) => {
    const [input, setInput] = useState('');

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const trimmed = input.trim();
            if (trimmed && !tags.includes(trimmed)) {
                onTagsChange([...tags, trimmed]);
                setInput('');
            }
        } else if (e.key === 'Backspace' && !input && tags.length > 0) {
            onTagsChange(tags.slice(0, -1));
        }
    };

    const removeTag = (indexToRemove: number) => {
        onTagsChange(tags.filter((_, index) => index !== indexToRemove));
    };

    return (
        <div className="flex flex-wrap gap-2 p-2 border border-gray-200 rounded-md bg-white focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
            {tags.map((tag, index) => (
                <span key={index} className="flex items-center gap-1 bg-gray-100 text-gray-800 text-sm px-2 py-1 rounded-full">
                    {tag}
                    <button onClick={() => removeTag(index)} className="hover:text-red-500">
                        <X className="w-3 h-3" />
                    </button>
                </span>
            ))}
            <input
                type="text"
                className="flex-1 min-w-[120px] outline-none text-sm p-1"
                placeholder={tags.length === 0 ? placeholder : ''}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
            />
        </div>
    );
};

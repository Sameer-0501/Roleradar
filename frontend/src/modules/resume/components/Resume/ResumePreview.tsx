import React from 'react';
import { useResume } from '../../context/ResumeContext';

export const ResumePreview: React.FC = () => {
    const { resumeData } = useResume();
    const { personalInfo, summary, education, experience, projects, skills, selectedTemplate = 'modern', selectedColor = '#14b8a6' } = resumeData;

    const hasData = personalInfo.fullName || summary || education.length > 0;

    if (!hasData) {
        return (
            <div className="h-full flex items-center justify-center text-gray-400 bg-gray-50 border-2 border-dashed border-gray-200 rounded-lg min-h-[400px]">
                <p>Start editing to see preview</p>
            </div>
        );
    }

    // Dynamic Style for Accent Color
    const accentStyle = {
        '--accent-color': selectedColor,
    } as React.CSSProperties;

    // --- Components ---

    const ContactInfo = () => (
        <div className={`text-sm ${selectedTemplate === 'modern' ? 'space-y-2 text-white/90' : 'flex flex-wrap justify-center gap-x-4 gap-y-1 text-gray-600'}`}>
            {personalInfo.email && <div>{personalInfo.email}</div>}
            {personalInfo.phone && <div>{selectedTemplate === 'modern' ? '' : '• '}{personalInfo.phone}</div>}
            {personalInfo.location && <div>{selectedTemplate === 'modern' ? '' : '• '}{personalInfo.location}</div>}
            {personalInfo.linkedin && (
                <div>
                    {selectedTemplate !== 'modern' && '• '}
                    <a href={`https://${personalInfo.linkedin}`} target="_blank" rel="noreferrer" className="hover:underline">{personalInfo.linkedin}</a>
                </div>
            )}
            {personalInfo.github && (
                <div>
                    {selectedTemplate !== 'modern' && '• '}
                    <a href={`https://${personalInfo.github}`} target="_blank" rel="noreferrer" className="hover:underline">{personalInfo.github}</a>
                </div>
            )}
        </div>
    );

    const ModernSidebar = () => (
        <aside className="bg-[var(--accent-color)] text-white p-6 flex flex-col gap-6" style={accentStyle}>
            <div className="text-center sm:text-left">
                <h1 className="text-3xl font-bold uppercase tracking-wider mb-4 leading-tight">
                    {personalInfo.fullName || 'Your Name'}
                </h1>
                <ContactInfo />
            </div>

            {/* Skills in Sidebar for Modern */}
            {skills && (typeof skills === 'object') && (
                <div className="mt-4">
                    <h3 className="text-xs font-bold uppercase tracking-widest border-b border-white/30 pb-1 mb-3 opacity-80">Skills</h3>
                    <div className="space-y-4 text-sm">
                        {skills.technical.length > 0 && (
                            <div>
                                <div className="font-semibold opacity-80 mb-1">Technical</div>
                                <div className="leading-relaxed opacity-90">{skills.technical.join(', ')}</div>
                            </div>
                        )}
                        {skills.soft.length > 0 && (
                            <div>
                                <div className="font-semibold opacity-80 mb-1">Soft Skills</div>
                                <div className="leading-relaxed opacity-90">{skills.soft.join(', ')}</div>
                            </div>
                        )}
                        {skills.tools.length > 0 && (
                            <div>
                                <div className="font-semibold opacity-80 mb-1">Tools</div>
                                <div className="leading-relaxed opacity-90">{skills.tools.join(', ')}</div>
                            </div>
                        )}
                    </div>
                </div>
            )}
            {/* Fallback Skills */}
            {skills && (typeof skills === 'string') && (
                <div className="mt-4">
                    <h3 className="text-xs font-bold uppercase tracking-widest border-b border-white/30 pb-1 mb-3 opacity-80">Skills</h3>
                    <p className="text-sm opacity-90">{skills}</p>
                </div>
            )}

            {/* Education in Sidebar for Modern */}
            {education.length > 0 && (
                <div className="mt-2">
                    <h3 className="text-xs font-bold uppercase tracking-widest border-b border-white/30 pb-1 mb-3 opacity-80">Education</h3>
                    <div className="space-y-3">
                        {education.map(edu => (
                            <div key={edu.id}>
                                <div className="font-bold text-sm">{edu.school}</div>
                                <div className="text-xs opacity-90">{edu.degree}</div>
                                <div className="text-xs opacity-70 mt-0.5">{edu.year}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </aside>
    );

    const MainContent = () => (
        <div className={`flex-1 ${selectedTemplate === 'modern' ? 'p-8 pt-10' : ''}`}>

            {/* Header for Non-Modern */}
            {selectedTemplate !== 'modern' && (
                <header className={`text-center mb-8 ${selectedTemplate === 'classic' ? 'border-b-2 border-[var(--accent-color)] pb-6' : ''}`} style={accentStyle}>
                    <h1 className={`font-bold uppercase tracking-widest mb-3 ${selectedTemplate === 'minimal' ? 'text-4xl font-light tracking-tight' : 'text-3xl text-[var(--accent-color)]'}`}>
                        {personalInfo.fullName || 'Your Name'}
                    </h1>
                    <ContactInfo />
                </header>
            )}

            {/* Summary */}
            {summary && (
                <section className="mb-8">
                    <h2
                        className={`text-sm font-bold uppercase tracking-widest mb-3 
                        ${selectedTemplate === 'modern' ? 'text-[var(--accent-color)] border-b border-gray-200 pb-1' : ''}
                        ${selectedTemplate === 'classic' ? 'text-black border-b border-black pb-1 text-center' : ''}
                        ${selectedTemplate === 'minimal' ? 'text-gray-400 mt-8' : ''}`}
                        style={selectedTemplate === 'modern' ? accentStyle : {}}
                    >
                        Professional Summary
                    </h2>
                    <p className="leading-relaxed text-sm text-gray-800">{summary}</p>
                </section>
            )}

            {/* Experience */}
            {experience.length > 0 && (
                <section className="mb-8">
                    <h2
                        className={`text-sm font-bold uppercase tracking-widest mb-4 
                        ${selectedTemplate === 'modern' ? 'text-[var(--accent-color)] border-b border-gray-200 pb-1' : ''}
                        ${selectedTemplate === 'classic' ? 'text-black border-b border-black pb-1 text-center' : ''}
                        ${selectedTemplate === 'minimal' ? 'text-gray-400' : ''}`}
                        style={selectedTemplate === 'modern' ? accentStyle : {}}
                    >
                        Experience
                    </h2>
                    <div className="space-y-6">
                        {experience.map(exp => (
                            <div key={exp.id}>
                                <div className="flex justify-between items-baseline mb-1">
                                    <h3 className="font-bold text-base text-gray-900">{exp.role}</h3>
                                    <span className="text-xs text-gray-500 font-medium">{exp.duration}</span>
                                </div>
                                <div className="font-semibold text-sm mb-2 opacity-80" style={{ color: selectedTemplate === 'modern' ? selectedColor : undefined }}>
                                    {exp.company}
                                </div>
                                <p className="text-sm leading-relaxed whitespace-pre-line text-gray-700">{exp.description}</p>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Projects */}
            {projects.length > 0 && (
                <section className="mb-8">
                    <h2
                        className={`text-sm font-bold uppercase tracking-widest mb-4 
                        ${selectedTemplate === 'modern' ? 'text-[var(--accent-color)] border-b border-gray-200 pb-1' : ''}
                        ${selectedTemplate === 'classic' ? 'text-black border-b border-black pb-1 text-center' : ''}
                        ${selectedTemplate === 'minimal' ? 'text-gray-400' : ''}`}
                        style={selectedTemplate === 'modern' ? accentStyle : {}}
                    >
                        Projects
                    </h2>
                    <div className="space-y-5">
                        {projects.map(proj => (
                            <div key={proj.id} className={`${selectedTemplate === 'modern' ? 'bg-gray-50 p-4 rounded' : ''}`}>
                                <div className="flex justify-between items-baseline mb-1">
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-bold text-sm text-gray-900">{proj.name}</h3>
                                        {(proj.link || proj.github) && (
                                            <div className="flex gap-2 text-xs">
                                                {proj.link && <a href={`https://${proj.link}`} target="_blank" rel="noreferrer" className="text-[var(--accent-color)] hover:underline" style={{ color: selectedColor }}>Live Demo</a>}
                                                {proj.github && <a href={`https://${proj.github}`} target="_blank" rel="noreferrer" className="text-gray-600 hover:underline">GitHub</a>}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <p className="text-sm leading-relaxed mb-2 text-gray-700">{proj.description}</p>
                                {proj.techStack && proj.techStack.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                        {proj.techStack.map((tech, i) => (
                                            <span key={i} className="text-[10px] bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded shadow-sm">
                                                {tech}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Skills & Education for Non-Modern */}
            {selectedTemplate !== 'modern' && (
                <>
                    {/* Education */}
                    {education.length > 0 && (
                        <section className="mb-8">
                            <h2 className={`text-sm font-bold uppercase tracking-widest mb-4 ${selectedTemplate === 'classic' ? 'text-black border-b border-black pb-1 text-center' : 'text-gray-400'}`}>Education</h2>
                            <div className="space-y-3">
                                {education.map(edu => (
                                    <div key={edu.id} className="flex justify-between items-start">
                                        <div>
                                            <div className="font-bold text-sm">{edu.school}</div>
                                            <div className="text-sm text-gray-700">{edu.degree}</div>
                                        </div>
                                        <div className="text-sm text-gray-500">{edu.year}</div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Skills */}
                    {skills && (typeof skills === 'object') && (
                        <section>
                            <h2 className={`text-sm font-bold uppercase tracking-widest mb-4 ${selectedTemplate === 'classic' ? 'text-black border-b border-black pb-1 text-center' : 'text-gray-400'}`}>Skills</h2>
                            <div className="space-y-2 text-sm">
                                {skills.technical.length > 0 && (
                                    <div className="flex">
                                        <span className="font-semibold w-32 shrink-0 text-gray-900">Technical:</span>
                                        <span className="text-gray-700">{skills.technical.join(', ')}</span>
                                    </div>
                                )}
                                {skills.soft.length > 0 && (
                                    <div className="flex">
                                        <span className="font-semibold w-32 shrink-0 text-gray-900">Soft Skills:</span>
                                        <span className="text-gray-700">{skills.soft.join(', ')}</span>
                                    </div>
                                )}
                                {skills.tools.length > 0 && (
                                    <div className="flex">
                                        <span className="font-semibold w-32 shrink-0 text-gray-900">Tools:</span>
                                        <span className="text-gray-700">{skills.tools.join(', ')}</span>
                                    </div>
                                )}
                            </div>
                        </section>
                    )}
                    {skills && (typeof skills === 'string') && (
                        <section>
                            <h2 className={`text-sm font-bold uppercase tracking-widest mb-4 ${selectedTemplate === 'classic' ? 'text-black border-b border-black pb-1 text-center' : 'text-gray-400'}`}>Skills</h2>
                            <p className="text-sm leading-relaxed">{skills}</p>
                        </section>
                    )}
                </>
            )}
        </div>
    );

    // Root Container
    return (
        <div
            className={`bg-white shadow-xl min-h-[297mm] w-full max-w-[210mm] mx-auto scale-90 origin-top text-gray-800 ${selectedTemplate === 'classic' ? 'font-serif' : 'font-sans'}`}
            id="resume-preview"
        >
            {selectedTemplate === 'modern' ? (
                <div className="grid grid-cols-[30%_70%] min-h-[297mm]">
                    <ModernSidebar />
                    <MainContent />
                </div>
            ) : (
                <div className="p-10">
                    <MainContent />
                </div>
            )}
        </div>
    );
};

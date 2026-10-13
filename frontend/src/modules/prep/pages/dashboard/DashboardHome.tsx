import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { Progress } from "../../components/ui/progress";
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip } from 'recharts';
import { PlayCircle, Clock, Calendar } from 'lucide-react';

const ReadinessCircle: React.FC<{ score: number }> = ({ score }) => {
    const radius = 60;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (score / 100) * circumference;

    return (
        <div className="relative w-40 h-40 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90">
                <circle
                    className="text-gray-200"
                    strokeWidth="12"
                    stroke="currentColor"
                    fill="transparent"
                    r={radius}
                    cx="80"
                    cy="80"
                />
                <circle
                    className="text-primary transition-all duration-1000 ease-out"
                    strokeWidth="12"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="transparent"
                    r={radius}
                    cx="80"
                    cy="80"
                />
            </svg>
            <div className="absolute flex flex-col items-center">
                <span className="text-4xl font-bold text-gray-900">{score}</span>
                <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Score</span>
            </div>
        </div>
    );
};

const skillData = [
    { subject: 'DSA', A: 75, fullMark: 100 },
    { subject: 'Sys Des', A: 60, fullMark: 100 },
    { subject: 'Comm', A: 80, fullMark: 100 },
    { subject: 'Resume', A: 85, fullMark: 100 },
    { subject: 'Aptitude', A: 70, fullMark: 100 },
];

export const DashboardHome: React.FC = () => {
    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold font-serif text-gray-900">Welcome back, Student</h1>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Row 1: Overall Readiness & Skill Breakdown */}
                <Card className="flex flex-col items-center justify-center py-8">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-center">Overall Readiness</CardTitle>
                        <CardDescription>Based on your recent activity</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ReadinessCircle score={72} />
                        <p className="text-center mt-4 text-sm text-gray-500">You are in the top 15% of peers!</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Skill Breakdown</CardTitle>
                        <CardDescription>Your proficiency across key areas</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={skillData}>
                                <PolarGrid stroke="#e5e7eb" />
                                <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 12 }} />
                                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                <Radar
                                    name="Skills"
                                    dataKey="A"
                                    stroke="#3733cc"
                                    strokeWidth={2}
                                    fill="#3733cc"
                                    fillOpacity={0.3}
                                />
                                <Tooltip
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    itemStyle={{ color: '#3733cc', fontWeight: 600 }}
                                />
                            </RadarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Row 2: Continue Practice & Weekly Goals */}
                <Card>
                    <CardHeader>
                        <CardTitle>Continue Practice</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h4 className="font-semibold text-gray-900">Dynamic Programming</h4>
                                <p className="text-sm text-gray-500">Last visited 2 hours ago</p>
                            </div>
                            <div className="bg-indigo-100 p-2 rounded-full">
                                <PlayCircle className="text-primary h-6 w-6" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Progress</span>
                                <span className="font-medium">3/10 Completed</span>
                            </div>
                            <Progress value={30} className="h-2 bg-gray-100" />
                        </div>
                        <button className="w-full mt-6 bg-primary hover:bg-indigo-700 text-white font-medium py-2 rounded-md transition-colors">
                            Continue Lesson
                        </button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Weekly Goals</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div>
                                <div className="flex justify-between items-end mb-2">
                                    <span className="text-sm font-medium text-gray-700">Problems Solved</span>
                                    <span className="text-2xl font-bold text-gray-900">12<span className="text-sm text-gray-400 font-normal">/20</span></span>
                                </div>
                                <Progress value={60} className="h-2 bg-gray-100" />
                            </div>

                            <div className="pt-4">
                                <p className="text-xs text-gray-500 mb-3 font-medium uppercase tracking-wide">Activity Log</p>
                                <div className="flex justify-between">
                                    {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
                                        <div key={i} className="flex flex-col items-center gap-1">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${[0, 1, 3, 4].includes(i) ? 'bg-primary text-white' : 'bg-gray-100 text-gray-400'
                                                }`}>
                                                {day}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Row 3: Upcoming Assessments (Full Width on Desktop maybe? Or split if user wants 2 col grid consistent. Let's keep it in the flow) */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>Upcoming Assessments</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-4 md:grid-cols-3">
                            {[
                                { title: "DSA Mock Test", time: "Tomorrow, 10:00 AM", type: "Technical" },
                                { title: "System Design Review", time: "Wed, 2:00 PM", type: "Technical" },
                                { title: "HR Interview Prep", time: "Friday, 11:00 AM", type: "Behavioral" }
                            ].map((item, i) => (
                                <div key={i} className="flex items-start p-4 rounded-lg border border-gray-100 bg-gray-50 hover:bg-indigo-50 hover:border-indigo-100 transition-colors cursor-pointer">
                                    <div className="mr-4 mt-1 bg-white p-2 rounded-full shadow-sm">
                                        <Calendar className="h-5 w-5 text-primary" />
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-gray-900">{item.title}</h4>
                                        <div className="flex items-center text-sm text-gray-500 mt-1">
                                            <Clock className="h-3 w-3 mr-1" />
                                            {item.time}
                                        </div>
                                        <span className="inline-block mt-2 text-xs font-medium px-2 py-0.5 rounded bg-white border border-gray-200 text-gray-600">
                                            {item.type}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

            </div>
        </div>
    );
};

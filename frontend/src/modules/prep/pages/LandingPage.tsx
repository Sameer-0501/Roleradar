import React from 'react';
import { Link } from 'react-router-dom';
import { Code, Video, BarChart } from 'lucide-react';

const LandingPage: React.FC = () => {
    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            {/* Hero Section */}
            <header className="bg-white shadow-sm sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
                    <div className="text-2xl font-bold font-serif text-gray-900">Placement Prep</div>
                    <Link to="/dashboard" className="text-sm font-medium text-gray-700 hover:text-primary transition-colors">
                        Login
                    </Link>
                </div>
            </header>

            <main className="flex-grow">
                <section className="bg-white py-20 lg:py-32">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                        <h1 className="text-5xl md:text-6xl font-extrabold text-gray-900 font-serif mb-6 leading-tight">
                            Ace Your Placement
                        </h1>
                        <p className="text-xl md:text-2xl text-gray-600 mb-10 max-w-3xl mx-auto">
                            Practice, assess, and prepare for your dream job with our comprehensive placement readiness platform.
                        </p>
                        <Link
                            to="/dashboard"
                            className="inline-block bg-primary hover:bg-indigo-700 text-white font-semibold px-8 py-4 rounded-lg shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-1"
                        >
                            Get Started
                        </Link>
                    </div>
                </section>

                {/* Features Section */}
                <section className="py-20 bg-gray-50">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            {/* Feature 1 */}
                            <div className="bg-white p-8 rounded-xl shadow-md hover:shadow-lg transition-shadow border border-gray-100">
                                <div className="bg-indigo-100 p-3 rounded-full w-fit mb-6">
                                    <Code className="h-8 w-8 text-primary" />
                                </div>
                                <h3 className="text-xl font-bold text-gray-900 mb-3 font-serif">Practice Problems</h3>
                                <p className="text-gray-600 leading-relaxed">
                                    Solve hundreds of coding problems tailored to top company interview patterns.
                                </p>
                            </div>

                            {/* Feature 2 */}
                            <div className="bg-white p-8 rounded-xl shadow-md hover:shadow-lg transition-shadow border border-gray-100">
                                <div className="bg-purple-100 p-3 rounded-full w-fit mb-6">
                                    <Video className="h-8 w-8 text-purple-600" />
                                </div>
                                <h3 className="text-xl font-bold text-gray-900 mb-3 font-serif">Mock Interviews</h3>
                                <p className="text-gray-600 leading-relaxed">
                                    Simulate real interview scenarios with AI-driven feedback and peer sessions.
                                </p>
                            </div>

                            {/* Feature 3 */}
                            <div className="bg-white p-8 rounded-xl shadow-md hover:shadow-lg transition-shadow border border-gray-100">
                                <div className="bg-blue-100 p-3 rounded-full w-fit mb-6">
                                    <BarChart className="h-8 w-8 text-blue-600" />
                                </div>
                                <h3 className="text-xl font-bold text-gray-900 mb-3 font-serif">Track Progress</h3>
                                <p className="text-gray-600 leading-relaxed">
                                    Visualize your growth with detailed analytics and performance insights.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            <footer className="bg-gray-900 text-white py-8">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-400">
                    <p>&copy; {new Date().getFullYear()} Placement Readiness Platform. All rights reserved.</p>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;

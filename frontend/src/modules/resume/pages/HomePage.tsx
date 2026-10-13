import React from 'react';
import { Button } from '../components/ui/Button';
import { ArrowRight, FileText } from 'lucide-react';
import { AppNavigation } from '../components/Layout/AppNavigation';
import { useModuleRouter } from '../context/ModuleRouterContext';

export const HomePage: React.FC = () => {
    const { navigate } = useModuleRouter();

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <AppNavigation />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 flex flex-col items-center text-center">
                <div className="bg-blue-50 p-3 rounded-2xl mb-8">
                    <FileText className="w-8 h-8 text-blue-600" />
                </div>

                <h1 className="text-5xl md:text-7xl font-extrabold text-gray-900 tracking-tight mb-6">
                    Build a Resume <br className="hidden md:block" />
                    <span className="text-blue-600">That Gets Read.</span>
                </h1>

                <p className="text-xl text-gray-600 max-w-2xl mb-10 leading-relaxed">
                    Create professional, ATS-friendly resumes in minutes with our AI-powered builder.
                    Stand out from the crowd with premium designs.
                </p>

                <div className="flex flex-col sm:flex-row gap-4">
                    <Button
                        size="lg"
                        className="rounded-full px-8 h-14 text-lg shadow-lg shadow-blue-600/20"
                        onClick={() => navigate('builder')}
                    >
                        Start Building <ArrowRight className="ml-2 w-5 h-5" />
                    </Button>
                    <Button variant="outline" size="lg" className="rounded-full px-8 h-14 text-lg bg-white">
                        View Templates
                    </Button>
                </div>

                {/* Abstract visual decor */}
                <div className="mt-20 relative w-full max-w-4xl mx-auto opacity-50">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-blue-200 rounded-full blur-[100px] -z-10"></div>
                    <div className="bg-white rounded-xl shadow-2xl border border-gray-200 aspect-[16/9] flex items-center justify-center">
                        <p className="text-gray-300 font-medium">App Preview Placeholder</p>
                    </div>
                </div>
            </main>
        </div>
    );
};

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import Head from 'next/head';

const DashboardPage: React.FC = () => {
  const { isAuthenticated, logout } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, router]);

  const handleLogout = async () => {
    setIsLoading(true);
    try {
      await logout();
      router.push('/');
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Dashboard - AI Video System</title>
        <meta name="description" content="AI Video System Dashboard" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className={`min-h-screen ${resolvedTheme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'}`}>
        {/* Navigation Header */}
        <nav className={`${resolvedTheme === 'dark' ? 'bg-gray-800' : 'bg-white'} shadow-lg`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center">
                <div className="flex-shrink-0 flex items-center">
                  <div className="h-8 w-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <span className={`ml-3 text-xl font-semibold ${resolvedTheme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    AI Video System
                  </span>
                </div>
                <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                  <a href="/dashboard" className={`${resolvedTheme === 'dark' ? 'text-white' : 'text-gray-900'} inline-flex items-center px-1 pt-1 border-b-2 border-blue-500 text-sm font-medium`}>
                    Dashboard
                  </a>
                  <a href="/app/projects" className={`${resolvedTheme === 'dark' ? 'text-gray-300 hover:text-white' : 'text-gray-500 hover:text-gray-900'} inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium`}>
                    Projects
                  </a>
                  <a href="/app/templates" className={`${resolvedTheme === 'dark' ? 'text-gray-300 hover:text-white' : 'text-gray-500 hover:text-gray-900'} inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium`}>
                    Templates
                  </a>
                  <a href="/app/analytics" className={`${resolvedTheme === 'dark' ? 'text-gray-300 hover:text-white' : 'text-gray-500 hover:text-gray-900'} inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium`}>
                    Analytics
                  </a>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <button
                  onClick={toggleTheme}
                  className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  aria-label="Toggle theme"
                >
                  {resolvedTheme === 'dark' ? (
                    <svg className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-gray-700" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={handleLogout}
                  disabled={isLoading}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Logging out...' : 'Logout'}
                </button>
              </div>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            <div className="border-4 border-dashed border-gray-200 rounded-lg h-96 flex items-center justify-center">
              <div className="text-center">
                <h1 className={`text-3xl font-bold ${resolvedTheme === 'dark' ? 'text-white' : 'text-gray-900'} mb-4`}>
                  Welcome to AI Video System Dashboard
                </h1>
                <p className={`${resolvedTheme === 'dark' ? 'text-gray-300' : 'text-gray-600'} mb-8`}>
                  This is the main dashboard for the AI Video System. From here you can manage your projects, templates, and analytics.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
                  <div className={`${resolvedTheme === 'dark' ? 'bg-gray-800' : 'bg-white'} p-6 rounded-lg shadow-md`}>
                    <div className="flex items-center justify-center h-12 w-12 rounded-md bg-blue-500 text-white mx-auto mb-4">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <h3 className={`text-lg font-medium ${resolvedTheme === 'dark' ? 'text-white' : 'text-gray-900'} mb-2`}>Projects</h3>
                    <p className={`${resolvedTheme === 'dark' ? 'text-gray-400' : 'text-gray-600'} text-sm mb-4`}>
                      Manage your video projects and track their progress
                    </p>
                    <button className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium">
                      View Projects
                    </button>
                  </div>

                  <div className={`${resolvedTheme === 'dark' ? 'bg-gray-800' : 'bg-white'} p-6 rounded-lg shadow-md`}>
                    <div className="flex items-center justify-center h-12 w-12 rounded-md bg-purple-500 text-white mx-auto mb-4">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                      </svg>
                    </div>
                    <h3 className={`text-lg font-medium ${resolvedTheme === 'dark' ? 'text-white' : 'text-gray-900'} mb-2`}>Templates</h3>
                    <p className={`${resolvedTheme === 'dark' ? 'text-gray-400' : 'text-gray-600'} text-sm mb-4`}>
                      Browse and use pre-designed video templates
                    </p>
                    <button className="w-full bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md text-sm font-medium">
                      Browse Templates
                    </button>
                  </div>

                  <div className={`${resolvedTheme === 'dark' ? 'bg-gray-800' : 'bg-white'} p-6 rounded-lg shadow-md`}>
                    <div className="flex items-center justify-center h-12 w-12 rounded-md bg-green-500 text-white mx-auto mb-4">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    <h3 className={`text-lg font-medium ${resolvedTheme === 'dark' ? 'text-white' : 'text-gray-900'} mb-2`}>Analytics</h3>
                    <p className={`${resolvedTheme === 'dark' ? 'text-gray-400' : 'text-gray-600'} text-sm mb-4`}>
                      View performance metrics and insights
                    </p>
                    <button className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium">
                      View Analytics
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
};

export default DashboardPage;
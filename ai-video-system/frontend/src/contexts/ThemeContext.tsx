import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'light' | 'dark';
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('theme') as Theme;
      if (stored) return stored;
      return 'system';
    }
    return 'system';
  });

  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  // Resolve system theme
  useEffect(() => {
    const resolveTheme = () => {
      if (theme === 'system') {
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        setResolvedTheme(systemTheme);
        return systemTheme;
      }
      setResolvedTheme(theme);
      return theme;
    };

    resolveTheme();

    // Listen for system theme changes
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => resolveTheme();
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [theme]);

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(resolvedTheme);
    
    // Update CSS custom properties for theme
    if (resolvedTheme === 'dark') {
      root.style.setProperty('--color-primary', '59 130 246');
      root.style.setProperty('--color-secondary', '100 116 139');
      root.style.setProperty('--color-success', '34 197 94');
      root.style.setProperty('--color-warning', '245 158 11');
      root.style.setProperty('--color-error', '239 68 68');
      root.style.setProperty('--color-accent', '217 70 239');
    } else {
      root.style.setProperty('--color-primary', '59 130 246');
      root.style.setProperty('--color-secondary', '100 116 139');
      root.style.setProperty('--color-success', '34 197 94');
      root.style.setProperty('--color-warning', '245 158 11');
      root.style.setProperty('--color-error', '239 68 68');
      root.style.setProperty('--color-accent', '217 70 239');
    }
  }, [resolvedTheme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  const toggleTheme = () => {
    if (theme === 'light') {
      setTheme('dark');
    } else if (theme === 'dark') {
      setTheme('light');
    } else {
      // If system, toggle to opposite of current resolved theme
      setTheme(resolvedTheme === 'light' ? 'dark' : 'light');
    }
  };

  const value: ThemeContextType = {
    theme,
    setTheme,
    resolvedTheme,
    toggleTheme,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

// Theme utility functions
export const themeUtils = {
  isDark: (theme: 'light' | 'dark') => theme === 'dark',
  
  getContrast: (bgColor: string) => {
    // Simple contrast calculation - in a real app, you'd use a more sophisticated algorithm
    const color = bgColor.replace('#', '');
    const r = parseInt(color.substr(0, 2), 16);
    const g = parseInt(color.substr(2, 2), 16);
    const b = parseInt(color.substr(4, 2), 16);
    const brightness = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return brightness > 128 ? 'dark' : 'light';
  },
  
  adjustColor: (color: string, amount: number) => {
    const usePound = color[0] === '#';
    const col = usePound ? color.slice(1) : color;
    const num = parseInt(col, 16);
    let r = (num >> 16) + amount;
    let g = ((num >> 8) & 0x00FF) + amount;
    let b = (num & 0x0000FF) + amount;
    r = r > 255 ? 255 : r < 0 ? 0 : r;
    g = g > 255 ? 255 : g < 0 ? 0 : g;
    b = b > 255 ? 255 : b < 0 ? 0 : b;
    return (usePound ? '#' : '') + (r << 16 | g << 8 | b).toString(16).padStart(6, '0');
  },
  
  getThemeColors: (theme: 'light' | 'dark') => ({
    primary: theme === 'dark' ? '#60a5fa' : '#3b82f6',
    secondary: theme === 'dark' ? '#64748b' : '#475569',
    success: theme === 'dark' ? '#4ade80' : '#22c55e',
    warning: theme === 'dark' ? '#fbbf24' : '#f59e0b',
    error: theme === 'dark' ? '#f87171' : '#ef4444',
    accent: theme === 'dark' ? '#e879f9' : '#d946ef',
    background: theme === 'dark' ? '#0f172a' : '#ffffff',
    surface: theme === 'dark' ? '#1e293b' : '#f8fafc',
    text: theme === 'dark' ? '#f1f5f9' : '#0f172a',
    textSecondary: theme === 'dark' ? '#cbd5e1' : '#64748b',
    border: theme === 'dark' ? '#334155' : '#e2e8f0',
  }),
};

// Theme components for consistent styling
export const ThemeComponents = {
  Card: ({ children, className = '', ...props }: any) => {
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';
    
    return (
      <div
        className={`rounded-lg border ${isDark ? 'bg-secondary-900 border-secondary-700' : 'bg-white border-gray-200'} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  },
  
  Button: ({ 
    children, 
    variant = 'primary', 
    size = 'md', 
    className = '', 
    ...props 
  }: any) => {
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';
    
    const baseClasses = 'inline-flex items-center justify-center font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2';
    
    const variantClasses = {
      primary: `bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500`,
      secondary: `${isDark ? 'bg-secondary-700 text-secondary-100 hover:bg-secondary-600' : 'bg-gray-200 text-gray-900 hover:bg-gray-300'} focus:ring-secondary-500`,
      outline: `border ${isDark ? 'border-secondary-600 text-secondary-300 hover:bg-secondary-800' : 'border-gray-300 text-gray-700 hover:bg-gray-50'} focus:ring-primary-500`,
      ghost: `${isDark ? 'text-secondary-300 hover:bg-secondary-800' : 'text-gray-700 hover:bg-gray-100'} focus:ring-primary-500`,
      danger: 'bg-error-600 text-white hover:bg-error-700 focus:ring-error-500',
    };
    
    const sizeClasses = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2 text-sm',
      lg: 'px-6 py-3 text-base',
    };
    
    return (
      <button
        className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  },
  
  Input: ({ className = '', ...props }: any) => {
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';
    
    return (
      <input
        className={`block w-full rounded-md border ${isDark ? 'bg-secondary-800 border-secondary-600 text-white placeholder-secondary-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'} focus:ring-primary-500 focus:border-primary-500 ${className}`}
        {...props}
      />
    );
  },
};

export default ThemeContext;
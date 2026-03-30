import { useState, useEffect } from 'react';

interface SiteConfig {
    appName: string;
    logoUrl: string;
    themeColor: string;
}

export function useSiteConfig() {
    const [config, setConfig] = useState<SiteConfig>({
        appName: 'StreamsAI',
        logoUrl: '/logo.png',
        themeColor: '#a855f7'
    });

    useEffect(() => {
        fetch('/api/admin/config')
            .then((res) => res.json())
            .then((data) => {
                if (data && !data.error) {
                    setConfig((prev) => ({ ...prev, ...data }));

                    // Apply theme color
                    if (data.themeColor) {
                        document.documentElement.style.setProperty('--color-accent-indigo', data.themeColor);
                        document.documentElement.style.setProperty('--color-accent-purple', data.themeColor);
                    }
                }
            })
            .catch((err) => console.error('Failed to fetch site config:', err));
    }, []);

    return config;
}

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { UserSettings } from '../logic/types';
import { UserSettingsRepository } from '../db/repositories';
import { waitForDatabase } from '../db/database';
import { Events, GlobalEvents } from '../events';

interface UserSettingsContextType {
    settings: UserSettings | null;
    loading: boolean;
    error: Error | null;
    refresh: () => Promise<void>;
    updateSettings: (updates: Partial<UserSettings>) => Promise<void>;
}

const UserSettingsContext = createContext<UserSettingsContextType | undefined>(undefined);

export function UserSettingsProvider({ children }: { children: React.ReactNode }) {
    const [settings, setSettings] = useState<UserSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchSettings = useCallback(async () => {
        try {
            setError(null);
            await waitForDatabase();
            const s = await UserSettingsRepository.get();
            setSettings(s);
        } catch (e) {
            setError(e as Error);
        } finally {
            setLoading(false);
        }
    }, []);

    const updateSettings = useCallback(async (updates: Partial<UserSettings>) => {
        try {
            await UserSettingsRepository.update(updates);
            await fetchSettings();
        } catch (e) {
            console.error("Failed to update settings:", e);
            throw e;
        }
    }, [fetchSettings]);

    // Initial load
    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    // Keep settings in sync across the app
    useEffect(() => {
        return GlobalEvents.on(Events.userSettingsChanged, fetchSettings);
    }, [fetchSettings]);

    const value = {
        settings,
        loading,
        error,
        refresh: fetchSettings,
        updateSettings
    };

    return (
        <UserSettingsContext.Provider value= { value } >
        { children }
        </UserSettingsContext.Provider>
  );
}

export function useUserSettings() {
    const context = useContext(UserSettingsContext);
    if (context === undefined) {
        throw new Error('useUserSettings must be used within a UserSettingsProvider');
    }
    return context;
}

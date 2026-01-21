/**
 * CustomPopupProvider - Global context for imperative popup API
 * 
 * Usage:
 *   const { showPopup, showActionSheet, showInfo } = useCustomPopup();
 *   
 *   showPopup({ title: 'Delete?', message: '...', buttons: [...] });
 *   showActionSheet({ title: 'Options', actions: [...] });
 *   showInfo({ title: 'Join Code', copyableContent: 'ABC123' });
 */

import React, { createContext, useCallback, useContext, useState } from 'react';
import { CustomPopup, PopupAction, PopupButton } from './CustomPopup';

// ============================================================================
// Types
// ============================================================================

interface ShowPopupOptions {
    title: string;
    message?: string;
    buttons?: PopupButton[];
}

interface ShowActionSheetOptions {
    title: string;
    actions: PopupAction[];
}

interface ShowInfoOptions {
    title: string;
    copyableContent: string;
    copyButtonText?: string;
}

interface CustomPopupContextValue {
    showPopup: (options: ShowPopupOptions) => void;
    showActionSheet: (options: ShowActionSheetOptions) => void;
    showInfo: (options: ShowInfoOptions) => void;
}

// ============================================================================
// Context
// ============================================================================

const CustomPopupContext = createContext<CustomPopupContextValue | null>(null);

export function useCustomPopup(): CustomPopupContextValue {
    const context = useContext(CustomPopupContext);
    if (!context) {
        throw new Error('useCustomPopup must be used within a CustomPopupProvider');
    }
    return context;
}

// ============================================================================
// Provider
// ============================================================================

interface PopupState {
    visible: boolean;
    variant: 'alert' | 'actionSheet' | 'info';
    title: string;
    message?: string;
    buttons?: PopupButton[];
    actions?: PopupAction[];
    copyableContent?: string;
    copyButtonText?: string;
}

const initialState: PopupState = {
    visible: false,
    variant: 'alert',
    title: '',
};

export function CustomPopupProvider({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<PopupState>(initialState);

    const handleClose = useCallback(() => {
        setState((prev) => ({ ...prev, visible: false }));
    }, []);

    const showPopup = useCallback((options: ShowPopupOptions) => {
        setState({
            visible: true,
            variant: 'alert',
            title: options.title,
            message: options.message,
            buttons: options.buttons ?? [{ text: 'OK', style: 'default' }],
        });
    }, []);

    const showActionSheet = useCallback((options: ShowActionSheetOptions) => {
        setState({
            visible: true,
            variant: 'actionSheet',
            title: options.title,
            actions: options.actions,
        });
    }, []);

    const showInfo = useCallback((options: ShowInfoOptions) => {
        setState({
            visible: true,
            variant: 'info',
            title: options.title,
            copyableContent: options.copyableContent,
            copyButtonText: options.copyButtonText,
        });
    }, []);

    const contextValue: CustomPopupContextValue = {
        showPopup,
        showActionSheet,
        showInfo,
    };

    return (
        <CustomPopupContext.Provider value={contextValue}>
            {children}
            <CustomPopup
                visible={state.visible}
                onClose={handleClose}
                variant={state.variant}
                title={state.title}
                message={state.message}
                buttons={state.buttons}
                actions={state.actions}
                copyableContent={state.copyableContent}
                copyButtonText={state.copyButtonText}
            />
        </CustomPopupContext.Provider>
    );
}

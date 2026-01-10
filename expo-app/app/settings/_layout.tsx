/**
 * Settings layout - nested stack for settings sub-screens
 */

import { Stack } from 'expo-router';

export default function SettingsLayout() {
    return (
        <Stack
            screenOptions={{
                headerStyle: { backgroundColor: '#000000' },
                headerTintColor: '#FFFFFF',
                headerTitleStyle: {
                    fontFamily: 'AvenirNextCondensed-DemiBold',
                },
            }}
        />
    );
}

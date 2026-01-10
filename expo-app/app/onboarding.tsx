import { Stack } from 'expo-router';
import { OnboardingScreen } from '../screens/OnboardingScreen';

export default function OnboardingRoute() {
    return (
        <>
            <Stack.Screen options={{ headerShown: false }} />
            <OnboardingScreen />
        </>
    );
}

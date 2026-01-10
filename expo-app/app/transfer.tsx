import React from 'react';
import { useRouter } from 'expo-router';
import { TransferMoneyScreen } from '../screens/TransferMoneyScreen';

export default function TransferRoute() {
    const router = useRouter();

    return (
        <TransferMoneyScreen
            onDismiss={() => router.back()}
        />
    );
}

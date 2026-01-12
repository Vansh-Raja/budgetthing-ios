/**
 * User Profile Card Component
 * 
 * Displays signed-in user info with avatar and sign-out button.
 */

import React from 'react';
import {
    View,
    TouchableOpacity,
    StyleSheet,
    Image,
} from 'react-native';
import { Text } from '@/components/ui/LockedText';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface UserProfileCardProps {
    email?: string | null;
    firstName?: string | null;
    imageUrl?: string | null;
    onSignOutPress: () => void;
}

export function UserProfileCard({
    email,
    firstName,
    imageUrl,
    onSignOutPress,
}: UserProfileCardProps) {
    const displayName = firstName || email?.split('@')[0] || 'User';

    const handleSignOut = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onSignOutPress();
    };

    return (
        <View style={styles.container}>
            <View style={styles.userInfo}>
                {imageUrl ? (
                    <Image source={{ uri: imageUrl }} style={styles.avatar} />
                ) : (
                    <View style={styles.avatarPlaceholder}>
                        <Ionicons name="person" size={24} color="rgba(255, 255, 255, 0.6)" />
                    </View>
                )}
                <View style={styles.textContainer}>
                    <Text style={styles.name}>{displayName}</Text>
                    {email && <Text style={styles.email}>{email}</Text>}
                </View>
            </View>

            <TouchableOpacity
                style={styles.signOutButton}
                onPress={handleSignOut}
                activeOpacity={0.7}
            >
                <Text style={styles.signOutText}>Sign Out</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: 16,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    userInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        marginRight: 12,
    },
    avatarPlaceholder: {
        width: 44,
        height: 44,
        borderRadius: 22,
        marginRight: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.12)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    textContainer: {
        flex: 1,
    },
    name: {
        fontFamily: 'AvenirNextCondensed-DemiBold',
        fontSize: 17,
        color: '#FFFFFF',
    },
    email: {
        fontFamily: 'AvenirNextCondensed-Medium',
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.5)',
        marginTop: 2,
    },
    signOutButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: 'rgba(255, 59, 48, 0.15)',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(255, 59, 48, 0.3)',
    },
    signOutText: {
        fontFamily: 'AvenirNextCondensed-DemiBold',
        fontSize: 15,
        color: '#FF3B30',
    },
});

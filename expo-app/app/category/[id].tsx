import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { CategoryDetailScreen } from '../../screens/CategoryDetailScreen';

export default function CategoryDetailRoute() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();

    if (!id) {
        router.back();
        return null;
    }

    return (
        <>
            <Stack.Screen options={{ headerShown: false }} />
            <CategoryDetailScreen categoryId={id} onDismiss={() => router.back()} />
        </>
    );
}

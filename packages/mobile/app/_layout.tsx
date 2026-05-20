import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { Colors } from '../constants/colors';

SplashScreen.preventAutoHideAsync();

// ── PUSH NOTIFICATIONS DISABLED ───────────────────────────────────────────────
// Re-enable before production build:
//   1. Uncomment all imports below
//   2. Uncomment NotificationHandler component and its usage in RootLayout
//   3. Uncomment setupBackgroundScan() call in RootLayout
//   4. Requires a dev build — does NOT work in Expo Go SDK 53+
//
// import { useRef } from 'react';
// import { Platform } from 'react-native';
// import { useRouter } from 'expo-router';
// import * as BackgroundFetch from 'expo-background-fetch';
// import * as TaskManager from 'expo-task-manager';
// import * as Notifications from 'expo-notifications';
// import type { NotificationResponse } from 'expo-notifications';
// import {
//   BACKGROUND_SCAN_TASK,
//   runFullScan,
//   getUnnotifiedAlerts,
//   markNotified,
// } from '../services/scanner';
// import { getStoredContent } from '../hooks/useBlockchain';
//
// if (Platform.OS !== 'web') {
//   Notifications.setNotificationHandler({
//     handleNotification: async () => ({
//       shouldShowAlert: true,
//       shouldPlaySound: true,
//       shouldSetBadge: true,
//       shouldShowBanner: true,
//       shouldShowList: true,
//     } as any),
//   });
// }
//
// if (Platform.OS !== 'web') {
//   TaskManager.defineTask(BACKGROUND_SCAN_TASK, async () => {
//     try {
//       const content = await getStoredContent();
//       if (content.length === 0) return BackgroundFetch.BackgroundFetchResult.NoData;
//       await runFullScan(
//         content.map((c) => ({
//           contentHash: c.contentHash,
//           contentName: c.contentName,
//           contentType: c.contentType as any,
//           watermarkPattern: c.watermarkPattern,
//         }))
//       );
//       const fresh = await getUnnotifiedAlerts();
//       if (fresh.length > 0) {
//         const first = fresh[0];
//         await Notifications.scheduleNotificationAsync({
//           content: {
//             title: '⚠️ SIGIL — Content Match Detected',
//             body:
//               fresh.length === 1
//                 ? `"${first.contentName}" found on ${first.source} (${first.confidence}% match)`
//                 : `${fresh.length} new matches found for your registered content`,
//             sound: true,
//             data: { alertId: first.id, screen: 'evidence', count: fresh.length },
//           },
//           trigger: null,
//         });
//         await markNotified(fresh.map((a) => a.id));
//         return BackgroundFetch.BackgroundFetchResult.NewData;
//       }
//       return BackgroundFetch.BackgroundFetchResult.NoData;
//     } catch {
//       return BackgroundFetch.BackgroundFetchResult.Failed;
//     }
//   });
// }
//
// async function setupBackgroundScan() {
//   if (Platform.OS === 'web') return;
//   try {
//     const { status } = await Notifications.getPermissionsAsync();
//     if (status !== 'granted') await Notifications.requestPermissionsAsync();
//   } catch {}
//   try {
//     const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SCAN_TASK);
//     if (!isRegistered) {
//       await BackgroundFetch.registerTaskAsync(BACKGROUND_SCAN_TASK, {
//         minimumInterval: 15 * 60,
//         stopOnTerminate: false,
//         startOnBoot: true,
//       });
//     }
//   } catch {}
// }
//
// function NotificationHandler() {
//   const router = useRouter();
//   const notificationListener = useRef<{ remove: () => void } | undefined>(undefined);
//   const responseListener = useRef<{ remove: () => void } | undefined>(undefined);
//   useEffect(() => {
//     if (Platform.OS === 'web') return;
//     responseListener.current = Notifications.addNotificationResponseReceivedListener(
//       (response: NotificationResponse) => {
//         const data = response.notification.request.content.data as any;
//         if (data?.alertId && data?.screen === 'evidence') {
//           router.push(`/evidence/${data.alertId}` as any);
//         } else if (data?.screen === 'alerts') {
//           router.push('/(tabs)/alerts' as any);
//         }
//       }
//     );
//     notificationListener.current = Notifications.addNotificationReceivedListener(() => {});
//     Notifications.getLastNotificationResponseAsync().then((response) => {
//       if (response) {
//         const data = response.notification.request.content.data as any;
//         if (data?.alertId && data?.screen === 'evidence') {
//           setTimeout(() => router.push(`/evidence/${data.alertId}` as any), 500);
//         }
//       }
//     });
//     return () => {
//       notificationListener.current?.remove?.();
//       responseListener.current?.remove?.();
//     };
//   }, []);
//   return null;
// }
// ─────────────────────────────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

export default function RootLayout() {
  useEffect(() => {
    // setupBackgroundScan(); // re-enable with notifications
    SplashScreen.hideAsync();
  }, []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" backgroundColor={Colors.background} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Colors.background },
            animation: 'ios_from_right',
            animationDuration: 280,
          }}
        >
          <Stack.Screen name="index" options={{ animation: 'fade' }} />
          <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
          <Stack.Screen
            name="evidence/[id]"
            options={{ animation: 'ios_from_right' }}
          />
          <Stack.Screen
            name="settings"
            options={{ animation: 'slide_from_bottom' }}
          />
          <Stack.Screen
            name="debug"
            options={{ animation: 'slide_from_bottom' }}
          />
          <Stack.Screen
            name="dispute/[id]"
            options={{ animation: 'ios_from_right' }}
          />
          <Stack.Screen
            name="provenance/[id]"
            options={{ animation: 'ios_from_right' }}
          />
        </Stack>
        {/* <NotificationHandler /> */}
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

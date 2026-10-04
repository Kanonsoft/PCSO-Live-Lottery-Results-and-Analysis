import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState, Linking, Platform } from 'react-native';

import {
  ResultRemindersContext,
  type EnableResultRemindersResult,
  type ResultReminderStatus,
  type ResultRemindersContextValue,
} from '@/providers/notifications-context';
import { usePreferences } from '@/providers/preferences-provider';

const CHANNEL_ID = 'lotto-result-reminders';
const REMINDER_KIND = 'lotto-result-reminder';
const REMINDER_VERSION = 2;
const REMINDER_TIMES = Object.freeze([
  { hour: 14, minute: 0, label: '2:00 PM' },
  { hour: 17, minute: 0, label: '5:00 PM' },
  { hour: 21, minute: 0, label: '9:00 PM' },
]);

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function scheduleKey(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function isOwnedReminder(request: Notifications.NotificationRequest): boolean {
  return request.content.data?.kind === REMINDER_KIND;
}

function requestScheduleKey(request: Notifications.NotificationRequest): string | null {
  const value = request.content.data?.scheduleKey;
  return typeof value === 'string' ? value : null;
}

function requestVersionIsCurrent(request: Notifications.NotificationRequest): boolean {
  return request.content.data?.version === REMINDER_VERSION;
}

function triggerMatches(
  trigger: Notifications.NotificationTrigger,
  hour: number,
  minute: number,
): boolean {
  if (!trigger || typeof trigger !== 'object') return false;
  const candidate = trigger as {
    type?: string;
    hour?: number;
    minute?: number;
    repeats?: boolean;
    dateComponents?: { hour?: number; minute?: number };
  };
  if (candidate.type === 'daily') {
    return candidate.hour === hour && candidate.minute === minute;
  }
  if (candidate.type === 'calendar') {
    return (
      candidate.repeats === true &&
      candidate.dateComponents?.hour === hour &&
      candidate.dateComponents?.minute === minute
    );
  }
  return false;
}

async function configureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Lotto result reminders',
    description: 'Daily reminders to check newly published lotto results',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
    enableVibrate: true,
    vibrationPattern: [0, 200, 120, 200],
    lightColor: '#0050A4',
    showBadge: false,
  });
}

async function cancelOwnedReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const owned = scheduled.filter(isOwnedReminder);
  await Promise.all(
    owned.map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)),
  );
}

async function reconcileOwnedReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const owned = scheduled.filter(isOwnedReminder);
  const retained = new Set<string>();

  for (const time of REMINDER_TIMES) {
    const key = scheduleKey(time.hour, time.minute);
    const existing = owned.find(
      (request) =>
        !retained.has(request.identifier) &&
        requestScheduleKey(request) === key &&
        requestVersionIsCurrent(request) &&
        triggerMatches(request.trigger, time.hour, time.minute),
    );

    if (existing) {
      retained.add(existing.identifier);
      continue;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Check today\'s lotto results',
        body: `It is ${time.label}. Open the app to check the latest available results.`,
        data: {
          kind: REMINDER_KIND,
          scheduleKey: key,
          version: REMINDER_VERSION,
          route: 'results',
        },
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: time.hour,
        minute: time.minute,
        channelId: CHANNEL_ID,
      },
    });
  }

  const staleOrDuplicate = owned.filter((request) => !retained.has(request.identifier));
  await Promise.all(
    staleOrDuplicate.map((request) =>
      Notifications.cancelScheduledNotificationAsync(request.identifier),
    ),
  );
}

function permissionResult(
  permission: Notifications.NotificationPermissionsStatus,
): EnableResultRemindersResult {
  return {
    granted: permissionAllowsNotifications(permission),
    canAskAgain: permission.canAskAgain,
  };
}

function permissionAllowsNotifications(
  permission: Notifications.NotificationPermissionsStatus,
): boolean {
  if (permission.granted) return true;
  const iosStatus = permission.ios?.status;
  return (
    iosStatus === Notifications.IosAuthorizationStatus.AUTHORIZED ||
    iosStatus === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    iosStatus === Notifications.IosAuthorizationStatus.EPHEMERAL
  );
}

function isReminderResponse(response: Notifications.NotificationResponse): boolean {
  return response.notification.request.content.data?.kind === REMINDER_KIND;
}

export function ResultRemindersProvider({ children }: PropsWithChildren) {
  const {
    ready,
    resultRemindersEnabled,
    setResultRemindersEnabled,
  } = usePreferences();
  const [status, setStatus] = useState<ResultReminderStatus>('loading');
  const [permissionCanAskAgain, setPermissionCanAskAgain] = useState(true);
  const operationQueue = useRef<Promise<unknown>>(Promise.resolve());

  const enqueue = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
    const next = operationQueue.current.then(operation, operation);
    operationQueue.current = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }, []);

  const syncEnabled = useCallback(
    (requestPermission: boolean) =>
      enqueue(async (): Promise<EnableResultRemindersResult> => {
        setStatus('loading');
        try {
          // Android must have a channel before its notification permission prompt.
          await configureAndroidChannel();
          let permission = await Notifications.getPermissionsAsync();
          if (
            !permissionAllowsNotifications(permission) &&
            requestPermission &&
            permission.canAskAgain
          ) {
            permission = await Notifications.requestPermissionsAsync({
              ios: { allowAlert: true, allowSound: true, allowBadge: false },
            });
          }

          setPermissionCanAskAgain(permission.canAskAgain);
          if (!permissionAllowsNotifications(permission)) {
            setStatus('denied');
            return permissionResult(permission);
          }

          await reconcileOwnedReminders();
          setStatus('scheduled');
          return permissionResult(permission);
        } catch {
          setStatus('error');
          return { granted: false, canAskAgain: false };
        }
      }),
    [enqueue],
  );

  const disableReminders = useCallback(async () => {
    setResultRemindersEnabled(false);
    await enqueue(async () => {
      try {
        await cancelOwnedReminders();
        setStatus('disabled');
      } catch {
        setStatus('error');
      }
    });
  }, [enqueue, setResultRemindersEnabled]);

  const enableReminders = useCallback(async () => {
    setResultRemindersEnabled(true);
    return syncEnabled(true);
  }, [setResultRemindersEnabled, syncEnabled]);

  const openNotificationSettings = useCallback(async () => {
    try {
      await Linking.openSettings();
    } catch {
      // The Settings app may be unavailable on unusual devices; keep the app usable.
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (resultRemindersEnabled) {
      void syncEnabled(true);
      return;
    }
    void enqueue(async () => {
      try {
        await cancelOwnedReminders();
        setStatus('disabled');
      } catch {
        setStatus('error');
      }
    });
  }, [enqueue, ready, resultRemindersEnabled, syncEnabled]);

  useEffect(() => {
    if (!ready || !resultRemindersEnabled) return;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void syncEnabled(false);
    });
    return () => subscription.remove();
  }, [ready, resultRemindersEnabled, syncEnabled]);

  useEffect(() => {
    const openResults = (response: Notifications.NotificationResponse) => {
      if (!isReminderResponse(response)) return;
      Notifications.clearLastNotificationResponse();
      router.replace('/');
    };

    const lastResponse = Notifications.getLastNotificationResponse();
    if (lastResponse) openResults(lastResponse);
    const subscription = Notifications.addNotificationResponseReceivedListener(openResults);
    return () => subscription.remove();
  }, []);

  const value = useMemo<ResultRemindersContextValue>(
    () => ({
      available: true,
      status,
      permissionCanAskAgain,
      enableReminders,
      disableReminders,
      openNotificationSettings,
    }),
    [
      disableReminders,
      enableReminders,
      openNotificationSettings,
      permissionCanAskAgain,
      status,
    ],
  );

  return (
    <ResultRemindersContext.Provider value={value}>
      {children}
    </ResultRemindersContext.Provider>
  );
}

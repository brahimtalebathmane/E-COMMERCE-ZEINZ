type OneSignalPushSubscription = {
  optedIn?: boolean;
  id?: string | null;
  token?: string | null;
  optIn(): Promise<void>;
  optOut(): Promise<void>;
  addEventListener(event: "change", cb: (change: unknown) => void): void;
};

type OneSignalNotifications = {
  permission: boolean;
  permissionNative?: NotificationPermission;
  isPushSupported(): boolean;
  requestPermission(): Promise<void>;
  addEventListener(event: "permissionChange", cb: (granted: boolean) => void): void;
  addEventListener(
    event: "foregroundWillDisplay" | "click" | "dismiss",
    cb: (event: unknown) => void,
  ): void;
};

type OneSignalUser = {
  addTag(key: string, value: string): void;
  PushSubscription: OneSignalPushSubscription;
};

type OneSignalClient = {
  init(options: Record<string, unknown>): Promise<void>;
  login(externalId: string): Promise<void>;
  Debug: { setLogLevel(level: "trace" | "debug" | "info" | "warn" | "error"): void };
  User: OneSignalUser;
  Notifications: OneSignalNotifications;
};

interface Window {
  OneSignalDeferred?: Array<(oneSignal: OneSignalClient) => void | Promise<void>>;
  OneSignal?: OneSignalClient;
}

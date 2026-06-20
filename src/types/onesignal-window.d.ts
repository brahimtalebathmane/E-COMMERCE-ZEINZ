type OneSignalClient = {
  init(options: Record<string, unknown>): Promise<void>;
  User: {
    addTag(key: string, value: string): void;
  };
};

interface Window {
  OneSignalDeferred?: Array<(oneSignal: OneSignalClient) => void | Promise<void>>;
}

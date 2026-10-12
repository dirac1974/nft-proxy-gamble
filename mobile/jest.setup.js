/* global jest */
jest.mock("expo-av", () => {
  // Each createAsync returns a fresh mock instance so tests can track individual voices.
  // `__finish()` simulates the native didJustFinish status update.
  const makeSound = (asset, initialStatus) => {
    const s = {
      asset,
      initialStatus,
      onStatus: null,
      replayAsync: jest.fn(() => Promise.resolve()),
      playAsync: jest.fn(() => Promise.resolve()),
      pauseAsync: jest.fn(() => Promise.resolve()),
      stopAsync: jest.fn(() => Promise.resolve()),
      unloadAsync: jest.fn(() => Promise.resolve()),
      setVolumeAsync: jest.fn(() => Promise.resolve()),
      setPositionAsync: jest.fn(() => Promise.resolve()),
      setIsLoopingAsync: jest.fn(() => Promise.resolve()),
      setStatusAsync: jest.fn(() => Promise.resolve()),
      setOnPlaybackStatusUpdate: jest.fn((cb) => {
        s.onStatus = cb;
      }),
      __finish: () => s.onStatus?.({ isLoaded: true, didJustFinish: true, isPlaying: false }),
    };
    return s;
  };
  return {
    Audio: {
      setAudioModeAsync: jest.fn(() => Promise.resolve()),
      Sound: {
        createAsync: jest.fn((asset, status) =>
          Promise.resolve({ sound: makeSound(asset, status), status: { isLoaded: true } }),
        ),
      },
    },
  };
});
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
}));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

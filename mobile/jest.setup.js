/* global jest */
jest.mock("expo-av", () => {
  const sound = {
    replayAsync: jest.fn(() => Promise.resolve()),
    stopAsync: jest.fn(() => Promise.resolve()),
    unloadAsync: jest.fn(() => Promise.resolve()),
    setVolumeAsync: jest.fn(() => Promise.resolve()),
  };
  return {
    Audio: {
      setAudioModeAsync: jest.fn(() => Promise.resolve()),
      Sound: { createAsync: jest.fn(() => Promise.resolve({ sound })) },
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

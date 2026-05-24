import { act } from "@testing-library/react-native";
import { useGameStore } from "@/stores/gameStore";

// Reset zustand state between tests
beforeEach(() => {
  useGameStore.getState().reset();
});

describe("gameStore", () => {
  it("starts in idle phase with 0 balance", () => {
    const state = useGameStore.getState();
    expect(state.phase).toBe("idle");
    expect(state.coinBalance).toBe(0);
    expect(state.session).toBeNull();
  });

  it("setBalance updates coinBalance", () => {
    act(() => useGameStore.getState().setBalance(1000));
    expect(useGameStore.getState().coinBalance).toBe(1000);
  });

  it("setBetAmount clamps to 1-5", () => {
    act(() => useGameStore.getState().setBetAmount(0));
    expect(useGameStore.getState().betAmount).toBe(1);
    act(() => useGameStore.getState().setBetAmount(6));
    expect(useGameStore.getState().betAmount).toBe(5);
    act(() => useGameStore.getState().setBetAmount(3));
    expect(useGameStore.getState().betAmount).toBe(3);
  });

  it("setSession transitions to session_started phase", () => {
    const session = { sessionId: "s1", serverSeedHash: "0xabc", clientSeed: "xyz", betAmount: 2 };
    act(() => useGameStore.getState().setSession(session));
    const state = useGameStore.getState();
    expect(state.phase).toBe("session_started");
    expect(state.session).toEqual(session);
    expect(state.dealt).toBeNull();
  });

  it("setDealt transitions to dealt phase with all holds false", () => {
    act(() => useGameStore.getState().setSession({ sessionId: "s1", serverSeedHash: "h", clientSeed: "c", betAmount: 1 }));
    act(() => useGameStore.getState().setDealt([0, 1, 2, 3, 4]));
    const state = useGameStore.getState();
    expect(state.phase).toBe("dealt");
    expect(state.dealt?.dealtCards).toEqual([0, 1, 2, 3, 4]);
    expect(state.dealt?.holds).toEqual([false, false, false, false, false]);
  });

  it("toggleHold flips specific hold index", () => {
    act(() => useGameStore.getState().setSession({ sessionId: "s1", serverSeedHash: "h", clientSeed: "c", betAmount: 1 }));
    act(() => useGameStore.getState().setDealt([0, 1, 2, 3, 4]));
    act(() => useGameStore.getState().toggleHold(2));
    expect(useGameStore.getState().dealt?.holds).toEqual([false, false, true, false, false]);
    act(() => useGameStore.getState().toggleHold(2));
    expect(useGameStore.getState().dealt?.holds).toEqual([false, false, false, false, false]);
  });

  it("setResult transitions to drawn phase and updates balance", () => {
    act(() => useGameStore.getState().setSession({ sessionId: "s1", serverSeedHash: "h", clientSeed: "c", betAmount: 1 }));
    act(() => useGameStore.getState().setDealt([0, 1, 2, 3, 4]));
    const result = { drawnCards: [0, 1, 2, 3, 4], rank: "Full House", payout: 9, serverSeed: "abc123" };
    act(() => useGameStore.getState().setResult(result, 1009));
    const state = useGameStore.getState();
    expect(state.phase).toBe("drawn");
    expect(state.result).toEqual(result);
    expect(state.coinBalance).toBe(1009);
  });

  it("reset returns to idle", () => {
    act(() => useGameStore.getState().setBalance(500));
    act(() => useGameStore.getState().setSession({ sessionId: "s1", serverSeedHash: "h", clientSeed: "c", betAmount: 1 }));
    act(() => useGameStore.getState().reset());
    const state = useGameStore.getState();
    expect(state.phase).toBe("idle");
    expect(state.session).toBeNull();
    expect(state.coinBalance).toBe(500); // balance persists across reset
  });
});

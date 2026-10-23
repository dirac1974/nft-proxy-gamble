import { useEffect, useRef, useState } from "react";
import type { BlackjackRound } from "@/services/api";
import { motion } from "@/theme";
import {
  EMPTY_SHOWN,
  applyStep,
  planSteps,
  remapForSplit,
  scaleTimings,
  type Shown,
  type Step,
} from "./bjLogic";

// Paces a server round onto the felt. Every new round object re-plans from what
// is currently shown, so a late response never skips or replays cards. Timers
// are cancelled on change and on unmount.
export function useDealTimeline(
  round: BlackjackRound | null,
  reduceMotion: boolean,
  onStep: (step: Step, round: BlackjackRound, shown: Shown) => void,
): { shown: Shown; animating: boolean } {
  const [shown, setShown] = useState<Shown>(EMPTY_SHOWN);
  const [animating, setAnimating] = useState(false);
  const shownRef = useRef<Shown>(EMPTY_SHOWN);
  const prevRound = useRef<BlackjackRound | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;

  useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];

    if (!round) {
      prevRound.current = null;
      shownRef.current = EMPTY_SHOWN;
      setShown(EMPTY_SHOWN);
      setAnimating(false);
      return;
    }

    const from = remapForSplit(shownRef.current, prevRound.current, round);
    prevRound.current = round;
    shownRef.current = from;
    setShown(from);

    const steps = planSteps(
      from,
      round,
      scaleTimings(
        { cardInterval: motion.bjCardInterval, dealerDraw: motion.bjDealerDraw, revealDelay: motion.bjRevealDelay },
        reduceMotion,
      ),
    );
    if (steps.length === 0) {
      setAnimating(false);
      return;
    }
    setAnimating(true);
    steps.forEach((step, i) => {
      timers.current.push(
        setTimeout(() => {
          const next = applyStep(shownRef.current, step, round.hands.length);
          shownRef.current = next;
          setShown(next);
          onStepRef.current(step, round, next);
          if (i === steps.length - 1) setAnimating(false);
        }, step.at),
      );
    });
    // reduceMotion is read at plan time only; changing it mid-deal must not replay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  return { shown, animating };
}

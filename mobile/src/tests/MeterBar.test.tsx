import React from "react";
import { render } from "@testing-library/react-native";
import { MeterBar } from "@/components/MeterBar";

describe("MeterBar", () => {
  it("displays formatted credits, bet, and win values", () => {
    const { getByTestId } = render(<MeterBar credits={1234} bet={5} win={250} />);
    expect(getByTestId("meter-credits").props.children).toBe("1,234");
    expect(getByTestId("meter-bet").props.children).toBe("5");
    expect(getByTestId("meter-win").props.children).toBe("250");
  });

  it("shows 0 for win when win={0}", () => {
    const { getByTestId } = render(<MeterBar credits={0} bet={1} win={0} />);
    expect(getByTestId("meter-win").props.children).toBe("0");
  });

  it("matches snapshot", () => {
    const { toJSON } = render(<MeterBar credits={1234} bet={5} win={250} />);
    expect(toJSON()).toMatchSnapshot();
  });
});

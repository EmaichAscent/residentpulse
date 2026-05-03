import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { NpsGauge, NpsBar, NpsLineChart, StackedSentimentBars } from "./NpsCharts";

/**
 * Smoke tests for the NPS chart primitives. These don't pixel-compare —
 * they just verify the SVG renders without throwing for the score
 * extremes (-100, 0, 100), for missing-prev cases, and for empty/short
 * data arrays. Visual fidelity is checked manually against
 * DESIGN/design_handoff_clientapp/src/charts.jsx.
 */
describe("NpsCharts — smoke tests", () => {
  describe("NpsGauge", () => {
    it("renders for a positive value", () => {
      const { container } = render(<NpsGauge value={42} prev={30} />);
      expect(container.querySelector("svg")).toBeTruthy();
    });

    it("renders for a negative value", () => {
      const { container } = render(<NpsGauge value={-30} prev={-25} />);
      expect(container.querySelector("svg")).toBeTruthy();
    });

    it("renders without a prev tick when prev is omitted", () => {
      const { container } = render(<NpsGauge value={5} />);
      // Three arc segments + needle line + 2 pivot circles = 6 shapes.
      // No dashed prev line.
      expect(container.querySelectorAll("line").length).toBe(1);
    });

    it("clamps out-of-range values without throwing", () => {
      const { container } = render(<NpsGauge value={200} prev={-300} />);
      expect(container.querySelector("svg")).toBeTruthy();
    });

    it("respects custom size", () => {
      const { container } = render(<NpsGauge value={0} size={120} />);
      const svg = container.querySelector("svg");
      expect(svg.getAttribute("width")).toBe("120");
    });
  });

  describe("NpsBar", () => {
    it("renders a positive bar", () => {
      const { container } = render(<NpsBar value={25} prev={10} />);
      expect(container.firstChild).toBeTruthy();
    });

    it("renders a negative bar", () => {
      const { container } = render(<NpsBar value={-40} />);
      expect(container.firstChild).toBeTruthy();
    });

    it("respects custom width", () => {
      const { container } = render(<NpsBar value={0} width={200} />);
      expect(container.firstChild.style.width).toBe("200px");
    });
  });

  describe("NpsLineChart", () => {
    it("renders a 3-round line", () => {
      const data = [
        { round: "R1", nps: -5 },
        { round: "R2", nps: -3 },
        { round: "R3", nps: 2 },
      ];
      const { container } = render(<NpsLineChart data={data} width={600} height={200} />);
      expect(container.querySelector("svg")).toBeTruthy();
      // 3 dots
      expect(container.querySelectorAll("circle").length).toBe(3);
    });

    it("returns null for empty data", () => {
      const { container } = render(<NpsLineChart data={[]} />);
      expect(container.firstChild).toBeNull();
    });

    it("handles a single data point without dividing by zero", () => {
      const data = [{ round: "R1", nps: 0 }];
      const { container } = render(<NpsLineChart data={data} />);
      expect(container.querySelector("svg")).toBeTruthy();
    });
  });

  describe("StackedSentimentBars", () => {
    it("renders bars for 3 rounds", () => {
      const data = [
        { round: "R1", detractors: 30, passives: 35, promoters: 35 },
        { round: "R2", detractors: 28, passives: 35, promoters: 37 },
        { round: "R3", detractors: 25, passives: 35, promoters: 40 },
      ];
      const { container } = render(<StackedSentimentBars data={data} />);
      expect(container.querySelector("svg")).toBeTruthy();
      // 3 segments × 3 rounds = 9 bar rects (plus gridlines)
      expect(container.querySelectorAll("rect").length).toBeGreaterThanOrEqual(9);
    });

    it("returns null for empty data", () => {
      const { container } = render(<StackedSentimentBars data={[]} />);
      expect(container.firstChild).toBeNull();
    });

    it("skips bars where total is zero (avoids divide-by-zero)", () => {
      const data = [{ round: "R1", detractors: 0, passives: 0, promoters: 0 }];
      const { container } = render(<StackedSentimentBars data={data} />);
      expect(container.querySelector("svg")).toBeTruthy();
    });
  });
});

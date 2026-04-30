/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      // ResidentPulse v2 design tokens. Hex values mirror :root in
      // src/index.css — keep in sync.
      //
      // Color names are picked to NOT collide with Tailwind's default palette
      // (which is why "amber" became "watch" — Tailwind ships its own amber
      // 50..950 stops that 95+ existing classes depend on).
      //
      // Radii and shadows are NOT namespaced into Tailwind utilities to
      // avoid clobbering existing `rounded-md` / `shadow-sm` usage. Use the
      // CSS vars directly via inline style if you need exact design values.
      colors: {
        paper: {
          DEFAULT: "#fbfaf7",
          2: "#f4f2ec",
          3: "#ece9e1",
        },
        line: {
          DEFAULT: "#e2ded3",
          2: "#d4cfc1",
        },
        ink: {
          DEFAULT: "#0b1b2b",
          2: "#2a3b4d",
          3: "#5a6b7c",
          4: "#8a98a6",
          5: "#b6bfc8",
        },
        pulse: {
          DEFAULT: "#1fa571",
          deep: "#137a52",
          soft: "#d6efe3",
          tint: "#eef8f3",
        },
        coral: {
          DEFAULT: "#e5634d",
          soft: "#fbe2dc",
          tint: "#fcefeb",
        },
        watch: {
          // semantic name for the design's amber/passive/watch signal —
          // renamed to avoid clobbering Tailwind's amber-50..950 palette
          DEFAULT: "#e8a33d",
          soft: "#faeac9",
          tint: "#fcf4e0",
        },
        plum: {
          DEFAULT: "#6b4fbb",
          soft: "#e5def7",
          tint: "#f2eefa",
        },
      },
      fontFamily: {
        // sans defaults to Inter for the whole app (existing screens included).
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        display: ["Fraunces", "Georgia", "serif"],
        // mono picks up JetBrains Mono — affects existing `font-mono` usage,
        // but the change is small (10 call sites, all visual numerics).
        mono: ["JetBrains Mono", "ui-monospace", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

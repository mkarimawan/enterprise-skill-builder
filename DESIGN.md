# Design System: Enterprise Skill Builder Workbench

## 1. Visual Theme & Atmosphere
- **Calibration**: `DESIGN_VARIANCE: 8` (Asymmetric Architectural Workbench), `MOTION_INTENSITY: 6` (Fluid Spring Physics & Perpetual Telemetry Micro-Loops), `VISUAL_DENSITY: 4` (Balanced Daylight Studio).
- **Atmosphere**: A high-craft, daylight-first engineering studio inspired by Dieter Rams' functional minimalism. The workspace pairs an alabaster `#F8FAFC` canvas with crisp `#FFFFFF` structural surfaces, hairline `1px` dividers (`#E2E8F0`), and deep charcoal ink (`#18181B`). Secondary reference material (Terraform IaC guides and frozen runtime specs) lives inside a slide-over drawer so the primary workbench stays focused and uncluttered.

## 2. Color Palette & Roles
- **Alabaster Daylight Canvas** (`#F8FAFC`) - Primary viewport background surface (`--canvas-alabaster`)
- **Pure Architectural Surface** (`#FFFFFF`) - Primary workbench panes and drawers (`--surface-pure`)
- **Subtle Ledger Wash** (`#F1F5F9`) - Code header bars, hover states, and inactive tabs (`--surface-muted`)
- **Charcoal Ink** (`#18181B`) - Primary headings, body copy, and active controls (`--ink-charcoal`)
- **Zinc Steel** (`#52525B`) - Secondary descriptions and operational context (`--ink-secondary`)
- **Muted Slate** (`#71717A`) - Captions, parameter hints, and timestamps (`--ink-muted`)
- **Structural Hairline** (`#E2E8F0`) - `1px` structural borders and row dividers (`--border-hairline`)
- **Cobalt Workbench Accent** (`hsl(217, 72%, 46%)` / `#2160CA`) - Single contextual brand accent (`<80%` saturation) for primary CTAs, active stage indicators, and focus rings (`--accent-brand`)
- **Semantic Status Tones**:
  - Verified Emerald (`#15803D` text on `#DCFCE7` wash)
  - Self-Healed Amber (`#B45309` text on `#FEF3C7` wash)
  - Critical Crimson (`#B91C1C` text on `#FEE2E2` wash)

## 3. Typography Rules
- **Display & UI Sans**: `Plus Jakarta Sans` (`500`, `600`, `700`) - Track-tight headings (`-0.025em`), clean geometric legibility, relaxed body leading (`1.6`, `65ch` max width).
- **Technical Monospace**: `JetBrains Mono` (`400`, `500`, `600`) with mandatory `font-variant-numeric: tabular-nums` applied to all metrics, Readiness Scores, Normalized Gain ($g$), latencies, token counts, SHA-256 digests, and CLI flags.
- **Banned Fonts**: `Inter` and all serif fonts are strictly banned across the workbench.

## 4. Component Stylings
- **Buttons**: Flat architectural geometry (`6px` radius), zero outer glow, tactile `:active` push feedback (`transform: translateY(1px)`). Primary CTA uses `--accent-brand`; secondary actions use `1px` structural borders.
- **Surfaces & Dividers**: No cards nested inside cards. Inside a primary workbench pane, sections and records are separated by `1px` top-border hairlines (`border-top: 1px solid var(--border-hairline)`) and generous whitespace.
- **Loaders**: Layout-matched skeletal shimmer bars (`@keyframes shimmerSweep`) during live Gemini 3.6 Flash interview turns, headless `agy` sandbox builds, and Harbor evaluation runs.
- **Drawers**: Secondary reference content (Customer Terraform Deployment Guide, IAM Prerequisites, and GE Python 3.11 Frozen Package Baseline) resides in a slide-over drawer (`#referenceDrawer`) rather than competing with the active workspace.

## 5. Layout Principles
- **Asymmetric Workbench Grids**:
  - Stage 01 (Interview & Blueprint): `1.15fr 0.85fr` asymmetric split pairing the Conversational Voice/Text Studio with the live-updating Blueprint Ledger.
  - Stage 02 (Enterprise Grounding): `0.9fr 1.1fr` split pairing the Schema Introspection Form with the live `tests/fixtures/mock_payload.json` inspector.
  - Stage 03 (Cloud Run AGY Sandbox): `1.05fr 0.95fr` split pairing the NDJSON execution trajectory + AST security ledger with the multi-file Skill Bundle Explorer.
  - Stage 04 (SkillsBench + Harbor Evals): 4-metric tabular-numeral telemetry strip above an asymmetric `1.1fr 0.9fr` paired trial comparison and Harbor file inspector.
  - Stage 05 (Registry Publisher): Focused single-flow publishing workbench with live registration receipts and one-click `.zip` export.
- **Responsive Collapse**: All multi-column grids collapse cleanly to a single column below `960px` with `44px` minimum touch targets and zero horizontal overflow.

## 6. Motion & Interaction
- **Spring Physics Easing**: `cubic-bezier(0.22, 1, 0.36, 1)` for drawer transitions, progress bar updates, and staggered row reveals.
- **Perpetual Micro-Interactions**: Hardware-accelerated (`transform`, `opacity`) live voice waveform bars and active sandbox telemetry pulse indicators.

## 7. Anti-Patterns (Strictly Banned)
- No `Inter` or serif fonts anywhere in the UI.
- No dark-slate neon or purple glows.
- No 3-equal-card horizontal rows.
- No eyebrow or pill badge clutter above every section header.
- No cards nested inside cards (use `1px` structural hairlines instead).
- No generic placeholder names (`Acme`, `John Doe`, `Nexus`).
- No AI copywriting filler words (`Elevate`, `Seamless`, `Unleash`, `Next-Gen`).

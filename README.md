<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/e06960ed-7d2c-45bc-be51-1ff696f59058

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## OneStock design system

The UI follows the OneStock product design system (back-office):

- `styles/onestock.css`: design tokens (colours, spacing, radii, Roboto type scale) and component styles.
- `components/os/`: React versions of the `Os*` components used here (OsIcon, OsButton, OsBadge, OsTag, OsCheckbox, OsSwitch, OsSegmentedControl, OsAlert, OsStepper).
- `components/Layout.tsx`: content area only. The app runs as an extension inside the OneStock back-office, which already provides `OsSideMenu` and `OsNavBar`.
- `public/icons/`: official OneStock icons. Do not substitute another icon set.

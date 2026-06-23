# AegisLink | Offline Public Safety Mesh

AegisLink is an offline-first public safety platform designed for incident reporting, evidence collection, and security intelligence. It leverages a modern web stack and Capacitor for mobile deployment, ensuring reliable operation even in disconnected or low-bandwidth environments.

## 🚀 Features

- **Incident Reporting**: Comprehensive forms for documenting incidents and collecting evidence on the go.
- **Offline Mesh Network**: Robust offline capabilities with local data persistence and delayed sync once a connection is re-established.
- **Interactive Mapping**: Real-time incident plotting and geolocation tracking using interactive maps.
- **Security Intelligence Feed**: Aggregated intelligence and alerts keeping personnel informed.
- **Role-Based Access Control**: Secure authentication and admin dashboards to manage reports and personnel.
- **Cross-Platform**: Built as a Progressive Web App (PWA) and packaged as a native Android app using Capacitor.

## 🛠️ Tech Stack

- **Frontend**: React, TypeScript, Vite
- **Styling**: Tailwind CSS, Shadcn UI, Framer Motion
- **State & Data Fetching**: TanStack React Query
- **Maps**: Leaflet & React-Leaflet
- **Backend/Database**: Supabase
- **Mobile Environment**: Capacitor

## 📦 Getting Started

### Prerequisites

- Node.js (v18+)
- npm or bun

### Installation

1. Clone the repository and navigate to the project directory:
   ```bash
   cd aegislink-connect
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Create a `.env` file in the root directory based on `.env.example` (if provided), or set up your Supabase project keys:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
   VITE_SUPABASE_PROJECT_ID=your_project_id
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

## 📱 Mobile Build (Android)

To build the project for Android using Capacitor:

1. Build the web assets:
   ```bash
   npm run build:mobile
   ```

2. Sync with Capacitor:
   ```bash
   npm run cap:sync
   ```

3. Open the project in Android Studio:
   ```bash
   npm run cap:android
   ```

## 📜 Scripts

- `npm run dev` - Starts the Vite development server.
- `npm run build` - Builds the application for production.
- `npm run preview` - Locally previews the production build.
- `npm run lint` - Lints the codebase using ESLint.
- `npm run android` - Builds the app and syncs it with the Android project.

## 🔒 Security

All intelligence and evidence data is securely transmitted and authenticated via Supabase. Offline data is cached locally until a secure connection is established to prevent data loss.

---
*Developed by AegisLink.*

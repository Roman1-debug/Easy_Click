"use client";

import "./globals.css";
import Sidebar from "@/components/layout/Sidebar";
import SplashScreen from "@/components/ui/SplashScreen";
import OnboardingGuard from "@/components/layout/OnboardingGuard";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SplashScreen />
        <OnboardingGuard>
          <div className="app-layout">
            <Sidebar />
            <div className="main-content">
              {children}
            </div>
          </div>
        </OnboardingGuard>
      </body>
    </html>
  );
}

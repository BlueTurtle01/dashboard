import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Endurance Planner",
  description: "Coach dashboard for endurance training plans",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: `if(localStorage.getItem('sidebar-collapsed')==='1')document.documentElement.classList.add('sidebar-collapsed')` }} />
      </head>
      <body>
        <Navbar />
        {children}
      </body>
    </html>
  );
}

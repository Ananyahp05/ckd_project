import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EDCIF — Explainable Deep CKD Intelligence Framework",
  description:
    "AI-powered Chronic Kidney Disease prediction using Deep Learning and SHAP-based explainability. Enter patient data to receive risk assessment and interpretable results.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

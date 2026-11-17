import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AudioConvert",
  description: "Extraire l'audio d'une vidéo ou transcrire un fichier en texte.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}

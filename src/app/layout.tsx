import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/next"
import { I18nProvider } from "@/i18n/I18nProvider";
import { defaultLocale, localeToHtmlLang } from "@/i18n/config";

export const metadata: Metadata = {
  title: {
    default: "Wolves House Online Werewolf",
    template: "%s | Wolves House",
  },
  description: "Create a private room and play Werewolf online with friends.",
  applicationName: "Wolves House",
  keywords: [
    "online werewolf",
    "multiplayer werewolf",
    "werewolf game online",
    "werewolf with friends",
    "mafia game online",
    "social deduction game",
    "狼人杀",
    "多人狼人杀",
    "在线狼人杀",
    "沉浸式狼人杀",
    "推理游戏",
  ],
  openGraph: {
    title: "Wolves House Online Werewolf",
    description: "Create a private room and play Werewolf online with friends.",
    type: "website",
    siteName: "Wolves House",
    locale: localeToHtmlLang[defaultLocale],
    url: "https://wolf-cha.com",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Wolves House Online Werewolf",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Wolves House Online Werewolf",
    description: "Create a private room and play Werewolf online with friends.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: "/brand/wolfcha-favicon.svg",
  },
  metadataBase: new URL("https://wolf-cha.com"),
  alternates: {
    canonical: "/",
    languages: {
      "en": "/en",
      "zh-CN": "/zh",
    },
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang={localeToHtmlLang[defaultLocale]} suppressHydrationWarning>
      <Analytics />
      <head>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-3SSRH8KPLY"
          strategy="afterInteractive"
        />
        <Script id="ga-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-3SSRH8KPLY');
          `}
        </Script>
      </head>
      <body className="antialiased">
        <I18nProvider>
          <Toaster position="top-center" closeButton />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}

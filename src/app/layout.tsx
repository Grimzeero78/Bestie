import type { Metadata, Viewport } from "next";
import { Archivo, Bebas_Neue, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/bestie/theme-provider";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const bebas = Bebas_Neue({
  variable: "--font-bebas",
  subsets: ["latin"],
  weight: "400",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Bestie — Your Faith Friend",
  description:
    "Bestie is a warm Christian AI companion. It listens first, asks honest questions and points you gently to biblical truth. Private by design: chats stay on your device.",
  keywords: ["Bestie", "Christian AI", "faith friend", "Bible", "biblical wisdom", "Christian companion"],
  authors: [{ name: "Bestie" }],
  openGraph: {
    title: "Bestie — Your Faith Friend",
    description: "A warm Christian AI companion. Listens first. Points to truth. Private by design.",
    siteName: "Bestie",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* esbuild keepNames helper can leak into the prerendered next-themes
            inline script; defining a no-op shim prevents a ReferenceError
            that would block the theme from being applied before hydration. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "window.__name||(window.__name=function(a){return a});",
          }}
        />
      </head>
      <body className={`${archivo.variable} ${bebas.variable} ${jetbrains.variable} antialiased bg-background text-foreground`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}

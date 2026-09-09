import "./globals.css";

export const metadata = {
  title: "Unified Checkout Demo",
  description: "CyberSource Unified Checkout demonstration",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

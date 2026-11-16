"use client";

import Link from "next/link";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <head>
        <title>Application Error | E News</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{`
          body {
            margin: 0;
            padding: 0;
            background-color: #0c1017;
            color: #faf8f5;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            text-align: center;
          }
          .box {
            max-width: 500px;
            padding: 40px 24px;
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(179, 130, 52, 0.3);
            border-radius: 12px;
          }
          h1 {
            font-family: "Playfair Display", Georgia, serif;
            font-size: 28px;
            margin: 0 0 16px;
            color: #b38234;
          }
          p {
            color: #9ca3af;
            font-size: 15px;
            line-height: 1.6;
            margin-bottom: 24px;
          }
          .actions {
            display: flex;
            gap: 12px;
            justify-content: center;
          }
          button, a {
            padding: 10px 20px;
            border-radius: 6px;
            font-weight: 600;
            font-size: 14px;
            text-decoration: none;
            cursor: pointer;
          }
          .btn-primary {
            background: #b38234;
            color: #0c1017;
            border: none;
          }
          .btn-ghost {
            background: transparent;
            color: #faf8f5;
            border: 1px solid rgba(255, 255, 255, 0.2);
          }
        `}</style>
      </head>
      <body>
        <div className="box">
          <h1>Editorial Dispatch Notice</h1>
          <p>
            An unexpected error occurred while rendering the primary application layout.
            Our technical systems have captured the event details.
          </p>
          <div className="actions">
            <button className="btn-primary" onClick={() => reset()}>
              Reload Dispatch
            </button>
            <Link href="/" className="btn-ghost">
              Return Home
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}

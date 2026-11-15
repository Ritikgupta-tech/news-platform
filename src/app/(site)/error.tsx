"use client";
import { Button } from "@/components/ui/Button";
import { StateMessage } from "@/components/ui/StateMessage";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <StateMessage kind="error" title="Something went wrong" action={<Button onClick={reset}>Try again</Button>}>
      We couldn&rsquo;t load this page. Please try again in a moment.
    </StateMessage>
  );
}

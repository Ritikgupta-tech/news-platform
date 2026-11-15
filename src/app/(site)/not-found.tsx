import { ButtonLink } from "@/components/ui/Button";
import { StateMessage } from "@/components/ui/StateMessage";

export default function NotFound() {
  return (
    <StateMessage as="h1" kind="empty" title="Page not found" action={<ButtonLink href="/">Back to home</ButtonLink>}>
      The page you&rsquo;re looking for doesn&rsquo;t exist or is no longer available.
    </StateMessage>
  );
}

import { buildMetaPixelLandingPageViewScript } from "@/lib/meta-pixel-landing-script";

type Props = {
  pixelId: string | null | undefined;
};

/** Server-rendered PageView bootstrap — runs before client hydration on landing pages. */
export function MetaPixelLandingScript({ pixelId }: Props) {
  const js = buildMetaPixelLandingPageViewScript(pixelId);
  if (!js) return null;

  return (
    <script
      id="meta-pixel-landing-pageview"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: js }}
    />
  );
}

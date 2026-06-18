import { getImageProps } from "next/image";
import {
  isLandingHeroStaticImage,
  LANDING_HERO_IMAGE,
} from "@/lib/landing-hero-image";

type Props = {
  mediaType: "image" | "video";
  mediaUrl: string;
};

/** Early `<head>` preload for the LCP hero photo on product landings. */
export function HeroMediaPreload({ mediaType, mediaUrl }: Props) {
  if (!isLandingHeroStaticImage(mediaType, mediaUrl)) return null;

  const { props } = getImageProps({
    alt: "",
    src: mediaUrl.trim(),
    width: LANDING_HERO_IMAGE.width,
    height: LANDING_HERO_IMAGE.height,
    sizes: LANDING_HERO_IMAGE.sizes,
    quality: LANDING_HERO_IMAGE.quality,
  });

  return (
    <link
      rel="preload"
      as="image"
      href={props.src}
      imageSrcSet={props.srcSet}
      imageSizes={props.sizes}
      fetchPriority="high"
    />
  );
}

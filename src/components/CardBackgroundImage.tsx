type Props = { source?: string | null; className?: string };

export default function CardBackgroundImage({ source, className = "" }: Props) {
  // Large data URLs must stay in src: browsers can discard them in CSS variables.
  return source ? <img className={`card-background-image${className ? ` ${className}` : ""}`} src={source} alt="" aria-hidden="true" draggable={false} /> : null;
}

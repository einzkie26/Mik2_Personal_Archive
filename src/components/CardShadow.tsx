import { getCardShadowSource } from "../lib/cardShadows";

export default function CardShadow({ value }: { value?: string }) {
  const source = getCardShadowSource(value);
  return source ? <span className="card-shadow-overlay" aria-hidden="true" style={{ backgroundImage: `url("${source}")` }} /> : null;
}

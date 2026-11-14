import { TIER_LABEL } from "@/lib/fields";

export function TierHead({ tier, right }: { tier: 1 | 2 | 3; right?: React.ReactNode }) {
  return (
    <div className="tier-head">
      <span className="tier-badge" aria-hidden>
        {tier}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h2>{TIER_LABEL[tier].title}</h2>
        <div className="tier-blurb">{TIER_LABEL[tier].blurb}</div>
      </div>
      {right}
    </div>
  );
}

import React from "react";
import { TAJWEED_RULES } from "@/lib/tajweed";

const TajweedText = ({ segments, arabicSize, onRuleClick }) => {
  if (!segments || segments.length === 0) return null;
  return (
    <p
      className="font-arabic text-right leading-[2] text-foreground"
      style={{ fontSize: `${arabicSize}px`, direction: "rtl", unicodeBidi: "plaintext", textAlign: "right" }}
      dir="rtl"
      data-testid="tajweed-text"
    >
      {segments.map((seg, i) => {
        const rule = seg.rule && TAJWEED_RULES[seg.rule];
        if (!rule) return <span key={i}>{seg.text}</span>;
        return (
          <span
            key={i}
            role="button"
            tabIndex={0}
            onClick={() => onRuleClick && onRuleClick(seg.rule)}
            onKeyDown={(e) => e.key === "Enter" && onRuleClick && onRuleClick(seg.rule)}
            className="cursor-pointer rounded transition-[background-color] duration-150 hover:bg-foreground/5"
            style={{ color: rule.color }}
            title={rule.label}
            data-testid={`tajweed-letter-${seg.rule}`}
          >
            {seg.text}
          </span>
        );
      })}
    </p>
  );
};

export default TajweedText;

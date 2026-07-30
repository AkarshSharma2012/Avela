"use client";

import { useState } from "react";
import {
  Briefcase,
  Code2,
  Drama,
  FlaskConical,
  HeartHandshake,
  Home,
  Music2,
  Palette,
  PenTool,
  Search,
  Trophy,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PASSION_GROUPS, PASSION_GROUP_LABELS, listCategoriesByPassionGroup, resolveCategory, type PassionGroup } from "@/lib/portfolio/taxonomy";

const PASSION_GROUP_ICON: Record<PassionGroup, LucideIcon> = {
  making_and_engineering: Wrench,
  software_and_technology: Code2,
  art_and_design: Palette,
  music_and_audio: Music2,
  performing_arts: Drama,
  writing_and_media: PenTool,
  science_and_academics: FlaskConical,
  sports_and_competition: Trophy,
  community_and_leadership: HeartHandshake,
  business_and_entrepreneurship: Briefcase,
  home_family_and_life_skills: Home,
};

type Stage = "collapsed" | "groups" | "categories";

/**
 * Two-stage category picker (spec's "CATEGORY SELECTION" — replaces a
 * single ~110-option `<select>`). Stage A is scannable passion-group tiles;
 * Stage B is a search-filtered list within the chosen group, via the
 * existing `listCategoriesByPassionGroup`. Collapses to a compact editable
 * chip once a category is chosen — reopening never loses the underlying
 * `value`, it just re-enters at the group the current category belongs to.
 */
function CategorySelector({
  value,
  onChange,
  ariaLabelledBy,
}: {
  value: string | null;
  onChange: (categoryKey: string) => void;
  ariaLabelledBy: string;
}) {
  const resolved = value ? resolveCategory(value) : null;
  const [stage, setStage] = useState<Stage>(resolved ? "collapsed" : "groups");
  const [activeGroup, setActiveGroup] = useState<PassionGroup | null>(resolved?.passionGroup ?? null);
  const [search, setSearch] = useState("");

  function openPicker() {
    setActiveGroup(resolved?.passionGroup ?? null);
    setSearch("");
    setStage("groups");
  }

  function pickGroup(group: PassionGroup) {
    setActiveGroup(group);
    setSearch("");
    setStage("categories");
  }

  function pickCategory(categoryKey: string) {
    onChange(categoryKey);
    setStage("collapsed");
  }

  if (stage === "collapsed" && resolved) {
    const Icon = PASSION_GROUP_ICON[resolved.passionGroup];
    return (
      <button
        type="button"
        onClick={openPicker}
        aria-expanded={false}
        aria-label={`${resolved.label}. Change category`}
        className="flex w-full items-center justify-between gap-3 rounded-md border border-input bg-card px-3 py-2 text-left transition-colors duration-[var(--duration-fast)] hover:border-primary/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
      >
        <span aria-hidden="true" className="flex items-center gap-2 text-sm text-foreground">
          <Icon aria-hidden="true" className="size-4 text-primary" />
          {resolved.label}
        </span>
        <span aria-hidden="true" className="text-xs font-medium text-primary">
          Change
        </span>
      </button>
    );
  }

  return (
    <div role="group" aria-labelledby={ariaLabelledBy} className="animate-fade-up rounded-xl border border-border bg-secondary/40 p-3">
      {stage === "groups" && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PASSION_GROUPS.map((group) => {
            const Icon = PASSION_GROUP_ICON[group];
            return (
              <button
                key={group}
                type="button"
                onClick={() => pickGroup(group)}
                className={cn(
                  "flex flex-col items-start gap-1.5 rounded-lg border bg-card px-3 py-2.5 text-left transition-all duration-[var(--duration-fast)] hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm",
                  "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
                  activeGroup === group ? "border-primary bg-primary/5" : "border-border"
                )}
              >
                <Icon aria-hidden="true" className="size-4.5 text-primary" />
                <span className="text-xs font-medium text-foreground">{PASSION_GROUP_LABELS[group]}</span>
              </button>
            );
          })}
        </div>
      )}

      {stage === "categories" && activeGroup && (
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => setStage("groups")}
            className="flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            ← {PASSION_GROUP_LABELS[activeGroup]}
          </button>
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search categories…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              aria-label={`Search ${PASSION_GROUP_LABELS[activeGroup]} categories`}
              autoFocus
            />
          </div>
          <ul className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
            {listCategoriesByPassionGroup(activeGroup)
              .filter((c) => c.label.toLowerCase().includes(search.trim().toLowerCase()))
              .map((c) => (
                <li key={c.key}>
                  <button
                    type="button"
                    onClick={() => pickCategory(c.key)}
                    aria-pressed={value === c.key}
                    className="w-full rounded-md px-3 py-1.5 text-left text-sm text-foreground transition-colors duration-[var(--duration-fast)] hover:bg-primary/10 aria-pressed:bg-primary/10 aria-pressed:font-medium focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                  >
                    {c.label}
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export { CategorySelector };

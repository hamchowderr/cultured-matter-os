// Simone's 17 radar categories, matched by keyword against a company's source
// tags and description. No AI in phase 1, so this is deliberately simple.

export const CATEGORIES = [
  "Materials",
  "Packaging",
  "Circularity",
  "Fashion/Textiles",
  "Beauty/Chemistry",
  "Food",
  "Agriculture",
  "Waste",
  "Carbon",
  "Energy",
  "Buildings",
  "Water",
  "Oceans",
  "Biodiversity",
  "Mobility",
  "Manufacturing",
  "Climate biotech"
] as const;

export type Category = (typeof CATEGORIES)[number];

const KEYWORDS: Record<Category, RegExp> = {
  Materials:
    /\b(advanced materials?|biomaterials?|materials? science|bio-?based materials?|polymers?|bioplastics?|mycelium|composites?|leather alternative|fibers?)\b/i,
  Packaging: /\bpackag(ing|e|es)\b/i,
  Circularity: /\b(circular(ity| economy)?|recycl(ing|ed|e)|reuse|upcycl\w*|resale|refill\w*)\b/i,
  "Fashion/Textiles":
    /\b(fashion|textiles?|apparel|garments?|clothing|footwear|dyes?|dyeing|sustainable fashion)\b/i,
  "Beauty/Chemistry":
    /\b(beauty|cosmetics?|skin ?care|personal care|fragrances?|sunscreen|green chemistry|anti-aging)\b/i,
  Food: /\b(food|alt(ernative)? protein|plant-based|cultivated meat|cell-?based meat|cellular agriculture|fermentation|dairy|beverages?|snacks?)\b/i,
  Agriculture:
    /\b(agtech|agricultur\w*|farm(s|ing|ers)?|crops?|soil|fertiliz\w*|livestock|aquaculture)\b/i,
  Waste: /\b(waste|landfill|compost\w*|wastewater|methane capture)\b/i,
  Carbon:
    /\b(carbon (capture|removal|credits?|accounting|dioxide|utilization)|co2|direct air capture|sequestration|decarboni[sz]\w*|emissions?)\b/i,
  Energy:
    /\b(energy|electricity|solar|wind|batter(y|ies)|energy storage|grid|geothermal|nuclear|hydrogen|fuel cells?|clean power|power generation)\b/i,
  Buildings:
    /\b(buildings?|construction|cement|concrete|hvac|heat pumps?|insulation|real estate|built environment)\b/i,
  Water: /\b(water|desalination|irrigation|drought)\b/i,
  Oceans: /\b(oceans?|marine|seaweed|kelp|coral|reef|blue carbon|fisher(y|ies)|coastal)\b/i,
  Biodiversity:
    /\b(biodiversity|nature-based|ecosystems?|conservation|reforestation|forests?|wildlife|pollinators?)\b/i,
  Mobility:
    /\b(mobility|transportation|electric vehicles?|\bevs?\b|charging|aviation|shipping|logistics|motorcycles?|trucks?|rail)\b/i,
  Manufacturing:
    /\b(manufactur\w*|biomanufactur\w*|factor(y|ies)|3d printing|additive manufacturing)\b/i,
  "Climate biotech":
    /\b(synthetic biology|synbio|biotech\w*|engineered (microbes|enzymes|organisms)|microbes?|enzymes?|precision fermentation|computational bio\w*)\b/i
};

export function categorize(...texts: (string | null | undefined)[]): Category[] {
  const haystack = texts.filter(Boolean).join(" \n ");
  if (!haystack) return [];
  return CATEGORIES.filter((c) => KEYWORDS[c].test(haystack));
}

/**
 * Vehicle Detection
 *
 * Extract vehicle information from customer messages for catalog lookup.
 */

/**
 * Detected vehicle info
 */
export type DetectedVehicle = {
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  confidence: number;
};

/**
 * Known makes and their aliases
 */
const MAKE_ALIASES: Record<string, string> = {
  infiniti: "Infiniti",
  nissan: "Nissan",
  toyota: "Toyota",
  lexus: "Lexus",
  bmw: "BMW",
  ford: "Ford",
  chevy: "Chevrolet",
  chevrolet: "Chevrolet",
  gmc: "GMC",
  jeep: "Jeep",
  dodge: "Dodge",
  tesla: "Tesla",
  bentley: "Bentley",
  maserati: "Maserati",
  mitsubishi: "MITSUBISHI",
};

/**
 * Known models and their makes (for inference)
 */
const MODEL_TO_MAKE: Record<string, string> = {
  q50: "Infiniti",
  q60: "Infiniti",
  g37: "Infiniti",
  g35: "Infiniti",
  fx35: "Infiniti",
  fx50: "Infiniti",
  qx50: "Infiniti",
  qx60: "Infiniti",
  qx80: "Infiniti",
  "370z": "Nissan",
  "350z": "Nissan",
  titan: "Nissan",
  armada: "Nissan",
  pathfinder: "Nissan",
  maxima: "Nissan",
  altima: "Nissan",
  sentra: "Nissan",
  frontier: "Nissan",
  gtr: "Nissan",
  camry: "Toyota",
  corolla: "Toyota",
  rav4: "Toyota",
  tacoma: "Toyota",
  tundra: "Toyota",
  highlander: "Toyota",
  "4runner": "Toyota",
  supra: "Toyota",
  prius: "Toyota",
  sienna: "Toyota",
  camaro: "Chevrolet",
  corvette: "Chevrolet",
  silverado: "Chevrolet",
  tahoe: "Chevrolet",
  suburban: "Chevrolet",
  mustang: "Ford",
  "f-150": "Ford",
  f150: "Ford",
  raptor: "Ford",
  explorer: "Ford",
  bronco: "Ford",
  wrangler: "Jeep",
  "grand cherokee": "Jeep",
  cherokee: "Jeep",
  challenger: "Dodge",
  charger: "Dodge",
  durango: "Dodge",
  ram: "Dodge",
  "model s": "Tesla",
  "model 3": "Tesla",
  "model x": "Tesla",
  "model y": "Tesla",
};

/**
 * Known trims
 */
const KNOWN_TRIMS = [
  "redsport",
  "red sport",
  "sport",
  "premium",
  "luxe",
  "sensory",
  "base",
  "signature",
  "awd",
  "4wd",
  "rwd",
  "gt",
  "sr",
  "sv",
  "sl",
  "platinum",
  "pro",
  "limited",
  "lariat",
  "xlt",
  "rubicon",
  "sahara",
  "srt",
  "hellcat",
  "trackhawk",
  "nismo",
];

/**
 * Detect vehicle information from text
 */
export function detectVehicle(text: string): DetectedVehicle {
  const lowerText = text.toLowerCase();
  let confidence = 0;

  // Extract year (4-digit number between 1990-2030)
  const yearMatch = text.match(/\b(19[9][0-9]|20[0-2][0-9]|2030)\b/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
  if (year) confidence += 0.3;

  // Extract make
  let make: string | null = null;
  for (const [alias, canonical] of Object.entries(MAKE_ALIASES)) {
    if (lowerText.includes(alias)) {
      make = canonical;
      confidence += 0.3;
      break;
    }
  }

  // Extract model
  let model: string | null = null;
  for (const [modelName, modelMake] of Object.entries(MODEL_TO_MAKE)) {
    if (lowerText.includes(modelName)) {
      model = modelName.toUpperCase();
      // Infer make from model if not already found
      if (!make) {
        make = modelMake;
        confidence += 0.2;
      }
      confidence += 0.3;
      break;
    }
  }

  // Extract trim
  let trim: string | null = null;
  for (const trimName of KNOWN_TRIMS) {
    if (lowerText.includes(trimName)) {
      trim = trimName
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
      confidence += 0.1;
      break;
    }
  }

  // Cap confidence at 1.0
  confidence = Math.min(confidence, 1.0);

  return { year, make, model, trim, confidence };
}

/**
 * Check if message is asking about product compatibility
 */
export function isProductQuestion(text: string): boolean {
  const lowerText = text.toLowerCase();

  const productKeywords = [
    "which",
    "what",
    "compatible",
    "fit",
    "fits",
    "work with",
    "works with",
    "buy",
    "purchase",
    "recommend",
    "suggestion",
    "g-series",
    "gseries",
    "g series",
    "apex",
    "screen",
    "cluster",
    "head unit",
    "mk5",
    "mk6",
    "mk7",
    "mark 5",
    "mark 6",
    "mark 7",
  ];

  return productKeywords.some((keyword) => lowerText.includes(keyword));
}

/**
 * Check if we have enough info for a catalog lookup
 */
export function canDoProductLookup(vehicle: DetectedVehicle): boolean {
  // Need at least a make to do a lookup
  return vehicle.make !== null && vehicle.confidence >= 0.3;
}

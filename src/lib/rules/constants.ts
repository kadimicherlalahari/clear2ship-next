// Fixed values from clear2ship_rules.md sections 2 and 6. Do not edit without changing the rules file.

export const ORIGIN_COUNTRY = "United Kingdom";
export const ORIGIN_CITIES = ["London", "Manchester", "Birmingham", "Leeds"];

export const DESTINATIONS: Record<string, string[]> = {
  Germany: ["Berlin", "Frankfurt", "Hamburg"],
  France: ["Paris", "Lyon"],
  Netherlands: ["Amsterdam", "Rotterdam"],
};
export const DESTINATION_COUNTRIES = Object.keys(DESTINATIONS);
export const ALL_DESTINATION_CITIES = Object.values(DESTINATIONS).flat();

export const DESTINATION_TYPES = ["Warehouse", "Business address"] as const;
export type DestinationType = (typeof DESTINATION_TYPES)[number];

export const PRIORITIES = ["Cheapest", "Fastest", "Most reliable", "Balanced"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const ITEM_ORIGINS = ["United Kingdom", "China", "India", "Vietnam", "Turkey", "Germany"];

export const CURRENCIES = ["GBP"];

export type Carrier = {
  name: string;
  service: string;
  pricePerPallet: Record<string, number>;
  transitDays: number;
  onTimePct: number;
  maxKgPerPallet: number;
};

export const CARRIERS: Carrier[] = [
  { name: "Carrier A", service: "Road economy", pricePerPallet: { Germany: 180, France: 170, Netherlands: 160 }, transitDays: 5, onTimePct: 92, maxKgPerPallet: 500 },
  { name: "Carrier B", service: "Road standard", pricePerPallet: { Germany: 220, France: 210, Netherlands: 200 }, transitDays: 3, onTimePct: 95, maxKgPerPallet: 750 },
  { name: "Carrier C", service: "Road express", pricePerPallet: { Germany: 340, France: 330, Netherlands: 320 }, transitDays: 2, onTimePct: 98, maxKgPerPallet: 400 },
];

export const MAX_KG_ANY_CARRIER = Math.max(...CARRIERS.map((c) => c.maxKgPerPallet));

// R-06 word lists (description check).
export const RESTRICTED_RED_WORDS = [
  "lithium", "li-ion", "power bank", "battery", "batteries", "aerosol", "flammable", "petrol",
  "butane", "propane", "lighter fluid", "spray paint", "hairspray", "thinner",
];
export const RESTRICTED_AMBER_WORDS = [
  "perfume", "nail polish", "alcohol", "solvent", "paint", "varnish", "vape", "charger",
  "rechargeable", "wireless", "smartwatch", "earbuds",
];
export const BATTERIES_NOT_INCLUDED = "batteries not included";

/** Booking field labels, used in every message so the seller sees the same names as the template. */
export const BOOKING_LABELS = {
  seller_name: "Seller name",
  origin_city: "Origin city",
  origin_country: "Origin country",
  destination_country: "Destination country",
  destination_city: "Destination city",
  destination_type: "Destination type",
  ready_date: "Ready to ship date",
  seller_priority: "Seller priority",
  pallets: "Pallets",
  cartons: "Cartons",
  declared_value: "Total declared value",
  currency: "Currency",
  gross_weight_kg: "Total gross weight (kg)",
  appointment_booked: "Delivery appointment booked",
} as const;
export type BookingField = keyof typeof BOOKING_LABELS;

export const ITEM_LABELS = {
  sku: "SKU",
  description: "Description",
  hs_code: "HS code",
  quantity: "Quantity",
  units_per_carton: "Units per carton",
  cartons: "Cartons",
  unit_price: "Unit price (GBP)",
  unit_weight_kg: "Unit weight (kg)",
  country_of_origin: "Country of origin",
} as const;
export type ItemField = keyof typeof ITEM_LABELS;

export const DISCLAIMER = "These checks are not a customs clearance. Nothing has been booked.";

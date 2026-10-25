/** 5400 → "5,400", 2.5 → "2.5", 1234.567 → "1,234.57" */
export const fmt = (n: number) => n.toLocaleString("en-GB", { maximumFractionDigits: 2 });
export const money = (n: number) => `£${fmt(n)}`;

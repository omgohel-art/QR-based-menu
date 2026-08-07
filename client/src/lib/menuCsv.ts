/** Parse menu CSV: category,name,price,foodType,description */
export type MenuCsvRow = {
  category: string;
  name: string;
  price: number;
  foodType: "veg" | "non-veg" | "vegan";
  description: string;
};

export function parseMenuCsv(text: string): { rows: MenuCsvRow[]; errors: string[] } {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return { rows: [], errors: ["CSV needs a header row and at least one item"] };
  }

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase().trim());
  const idx = {
    category: header.findIndex((h) => h === "category" || h === "category_name"),
    name: header.findIndex((h) => h === "name" || h === "item" || h === "item_name"),
    price: header.findIndex((h) => h === "price"),
    foodType: header.findIndex((h) => h === "foodtype" || h === "food_type" || h === "type"),
    description: header.findIndex((h) => h === "description" || h === "desc"),
  };

  if (idx.category < 0 || idx.name < 0 || idx.price < 0) {
    return {
      rows: [],
      errors: ["Header must include: category, name, price (optional: foodType, description)"],
    };
  }

  const rows: MenuCsvRow[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const category = (cols[idx.category] || "").trim();
    const name = (cols[idx.name] || "").trim();
    const priceRaw = (cols[idx.price] || "").trim().replace(/[₹,]/g, "");
    const price = Number(priceRaw);
    let foodType = (idx.foodType >= 0 ? cols[idx.foodType] : "veg")?.trim().toLowerCase() || "veg";
    if (foodType === "nonveg" || foodType === "non veg") foodType = "non-veg";
    if (!["veg", "non-veg", "vegan"].includes(foodType)) foodType = "veg";
    const description = (idx.description >= 0 ? cols[idx.description] : "")?.trim() || "";

    if (!category || !name || Number.isNaN(price) || price < 0) {
      errors.push(`Row ${i + 1}: invalid category/name/price`);
      continue;
    }
    rows.push({
      category,
      name,
      price,
      foodType: foodType as MenuCsvRow["foodType"],
      description,
    });
  }

  return { rows, errors };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export const MENU_CSV_TEMPLATE = `category,name,price,foodType,description
Beverages,Masala Chai,40,veg,Hot spiced tea
Beverages,Cold Coffee,120,veg,
Starters,Veg Sandwich,90,veg,With fries option
Mains,Chicken Biryani,220,non-veg,Hyderabadi style
`;

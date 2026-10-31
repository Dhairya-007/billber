export const CATEGORIES = [
  { id: "food", label: "Food & drink", emoji: "🍽️", words: ["dinner", "lunch", "breakfast", "food", "restaurant", "cafe", "coffee", "chai", "tea", "snacks", "pizza", "biryani", "zomato", "swiggy", "drinks", "beer", "bar", "dessert", "brunch", "thali", "dosa"] },
  { id: "groceries", label: "Groceries", emoji: "🛒", words: ["groceries", "grocery", "vegetables", "sabzi", "milk", "blinkit", "zepto", "instamart", "bigbasket", "dmart", "supermarket", "fruits"] },
  { id: "transport", label: "Transport", emoji: "🚕", words: ["uber", "ola", "rapido", "cab", "taxi", "auto", "metro", "bus", "train", "flight", "petrol", "diesel", "fuel", "toll", "parking", "airport", "irctc", "indigo"] },
  { id: "stay", label: "Stay", emoji: "🏨", words: ["hotel", "hostel", "airbnb", "stay", "resort", "villa", "homestay", "oyo"] },
  { id: "home", label: "Home & bills", emoji: "🏠", words: ["rent", "electricity", "wifi", "internet", "gas", "water", "maid", "cook", "maintenance", "bill", "recharge"] },
  { id: "fun", label: "Fun", emoji: "🎉", words: ["movie", "movies", "netflix", "spotify", "party", "tickets", "concert", "game", "bowling", "club", "pvr", "bookmyshow"] },
  { id: "shopping", label: "Shopping", emoji: "🛍️", words: ["shopping", "clothes", "amazon", "flipkart", "myntra", "gift", "shoes"] },
  { id: "other", label: "Other", emoji: "🧾", words: [] },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export function guessCategory(description: string): CategoryId {
  const words = description.toLowerCase().split(/[^a-z]+/);
  return CATEGORIES.find(({ words: keys }) => (keys as readonly string[]).some((key) => words.includes(key)))?.id ?? "other";
}

export function category(id: string) {
  return CATEGORIES.find((entry) => entry.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}

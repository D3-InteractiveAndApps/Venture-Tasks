// categorize.js — guesses which grocery category a new item belongs to,
// from a small built-in keyword map, so items can be auto-filed without
// the user having to pick a category by hand every time. Pure/sync, no
// network call, no AI required.
//
// The map is keyed by the app's default category *names* (Produce, Dairy
// & Eggs, etc.), never by section id — every grocery page generates fresh
// section ids of its own, and a user can rename, delete, reorder, or add
// categories freely, so matching has to go through whichever category
// *names* actually exist on this page right now (see guessCategory below).
// A category the user renamed or invented from scratch just won't have an
// entry here, and guessCategory quietly returns null for it — never a
// wrong guess, never an error.

const CATEGORY_KEYWORDS = {
  "Produce": [
    "apple", "banana", "orange", "grape", "lettuce", "spinach", "carrot",
    "potato", "onion", "garlic", "tomato", "cucumber", "bell pepper",
    "broccoli", "celery", "avocado", "lemon", "lime", "berry", "berries",
    "strawberr", "blueberr", "raspberr", "mushroom", "corn", "squash",
    "zucchini", "cabbage", "kale", "cilantro", "parsley", "mango",
    "pineapple", "melon", "watermelon", "peach", "pear", "plum", "cherry",
    "cherries", "asparagus", "green bean", "sweet potato", "radish",
    "beet", "fruit", "vegetable", "veggie", "produce"
  ],
  "Dairy & Eggs": [
    "milk", "cheese", "yogurt", "yoghurt", "butter", "egg", "cream",
    "half and half", "sour cream", "cottage cheese", "cream cheese",
    "margarine", "whipped cream"
  ],
  "Meat & Seafood": [
    "chicken", "beef", "pork", "steak", "bacon", "sausage",
    "ground beef", "ground turkey", "turkey", "ham", "salmon", "shrimp",
    "fish", "tilapia", "tuna", "crab", "lobster", "lamb", "meat",
    "hot dog", "deli meat", "cold cuts"
  ],
  "Bakery": [
    "bread", "bagel", "bun", "dinner roll", "croissant", "muffin",
    "donut", "doughnut", "cake", "pie", "tortilla", "baguette", "pastry",
    "pita"
  ],
  "Frozen": [
    "frozen", "ice cream", "popsicle", "sorbet", "waffle", "freezer"
  ],
  "Pantry": [
    "rice", "pasta", "spaghetti", "flour", "sugar", "cooking oil",
    "olive oil", "vinegar", "dried beans", "lentil", "quinoa", "noodle",
    "cereal bar", "honey", "peanut butter", "jelly", "jam", "baking soda",
    "baking powder", "yeast", "oats"
  ],
  "Canned Goods": [
    "canned", "can of", "soup", "tomato sauce", "tomato paste",
    "canned beans", "canned corn", "canned tuna", "broth", "stock",
    "chickpeas", "garbanzo"
  ],
  "Breakfast & Cereal": [
    "cereal", "oatmeal", "granola", "pancake mix", "syrup", "pop tart",
    "breakfast bar", "grits"
  ],
  "Snacks": [
    "chips", "crackers", "popcorn", "pretzel", "cookie", "candy",
    "chocolate bar", "nuts", "trail mix", "granola bar", "snack",
    // Longer than Produce's bare "potato", so a bag of chips doesn't get
    // mistaken for the fresh vegetable it's made from.
    "potato chips", "tortilla chips", "corn chips"
  ],
  "Beverages": [
    "water bottle", "sparkling water", "soda", "pop", "juice", "coffee",
    "tea", "beer", "wine", "energy drink", "lemonade", "kombucha",
    "sports drink", "drink",
    // Longer than the matching fresh-produce keyword ("orange", "apple",
    // "grape") so a bottled/boxed juice outranks the fruit it's made
    // from, rather than getting filed as if it were the fresh fruit.
    "orange juice", "apple juice", "grape juice", "juice box", "fruit punch"
  ],
  "Condiments & Spices": [
    "ketchup", "mustard", "mayo", "mayonnaise", "soy sauce", "hot sauce",
    "bbq sauce", "salad dressing", "black pepper", "cayenne", "cinnamon",
    "paprika", "cumin", "oregano", "basil leaves", "condiment", "spice",
    "seasoning", "salsa", "relish"
  ],
  "Household": [
    "paper towel", "toilet paper", "trash bag", "detergent", "dish soap",
    "sponge", "aluminum foil", "plastic wrap", "batteries", "light bulb",
    "cleaning spray", "dish washer", "laundry"
  ],
  "Personal Care": [
    "shampoo", "conditioner", "bar soap", "body wash", "toothpaste",
    "toothbrush", "deodorant", "razor", "lotion", "sunscreen", "floss",
    "tissue", "cotton swab", "feminine"
  ]
};

function normalize(s) {
  return (s || "").toLowerCase().trim();
}

// itemText: whatever the user typed for the new item.
// availableCategoryNames: the *actual* category names on this grocery
// page right now (so a renamed/custom category never gets bypassed).
// Returns the best-matching name, or null if nothing in the map hits.
export function guessCategory(itemText, availableCategoryNames) {
  const text = normalize(itemText);
  if (!text || !availableCategoryNames || !availableCategoryNames.length) return null;

  let best = null;
  let bestLen = 0;
  availableCategoryNames.forEach((name) => {
    const keywords = CATEGORY_KEYWORDS[name];
    if (!keywords) return;
    keywords.forEach((kw) => {
      // Longest keyword match wins (e.g. "sweet potato" over a bare
      // "potato" match on the same item name), so more specific entries
      // naturally outrank more generic ones without any extra weighting.
      if (text.includes(kw) && kw.length > bestLen) {
        best = name;
        bestLen = kw.length;
      }
    });
  });
  return best;
}

// Exposed mainly for the unit test / for anything that wants to know
// which category names this module actually has keywords for.
export function knownCategoryNames() {
  return Object.keys(CATEGORY_KEYWORDS);
}

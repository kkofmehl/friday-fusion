/**
 * Survey questions for Friendly Feud.
 * Face-off rounds adapted from Cold Friendly Feud (MIT, Copyright 2021 Joshua Cold)
 * https://github.com/joshzcold/Friendly-Feud — English packs under games/en/.
 *
 * Acceptable phrasing: each answer may include `alts` (not shown on the board).
 * We auto-add slash/& parts from survey text (e.g. "TV/Movies" → "TV", "Movies")
 * plus curated synonym groups below (e.g. police ↔ cops).
 */
import questionsJson from "./data/friendlyFeudQuestions.json";
import { normalizeFriendlyFeudGuess } from "../../shared/friendlyFeudLogic";

export type FriendlyFeudAnswer = {
  ans: string;
  pnt: number;
  alts?: string[];
};

export type FriendlyFeudQuestion = {
  id: string;
  question: string;
  answers: FriendlyFeudAnswer[];
};

/**
 * Synonym groups for common survey answers where fuzzy/partial match fails
 * (e.g. "cops" vs "police"). Any member expands the others as acceptable alts.
 * Curated from frequent answers in friendlyFeudQuestions.json — keep entries
 * plain text; avoid merging distinct survey concepts (e.g. church ≠ synagogue).
 */
export const FRIENDLY_FEUD_SYNONYM_GROUPS: readonly (readonly string[])[] = [
  // Occupations / people
  ["police", "cops", "cop", "policeman", "policewoman", "police officer", "officers", "officer"],
  ["fireman", "firefighter", "fire fighter", "firemen", "firefighters"],
  ["doctor", "physician", "doc", "md", "surgeon", "doctors"],
  ["dentist", "dentists"],
  ["nurse", "nurses", "rn"],
  ["lawyer", "attorney", "attorneys", "lawyers"],
  ["teacher", "teachers", "educator", "schoolteacher", "school teacher"],
  ["chef", "cook", "cooks", "chefs"],
  ["pilot", "aviator", "pilots"],
  ["mechanic", "auto mechanic", "mechanics"],
  ["plumber", "plumbers"],
  ["electrician", "electricians"],
  ["janitor", "custodian", "janitors", "custodians", "cleaner"],
  ["secretary", "receptionist", "secretaries", "receptionists", "admin", "administrative assistant"],
  ["cashier", "cashiers", "clerk", "clerks"],
  ["bartender", "bartenders", "barkeep", "bar tender"],
  ["waiter", "waitress", "server", "waiters", "waitresses", "servers"],
  ["mailman", "mail carrier", "postal worker", "postman", "mail man", "letter carrier"],
  ["farmer", "farmers", "rancher"],
  ["soldier", "army", "troops", "military"],
  ["sailor", "navy", "seaman"],
  ["astronaut", "astronauts", "cosmonaut"],
  ["babysitter", "baby sitter", "nanny", "sitter"],
  ["actor", "actress", "actors", "actresses", "movie star"],
  ["model", "models", "supermodel"],

  // Family / relationships
  ["mom", "mother", "mama", "mum", "mommy", "moms", "mothers"],
  ["dad", "father", "papa", "daddy", "pa", "dads", "fathers"],
  ["kids", "children", "child", "youngster", "youngsters", "kid"],
  ["parents", "parent", "mom and dad", "mother and father"],
  ["grandparent", "grandparents", "grandma", "grandpa", "grandmother", "grandfather", "nana", "papaw"],
  ["spouse", "husband", "wife", "partner", "significant other", "hubby", "wifey"],
  ["sibling", "siblings", "brother", "sister", "brothers", "sisters"],
  ["baby", "infant", "newborn", "babies", "infants"],
  ["boyfriend", "bf", "guy friend"],
  ["girlfriend", "gf"],

  // Money / work / places
  ["money", "cash", "dollars", "bucks", "dough", "loot"],
  ["job", "work", "career", "occupation", "employment"],
  ["boss", "manager", "supervisor", "employer", "bosses"],
  ["coworker", "co worker", "colleague", "coworkers", "colleagues", "co-worker", "co-workers"],
  ["vacation", "holiday", "holidays", "time off"],
  ["school", "schools", "classroom", "class"],
  ["college", "university", "campus"],
  ["hospital", "er", "emergency room", "clinic"],
  ["grocery store", "supermarket", "grocery", "groceries", "market"],
  ["restaurant", "restaurants", "eatery", "diner", "cafe", "café"],
  ["bar", "pub", "tavern", "bars"],
  ["mall", "shopping mall", "shopping center"],
  ["bank", "banks", "atm"],
  ["library", "libraries"],
  ["church", "chapel"],
  ["jail", "prison", "slammer", "penitentiary"],
  ["house", "home", "houses", "homes", "residence"],
  ["apartment", "apt", "flat", "apartments"],
  ["hotel", "motel", "inn"],
  ["beach", "seashore", "seaside", "shore"],
  ["park", "parks", "playground"],

  // Vehicles / travel
  ["car", "automobile", "auto", "vehicle", "cars", "autos", "vehicles"],
  ["truck", "pickup", "pickup truck", "trucks"],
  ["bike", "bicycle", "cycle", "bikes", "bicycles"],
  ["motorcycle", "motorbike", "motorcycles"],
  ["airplane", "plane", "aircraft", "jet", "airplanes", "planes"],
  ["boat", "ship", "yacht", "boats", "ships"],
  ["bus", "buses", "coach"],
  ["train", "trains", "railroad", "railway"],
  ["taxi", "cab", "taxis", "cabs", "uber", "lyft"],

  // Tech / media
  ["tv", "television", "t v", "televisions"],
  ["movies", "movie", "film", "films", "cinema"],
  ["phone", "telephone", "phones", "telephones", "cell phone", "cellphone", "mobile", "mobile phone", "cellular phone", "cell"],
  ["computer", "pc", "laptop", "computers", "laptops", "desktop"],
  ["internet", "web", "online", "wifi", "wi fi", "world wide web"],
  ["radio", "radios", "stereo"],
  ["remote", "remote control", "clicker", "remotes"],
  ["camera", "cameras", "cam"],
  ["newspaper", "newspapers", "news paper"],
  ["magazine", "magazines", "mag"],
  ["book", "books"],
  ["music", "songs", "song", "tunes"],

  // Home / household
  ["bathroom", "restroom", "washroom", "lavatory", "toilet", "loo", "bath room"],
  ["bedroom", "bed room", "bedrooms"],
  ["living room", "family room", "den", "sitting room"],
  ["kitchen", "kitchens"],
  ["fridge", "refrigerator", "icebox", "ice box", "refrigerators"],
  ["stove", "oven", "range", "cooktop"],
  ["microwave", "microwave oven", "microwaves"],
  ["dishwasher", "dish washer"],
  ["washer", "washing machine", "clothes washer"],
  ["dryer", "clothes dryer"],
  ["vacuum", "vacuum cleaner", "hoover", "vacuums"],
  ["sofa", "couch", "settee", "couches", "sofas"],
  ["bed", "beds", "mattress"],
  ["chair", "chairs", "seat"],
  ["table", "tables"],
  ["lamp", "lamps"],
  ["mirror", "mirrors"],
  ["pillow", "pillows"],
  ["blanket", "blankets", "comforter"],
  ["towel", "towels"],
  ["soap", "soaps", "bar soap"],
  ["shampoo", "shampoos"],
  ["toothbrush", "tooth brush", "toothbrushes"],
  ["toothpaste", "tooth paste"],
  ["toilet paper", "tp", "bathroom tissue", "toilet tissue"],
  ["trash", "garbage", "rubbish", "waste"],
  ["trash can", "garbage can", "rubbish bin", "wastebasket", "waste basket", "trashcan", "garbage bin"],
  ["dishes", "dish"],
  ["laundry", "washing clothes"],
  ["furniture", "furnishings"],
  ["closet", "wardrobe", "closets"],
  ["garage", "garages", "carport"],
  ["yard", "backyard", "back yard", "lawn"],
  ["garden", "gardens"],

  // Clothing / accessories
  ["clothes", "clothing", "apparel", "outfit", "outfits"],
  ["pants", "trousers", "slacks", "pant"],
  ["jeans", "blue jeans", "denim"],
  ["shirt", "shirts", "tee", "t shirt", "tshirt", "blouse"],
  ["dress", "dresses", "gown"],
  ["skirt", "skirts"],
  ["shorts", "short pants"],
  ["socks", "sock", "stockings"],
  ["shoes", "shoe", "footwear"],
  ["boots", "boot"],
  ["sneakers", "tennis shoes", "trainers", "gym shoes", "athletic shoes"],
  ["high heels", "heels", "pumps"],
  ["hat", "hats", "cap", "caps"],
  ["jacket", "jackets", "coat", "coats"],
  ["underwear", "undergarments", "undies", "boxers", "briefs"],
  ["bra", "bras", "brassiere"],
  ["glasses", "eyeglasses", "spectacles", "eye glasses"],
  ["sunglasses", "shades", "sun glasses"],
  ["jewelry", "jewellery", "jewels", "bling"],
  ["watch", "watches", "wristwatch", "wrist watch"],
  ["tie", "ties", "necktie", "neck tie"],
  ["belt", "belts"],
  ["gloves", "glove", "mittens"],
  ["purse", "handbag", "pocketbook", "purses", "handbags"],
  ["wallet", "wallets", "billfold"],

  // Food / drink
  ["food", "foods", "meal", "meals"],
  ["pizza", "pizzas"],
  ["hamburger", "hamburgers", "burger", "burgers", "cheeseburger"],
  ["french fries", "fries", "fry"],
  ["hot dog", "hotdog", "hot dogs", "hotdogs", "frankfurter"],
  ["sandwich", "sandwiches", "sub", "hoagie"],
  ["taco", "tacos"],
  ["steak", "steaks", "beefsteak"],
  ["chicken", "chickens", "poultry", "hen", "rooster"],
  ["turkey", "turkeys"],
  ["bacon", "bacon strips"],
  ["egg", "eggs"],
  ["cheese", "cheeses"],
  ["bread", "loaf", "toast"],
  ["butter", "margarine"],
  ["ice cream", "icecream", "ice-cream"],
  ["candy", "sweets", "candies"],
  ["cookie", "cookies", "biscuit", "biscuits"],
  ["cake", "cakes", "birthday cake"],
  ["pie", "pies"],
  ["chocolate", "chocolates", "cocoa"],
  ["popcorn", "pop corn"],
  ["chips", "potato chips", "crisps"],
  ["soup", "soups", "stew"],
  ["salad", "salads"],
  ["fruit", "fruits"],
  ["vegetable", "vegetables", "veggies", "veggie"],
  ["apple", "apples"],
  ["banana", "bananas"],
  ["orange", "oranges"],
  ["onion", "onions"],
  ["meat", "meats"],
  ["soda", "pop", "soft drink", "soda pop", "soft drinks", "cola"],
  ["coffee", "java", "joe", "coffees"],
  ["tea", "teas"],
  ["beer", "ale", "lager", "beers", "brew"],
  ["wine", "wines", "vino"],
  ["alcohol", "booze", "liquor", "spirits"],
  ["water", "h2o"],
  ["juice", "juices"],

  // Animals
  ["dog", "dogs", "puppy", "puppies", "canine", "mutt"],
  ["cat", "cats", "kitten", "kittens", "feline", "kitty"],
  ["bird", "birds", "birdie"],
  ["fish", "fishes"],
  ["horse", "horses", "pony", "ponies", "stallion", "mare"],
  ["cow", "cows", "cattle", "bull"],
  ["pig", "pigs", "hog", "hogs", "swine"],
  ["snake", "snakes", "serpent"],
  ["rabbit", "rabbits", "bunny", "bunnies"],
  ["lion", "lions"],
  ["tiger", "tigers"],
  ["bear", "bears"],
  ["elephant", "elephants"],
  ["monkey", "monkeys", "ape", "apes"],
  ["frog", "frogs", "toad", "toads"],
  ["pet", "pets"],

  // Body / health / actions
  ["hair", "hairs", "hairdo", "hairstyle"],
  ["eyes", "eye", "eyeballs"],
  ["teeth", "tooth"],
  ["sleep", "sleeping", "asleep", "nap", "napping", "doze"],
  ["eat", "eating", "ate", "eaten"],
  ["drink", "drinking", "drank"],
  ["smoke", "smoking", "cigarette", "cigarettes", "cig", "cigar", "cigars"],
  ["cry", "crying", "weep", "tears"],
  ["sing", "singing", "sang"],
  ["dance", "dancing", "danced"],
  ["talk", "talking", "speak", "speaking", "chat", "chatting"],
  ["read", "reading", "reads"],
  ["drive", "driving", "drove"],
  ["walk", "walking", "walked", "stroll"],
  ["run", "running", "jog", "jogging", "ran"],
  ["swim", "swimming", "swam"],
  ["exercise", "exercising", "workout", "work out", "gym", "working out"],
  ["laugh", "laughing", "giggle", "giggling"],
  ["smile", "smiling", "grin"],
  ["kiss", "kissing", "smooch"],
  ["scream", "screaming", "yell", "yelling", "shout", "shouting"],
  ["fight", "fighting", "argue", "arguing", "argument"],
  ["sick", "ill", "illness", "unwell"],
  ["weight", "weigh", "pounds", "lbs"],

  // Personal care / misc
  ["makeup", "make up", "cosmetics", "make-up"],
  ["perfume", "cologne", "fragrance", "scent"],
  ["diaper", "nappy", "diapers", "nappies"],
  ["bandaid", "band aid", "bandage", "bandages", "band-aid"],
  ["kleenex", "tissue", "tissues", "facial tissue"],
  ["q tip", "q tips", "cotton swab", "cotton swabs", "q-tip", "q-tips"],
  ["gun", "guns", "pistol", "firearm", "firearms", "handgun"],
  ["ball", "balls"],
  ["toy", "toys"],
  ["game", "games"],
  ["party", "parties", "celebration"],
  ["wedding", "weddings", "marriage", "nuptials"],
  ["birthday", "birthdays", "bday", "b-day"],
  ["christmas", "xmas", "x-mas"],
  ["funeral", "funerals", "burial", "wake"],
  ["graduation", "graduations", "commencement", "grad"],
  ["anniversary", "anniversaries"],
  ["homework", "assignment", "assignments", "schoolwork", "school work"],
  ["traffic", "traffic jam", "rush hour", "congestion"],
  ["weather", "forecast"],
  ["age", "years old", "how old"],
  ["name", "names", "first name"],
  ["family", "families", "relatives"],
  ["friends", "friend", "buddy", "buddies", "pal", "pals"],
  ["people", "person", "humans", "folks"],
  ["flowers", "flower", "bouquet", "roses", "rose"],
  ["sports", "sport", "athletics"],
  ["football", "american football"],
  ["basketball", "hoops"],
  ["hockey", "ice hockey"],
  ["golf", "golfing"],
  ["concert", "concerts", "gig"],
  ["shopping", "shop", "shopped", "buying"],
  ["keys", "key", "house keys", "car keys"],

  //Misc categories
  ["damp", "wet", "dampness", "moisture", "mold", "mildew"],
  ["cold", "cool", "chilly", "freezing", "frost", "frostbite"],
  ["hot", "warm", "toasty", "scorching", "boiling", "boil"],
  ["dirty", "filthy", "messy", "mess", "cluttered", "clutter"],
  ["clean", "neat", "tidy", "tidy up", "organized", "organize"],
  ["noisy", "loud", "noisy", "noisy room", "noisy neighbors", "noisy neighbors"],
  ["quiet", "silent", "quiet room", "quiet neighbors", "quiet neighbors"],
  ["bright", "light", "bright room", "bright neighbors", "bright neighbors"],
];

function buildAliasLookup(
  groups: readonly (readonly string[])[]
): ReadonlyMap<string, readonly string[]> {
  const map = new Map<string, string[]>();
  for (const group of groups) {
    const normalized = group
      .map((term) => normalizeFriendlyFeudGuess(term))
      .filter((term) => term.length > 0);
    const unique = [...new Set(normalized)];
    for (const key of unique) {
      const others = unique.filter((term) => term !== key);
      const existing = map.get(key) ?? [];
      map.set(key, [...new Set([...existing, ...others])]);
    }
  }
  return map;
}

const ALIAS_LOOKUP = buildAliasLookup(FRIENDLY_FEUD_SYNONYM_GROUPS);

/** Split survey "A/B" or "A & B" style answers into individual acceptable parts. */
export function slashPartsFromAnswer(ans: string): string[] {
  return ans
    .split(/[/&]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Build alternate acceptable phrasings for a board answer:
 * slash/& parts + synonym-group expansions for the full answer and each part.
 */
export function buildAnswerAlts(ans: string, extraAlts: readonly string[] = []): string[] {
  const primaryNorm = normalizeFriendlyFeudGuess(ans);
  const collected = new Set<string>();

  for (const extra of extraAlts) {
    if (extra.trim()) {
      collected.add(extra.trim());
    }
  }

  const parts = slashPartsFromAnswer(ans);
  for (const part of parts) {
    const partNorm = normalizeFriendlyFeudGuess(part);
    if (partNorm && partNorm !== primaryNorm) {
      collected.add(part);
    }
  }

  const lookupKeys = new Set<string>();
  if (primaryNorm) {
    lookupKeys.add(primaryNorm);
  }
  for (const part of parts) {
    const partNorm = normalizeFriendlyFeudGuess(part);
    if (partNorm) {
      lookupKeys.add(partNorm);
    }
  }

  for (const key of lookupKeys) {
    for (const alias of ALIAS_LOOKUP.get(key) ?? []) {
      collected.add(alias);
    }
  }

  return [...collected].filter((alt) => {
    const altNorm = normalizeFriendlyFeudGuess(alt);
    return altNorm.length > 0 && altNorm !== primaryNorm;
  });
}

export function enrichFriendlyFeudAnswer(answer: FriendlyFeudAnswer): FriendlyFeudAnswer {
  const alts = buildAnswerAlts(answer.ans, answer.alts ?? []);
  if (alts.length === 0) {
    return { ans: answer.ans, pnt: answer.pnt };
  }
  return { ans: answer.ans, pnt: answer.pnt, alts };
}

export function enrichFriendlyFeudQuestion(question: FriendlyFeudQuestion): FriendlyFeudQuestion {
  return {
    ...question,
    answers: question.answers.map(enrichFriendlyFeudAnswer)
  };
}

const RAW_QUESTIONS: readonly FriendlyFeudQuestion[] = questionsJson as FriendlyFeudQuestion[];
const QUESTIONS: readonly FriendlyFeudQuestion[] = RAW_QUESTIONS.map(enrichFriendlyFeudQuestion);

export function listFriendlyFeudQuestions(): readonly FriendlyFeudQuestion[] {
  return QUESTIONS;
}

/** Pick `count` unused questions; if the pool is exhausted, wrap and reuse. */
export function pickFriendlyFeudQuestions(usedIds: ReadonlySet<string>, count: number): FriendlyFeudQuestion[] {
  if (count <= 0) {
    return [];
  }
  const unused = QUESTIONS.filter((q) => !usedIds.has(q.id));
  const pool = unused.length >= count ? unused : [...QUESTIONS];
  const picked: FriendlyFeudQuestion[] = [];
  const remaining = [...pool];
  for (let i = 0; i < count && remaining.length > 0; i++) {
    const idx = Math.floor(Math.random() * remaining.length);
    picked.push(remaining.splice(idx, 1)[0]!);
  }
  return picked;
}

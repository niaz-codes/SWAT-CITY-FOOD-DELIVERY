// ============================================================
// seed-demo-images — fill imageUrl for restaurants/food items that have none.
//
// Design rules:
//  - additive ONLY: a row that already has an imageUrl is never touched, so
//    admin/owner uploads always win over demo imagery;
//  - every image is downloaded server-side and re-hosted in the project's own
//    Supabase Storage bucket ("demo-images/" folder), so the app never depends
//    on a third-party CDN staying alive;
//  - keyword-matched per dish name/category/admin-uploaded emoji hints, with a
//    safe generic fallback;
//  - a failed download leaves the row untouched (rerun to retry).
//
// Run with the normal backend env (backend/.env or the environment):
//   npx tsx src/scripts/seed-demo-images.ts
// This is a demo-data helper; it does NOT belong to any payment/order flow.
// ============================================================

import dotenv from 'dotenv';
dotenv.config();

import { RestaurantModel } from '../models/Restaurant';
import { FoodItemModel } from '../models/FoodItem';
import { uploadBuffer } from '../services/storage.service';

interface Recipe {
  keywords: string[];
  /** Candidates tried in order; the first that downloads wins. */
  images: string[];
}

const W = (a: string, b: string) => `https://loremflickr.com/900/720/${a},${b}?lock=7`;
const randomFood = W('food', 'dish');
const randomRestaurant = W('restaurant', 'food');

/** Demo recipes. Prefer stable Unsplash IDs, fall back to keyword-hosted photos. */
const FOOD_RECIPES: Recipe[] = [
  {
    keywords: ['karahi', 'kadai'],
    images: [
      'https://images.unsplash.com/photo-1596797038530-2c107229654b?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=900&q=80',
    ],
  },
  {
    keywords: ['tikka', 'kebab', 'seekh', 'boti', 'chapli', 'barbecue', 'bbq'],
    images: [
      'https://images.unsplash.com/photo-1529042410759-befb1204b468?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=900&q=80',
    ],
  },
  {
    keywords: ['biryani', 'pulao', 'rice'],
    images: [
      'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1631515243349-e0cb75fb8d3a?auto=format&fit=crop&w=900&q=80',
    ],
  },
  {
    keywords: ['burger'],
    images: [
      'https://images.unsplash.com/photo-1568901346375-23c9450c5869?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=900&q=80',
    ],
  },
  {
    keywords: ['pizza'],
    images: [
      'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1513104890138-7c749659bc59?auto=format&fit=crop&w=900&q=80',
    ],
  },
  {
    keywords: ['fries', 'chips'],
    images: ['https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=900&q=80'],
  },
  {
    keywords: ['sandwich', 'club', 'shawarma', 'wrap', 'roll'],
    images: [
      'https://images.unsplash.com/photo-1528735652786-b9966d789a39?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1553909489-cd47e0907980?auto=format&fit=crop&w=900&q=80',
    ],
  },
  {
    keywords: ['momo', 'dumpling', 'dimsum'],
    images: ['https://images.unsplash.com/photo-1496116218417-1a781b1c416c?auto=format&fit=crop&w=900&q=80'],
  },
  {
    keywords: ['pasta', 'macroni', 'noodle'],
    images: ['https://images.unsplash.com/photo-1563379926898-05f4575a45d8?auto=format&fit=crop&w=900&q=80'],
  },
  {
    keywords: ['chicken wing', 'wings', 'broast', 'fried chicken', 'crispy'],
    images: ['https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=900&q=80'],
  },
  {
    keywords: ['naan', 'paratha', 'roti', 'bread', 'breakfast', 'halwa', 'puri'],
    images: [
      'https://images.unsplash.com/photo-1589302160015-c3c9b12cbf2b?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=80',
    ],
  },
  {
    keywords: ['chai', 'tea', 'coffee', 'latte'],
    images: ['https://images.unsplash.com/photo-1571934811356-5cc061b6821f?auto=format&fit=crop&w=900&q=80'],
  },
  {
    keywords: ['marg', 'juice', 'shake', 'lassi', 'drink', 'cola', 'soda', 'mojito', 'mint'],
    images: [
      'https://images.unsplash.com/photo-1551024506-0bccd828d307?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=900&q=80',
    ],
  },
  {
    keywords: ['ice', 'falooda', 'sundae'],
    images: ['https://images.unsplash.com/photo-1501443762994-82bd5dace89a?auto=format&fit=crop&w=900&q=80'],
  },
  {
    keywords: ['kheer', 'gulab', 'jamun', 'zarda', 'phirni', 'cake', 'dessert', 'sweet', 'brownie', 'lava'],
    images: [
      'https://images.unsplash.com/photo-1563805042-7684c016e4cb?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=900&q=80',
    ],
  },
  {
    keywords: ['soup', 'salad'],
    images: ['https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=900&q=80'],
  },
  {
    keywords: ['curry', 'masala', 'daal', 'dal', 'haleem', 'nihari', 'sabzi', 'chole', 'chana'],
    images: [
      'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=900&q=80',
    ],
  },
];

/** Restaurant heroes: cuisine first, then interiors / generous food spreads. */
const RESTAURANT_RECIPES: Recipe[] = [
  {
    keywords: ['fast', 'burger', 'pizza', 'snack'],
    images: [
      'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1000&q=80',
    ],
  },
  {
    keywords: ['pakistani', 'desi', 'traditional', 'swat'],
    images: [
      'https://images.unsplash.com/photo-1596797038530-2c107229654b?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1000&q=80',
    ],
  },
  {
    keywords: [],
    images: [
      'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1552566626-52f8ef860bdf?auto=format&fit=crop&w=1000&q=80',
      randomRestaurant,
    ],
  },
];

function pickRecipe(keyTexts: Array<string | null | undefined>, kind: 'food' | 'restaurant'): Recipe {
  const haystack = keyTexts
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const recipes = kind === 'food' ? FOOD_RECIPES : RESTAURANT_RECIPES;
  for (const recipe of recipes) {
    if (recipe.keywords.some((k) => haystack.includes(k))) return recipe;
  }
  return kind === 'food' ? { keywords: [], images: [randomFood] } : RESTAURANT_RECIPES[RESTAURANT_RECIPES.length - 1];
}

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? '';
    if (!type.startsWith('image/')) return null;
    // A teaser page or 1x1 is useless as a food photo.
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 10_000) return null;
    return buffer;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  let restaurantsFixed = 0;
  let itemsFixed = 0;

  const restaurants = await RestaurantModel.find({});
  for (const r of restaurants) {
    if (String(r.imageUrl ?? '').trim() !== '') continue;
    const recipe = pickRecipe([r.name, r.cuisine, r.category, r.emoji], 'restaurant');
    for (const url of recipe.images) {
      const buffer = await downloadImage(url);
      if (!buffer) continue;
      const uploaded = await uploadBuffer(buffer, { mimetype: 'image/jpeg', ext: 'jpg', folder: 'demo-images' });
      await RestaurantModel.updateOne(
        { _id: r._id },
        { $set: { imageUrl: uploaded.url, imagePublicId: uploaded.publicId } },
      );
      console.log(`[seed-demo-images] restaurant "${r.name}" -> ${uploaded.url}`);
      restaurantsFixed += 1;
      break;
    }
  }

  const items = await FoodItemModel.find({});
  for (const f of items) {
    if (String(f.imageUrl ?? '').trim() !== '') continue;
    const recipe = pickRecipe([f.name, f.category, f.emoji], 'food');
    for (const url of recipe.images) {
      const buffer = await downloadImage(url);
      if (!buffer) continue;
      const uploaded = await uploadBuffer(buffer, { mimetype: 'image/jpeg', ext: 'jpg', folder: 'demo-images' });
      await FoodItemModel.updateOne(
        { _id: f._id },
        { $set: { imageUrl: uploaded.url, imagePublicId: uploaded.publicId } },
      );
      console.log(`[seed-demo-images] food item "${f.name}" -> ${uploaded.url}`);
      itemsFixed += 1;
      break;
    }
  }

  console.log(`[seed-demo-images] done: ${restaurantsFixed} restaurants, ${itemsFixed} food items updated`);
  console.log('[seed-demo-images] rows that already had an image were left untouched.');
}

void main().catch((err) => {
  console.error('[seed-demo-images] failed:', (err as Error).message);
  process.exit(1);
});

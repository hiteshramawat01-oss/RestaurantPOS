/**
 * Mewari Makkhan Dhaba — menu as printed on the restaurant's menu card.
 * Prices are in rupees. A dish is either one price, or two sizes:
 * [half, full] (or [plain, butter] for rotis).
 */
import { newId } from '../lib/id';
import type { Category, MenuItem, RestaurantProfile } from './types';

export const RESTAURANT: RestaurantProfile = {
  name: 'Mewari Makkhan Dhaba',
  address: 'Shop No. 1, Debari Circle, Airport Road, Near Bharat Tirpal, Udaipur (Raj.)',
  phone: '7737788703',
  gstin: '',
  footer: 'Thank you! Visit again.',
};

type Price = number | [number, number];
interface Section {
  name: string;
  sizes?: [string, string]; // labels for two-price dishes
  items: [string, Price][];
}

const HF: [string, string] = ['Half', 'Full'];

export const MENU: Section[] = [
  {
    name: 'Starter',
    items: [
      ['French Fries', 120],
      ['Peri Peri Fries', 150],
      ['Crispy Corn', 160],
      ['Peanut Chat', 160],
      ['Chana Roasted', 160],
      ['Veg. Pakoda', 180],
      ['Paneer Pakoda', 240],
      ['Roasted Papad', 20],
      ['Fry Papad', 30],
      ['Masala Papad', 70],
      ['Khichiya Papad (Makki)', 40],
      ['Marwadi Masala Papad', 100],
    ],
  },
  {
    name: 'Tandoor Se',
    items: [
      ['Paneer Tikka', 320],
      ['Malai Paneer Tikka', 350],
      ['Hara Bhara Kebab', 280],
    ],
  },
  {
    name: 'Rajasthani Tadka',
    sizes: HF,
    items: [
      ['Lehsuniya Sev Bhaji', [130, 250]],
      ['Sev Tomato', [120, 220]],
      ['Sev Dud Bhaji', [130, 250]],
      ['Dahi Tadka', [120, 220]],
      ['Kadi Pakoda', [120, 220]],
      ['Mewari Gatta Curry', [150, 280]],
      ['Papad Pyaz Ki Sabji', [150, 280]],
      ['Chana Masala', [120, 220]],
      ['Lehsuniya Palak', [170, 320]],
      ['Ker Sangri', [200, 380]],
      ['Haldi ki Sabji', [200, 380]],
      ['Lassan ki Chatni', 180],
    ],
  },
  {
    name: 'Punjabi Tadka',
    sizes: HF,
    items: [
      ['Paneer Masala', [120, 220]],
      ['Mutter Paneer', [140, 260]],
      ['Palak Paneer', [140, 260]],
      ['Malai Payaz', [150, 280]],
      ['Rajasthani Papad Paneer Pyaz', [170, 320]],
      ['Paneer Do Pyaza', [170, 320]],
      ['Malai Kofta', [150, 280]],
      ['Methi Malai Mutter', [170, 320]],
      ['Malai Chap Masala', [170, 320]],
      ['Shahi Paneer', [180, 350]],
      ['Mewari Lehsuniya Paneer', [180, 350]],
      ['Paneer Angara', [180, 350]],
      ['Paneer Tikka Butter Masala', 350],
      ['Paneer Butter Masala', [170, 320]],
      ['Kadhai Paneer', [170, 320]],
      ['Paneer Bhurji', [170, 320]],
      ['Kaju Curry Sweet', [200, 380]],
      ['Kaju Curry Spicy', [200, 380]],
      ['Kaju Paneer', [200, 380]],
      ['Lehsuniya Kaju', [200, 380]],
      ['Cheese Butter Masala', [200, 380]],
    ],
  },
  {
    name: 'Sabji Ki Bahar',
    sizes: HF,
    items: [
      ['Jeera Aloo Dry', [120, 220]],
      ['Aloo Gobhi Mutter', [120, 220]],
      ['Mix Veg', [120, 220]],
      ['Bhindi Dopyaza', [120, 220]],
      ['Aloo Mutter', [120, 220]],
      ['Corn Palak', [130, 250]],
      ['Aloo Palak', [120, 220]],
      ['Makkhan Dhaba Sp. Veg.', [180, 350]],
      ['Sarso Ka Saag', [180, 350]],
    ],
  },
  {
    name: 'Dal',
    sizes: HF,
    items: [
      ['Dal Fry', [120, 220]],
      ['Dal Dhaba Style', [130, 250]],
      ['Yellow Dal Tadka', [130, 250]],
      ['Lehsuniya Dal Tadka', [150, 280]],
      ['Dal Makhni', [150, 280]],
    ],
  },
  {
    name: 'Roti',
    sizes: ['Plain', 'Butter'],
    items: [
      ['Tawa Roti', [18, 20]],
      ['Tandoori Roti', [18, 20]],
      ['Naan', 40],
      ['Garlic Naan', 80],
      ['Cheese Garlic Naan', 130],
      ['Laccha Paratha', 40],
      ['Aloo Paratha', 50],
      ['Paneer Paratha', 80],
      ['Plain Tawa Paratha', 30],
      ['Garlic Laccha Paratha', 80],
      ['Missi Roti', 50],
      ['Makki ki Roti', 50],
      ['Bajra Ki Roti', 50],
    ],
  },
  {
    name: 'Rice',
    sizes: HF,
    items: [
      ['Plain Rice', [80, 150]],
      ['Jeera Rice', [100, 180]],
      ['Veg. Pulao', [120, 220]],
      ['Plain Khichdi', [100, 180]],
      ['Masala Khichdi', [120, 220]],
      ['Veg. Dum Biryani', 250],
    ],
  },
  {
    name: 'Thali',
    items: [
      ['Punjabi Thali', 300],
      ['Rajasthani Thali', 250],
      ['Dal Bati Chach', 180],
      ['Sp. Dal Bati Churma', 250],
    ],
  },
  {
    name: 'Dahi & Raita',
    items: [
      ['Plain Curd', 30],
      ['Sweet Lassi', 60],
      ['Bundi Raita', 80],
      ['Veg. Raita', 80],
      ['Butter Milk', 20],
    ],
  },
  {
    name: 'Salad',
    items: [
      ['Green Salad', 80],
      ['Kachumber Salad', 80],
    ],
  },
  {
    name: 'Chinese',
    items: [
      ['Veg. Manchurian', 220],
      ['Honey Chilly Potato', 220],
      ['Paneer Chilly', 250],
      ['Veg. Fried Rice', 220],
      ['Plain Maggi', 80],
      ['Veg. Maggi', 100],
      ['Veg. Cheese Maggi', 130],
      ['Cheese Balls', 280],
    ],
  },
  {
    name: 'Meethe Me',
    items: [
      ['Gulab Jamun', 50],
      ['Gulab Jamun with Ice Cream', 80],
      ['Ghee Gud ki Roti', 60],
      ['Churma', 60],
      ['Moong Dal Halwa', 100],
    ],
  },
];

/** Names of the sample dishes shipped before the real menu, so an upgrade can remove them. */
export const SAMPLE_DISHES = new Set([
  'Paneer Tikka', 'Veg Spring Roll', 'Chicken 65', 'Hara Bhara Kebab', 'Dal Makhani', 'Paneer Butter Masala',
  'Kadai Veg', 'Butter Chicken', 'Dal Baati Churma', 'Tandoori Roti', 'Butter Naan', 'Garlic Naan', 'Missi Roti',
  'Steamed Rice', 'Jeera Rice', 'Veg Biryani', 'Masala Chaas', 'Sweet Lassi', 'Fresh Lime Soda', 'Mineral Water',
  'Gulab Jamun (2 pc)', 'Rasmalai',
]);
export const SAMPLE_CATEGORIES = new Set(['Starters', 'Main Course', 'Breads', 'Rice', 'Beverages', 'Desserts']);

/** Build category and dish rows for the database (prices in paise). */
export function buildMenu(firstSortOrder = 1): { categories: Category[]; menuItems: MenuItem[] } {
  const categories: Category[] = [];
  const menuItems: MenuItem[] = [];
  MENU.forEach((section, ci) => {
    const cat: Category = { id: newId(), name: section.name, sortOrder: firstSortOrder + ci, active: true };
    categories.push(cat);
    section.items.forEach(([name, price], ii) => {
      const two = Array.isArray(price);
      const variants = two ? [0, 1].map((k) => ({ label: (section.sizes ?? HF)[k], price: (price as [number, number])[k] * 100 })) : undefined;
      menuItems.push({
        id: newId(),
        categoryId: cat.id,
        name,
        price: two ? variants![0].price : (price as number) * 100,
        variants,
        active: true,
        available: true,
        sortOrder: ii + 1,
      });
    });
  });
  return { categories, menuItems };
}

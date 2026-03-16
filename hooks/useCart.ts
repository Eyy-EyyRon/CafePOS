import { create } from 'zustand';

export interface Modifier {
  name: string;
  price: number;
}

export interface CartItem {
  cartItemId: string; // Unique ID so "Latte + Oat Milk" doesn't merge with a regular "Latte"
  id: string; // Product ID
  name: string;
  base_price: number;
  quantity: number;
  modifiers: Modifier[];
}

interface CartStore {
  cart: CartItem[];
  discount: number; // Percentage (e.g., 0.20 for 20%)
  subtotal: number;
  total: number;
  addItem: (product: any, modifiers: Modifier[]) => void;
  removeItem: (cartItemId: string) => void;
  setDiscount: (percent: number) => void;
  clearCart: () => void;
}

export const useCart = create<CartStore>((set) => ({
  cart: [],
  discount: 0,
  subtotal: 0,
  total: 0,
  
  addItem: (product, modifiers = []) => set((state) => {
    // Calculate price of item + its modifiers
    const modifierTotal = modifiers.reduce((sum, mod) => sum + mod.price, 0);
    const itemFinalPrice = product.base_price + modifierTotal;
    
    // Create a unique string based on modifiers so identical custom drinks stack, but different ones don't
    const modifierString = modifiers.map(m => m.name).sort().join(',');
    const uniqueCartId = `${product.id}-${modifierString}`;

    const existingIndex = state.cart.findIndex(i => i.cartItemId === uniqueCartId);
    let newCart = [...state.cart];

    if (existingIndex >= 0) {
      newCart[existingIndex].quantity += 1;
    } else {
      newCart.push({
        cartItemId: uniqueCartId,
        id: product.id,
        name: product.name,
        base_price: itemFinalPrice, // Store the price including modifiers
        quantity: 1,
        modifiers: modifiers
      });
    }

    const newSubtotal = newCart.reduce((sum, item) => sum + (item.base_price * item.quantity), 0);
    const newTotal = newSubtotal * (1 - state.discount);

    return { cart: newCart, subtotal: newSubtotal, total: newTotal };
  }),

  removeItem: (cartItemId) => set((state) => {
    const newCart = state.cart.filter(i => i.cartItemId !== cartItemId);
    const newSubtotal = newCart.reduce((sum, item) => sum + (item.base_price * item.quantity), 0);
    const newTotal = newSubtotal * (1 - state.discount);
    
    return { cart: newCart, subtotal: newSubtotal, total: newTotal };
  }),

  setDiscount: (percent) => set((state) => {
    const newTotal = state.subtotal * (1 - percent);
    return { discount: percent, total: newTotal };
  }),

  clearCart: () => set({ cart: [], subtotal: 0, total: 0, discount: 0 }),
}));